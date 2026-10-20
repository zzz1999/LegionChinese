// Called with the authenticated client supplied by actions/github-script.
async function optionalRelease(request) {
  try { return (await request()).data; }
  catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function collect(github, method, repo) {
  const items = [];
  for await (const {data} of github.paginate.iterator(method, {...repo, per_page: 100})) items.push(...data);
  return items;
}

function stableVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) throw new Error(`Expected a stable major.minor.patch version, got ${value}`);
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error(`Version is too large: ${value}`);
  return parts;
}

function compareVersions(left, right) {
  const a = stableVersion(left), b = stableVersion(right);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function releasedRef(release, tags) {
  // target_commitish can be a moving branch. Compare the released tag's commit
  // instead, including when it is not in the earlier tag-list snapshot.
  const ref = tags.find(tag => tag.name === release.tag_name)?.commit.sha ?? release.tag_name;
  if (!ref) throw new Error('Cannot verify release ancestry: Latest has no tag.');
  return ref;
}

async function isSuperseded({github, context, tags, latest}) {
  if (!latest) return false;
  const ref = releasedRef(latest, tags);
  const {data} = await github.rest.repos.compareCommitsWithBasehead({
    ...context.repo, basehead: `${ref}...${context.sha}`, per_page: 1, page: 1,
  });
  if (data.status === 'behind') return true;
  if (data.status === 'ahead' || data.status === 'identical') return false;
  throw new Error(`Cannot verify release ancestry: ${context.sha} is ${data.status} relative to ${ref}.`);
}

// Run inside the serialized release job, before packaging. New pushes get a
// unique patch version; retries reuse the version already reserved for this SHA.
// Return null for a superseded source so the workflow skips packaging/publishing.
export async function resolveReleaseVersion({github, context, baseVersion}) {
  stableVersion(baseVersion);
  const api = github.rest.repos;
  const releases = await collect(github, api.listReleases, context.repo);
  const tags = await collect(github, api.listTags, context.repo);
  const versions = tags.filter(tag => /^v\d+\.\d+\.\d+$/.test(tag.name));
  const sameCommit = releases.find(release =>
    release.target_commitish === context.sha && /^v\d+\.\d+\.\d+$/.test(release.tag_name));
  if (sameCommit) {
    const tag = tags.find(item => item.name === sameCommit.tag_name);
    if (tag && tag.commit.sha !== context.sha) throw new Error(`${tag.name} points to another commit.`);
    if (!sameCommit.draft) return sameCommit.tag_name.slice(1);
  }
  const reserved = versions.filter(tag => tag.commit.sha === context.sha);
  if (reserved.length > 1) throw new Error('Multiple version tags point to this commit; refusing to guess.');
  const latest = await optionalRelease(() => api.getLatestRelease(context.repo));
  if (await isSuperseded({github, context, tags, latest})) return null;
  if (sameCommit) return sameCommit.tag_name.slice(1);
  if (reserved.length === 1) return reserved[0].name.slice(1);

  // Draft releases may not have a visible tag yet, but still reserve a version.
  const used = new Set([
    ...versions.map(tag => tag.name.slice(1)),
    ...releases.filter(release => /^v\d+\.\d+\.\d+$/.test(release.tag_name)).map(release => release.tag_name.slice(1)),
  ]);
  let version = baseVersion;
  for (const usedVersion of used) {
    if (compareVersions(usedVersion, version) >= 0) {
      const parts = stableVersion(usedVersion);
      parts[2]++;
      version = parts.join('.');
    }
  }
  stableVersion(version);
  return version;
}

export function notesForVersion(changelog, version) {
  const sections = changelog.replaceAll('\r\n', '\n').split(/^## /m);
  const section = sections.find(text => text.split('\n', 1)[0].trim() === `v${version}`);
  return section ? section.slice(section.indexOf('\n') + 1).trim() : '';
}

async function describeChanges({github, context, version, changelog, previous, tags}) {
  const curated = notesForVersion(changelog, version);
  if (curated) return curated;
  const api = github.rest.repos;
  let commits;
  if (previous) {
    const ref = releasedRef(previous, tags);
    commits = [];
    let status;
    for (let page = 1; ; page++) {
      const {data} = await api.compareCommitsWithBasehead({
        ...context.repo, basehead: `${ref}...${context.sha}`, per_page: 100, page,
      });
      status ??= data.status;
      commits.push(...data.commits);
      if (data.commits.length < 100) break;
    }
    // A slow older job may finish after a newer release. Describe its own
    // commit instead of comparing an ancestor against a newer Latest commit.
    if (!commits.length && status === 'behind') {
      commits = [(await api.getCommit({...context.repo, ref: context.sha})).data];
    }
  } else {
    commits = [(await api.getCommit({...context.repo, ref: context.sha})).data];
  }
  if (!commits.length) throw new Error('No release notes or new commits found; refusing to publish empty notes.');
  const base = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}`;
  // Fallback uses actual commits, not a repeated generic "automatic build" body.
  return commits.map(commit => {
    const subject = commit.commit.message.split(/\r?\n/, 1)[0].replace(/[\\`*_{}\[\]<>!#|]/g, '\\$&');
    return `- ${subject} ([${commit.sha.slice(0, 7)}](${base}/commit/${commit.sha}))`;
  }).join('\n');
}

