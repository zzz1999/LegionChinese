import {readFixtureFile,listFixtureFiles} from './addon-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {capturedQuestDialogue,importReviewedDialogue,collectReviewedDialogue} from '../scripts/quest-dialogue.mjs';
import {parseValues} from '../scripts/sql.mjs';
import {fingerprint,normalize} from '../scripts/text.mjs';

const source={locale:'zhCN',captureBuild:26124,questIDs:[34774]};
const row={ID:'34774',RewardText:'你要接受这份馈赠，并且一定会喜欢它的。',VerifiedBuild:'26124'};

test('reviewed Chinese reward captures become the correct quest locale field',()=>{
  assert.deepEqual(capturedQuestDialogue('quest_offer_reward',row,source),{
    table:'quest_offer_reward_locale',row:{ID:'34774',locale:'zhCN',RewardText:row.RewardText,VerifiedBuild:26124}});
  assert.deepEqual(capturedQuestDialogue('quest_request_items',{ID:'34774',CompletionText:'任务进行中。',VerifiedBuild:'26124'},source),{
    table:'quest_request_items_locale',row:{ID:'34774',locale:'zhCN',CompletionText:'任务进行中。',VerifiedBuild:26124}});
  assert.equal(capturedQuestDialogue('quest_offer_reward',row,{...source,locale:'zhTW'}).row.locale,'zhTW');
});

test('base-table capture import rejects unknown IDs, versions, languages and incomplete fields',()=>{
  for(const invalid of [{...row,ID:'32851'},{...row,ID:'34774.5'},{...row,VerifiedBuild:'0'},
    {...row,VerifiedBuild:'27547'},{...row,VerifiedBuild:'26365'},{...row,VerifiedBuild:'NaN'},
    {...row,RewardText:undefined},{...row,RewardText:''},{...row,RewardText:'English reward'},
    {...row,RewardText:'不可解析的$1oa目标'}])assert.equal(capturedQuestDialogue('quest_offer_reward',invalid,source),null);
  for(const invalid of [{...source,locale:undefined},{...source,locale:'enUS'},{...source,questIDs:[]},
    {...source,captureBuild:undefined}])assert.equal(capturedQuestDialogue('quest_offer_reward',row,invalid),null);
  assert.equal(capturedQuestDialogue('quest_template',row,source),null);
  // A later update containing only VerifiedBuild must not create a blank
  // translation or falsely promote an older text to a newer capture build.
  assert.equal(capturedQuestDialogue('quest_offer_reward',{ID:'34774',VerifiedBuild:'26124'},source),null);
});

test('Blingtron 6000 capture retains both paragraphs and no reward mechanics',()=>{
  const columns=['ID','Emote1','Emote2','Emote3','Emote4','EmoteDelay1','EmoteDelay2','EmoteDelay3','EmoteDelay4','RewardText','VerifiedBuild'];
  let parsed;
  parseValues("(40753, 0, 0, 0, 0, 0, 0, 0, 0, '我的功能是发放礼物，根据我的观察显示，你的功能是接收礼物。$b$b我们可以进行一次互惠互利的交易吗？', 25996);",values=>parsed=Object.fromEntries(columns.map((key,i)=>[key,values[i]])));
  const result=capturedQuestDialogue('quest_offer_reward',parsed,{locale:'zhCN',captureBuild:25996,questIDs:[40753]});
  assert.equal(result.row.RewardText,parsed.RewardText);
  assert.deepEqual(Object.keys(result.row),['ID','locale','RewardText','VerifiedBuild']);
});

test('shipped source audit confirms both pinned daily reward captures were imported',()=>{
  const manifest=JSON.parse(readFixtureFile(new URL('../sources.json',import.meta.url),'utf8'));
  const audit=JSON.parse(readFixtureFile(new URL('../docs/data-audit.json',import.meta.url),'utf8'));
  const captures=manifest.sql.filter(source=>source.kind==='quest-dialogue-capture');
  assert.deepEqual(captures.flatMap(source=>source.questIDs).sort((a,b)=>a-b),[34774,40753]);
  for(const source of captures){
    const imported=audit.sources.find(entry=>entry.file===source.file);
    assert.ok(imported,source.file);
    assert.equal(imported.sha256,source.sha256);
    assert.equal(imported.provenance,source.provenance);
    assert.equal(imported.locale,'zhCN');
    assert.deepEqual(imported.imported,source.questIDs.map(id=>({id,table:'quest_offer_reward_locale',verifiedBuild:source.captureBuild})));
  }
});

