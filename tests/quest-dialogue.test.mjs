import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {capturedQuestDialogue} from '../scripts/quest-dialogue.mjs';
import {parseValues} from '../scripts/sql.mjs';

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
