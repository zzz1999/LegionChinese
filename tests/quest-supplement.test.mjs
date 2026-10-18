import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {compatibleSupplement,mergeQuestSupplement} from '../scripts/quest-supplement.mjs';
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
