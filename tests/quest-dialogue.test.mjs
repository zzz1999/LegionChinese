import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {capturedQuestDialogue,importReviewedDialogue} from '../scripts/quest-dialogue.mjs';
import {parseValues} from '../scripts/sql.mjs';
import {ChineseTextIndex} from '../scripts/fallback.mjs';
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
  const manifest=JSON.parse(fs.readFileSync(new URL('../sources.json',import.meta.url),'utf8'));
  const audit=JSON.parse(fs.readFileSync(new URL('../docs/data-audit.json',import.meta.url),'utf8'));
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

const reviewed=()=>JSON.parse(fs.readFileSync(new URL('../data/reviewed-quest-dialogue.json',import.meta.url),'utf8'));
const baseQuests=snapshot=>new Map(snapshot.quests.map(q=>[String(q.id),{ID:String(q.id),VerifiedBuild:26972,
  LogTitle:q.identity.title,LogDescription:q.identity.objectives,QuestDescription:q.identity.description}]));

test('reviewed dialogue uses complete source fingerprints and falls back from Simplified to Traditional',()=>{
  const snapshot=reviewed(),base=baseQuests(snapshot),index=new ChineseTextIndex();
  const audit=importReviewedDialogue(snapshot,base,index);index.finish();
  assert.equal(audit.rejected,0);assert.equal(audit.candidates.length,8);assert.equal(index.entries.size,4);
  for(const quest of snapshot.quests)for(const record of Object.values(quest.fields)){
    assert.equal(index.entries.get(fingerprint(normalize(record.english))),record.locales.zhCN.text);
    assert.equal(index.entries.has(fingerprint(normalize(record.english+' A different server ending.'))),false);
  }
  const record=snapshot.quests[0].fields.Completion,key=fingerprint(normalize(record.english));
  record.locales.zhCN.text='Unsupported $123 中文';
  const fallback=new ChineseTextIndex();importReviewedDialogue(snapshot,base,fallback);fallback.finish();
  assert.equal(fallback.entries.get(key),record.locales.zhTW.text);assert.equal(fallback.localeFor(key),'zhTW');
  record.locales.zhTW.text='English placeholder';
  const missing=new ChineseTextIndex();importReviewedDialogue(snapshot,base,missing);missing.finish();
  assert.equal(missing.entries.has(key),false);
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
    const index=new ChineseTextIndex(),audit=importReviewedDialogue(snapshot,base,index);index.finish();
    assert.equal(audit.rejected,2);assert.equal(index.entries.size,2);
  }
  const snapshot=reviewed(),base=baseQuests(snapshot),record=snapshot.quests[0].fields.Completion;
  record.englishBuild=30000;
  snapshot.quests[0].fields.Progress.locales.zhCN.build=30000;
  snapshot.quests[0].fields.Description=record;
  const index=new ChineseTextIndex(),audit=importReviewedDialogue(snapshot,base,index);index.finish();
  assert.equal(audit.rejected,3);assert.equal(index.entries.size,3);
  assert.equal(index.localeFor(fingerprint(normalize(snapshot.quests[0].fields.Progress.english))),'zhTW');
  snapshot.quests.push(snapshot.quests[0]);
  assert.throws(()=>importReviewedDialogue(snapshot,base,new ChineseTextIndex()),/quest ID/);
});

test('reviewed dialogue ships only the selected fingerprints with pinned source provenance',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../sources.json',import.meta.url),'utf8'));
  const spec=manifest.reviewedQuestDialogue,bytes=fs.readFileSync(new URL('../'+spec.file,import.meta.url));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),spec.sha256);
  const audit=JSON.parse(fs.readFileSync(new URL('../docs/reviewed-quest-dialogue-audit.json',import.meta.url),'utf8'));
  assert.equal(audit.sha256,spec.sha256);assert.equal(audit.rejected,0);
  assert.deepEqual(audit.sources,JSON.parse(bytes).sources);
  assert.equal(audit.candidates.filter(row=>row.selected).length,4);
  assert.ok(audit.candidates.filter(row=>row.selected).every(row=>row.locale==='zhCN'&&row.build===18414));
});
