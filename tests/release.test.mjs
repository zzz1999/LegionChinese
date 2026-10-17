import test from 'node:test';
import assert from 'node:assert/strict';
import {publishRelease, resolveReleaseVersion, notesForVersion} from '../scripts/release.mjs';

const context = {
  repo: {owner: 'example', repo: 'addon'},
  sha: 'a'.repeat(40), runNumber: 2, runId: 123,
  serverUrl: 'https://github.com',
};
const assets = ['LegionChinese-latest.zip', 'LegionChinese-latest.zip.sha256']
  .map(name => ({name, data: Buffer.from('fixture')}));

const version = '0.1.0';
const changelog = '# 更新记录\n\n## v0.1.0\n\n- 补齐任务交付说明。\n\n## v0.0.9\n\n- 旧版说明。\n';
function fixture({existing = null, latest = null, failUpload = null, readError = null,
  tags = [], releases = [], commits = [{sha: context.sha, commit: {message: '修复书籍翻页\n\n更多细节'}}],
  notes = changelog, comparisonStatus = 'ahead'} = {}) {
  const mutations = [];
  let release = existing;
  if (release) release.tag_name ??= 'v0.1.0';
  const missing = () => { throw Object.assign(new Error('Not found'), {status: 404}); };
  const api = {
    async getReleaseByTag() {
      if (readError) throw readError;
      return {data: release && !release.draft ? release : missing()};
    },
    async listReleases() {},
    async listTags() {},
    async compareCommitsWithBasehead(args) {
      assert.equal(args.basehead, `${latest.target_commitish}...${context.sha}`);
      return {data: {status: comparisonStatus, commits: commits.slice((args.page - 1) * 100, args.page * 100)}};
    },
    async getCommit(args) {
      assert.equal(args.ref, context.sha);
      return {data: {sha: context.sha, commit: {message: '修复书籍翻页\n\n更多细节'}}};
    },
    async createRelease(args) {
      mutations.push(['create', args]);
      release = {...args, id: 1, assets: [], html_url: 'https://example.test/release'};
      return {data: release};
    },
    async deleteReleaseAsset(args) { mutations.push(['delete', args]); },
    async uploadReleaseAsset(args) {
      if (args.name === failUpload) throw new Error('Upload interrupted');
      mutations.push(['upload', args]);
      return {data: {}};
    },
    async getLatestRelease() { return {data: latest ?? missing()}; },
    async updateRelease(args) {
      mutations.push(['publish', args]);
      return {data: {...release, ...args}};
    },
  };
  const github = {
    rest: {repos: api},
    paginate: {async *iterator(method) {
      if (method === api.listTags) {
        yield {data: tags.slice(0, 1)};
        yield {data: tags.slice(1)};
        return;
      }
      assert.equal(method, api.listReleases);
      yield {data: [{tag_name: 'unrelated-release'}]};
      yield {data: [...releases, ...(release ? [release] : [])]};
    }},
  };
  return {mutations,
    resolve: (baseVersion = version) => resolveReleaseVersion({github, context, baseVersion}),
    run: () => publishRelease({github, context, version, assets, changelog: notes}),
  };
}

