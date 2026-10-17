// Called with the authenticated client supplied by actions/github-script.
async function optionalRelease(request) {
  try { return (await request()).data; }
  catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function publishRelease({github, context, version, assets}) {
  const repo = context.repo;
  const api = github.rest.repos;
  const tag = `build-${context.runNumber}`;
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
  // Rerunning a successful build must not overwrite an already published package.
  if (release && !release.draft) return release;

  if (!release) {
    const base = `${context.serverUrl}/${repo.owner}/${repo.repo}`;
    release = (await api.createRelease({
      ...repo,
      tag_name: tag,
      target_commitish: context.sha,
      name: `TauriChinese 自动构建 #${context.runNumber}`,
      draft: true,
      prerelease: false,
      body: [
        '由 main 分支自动构建，检查通过后发布。',
        '',
        `- 插件版本：\`${version}\``,
        `- 源码：[${context.sha.slice(0, 7)}](${base}/commit/${context.sha})`,
        `- 构建记录：[#${context.runNumber}](${base}/actions/runs/${context.runId})`,
        '',
        '下载 **TauriChinese-latest.zip**，将其中的 TauriChinese 文件夹解压到游戏的 Interface/AddOns/。',
        '同名 .sha256 文件可用于校验下载完整性。',
        '',
        '**自动构建仍需实机验证：尚未在真实 Tauri 7.3.5 客户端确认显示和实际命中率。**',
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
    draft: false,
    make_latest: latestBuild && Number(latestBuild[1]) > context.runNumber ? 'false' : 'true',
  })).data;
}
