import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {publishRelease, resolveReleaseVersion, notesForVersion, prepareReleaseNotes} from '../scripts/release.mjs';
import {renderReleaseChangelog} from '../scripts/changelog.mjs';

const context = {
  repo: {owner: 'example', repo: 'addon'},
  sha: 'a'.repeat(40), runNumber: 2, runId: 123,
  serverUrl: 'https://github.com',
};
const version = '0.1.0';
const assetsForVersion = value => [`LegionChinese-${value}.zip`, `LegionChinese-${value}.zip.sha256`]
  .map(name => ({name, data: Buffer.from('fixture')}));
const assets = assetsForVersion(version);
const changelog = '# 更新记录\n\n## v0.1.0\n\n- 补齐任务交付说明。\n\n## v0.0.9\n\n- 旧版说明。\n';
function fixture({existing = null, latest = null, failUpload = null, readError = null,
  tags = [], releases = [], commits = [{sha: context.sha, commit: {message: '修复书籍翻页\n\n更多细节'}}],
  notes = changelog, comparisonStatus = 'ahead', comparisonError = null, latestAfterUpload = null,
  runContext = context} = {}) {
  const mutations = [];
  const comparisons = [];
  let release = existing;
  let uploaded = false;
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
      comparisons.push(args);
      if (comparisonError) throw comparisonError;
      const previous = uploaded && latestAfterUpload ? latestAfterUpload : latest;
      const refs = [previous.target_commitish, previous.tag_name,
        tags.find(tag => tag.name === previous.tag_name)?.commit.sha].filter(Boolean);
      assert.ok(refs.some(ref => args.basehead === `${ref}...${runContext.sha}`), args.basehead);
      const status = typeof comparisonStatus === 'function' ? comparisonStatus(previous) : comparisonStatus;
      return {data: {status, commits: commits.slice((args.page - 1) * args.per_page, args.page * args.per_page)}};
    },
    async getCommit(args) {
      assert.equal(args.ref, runContext.sha);
      return {data: {sha: runContext.sha, commit: {message: '修复书籍翻页\n\n更多细节'}}};
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
      uploaded = true;
      return {data: {}};
    },
    async getLatestRelease() { return {data: (uploaded && latestAfterUpload ? latestAfterUpload : latest) ?? missing()}; },
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
  return {mutations, comparisons, github, context: runContext,
    resolve: (baseVersion = version) => resolveReleaseVersion({github, context: runContext, baseVersion}),
    prepare: releaseVersion => prepareReleaseNotes({github,context:runContext,version:releaseVersion,changelog:notes}),
    run: (releaseVersion = version, releaseNotes) => publishRelease({github, context: runContext,
      version: releaseVersion, assets: assetsForVersion(releaseVersion), changelog: notes, releaseNotes}),
  };
}

test('automatic patch bumps share actual new notes with the packaged changelog and release body',async()=>{
  const prior={tag_name:'v0.1.0',target_commitish:'b'.repeat(40),draft:false};
  const flow=fixture({latest:prior,releases:[prior],tags:[{name:prior.tag_name,commit:{sha:prior.target_commitish}}]});
  const next=await flow.resolve();assert.equal(next,'0.1.1');
  const notes=await flow.prepare(next);
  assert.match(notes,/修复书籍翻页/);assert.doesNotMatch(notes,/补齐任务交付说明|旧版说明/);
  const lua=renderReleaseChangelog(notes,next);
  assert.match(lua,/version = "0\.1\.1"/);assert.match(lua,/修复书籍翻页/);
  const release=await flow.run(next,notes);
  assert.ok(release.body.includes(`## 本次更新\n\n${notes}\n\n## 安装与更新`));
});