test('release is published only after both assets have uploaded', async () => {
  const {run, mutations} = fixture();
  const release = await run();
  assert.deepEqual(mutations.map(([name]) => name), ['create', 'upload', 'upload', 'publish']);
  assert.equal(mutations[0][1].draft, true);
  assert.equal(mutations[0][1].target_commitish, context.sha);
  assert.equal(release.draft, false);
  assert.equal(release.make_latest, 'true');
  assert.equal(release.tag_name, 'v0.1.0');
  assert.equal(release.name, 'v0.1.0');
  assert.match(release.body, /## 本次更新\n\n- 补齐任务交付说明。/);
  assert.match(release.body, /插件版本：`0\.1\.0`/);
  assert.doesNotMatch(release.body, /旧版说明/);
});

test('interrupted upload leaves a draft and retry replaces only draft assets', async () => {
  const interrupted = fixture({failUpload: assets[1].name});
  await assert.rejects(interrupted.run(), /Upload interrupted/);
  assert.equal(interrupted.mutations.some(([name]) => name === 'publish'), false);

  const retry = fixture({existing: {
    id: 1, draft: true, target_commitish: context.sha,
    assets: [{id: 11, name: assets[0].name}],
  }});
  await retry.run();
  assert.deepEqual(retry.mutations.map(([name]) => name), ['delete', 'upload', 'upload', 'publish']);
  assert.equal(retry.mutations[0][1].asset_id, 11);
});

test('rerunning a published build leaves its assets and Latest status intact', async () => {
  const existing = {draft: false, target_commitish: context.sha};
  const {run, mutations} = fixture({existing});
  assert.equal(await run(), existing);
  assert.deepEqual(mutations, []);
});

test('older queued build is published without replacing a newer Latest release', async () => {
  const {run} = fixture({latest: {tag_name: 'v0.2.0', body: '- 构建记录：[#3](https://example.test/run)'}});
  assert.equal((await run()).make_latest, 'false');
});

test('authentication errors are not treated as a missing release', async () => {
  const {run, mutations} = fixture({readError: Object.assign(new Error('Unauthorized'), {status: 401})});
  await assert.rejects(run(), /Unauthorized/);
  assert.deepEqual(mutations, []);
});

test('a build tag belonging to another commit is never modified', async () => {
  const {run, mutations} = fixture({existing: {draft: true, target_commitish: 'b'.repeat(40)}});
  await assert.rejects(run(), /another commit/);
  assert.deepEqual(mutations, []);
});

test('first release uses the requested version and invalid versions cause no mutations', async () => {
  const f = fixture();
  assert.equal(await f.resolve(), '0.1.0');
  for (const invalid of ['01.2.3', '1.2', '1.2.3+build.1', '1.2.3-rc.1', '999999999999999999999.0.0']) {
    await assert.rejects(f.resolve(invalid));
  }
  assert.deepEqual(f.mutations, []);
});

test('new pushes choose a numeric next patch across paginated tags and reserved drafts', async () => {
  const f = fixture({tags: [
    {name: 'build-17', commit: {sha: 'old'}},
    {name: 'v1.2.9', commit: {sha: 'old'}},
    {name: 'v1.2.10', commit: {sha: 'old'}},
    {name: 'v1.2.2+build.17.76f889a', commit: {sha: 'old'}},
  ], releases: [{tag_name: 'v1.2.11', target_commitish: 'old', draft: true}]});
  assert.equal(await f.resolve('1.2.2'), '1.2.12');
  assert.equal(await f.resolve('2.0.0'), '2.0.0');
});

test('retries retain the original version even after a newer release, including tag-only reservations', async () => {
  const tags = [
    {name: 'v1.2.3', commit: {sha: context.sha}},
    {name: 'v1.2.4', commit: {sha: 'newer'}},
  ];
  for (const draft of [true, false]) {
    assert.equal(await fixture({tags, existing: {
      tag_name: 'v1.2.3', target_commitish: context.sha, draft,
    }}).resolve('1.2.2'), '1.2.3');
  }
  assert.equal(await fixture({tags}).resolve('1.2.2'), '1.2.3');
});

test('tag collisions are rejected before any upload or release change', async () => {
  const tags = [{name: 'v0.1.0', commit: {sha: 'other'}}];
  const f = fixture({tags});
  await assert.rejects(f.run(), /another commit/);
  assert.deepEqual(f.mutations, []);
  await assert.rejects(fixture({tags, existing: {
    tag_name: 'v0.1.0', target_commitish: context.sha, draft: true,
  }}).resolve(), /another commit/);
});

test('notes select only an exact version and retain lists and subheadings', () => {
  const input = '# 记录\r\n\r\n## v1.2.3\r\n\r\n- 修复任务。\r\n\r\n### 说明\r\n保留计数。\r\n\r\n## v1.2.30\r\n\r\n- 其他版本。\r\n';
  assert.equal(notesForVersion(input, '1.2.3'), '- 修复任务。\n\n### 说明\n保留计数。');
  assert.equal(notesForVersion(input, '1.2.4'), '');
});

test('missing curated notes list every actual commit since the previous release across pages', async () => {
  const commits = Array.from({length: 101}, (_, i) => ({sha: i.toString(16).padStart(40, '0'),
    commit: {message: `实际更新 ${i}\n\n提交正文`}}));
  const release = await fixture({notes: '', commits,
    latest: {tag_name: 'v0.0.9', target_commitish: 'b'.repeat(40)},
  }).run();
  assert.match(release.body, /实际更新 0 /);
  assert.match(release.body, /实际更新 100 /);
  assert.equal((release.body.match(/实际更新/g) ?? []).length, 101);
  assert.doesNotMatch(release.body, /提交正文/);
});

test('first release without curated notes describes its source commit', async () => {
  const release = await fixture({notes: ''}).run();
  assert.match(release.body, /修复书籍翻页/);
  assert.doesNotMatch(release.body, /更多细节/);
});

test('empty comparisons cannot publish generic release notes', async () => {
  const f = fixture({notes: '', commits: [], latest: {target_commitish: 'b'.repeat(40)}});
  await assert.rejects(f.run(), /No release notes or new commits/);
  assert.deepEqual(f.mutations, []);
});

test('a delayed older job can describe its source commit without taking Latest', async () => {
  const release = await fixture({notes: '', commits: [], comparisonStatus: 'behind',
    latest: {tag_name: 'v0.2.0', target_commitish: 'b'.repeat(40), body: '- 构建记录：[#3](url)'},
  }).run();
  assert.match(release.body, /修复书籍翻页/);
  assert.equal(release.make_latest, 'false');
});