const reviewed=()=>{
  const snapshot=JSON.parse(readFixtureFile(new URL('../data/reviewed-quest-dialogue.json',import.meta.url),'utf8'));
  snapshot.quests=snapshot.quests.filter(q=>[29406,29524].includes(q.id));
  return snapshot;
};
const baseQuests=snapshot=>new Map(snapshot.quests.map(q=>[String(q.id),{ID:String(q.id),VerifiedBuild:26972,
  LogTitle:q.identity.title,LogDescription:q.identity.objectives,QuestDescription:q.identity.description}]));
const scope=(result,id,field)=>result.scopes.find(s=>s.id===id&&s.field===field)?.index;

test('reviewed dialogue uses complete source fingerprints and falls back from Simplified to Traditional',()=>{
  const snapshot=reviewed(),base=baseQuests(snapshot),result=importReviewedDialogue(snapshot,base);
  assert.equal(result.audit.rejected,0);assert.equal(result.audit.candidates.length,8);assert.equal(result.scopes.length,4);
  for(const quest of snapshot.quests)for(const [field,record] of Object.entries(quest.fields)){
    const index=scope(result,quest.id,field);
    assert.equal(index.entries.get(fingerprint(normalize(record.english))),record.locales.zhCN.text);
    assert.equal(index.entries.has(fingerprint(normalize(record.english+' A different server ending.'))),false);
  }
  const record=snapshot.quests[0].fields.Completion,key=fingerprint(normalize(record.english));
  record.locales.zhCN.text='Unsupported $123 中文';
  const fallback=scope(importReviewedDialogue(snapshot,base),29406,'Completion');
  assert.equal(fallback.entries.get(key),record.locales.zhTW.text);assert.equal(fallback.localeFor(key),'zhTW');
  record.locales.zhTW.text='English placeholder';
  assert.equal(scope(importReviewedDialogue(snapshot,base),29406,'Completion'),undefined);
});

test('reviewed dialogue rejects changed quest context, later builds, unrelated fields and duplicate IDs',()=>{
  for(const change of [
    (s,b)=>{b.get('29406').LogTitle='Another task';},
    (s,b)=>{b.get('29406').LogDescription='Another objective';},
    s=>{s.quests[0].legacyIdentity.description='Changed legacy dialogue';},
    (s,b)=>{b.get('29406').VerifiedBuild=30000;},
    (s,b)=>{b.delete('29406');}
  ]){
    const snapshot=reviewed(),base=baseQuests(snapshot);change(snapshot,base);
    const {scopes,audit}=importReviewedDialogue(snapshot,base);
    assert.equal(audit.rejected,2);assert.equal(scopes.length,2);
  }
  const snapshot=reviewed(),base=baseQuests(snapshot),record=snapshot.quests[0].fields.Completion;
  record.englishBuild=30000;
  snapshot.quests[0].fields.Progress.locales.zhCN.build=30000;
  snapshot.quests[0].fields.Description=record;
  const result=importReviewedDialogue(snapshot,base);
  assert.equal(result.audit.rejected,3);assert.equal(result.scopes.length,3);
  const index=scope(result,29406,'Progress');
  assert.equal(index.localeFor(fingerprint(normalize(snapshot.quests[0].fields.Progress.english))),'zhTW');
  snapshot.quests.push(snapshot.quests[0]);
  assert.throws(()=>importReviewedDialogue(snapshot,base),/quest ID/);
});

test('supplementary dialogue preserves existing quest fields and isolates conflicting common phrases',()=>{
  const snapshot=reviewed();
  const first=snapshot.quests[0].fields.Completion,second=snapshot.quests[1].fields.Completion;
  second.english=first.english;second.legacyEnglish=first.legacyEnglish;
  second.locales.zhCN.text='另一个任务的完成对白。';
  const base=baseQuests(snapshot),result=importReviewedDialogue(snapshot,base,new Map([['29406',{Progress:'已有可靠中文。'}]]));
  assert.equal(scope(result,29406,'Progress'),undefined);
  assert.equal(result.audit.alreadyCoveredFields,1);
  assert.equal(result.audit.candidates.filter(r=>r.alreadyCovered).length,2);
  const key=fingerprint(normalize(first.english));
  assert.equal(scope(result,29406,'Completion').entries.get(key),first.locales.zhCN.text);
  assert.equal(scope(result,29524,'Completion').entries.get(key),second.locales.zhCN.text);
});

