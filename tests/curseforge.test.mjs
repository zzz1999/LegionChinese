import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {publishCurseForge, CURSEFORGE_PROJECT_ID} from '../scripts/curseforge.mjs';

const version = '1.2.7', token = 'fixture-secret-do-not-log';
const archiveName = `LegionChinese-${version}.zip`;
const zip = Buffer.from('PK\x03\x04published ZIP bytes');
const digest = createHash('sha256').update(zip).digest('hex');
const notes = '- 接入自动上传。\n- 保持完整的更新列表。\n\n### 说明\n适用 7.3.5。';
const body = `## 本次更新\n\n${notes}\n\n## 安装与更新\n\n下载 ZIP。`;
const context = {repo: {owner: 'example', repo: 'addon'}, sha: 'a'.repeat(40)};

function fixture(options = {}) {
  const requests = [], updates = [];
  let latestReads = 0;
  let release = {id: 123, tag_name: 'v1.2.7', target_commitish: context.sha,
    draft: false, prerelease: false, body, assets: [
      {name: archiveName, state: 'uploaded', size: zip.length, digest: `sha256:${digest}`},
      {name: `${archiveName}.sha256`, state: 'uploaded'},
    ], ...options.release};
  const github = {rest: {repos: {
    async getReleaseByTag(args) { assert.equal(args.tag, 'v1.2.7'); return {data: structuredClone(release)}; },
    async getLatestRelease() {
      latestReads++;
      return {data: {id: options.superseded || (options.supersededAfterDownload && latestReads > 1) ? 999 : 123}};
    },
    async updateRelease(args) {
      assert.equal(args.release_id, release.id);
      assert.equal(args.make_latest, undefined);
      if (options.failSaveAt === updates.length + 1) throw new Error('GitHub write failed');
      updates.push(args);
      release = {...release, ...args};
      return {data: structuredClone(release)};
    },
  }}};
  const fetchImpl = async (url, args = {}) => {
    requests.push({url, ...args});
    assert.ok(args.signal instanceof AbortSignal);
    if (url.startsWith('https://github.com/')) {
      assert.equal(args.headers, undefined, 'CurseForge token must not go to GitHub');
      if (options.failDownload) return new Response('unavailable', {status: 404});
      if (url.endsWith('.sha256')) return new Response(options.badChecksum ? 'invalid' : `${digest}  ${archiveName}\n`);
      assert.ok(url.endsWith(`/${archiveName}`));
      return new Response(zip);
    }
    assert.equal(args.headers['X-Api-Token'], token);
    assert.equal(args.redirect, 'error');
    assert.ok(!url.includes(token));
    if (url === 'https://wow.curseforge.com/api/game/wow/versions') {
      return Response.json(options.versions ?? [{name: '7.3.5', id: 735, gameVersionTypeID: 517}]);
    }
    assert.equal(url, `https://wow.curseforge.com/api/projects/${CURSEFORGE_PROJECT_ID}/upload-file`);
    assert.equal(args.method, 'POST');
    assert.match(release.body, /"status":"pending"/, 'receipt must be persisted BEFORE sending the upload');
    if (options.timeout) throw new Error(`network error with ${token}`);
    if (options.uploadStatus) return new Response(`error reflecting ${token}`, {status: options.uploadStatus});
    return Response.json(options.uploadResult ?? {id: 456789});
  };
  return {requests, updates, github, fetchImpl, options,
    get release() { return release; },
    run: (overrides = {}) => publishCurseForge({github, context, version, token, fetchImpl, ...overrides}),
  };
}

test('unconfigured publishing does not touch either service', async () => {
  assert.deepEqual(await publishCurseForge({}), {status: 'not-configured'});
  assert.deepEqual(await fixture().run({token: '   '}), {status: 'not-configured'});
});

test('uploads verified published bytes with the complete version notes and exact WoW version', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), {status: 'uploaded', fileId: 456789});
  const post = f.requests.find(request => request.method === 'POST');
  const file = post.body.get('file');
  assert.equal(file.name, archiveName);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), zip);
  assert.deepEqual(JSON.parse(post.body.get('metadata')), {
    displayName: 'v1.2.7', gameVersions: [735], releaseType: 'release',
    changelog: notes, changelogType: 'markdown', isMarkedForManualRelease: false,
  });
  assert.equal(f.updates.length, 2);
  assert.ok(f.release.body.startsWith(body));
  assert.match(f.release.body, /"status":"uploaded","fileId":456789/);
  assert.doesNotMatch(f.release.body, new RegExp(token));
  const count = f.requests.length;
  assert.deepEqual(await f.run(), {status: 'already-uploaded', fileId: 456789});
  assert.equal(f.requests.length, count, 'retry must neither download again nor POST a duplicate');
});

test('invalid versions, drafts, prereleases, wrong source and missing assets never upload', async () => {
  for (const override of [{draft: true}, {prerelease: true}, {target_commitish: 'other'}, {assets: []}, {body: 'No updates'}]) {
    const f = fixture({release: override});
    await assert.rejects(f.run());
    assert.equal(f.requests.length, 0);
    assert.equal(f.updates.length, 0);
  }
  await assert.rejects(fixture().run({version: '../../unsafe'}), /stable/);
});

