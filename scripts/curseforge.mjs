import {createHash} from 'node:crypto';

export const CURSEFORGE_PROJECT_ID = 1750538;
const apiRoot = 'https://wow.curseforge.com/api';
const marker = /<!-- legionchinese-curseforge:(\{[^\r\n]*\}) -->/g;

function uploadState(body, version) {
  const matches = [...(body ?? '').matchAll(marker)];
  if (!matches.length) {
    if ((body ?? '').includes('<!-- legionchinese-curseforge:')) throw new Error('Invalid CurseForge upload receipt.');
    return null;
  }
  if (matches.length !== 1) throw new Error('Multiple CurseForge upload receipts.');
  let state;
  try { state = JSON.parse(matches[0][1]); } catch { throw new Error('Invalid CurseForge upload receipt.'); }
  if (state?.projectId !== CURSEFORGE_PROJECT_ID || state.version !== version
      || !/^[a-f0-9]{64}$/.test(state.sha256 ?? '')
      || !['pending', 'uploaded'].includes(state.status)
      || (state.status === 'uploaded' && (!Number.isSafeInteger(state.fileId) || state.fileId <= 0))) {
    throw new Error('Invalid or mismatched CurseForge upload receipt.');
  }
  return state;
}

async function json(response, operation) {
  if (!response.ok) throw new Error(`${operation} failed (HTTP ${response.status}).`);
  try { return await response.json(); } catch { throw new Error(`${operation} returned invalid JSON.`); }
}

// Called inside the serialized release job, after GitHub publication. Upload the
// published bytes, including on retries: rebuilding a ZIP changes its timestamps.
export async function publishCurseForge({github, context, version, token, fetchImpl = fetch}) {
  if (!token?.trim()) return {status: 'not-configured'};
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('CurseForge uploads require a stable major.minor.patch version.');
  }
  const repo = context.repo, api = github.rest.repos, tag = `v${version}`;
  const release = (await api.getReleaseByTag({...repo, tag})).data;
  if (release.draft || release.prerelease || release.tag_name !== tag || release.target_commitish !== context.sha) {
    throw new Error('CurseForge upload requires a published release from this commit.');
  }
  const latest = (await api.getLatestRelease(repo)).data;
  if (latest.id !== release.id) return {status: 'superseded'};

  const archiveName = `LegionChinese-${version}.zip`;
  const asset = name => {
    const matches = release.assets.filter(item => item.name === name && item.state === 'uploaded');
    if (matches.length !== 1) throw new Error(`Missing or ambiguous published asset: ${name}`);
    return matches[0];
  };
  const zipAsset = asset(archiveName);
  asset(`${archiveName}.sha256`);
  const existing = uploadState(release.body, version);
  if (existing) {
    if (zipAsset.digest && zipAsset.digest !== `sha256:${existing.sha256}`) {
      throw new Error('Published ZIP differs from the CurseForge upload receipt.');
    }
    if (existing.status === 'uploaded') return {status: 'already-uploaded', fileId: existing.fileId};
    throw new Error('A previous CurseForge upload has an uncertain outcome. Check the author dashboard before retrying; see docs/CURSEFORGE.md.');
  }
  const section = (release.body ?? '').replaceAll('\r\n', '\n').split(/^## /m)
    .find(text => text.split('\n', 1)[0].trim() === '本次更新');
  const changelog = section?.slice(section.indexOf('\n') + 1).trim();
  if (!changelog) throw new Error('The published release has no update notes.');

  // Credentials go only to the documented WoW upload API, never into URLs,
  // release notes, GitHub downloads or automatically followed redirects.
  const cfRequest = async (path, options = {}) => {
    try {
      return await fetchImpl(`${apiRoot}${path}`, {
        ...options, headers: {'X-Api-Token': token.trim()}, redirect: 'error',
        signal: AbortSignal.timeout(options.method === 'POST' ? 300000 : 30000),
      });
    } catch { throw new Error('CurseForge request failed or timed out.'); }
  };
  const versions = await json(await cfRequest('/game/wow/versions'), 'CurseForge version lookup');
  if (!Array.isArray(versions)) throw new Error('Invalid CurseForge game version list.');
  const matches = versions.filter(item => item.name === '7.3.5' && item.gameVersionTypeID === 517);
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0].id) || matches[0].id <= 0) {
    throw new Error('CurseForge has no unique WoW 7.3.5 version. Refusing to label this addon for another client.');
  }
  const download = async name => {
    const url = `https://github.com/${repo.owner}/${repo.repo}/releases/download/${tag}/${name}`;
    const response = await fetchImpl(url, {signal: AbortSignal.timeout(300000)});
    if (!response.ok) throw new Error(`Published asset download failed (HTTP ${response.status}).`);
    return Buffer.from(await response.arrayBuffer());
  };
  const checksum = (await download(`${archiveName}.sha256`)).toString('utf8').trim();
  const zip = await download(archiveName);
  const sha256 = createHash('sha256').update(zip).digest('hex');
  if (checksum !== `${sha256}  ${archiveName}` || zip.length !== zipAsset.size
      || (zipAsset.digest && zipAsset.digest !== `sha256:${sha256}`)) {
    throw new Error('Published ZIP failed SHA-256 verification.');
  }
  const form = new FormData();
  form.set('metadata', JSON.stringify({
    displayName: tag, gameVersions: [matches[0].id], releaseType: 'release',
    changelog, changelogType: 'markdown', isMarkedForManualRelease: false,
  }));
  form.set('file', new Blob([zip], {type: 'application/zip'}), archiveName);

  // Persist a receipt before POST because the upload API has no idempotency key.
  // A timeout must not cause the same file to be blindly submitted a second time.
  const saveState = async (expected, next) => {
    const current = (await api.getReleaseByTag({...repo, tag})).data;
    if (current.id !== release.id || JSON.stringify(uploadState(current.body, version)) !== JSON.stringify(expected)) {
      throw new Error('CurseForge upload receipt changed during publication.');
    }
    const body = current.body.replace(marker, '').trimEnd();
    await api.updateRelease({...repo, release_id: release.id,
      body: next ? `${body}\n\n<!-- legionchinese-curseforge:${JSON.stringify(next)} -->` : body});
  };
  // A new release could also have been published manually while downloading.
  if ((await api.getLatestRelease(repo)).data.id !== release.id) return {status: 'superseded'};
  const pending = {projectId: CURSEFORGE_PROJECT_ID, version, sha256, status: 'pending'};
  await saveState(null, pending);
  const response = await cfRequest(`/projects/${CURSEFORGE_PROJECT_ID}/upload-file`, {method: 'POST', body: form});
  // Definite request rejection is retryable after fixing the configuration.
  // Server errors/timeouts and malformed success responses remain uncertain.
  if ([400, 401, 403, 404, 413, 415, 422, 429].includes(response.status)) await saveState(pending, null);
  const result = await json(response, 'CurseForge upload');
  if (!Number.isSafeInteger(result?.id) || result.id <= 0) throw new Error('CurseForge returned no valid file ID; check the author dashboard before retrying.');
  try { await saveState(pending, {...pending, status: 'uploaded', fileId: result.id}); }
  catch { throw new Error(`CurseForge accepted file ${result.id}, but its receipt could not be saved. Check docs/CURSEFORGE.md before retrying.`); }
  return {status: 'uploaded', fileId: result.id};
}