test('draft retries preserve packaged notes and reject a mismatched replacement before uploading',async()=>{
  const draft={id:1,tag_name:'v0.1.0',target_commitish:context.sha,draft:true,assets:[],
    body:'## 本次更新\n\n- 已准备的更新记录。\n\n## 安装与更新\n\n下载。'};
  const flow=fixture({existing:draft});
  assert.equal(await flow.prepare(version),'- 已准备的更新记录。');
  await assert.rejects(flow.run(version,'- 不一致的更新记录。'),/Packaged notes differ/);
  assert.equal(flow.mutations.length,0);
  const release=await flow.run(version,await flow.prepare(version));
  assert.equal(release.body,draft.body);
});

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
  assert.ok(release.body.includes('下载 **LegionChinese-0.1.0.zip**'));
  assert.deepEqual(mutations.filter(([name]) => name === 'upload').map(([, args]) => args.name),
    ['LegionChinese-0.1.0.zip', 'LegionChinese-0.1.0.zip.sha256']);
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
  const existing = {tag_name: 'v0.1.0', draft: false, target_commitish: context.sha};
  const f = fixture({existing, comparisonStatus: 'behind',
    latest: {tag_name: 'v1.2.5', target_commitish: 'b'.repeat(40)}});
  assert.equal(await f.resolve(), '0.1.0');
  assert.equal(await f.run(), existing);
  assert.deepEqual(f.mutations, []);
  assert.deepEqual(f.comparisons, [], 'already published versions need no new ancestry check');
});

test('a superseded build skips version allocation and publication without mutations', async () => {
  const latest = {tag_name: 'v1.2.5', target_commitish: 'b'.repeat(40), draft: false,
    body: '- 构建记录：[#3](https://example.test/run)'};
  const f = fixture({latest, releases: [latest],
    tags: [{name: latest.tag_name, commit: {sha: latest.target_commitish}}], comparisonStatus: 'behind'});
  assert.equal(await f.resolve('1.2.4'), null, 'the older source must not receive v1.2.6');
  assert.equal(await f.run('1.2.6'), null, 'publication must also reject an already selected version');
  assert.deepEqual(f.mutations, []);
});

test('a new workflow run for an older commit is skipped even with a larger run number', async () => {
  const f = fixture({runContext: {...context, runNumber: 99}, comparisonStatus: 'behind',
    latest: {tag_name: 'v1.2.5', target_commitish: 'b'.repeat(40), body: '- 构建记录：[#3](url)'}});
  assert.equal(await f.resolve('1.2.4'), null);
  assert.equal(await f.run('1.2.6'), null);
  assert.deepEqual(f.mutations, []);
});

test('superseded draft and tag-only retries cannot publish an older reserved version', async () => {
  const latest = {tag_name: 'v1.2.5', target_commitish: 'b'.repeat(40)};
  for (const existing of [null, {id: 1, tag_name: 'v0.1.0', target_commitish: context.sha,
    draft: true, assets: [{id: 11, name: assets[0].name}]}]) {
    const f = fixture({latest, existing, comparisonStatus: 'behind',
      tags: [{name: 'v0.1.0', commit: {sha: context.sha}}]});
    assert.equal(await f.resolve(), null);
    assert.equal(await f.run(), null);
    assert.deepEqual(f.mutations, [], 'a stale retry must not replace draft assets');
  }
});

test('an actual descendant still receives the next version and becomes Latest', async () => {
  const latest = {tag_name: 'v1.2.5', target_commitish: 'b'.repeat(40), draft: false,
    body: '- 构建记录：[#1](url)'};
  const f = fixture({latest, releases: [latest], comparisonStatus: 'ahead',
    tags: [{name: latest.tag_name, commit: {sha: latest.target_commitish}}], notes: ''});
  const next = await f.resolve('1.2.4');
  assert.equal(next, '1.2.6');
  const release = await f.run(next);
  assert.equal(release.tag_name, 'v1.2.6');
  assert.equal(release.make_latest, 'true');
  assert.deepEqual(f.mutations.map(([name]) => name), ['create', 'upload', 'upload', 'publish']);
});

test('ancestry uses the released tag commit rather than a moving target branch', async () => {
  const latest = {tag_name: 'v1.2.5', target_commitish: 'main'};
  for (const tags of [[], [{name: latest.tag_name, commit: {sha: 'b'.repeat(40)}}]]) {
    const f = fixture({latest, tags, comparisonStatus: 'behind'});
    assert.equal(await f.resolve('1.2.4'), null);
    assert.equal(f.comparisons[0].basehead, `${tags[0]?.commit.sha ?? latest.tag_name}...${context.sha}`);
  }
});