test('only the current Latest release is synced, including a change during downloads', async () => {
  for (const options of [{superseded: true}, {supersededAfterDownload: true}]) {
    const f = fixture(options);
    assert.deepEqual(await f.run(), {status: 'superseded'});
    assert.ok(f.requests.every(request => request.method !== 'POST'));
    assert.equal(f.updates.length, 0);
  }
});

test('a missing, ambiguous or wrong-flavor game version never falls back to a different client', async () => {
  for (const versions of [[], {}, [{name: '12.0.0', id: 1, gameVersionTypeID: 517}],
    [{name: '7.3.5', id: 1, gameVersionTypeID: 67408}],
    [{name: '7.3.5', id: 1, gameVersionTypeID: 517}, {name: '7.3.5', id: 2, gameVersionTypeID: 517}]]) {
    const f = fixture({versions});
    await assert.rejects(f.run(), /version/i);
    assert.equal(f.requests.length, 1);
    assert.equal(f.updates.length, 0);
  }
});

test('a failed download or mismatched checksum cannot be uploaded', async () => {
  for (const options of [{badChecksum: true}, {failDownload: true},
    {release: {assets: [{name: archiveName, state: 'uploaded', size: zip.length, digest: `sha256:${'0'.repeat(64)}`},
      {name: `${archiveName}.sha256`, state: 'uploaded'}]}}]) {
    const f = fixture(options);
    await assert.rejects(f.run(), /download|SHA-256/);
    assert.equal(f.updates.length, 0);
    assert.ok(f.requests.every(request => request.method !== 'POST'));
  }
});

test('network failures keep a pending receipt, redact secrets and block automatic resubmission', async () => {
  const f = fixture({timeout: true});
  await assert.rejects(f.run(), error => {
    assert.match(error.message, /request failed or timed out/);
    assert.ok(!error.message.includes(token));
    return true;
  });
  assert.match(f.release.body, /"status":"pending"/);
  await assert.rejects(f.run(), /uncertain outcome/);
  assert.equal(f.requests.filter(request => request.method === 'POST').length, 1);
});

test('definite rejected uploads clear pending state and can be retried after fixing configuration', async () => {
  const f = fixture({uploadStatus: 401});
  await assert.rejects(f.run(), error => {
    assert.match(error.message, /HTTP 401/);
    assert.ok(!error.message.includes(token));
    return true;
  });
  assert.equal(f.release.body, body);
  delete f.options.uploadStatus;
  assert.equal((await f.run()).status, 'uploaded');
});

test('server failures and invalid success responses remain pending rather than retrying the POST', async () => {
  for (const options of [{uploadStatus: 503}, {uploadResult: {}}, {uploadResult: {id: -1}}]) {
    const f = fixture(options);
    await assert.rejects(f.run());
    await assert.rejects(f.run(), /uncertain outcome/);
    assert.equal(f.requests.filter(request => request.method === 'POST').length, 1);
  }
});

test('failed pending receipt writes prevent POST; failed success receipt writes expose the accepted file ID', async () => {
  const before = fixture({failSaveAt: 1});
  await assert.rejects(before.run(), /GitHub write failed/);
  assert.ok(before.requests.every(request => request.method !== 'POST'));
  const after = fixture({failSaveAt: 2});
  await assert.rejects(after.run(), /accepted file 456789/);
  await assert.rejects(after.run(), /uncertain outcome/);
  assert.equal(after.requests.filter(request => request.method === 'POST').length, 1);
});

test('malformed, conflicting and stale receipts stop publication', async () => {
  const state = {projectId: CURSEFORGE_PROJECT_ID, version, sha256: digest, status: 'uploaded', fileId: 123};
  const wrap = value => `<!-- legionchinese-curseforge:${JSON.stringify(value)} -->`;
  for (const receipt of ['<!-- legionchinese-curseforge:broken -->', wrap({...state, projectId: 1}),
    wrap({...state, sha256: '0'.repeat(64)}), `${wrap(state)}\n${wrap(state)}`]) {
    const f = fixture({release: {body: `${body}\n\n${receipt}`}});
    await assert.rejects(f.run(), /receipt/);
    assert.equal(f.requests.length, 0);
  }
});

test('actual workflow uploads only after release publication and reports an absent secret explicitly', async () => {
  const workflow = (await readFile(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  const step = workflow.split('      - name: Upload to CurseForge\n')[1];
  assert.match(step, /^        if: steps\.release\.outputs\.tag != ''$/m);
  assert.match(step, /CF_API_TOKEN: \$\{\{ secrets.CF_API_TOKEN \}\}/);
  const messages = [];
  const summary = {addHeading() {return this;}, addRaw(value) {messages.push(value); return this;}, async write() {}};
  const core = {summary, notice: value => messages.push(value)};
  const script = step.split('          script: |\n')[1].replace(/^ {12}/gm, '');
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  await new AsyncFunction('require', 'github', 'context', 'core', 'process', script)(
    () => ({pathToFileURL}), {}, context, core,
    {env: {GITHUB_WORKSPACE: fileURLToPath(new URL('..', import.meta.url)), PACKAGE_VERSION: version}},
  );
  assert.ok(messages.every(message => message.includes('尚未配置 CF_API_TOKEN')));
});