function buildNumber(release) {
  return Number(/^build-(\d+)$/.exec(release?.tag_name ?? '')?.[1]
    ?? /^- 构建记录：\[#(\d+)\]/m.exec(release?.body ?? '')?.[1] ?? 0);
}

function releaseNotesFromBody(body) {
  const match=/^## 本次更新\r?\n([\s\S]*?)^## 安装与更新\r?$/m.exec(body ?? '');
  if(!match?.[1].trim())throw new Error('Existing release has no recognizable update notes.');
  return match[1].trim();
}

// Resolve once before packaging, then feed the exact same notes to both the
// in-game changelog and the release body. Draft retries retain their notes.
export async function prepareReleaseNotes({github,context,version,changelog=''}){
  stableVersion(version);
  const api=github.rest.repos,repo=context.repo,tag=`v${version}`;
  let existing=await optionalRelease(()=>api.getReleaseByTag({...repo,tag}));
  if(!existing)existing=(await collect(github,api.listReleases,repo)).find(r=>r.tag_name===tag);
  if(existing){
    if(existing.target_commitish!==context.sha)throw new Error(`${tag} already belongs to another commit.`);
    return releaseNotesFromBody(existing.body);
  }
  const previous=await optionalRelease(()=>api.getLatestRelease(repo));
  const tags=await collect(github,api.listTags,repo);
  return describeChanges({github,context,version,changelog,previous,tags});
}

export async function publishRelease({github, context, version, assets, changelog = '', releaseNotes}) {
  stableVersion(version);
  const repo = context.repo;
  const api = github.rest.repos;
  const tag = `v${version}`;
  let release = await optionalRelease(() => api.getReleaseByTag({...repo, tag}));
  if (!release) {
    const releases = await collect(github, api.listReleases, repo);
    release = releases.find(item => item.tag_name === tag);
  }
  if (release && release.target_commitish !== context.sha) {
    throw new Error(`${tag} already belongs to another commit; refusing to replace it.`);
  }
  const tags = await collect(github, api.listTags, repo);
  const existingTag = tags.find(item => item.name === tag);
  if (existingTag && existingTag.commit.sha !== context.sha) {
    throw new Error(`${tag} points to another commit; refusing to publish mismatched assets.`);
  }
  // Rerunning a successful build must not overwrite an already published package.
  if (release && !release.draft) return release;
  if(releaseNotes!==undefined&&(typeof releaseNotes!=='string'||!releaseNotes.trim()))
    throw new Error('Prepared release notes must not be empty.');
  if(release&&releaseNotes!==undefined&&releaseNotesFromBody(release.body)!==releaseNotes.trim())
    throw new Error('Packaged notes differ from the existing draft release.');

  const previous = await optionalRelease(() => api.getLatestRelease(repo));
  if (await isSuperseded({github, context, tags, latest: previous})) return null;
  if (!release) {
    const notes = releaseNotes ?? await describeChanges({github, context, version, changelog, previous, tags});
    const base = `${context.serverUrl}/${repo.owner}/${repo.repo}`;
    release = (await api.createRelease({
      ...repo,
      tag_name: tag,
      target_commitish: context.sha,
      name: tag,
      draft: true,
      prerelease: false,
      body: [
        '## 本次更新', '', notes, '',
        '## 安装与更新', '',
        `下载 **LegionChinese-${version}.zip**，将其中的 LegionChinese 文件夹解压到游戏的 Interface/AddOns/。`,
        '更新时覆盖原文件；同名 .sha256 文件可用于校验下载完整性。', '',
        '## 版本信息', '',
        `- 插件版本：\`${version}\``,
        `- 源码：[${context.sha.slice(0, 7)}](${base}/commit/${context.sha})`,
        `- 构建记录：[#${context.runNumber}](${base}/actions/runs/${context.runId})`, '',
        '**适用于保留原版接口的 7.3.5 客户端；不同服务器的显示效果和实际命中率仍需实机验证。**',
      ].join('\n'),
    })).data;
  }

  // A failed upload leaves a draft. Only its own assets may be replaced on retry.
  for (const asset of assets) {
    const previous = release.assets.find(item => item.name === asset.name);
    if (previous) await api.deleteReleaseAsset({...repo, asset_id: previous.id});
    await api.uploadReleaseAsset({
      ...repo,
      release_id: release.id,
      name: asset.name,
      data: asset.data,
      headers: {
        'content-type': asset.name.endsWith('.zip') ? 'application/zip' : 'text/plain',
        'content-length': asset.data.length,
      },
    });
  }

  // Recheck after uploads as a release may also be published outside this job.
  const latest = await optionalRelease(() => api.getLatestRelease(repo));
  if (await isSuperseded({github, context, tags, latest})) return null;
  return (await api.updateRelease({
    ...repo,
    release_id: release.id,
    name: tag,
    draft: false,
    make_latest: buildNumber(latest) > context.runNumber ? 'false' : 'true',
  })).data;
}