test('unverifiable ancestry fails before allocating or publishing a version', async () => {
  const latest = {tag_name: 'v1.2.5', target_commitish: 'b'.repeat(40)};
  for (const status of ['diverged', 'unexpected', undefined]) {
    const f = fixture({latest, comparisonStatus: () => status});
    await assert.rejects(f.resolve('1.2.4'), /ancestry/i);
    await assert.rejects(f.run(), /ancestry/i);
    assert.deepEqual(f.mutations, []);
  }
  for (const status of [403, 404, 500]) {
    const error = Object.assign(new Error('Comparison unavailable'), {status});
    const f = fixture({latest, comparisonError: error});
    await assert.rejects(f.resolve(), error);
    await assert.rejects(f.run(), error);
    assert.deepEqual(f.mutations, []);
  }
});

test('a newer release appearing during asset upload keeps the superseded build as a draft', async () => {
  const newer = {tag_name: 'v1.2.5', target_commitish: 'b'.repeat(40), body: '- 构建记录：[#3](url)'};
  const f = fixture({latestAfterUpload: newer, comparisonStatus: 'behind'});
  assert.equal(await f.run(), null);
  assert.deepEqual(f.mutations.map(([name]) => name), ['create', 'upload', 'upload']);
  assert.equal(f.mutations[0][1].draft, true);
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

test('automatic notes compare the released tag even when its target branch has advanced to this push', async () => {
  const latest = {tag_name: 'v1.2.11', target_commitish: 'main', draft: false};
  const commits = Array.from({length: 101}, (_, i) => ({sha: i.toString(16).padStart(40, '0'),
    commit: {message: `版本间更新 ${i}\n\n提交正文`}}));
  for (const tags of [[], [{name: latest.tag_name, commit: {sha: 'b'.repeat(40)}}]]) {
    const f = fixture({latest, releases: [latest], tags, notes: '', commits});
    const compare = f.github.rest.repos.compareCommitsWithBasehead;
    const requested = [];
    f.github.rest.repos.compareCommitsWithBasehead = async args => {
      requested.push(args);
      // main already points at the current push, unlike the previous version tag.
      if (args.basehead === `main...${context.sha}`) return {data: {status: 'identical', commits: []}};
      return compare(args);
    };
    const next = await f.resolve('1.2.11');
    assert.equal(next, '1.2.12');
    const release = await f.run(next);
    assert.equal(release.tag_name, 'v1.2.12');
    assert.equal(release.draft, false);
    assert.equal(release.make_latest, 'true');
    assert.match(release.body, /版本间更新 0 /);
    assert.match(release.body, /版本间更新 100 /);
    assert.equal((release.body.match(/版本间更新/g) ?? []).length, 101);
    const ref = tags[0]?.commit.sha ?? latest.tag_name;
    assert.ok(requested.every(args => args.basehead === `${ref}...${context.sha}`));
    assert.deepEqual(requested.filter(args => args.per_page === 100).map(args => args.page), [1, 2]);
    assert.deepEqual(f.mutations.map(([name]) => name), ['create', 'upload', 'upload', 'publish']);
  }
});

test('first release without curated notes describes its source commit', async () => {
  const release = await fixture({notes: ''}).run();
  assert.match(release.body, /修复书籍翻页/);
  assert.doesNotMatch(release.body, /更多细节/);
});

test('empty comparisons cannot publish generic release notes', async () => {
  const f = fixture({notes: '', commits: [], latest: {tag_name: 'v0.0.9', target_commitish: 'b'.repeat(40)}});
  await assert.rejects(f.run(), /No release notes or new commits/);
  assert.deepEqual(f.mutations, []);
});

test('a delayed older job without curated notes is skipped instead of generating a misleading release', async () => {
  const f = fixture({notes: '', commits: [], comparisonStatus: 'behind',
    latest: {tag_name: 'v0.2.0', target_commitish: 'b'.repeat(40), body: '- 构建记录：[#3](url)'},
  });
  assert.equal(await f.run(), null);
  assert.deepEqual(f.mutations, []);
});

// Run the actual inline Actions scripts with local API/filesystem stand-ins.
// This checks that a null release selection is wired through to both step gates.
const workflow = await readFile(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');
const steps = new Map(workflow.replaceAll('\r\n', '\n').split(/^      - name: /m).slice(1)
  .map(block => [block.slice(0, block.indexOf('\n')), block]));
const workflowFiles=new WeakMap();
async function runWorkflowStep(name, f, outputs = {}) {
  if(!workflowFiles.has(outputs))workflowFiles.set(outputs,new Map());
  const files=workflowFiles.get(outputs);
  const messages = [];
  const summary = {
    addHeading(text) { messages.push(text); return this; },
    addRaw(text) { messages.push(text); return this; },
    addLink(text) { messages.push(text); return this; },
    async write() {},
  };
  const core = {summary, notice: text => messages.push(text), setOutput: (key, value) => { outputs[key] = value; }};
  const require = module => {
    if (module === 'node:url') return {pathToFileURL};
    assert.equal(module, 'node:fs/promises');
    return {async mkdir(path){assert.equal(path,'.release');},
      async writeFile(path,text){files.set(path,text);},
      async readFile(path) {
      if(files.has(path))return files.get(path);
      if (path === 'package.json') return JSON.stringify({version: '1.2.4'});
      if (path === 'CHANGELOG.md') return changelog;
      const asset = assetsForVersion(outputs.version).find(asset => path === `dist/${asset.name}`);
      assert.ok(asset, `Unexpected file read: ${path}`);
      return asset.data;
    }};
  };
  const script = steps.get(name).split('          script: |\n')[1].replace(/^ {12}/gm, '');
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  await new AsyncFunction('require', 'github', 'context', 'core', 'process', script)(
    require, f.github, f.context, core,
    {env: {GITHUB_WORKSPACE: fileURLToPath(new URL('..', import.meta.url)), PACKAGE_VERSION: outputs.version}},
  );
  return {outputs, messages};
}

test('workflow skips both packaging and publishing for a superseded source', async () => {
  const f = fixture({latest: {tag_name: 'v1.2.5', target_commitish: 'b'.repeat(40)}, comparisonStatus: 'behind'});
  const {outputs, messages} = await runWorkflowStep('Select release version', f);
  assert.equal(outputs.publish, 'false');
  assert.equal(outputs.version, undefined);
  for (const name of ['Package addon', 'Publish release']) {
    assert.match(steps.get(name), /^        if: steps\.version\.outputs\.publish == 'true'$/m);
  }
  assert.ok(messages.includes('Release skipped'));
  assert.deepEqual(f.mutations, []);
});

test('workflow publishes the selected successor version and handles a later skip cleanly', async () => {
  const latest = {tag_name: 'v1.2.5', target_commitish: 'b'.repeat(40), draft: false};
  const f = fixture({latest, releases: [latest], tags: [{name: latest.tag_name, commit: {sha: latest.target_commitish}}]});
  const {outputs} = await runWorkflowStep('Select release version', f);
  assert.deepEqual(outputs, {publish: 'true', version: '1.2.6'});
  const result = await runWorkflowStep('Publish release', f, outputs);
  assert.ok(result.messages.includes('v1.2.6'));
  assert.equal(f.mutations[0][1].tag_name, 'v1.2.6');
  assert.ok(f.mutations[0][1].body.includes('下载 **LegionChinese-1.2.6.zip**'));
  assert.deepEqual(f.mutations.filter(([name]) => name === 'upload').map(([, args]) => args.name),
    ['LegionChinese-1.2.6.zip', 'LegionChinese-1.2.6.zip.sha256']);
  assert.deepEqual(f.mutations.map(([name]) => name), ['create', 'upload', 'upload', 'publish']);

  const stale = fixture({latest, comparisonStatus: 'behind'});
  const skipped = await runWorkflowStep('Publish release', stale, outputs);
  assert.ok(skipped.messages.includes('Release skipped'));
  assert.deepEqual(stale.mutations, []);
});
