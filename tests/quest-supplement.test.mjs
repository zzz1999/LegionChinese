import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {compatibleSupplement,compatibleFieldAlias,mergeQuestSupplement} from '../scripts/quest-supplement.mjs';
import {ChineseTextIndex} from '../scripts/fallback.mjs';
const base={ID:'5',LogTitle:'A journey',LogDescription:'Speak to the captain.',QuestDescription:'Return, $n.',QuestCompletionLog:'',VerifiedBuild:26972};
const quest={id:5,identity:{title:base.LogTitle,objectives:base.LogDescription,description:base.QuestDescription}};
const record={text:'与船长谈一谈。',locale:'zhCN',english:base.LogDescription,build:26972,source:'same-version',column:'quest_template_locale.logdescription'};

test('quest supplements require same-version identity and source-text context, not merely a matching numeric ID',()=>{
  assert.equal(compatibleSupplement(base,quest,'Objectives',record),true);
  for(const other of [{...base,ID:6},{...base,LogTitle:'Different quest'},{...base,LogDescription:'Changed',QuestDescription:'Changed'},
    {...base,LogDescription:'Changed'},{...base,VerifiedBuild:30000}])assert.equal(compatibleSupplement(other,quest,'Objectives',record),false);
  for(const other of [{...record,locale:'enUS'},{...record,text:'English'},{...record,text:'中文 $123'},
    {...record,build:30000},{...record,build:-30000}])assert.equal(compatibleSupplement(base,quest,'Objectives',other),false);
  assert.equal(compatibleSupplement(base,quest,'UnknownField',record),false);
  assert.equal(compatibleSupplement(base,quest,'Completion',{...record,text:'谢谢你，$n。',english:'Thank you, $n.'}),true);
});

test('supplement import fills missing fields, preserves existing Chinese and validates the pinned snapshot hash',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'legion-quest-supplement-'));
  try{
    const data={schemaVersion:1,version:'legion',baseWorldSha256:'world',archive:{commit:'pinned'},sources:[{id:'same-version'}],
      quests:[{...quest,fields:{Objectives:record,Completion:{...record,text:'谢谢你。',english:'Thank you.'}}}]};
    const bytes=JSON.stringify(data);fs.writeFileSync(path.join(root,'snapshot.json'),bytes);
    const manifest={sql:[{kind:'world',sha256:'world'}],questSupplement:{file:'snapshot.json',sha256:crypto.createHash('sha256').update(bytes).digest('hex')}};
    const questData=new Map([['5',{Objectives:'與船長談一談。'}]]);
    const args={root,manifest,baseQuests:new Map([['5',base]]),questData,titles:new ChineseTextIndex(),gossip:new ChineseTextIndex(),completions:new ChineseTextIndex()};
    const audit=mergeQuestSupplement(args);
    assert.deepEqual(questData.get('5'),{Objectives:'與船長談一談。',Completion:'谢谢你。'});
    assert.equal(audit.fields,1);assert.equal(audit.preserved,1);assert.equal(audit.quests,1);
    fs.appendFileSync(path.join(root,'snapshot.json'),' ');
    assert.throws(()=>mergeQuestSupplement(args),/checksum mismatch/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('reviewed journal aliases reject changed context, dialogue, missing quests and later versions',()=>{
  const target={...base,ID:'6'};
  assert.equal(compatibleFieldAlias(target,base,quest,'Objectives',record),true);
  for(const invalid of [undefined,{...target,LogTitle:'Other quest'},{...target,LogDescription:'Speak to another captain.'},
    {...target,QuestDescription:'A different class story.'},{...target,QuestDescription:''},
    {...target,VerifiedBuild:30000},{...target,VerifiedBuild:'unknown'}]){
    assert.equal(compatibleFieldAlias(invalid,base,quest,'Objectives',record),false);
  }
  assert.equal(compatibleFieldAlias(target,{...base,VerifiedBuild:30000},quest,'Objectives',record),false);
  assert.equal(compatibleFieldAlias(target,base,quest,'Objectives',{...record,english:'Another objective.'}),false);
  for(const field of ['Completion','Progress','CompletionLog']){
    assert.equal(compatibleFieldAlias(target,base,quest,field,record),false);
  }
});

test('journal alias import retains original quest provenance and never overwrites existing Chinese',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'legion-quest-alias-'));
  try{
    const snapshot={schemaVersion:1,version:'legion',baseWorldSha256:'world',archive:{commit:'pinned'},sources:[{id:'same-version'}],
      quests:[{...quest,fields:{Objectives:record}}]};
    const bytes=JSON.stringify(snapshot);fs.writeFileSync(path.join(root,'snapshot.json'),bytes);
    const manifest={sql:[{kind:'world',sha256:'world'}],questSupplement:{file:'snapshot.json',
      sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
      fieldAliases:[{id:6,sourceQuestID:5,fields:['Objectives']},{id:7,sourceQuestID:5,fields:['Objectives']},
        {id:8,sourceQuestID:5,fields:['Objectives']}]}};
    const questData=new Map([['7',{Objectives:'現有的中文目標。'}]]);
    const args={root,manifest,questData,baseQuests:new Map([
      ['5',base],['6',{...base,ID:'6'}],['7',{...base,ID:'7'}],['8',{...base,ID:'8',QuestDescription:'Different story.'}]
    ]),titles:new ChineseTextIndex(),gossip:new ChineseTextIndex(),completions:new ChineseTextIndex()};
    const audit=mergeQuestSupplement(args);
    assert.deepEqual(questData.get('6'),{Objectives:record.text});
    assert.equal(questData.get('7').Objectives,'現有的中文目標。');assert.equal(questData.has('8'),false);
    assert.equal(audit.fields,2);assert.equal(audit.quests,2);assert.equal(audit.preserved,1);assert.equal(audit.rejected,1);
    assert.deepEqual(audit.records.find(row=>row.id===6),{id:6,field:'Objectives',locale:'zhCN',source:'same-version',
      column:record.column,build:26972,sourceQuestID:5,match:'reviewed-identical-journal-text'});
    manifest.questSupplement.fieldAliases=[{id:6,sourceQuestID:5,fields:['Completion']}];
    assert.throws(()=>mergeQuestSupplement(args),/Invalid quest field alias/);
    manifest.questSupplement.fieldAliases=[{id:6,sourceQuestID:9999,fields:['Objectives']}];
    assert.equal(mergeQuestSupplement(args).rejected,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