function batchFixture(){
  const old={Id:'1',Title:'Training',Objectives:'Defeat 5 targets.',Details:'Practice your attacks.',WDBVerified:18414,OfferRewardText:'Well done, $n.'};
  const current={ID:'1',LogTitle:old.Title,LogDescription:old.Objectives,QuestDescription:old.Details,VerifiedBuild:26972};
  return {legacyQuests:new Map([['1',old]]),baseQuests:new Map([['1',current]]),
    references:[{id:'legion-world',quests:new Map([['1',current]]),Progress:new Map(),Completion:new Map([['1',{text:old.OfferRewardText,build:26972}]])}],
    localeRows:[{id:1,field:'Completion',locale:'zhCN',build:18414,text:'干得好，$n。'},
      {id:1,field:'Completion',locale:'zhTW',build:18414,text:'幹得好，$n。'}]};
}

test('batch review uses exact context and records which originals also match Legion',()=>{
  const input=batchFixture(),result=collectReviewedDialogue(input);
  assert.equal(result.verification.rows,2);assert.equal(result.verification.byResult['cross-version-exact'],2);
  assert.equal(result.quests[0].fields.Completion.method,'cross-version-exact');
  input.references[0].Completion.get('1').text='Bien hecho, $n.';
  const legacy=collectReviewedDialogue(input).quests[0].fields.Completion;
  assert.equal(legacy.method,'legacy-full-text');assert.equal(legacy.english,'Well done, $n.');
  assert.equal(legacy.englishSource,'pandaria-world');assert.deepEqual(legacy.confirmation,[]);
  // A changed count is not normalized away, even when the title is identical.
  input.baseQuests.get('1').LogDescription='Defeat 10 targets.';
  assert.deepEqual(collectReviewedDialogue(input).quests,[]);
});

test('batch review excludes later/unmarked translations, unsupported tokens and unpaired originals',()=>{
  for(const [mutate,reason] of [
    [r=>{r.build=55261;},'translation_build'],[r=>{r.build=0;},'unverified_build'],
    [r=>{r.text='数量：$1oa';},'unusable_chinese'],[r=>{r.text='untranslated';},'unusable_chinese']
  ]){
    const input=batchFixture();input.localeRows=input.localeRows.slice(0,1);mutate(input.localeRows[0]);
    const result=collectReviewedDialogue(input);
    assert.deepEqual(result.quests,[]);assert.equal(result.verification.byResult[reason],1);
  }
  const input=batchFixture();input.legacyQuests.get('1').OfferRewardText=null;
  assert.equal(collectReviewedDialogue(input).verification.byResult.missing_legacy_original,2);
  // Missing legacy text needs a specific human review AND a matching pinned
  // current record; a generic ID allowlist cannot create a translation.
  input.reviews=[{id:1,field:'Completion',source:'legion-world',english:'Well done, $n.',note:'Reviewed complete bilingual field.'}];
  assert.equal(collectReviewedDialogue(input).quests[0].fields.Completion.method,'reviewed-current');
  input.references[0].Completion.get('1').text='A different ending.';
  assert.deepEqual(collectReviewedDialogue(input).quests,[]);
  const duplicate=batchFixture();duplicate.localeRows.push(duplicate.localeRows[0]);
  assert.throws(()=>collectReviewedDialogue(duplicate),/Duplicate reviewed dialogue locale/);
});

test('reviewed dialogue ships only the selected fingerprints with pinned source provenance',()=>{
  const manifest=JSON.parse(readFixtureFile(new URL('../sources.json',import.meta.url),'utf8'));
  const spec=manifest.reviewedQuestDialogue,bytes=readFixtureFile(new URL('../'+spec.file,import.meta.url));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),spec.sha256);
  const audit=JSON.parse(readFixtureFile(new URL('../docs/reviewed-quest-dialogue-audit.json',import.meta.url),'utf8'));
  assert.equal(audit.sha256,spec.sha256);assert.equal(audit.rejected,0);
  assert.deepEqual(audit.sources,JSON.parse(bytes).sources);
  assert.equal(audit.verification.rows,29258);
  assert.equal(Object.values(audit.verification.byResult).reduce((a,b)=>a+b,0),29258);
  assert.equal(audit.fields,52);assert.equal(audit.quests,36);
  assert.deepEqual(audit.byLocale,{zhCN:15,zhTW:37});
  assert.equal(audit.candidates.filter(row=>row.selected).length,52);
  assert.ok(audit.candidates.filter(row=>row.selected).every(row=>row.build===18414&&!row.alreadyCovered));
  const reviews=readFixtureFile(new URL('../'+audit.reviews.file,import.meta.url));
  assert.equal(crypto.createHash('sha256').update(reviews).digest('hex'),audit.reviews.sha256);
});
