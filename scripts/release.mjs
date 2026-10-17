// Called with the authenticated client supplied by actions/github-script.
async function optionalRelease(request) {
  try { return (await request()).data; }
  catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function normalizeLegacyTitles(github, repo) {
  const api = github.rest.repos;
  const changes = [];
  // Read every page before updating titles so changes cannot shift pagination.
  for await (const {data} of github.paginate.iterator(api.listReleases, {...repo, per_page: 100})) {
    for (const release of data) {
      const build = /^(?:TauriChinese|LegionChinese) 自动构建 #(\d+)$/.exec(release.name ?? '');
      if (!build || release.draft || release.tag_name !== `build-${build[1]}`) continue;
      const version = /^- 插件版本：`(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\+[0-9A-Za-z.-]+)?`\s*$/m.exec(release.body ?? '');
      if (version) changes.push({id: release.id, name: `v${version[1]}`});
    }
  }
  if (!changes.length) return;
  const latest = await optionalRelease(() => api.getLatestRelease(repo));
  for (const change of changes) {
    await api.updateRelease({
      ...repo, release_id: change.id, name: change.name,
      make_latest: change.id === latest?.id ? 'true' : 'false',
    });
  }
}

export async function publishRelease({github, context, version, assets}) {
  const repo = context.repo;
  const api = github.rest.repos;
  const tag = `build-${context.runNumber}`;
  const title = `v${version.split('+')[0]}`;
  let release = await optionalRelease(() => api.getReleaseByTag({...repo, tag}));
  // The tag endpoint only promises published releases. Recover interrupted
  // drafts through the authenticated release listing, including older pages.
  if (!release) {
    for await (const {data} of github.paginate.iterator(api.listReleases, {...repo, per_page: 100})) {
      release = data.find(item => item.tag_name === tag);
      if (release) break;
    }
  }
  if (release && release.target_commitish !== context.sha) {
    throw new Error(`${tag} already belongs to another commit; refusing to replace it.`);
  }
  await normalizeLegacyTitles(github, repo);
  // Rerunning a successful build must not overwrite an already published package.
  if (release && !release.draft) return release;

  if (!release) {
    const base = `${context.serverUrl}/${repo.owner}/${repo.repo}`;
    release = (await api.createRelease({
      ...repo,
      tag_name: tag,
      target_commitish: context.sha,
      name: title,
      draft: true,
      prerelease: false,
      body: [
        '由 main 分支自动构建，检查通过后发布。',
        '',
        `- 插件版本：\`${version}\``,
        `- 源码：[${context.sha.slice(0, 7)}](${base}/commit/${context.sha})`,
        `- 构建记录：[#${context.runNumber}](${base}/actions/runs/${context.runId})`,
        '',
        '下载 **LegionChinese-latest.zip**，将其中的 LegionChinese 文件夹解压到游戏的 Interface/AddOns/。',
        '同名 .sha256 文件可用于校验下载完整性。',
        '',
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

  // The workflow serializes release jobs. An older queued build must not take
  // Latest away from a newer successful build, even if checks finish out of order.
  const latest = await optionalRelease(() => api.getLatestRelease(repo));
  const latestBuild = /^build-(\d+)$/.exec(latest?.tag_name ?? '');
  return (await api.updateRelease({
    ...repo,
    release_id: release.id,
    name: title,
    draft: false,
    make_latest: latestBuild && Number(latestBuild[1]) > context.runNumber ? 'false' : 'true',
  })).data;
}
