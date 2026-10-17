import test from 'node:test';
import assert from 'node:assert/strict';
import {publishRelease} from '../scripts/release.mjs';

const context = {
  repo: {owner: 'example', repo: 'addon'},
  sha: 'a'.repeat(40), runNumber: 2, runId: 123,
  serverUrl: 'https://github.com',
};
const assets = ['TauriChinese-latest.zip', 'TauriChinese-latest.zip.sha256']
  .map(name => ({name, data: Buffer.from('fixture')}));

function fixture({existing = null, latest = null, failUpload = null, readError = null} = {}) {
  const mutations = [];
  let release = existing;
  const missing = () => { throw Object.assign(new Error('Not found'), {status: 404}); };
  const api = {
    async getReleaseByTag() {
      if (readError) throw readError;
      return {data: release && !release.draft ? release : missing()};
    },
    async listReleases() {},
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
    paginate: {async *iterator() {
      yield {data: [{tag_name: 'unrelated-release'}]};
      yield {data: release ? [{...release, tag_name: 'build-2'}] : []};
    }},
  };
  return {mutations, run: () => publishRelease({github, context, version: '0.1.0+build.2.aaaaaaa', assets})};
}

test('release is published only after both assets have uploaded', async () => {
  const {run, mutations} = fixture();
  const release = await run();
  assert.deepEqual(mutations.map(([name]) => name), ['create', 'upload', 'upload', 'publish']);
  assert.equal(mutations[0][1].draft, true);
  assert.equal(mutations[0][1].target_commitish, context.sha);
  assert.equal(release.draft, false);
  assert.equal(release.make_latest, 'true');
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
  const {run} = fixture({latest: {tag_name: 'build-3'}});
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
