import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {compileQuestTemplate,questTemplateParts,questTemplateLua,buildQuestVariables} from '../scripts/quest-variables.mjs';
import {luaString,fingerprint,normalize,supportsTokens} from '../scripts/text.mjs';
import {readFixtureFile} from './addon-fixture.mjs';
import {runtimeFiles} from '../scripts/resource-layout.mjs';

const snapshot=JSON.parse(fs.readFileSync(new URL('../data/quest-variables-735.json',import.meta.url)));
const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
function runtime(body,{shipped=false}={}){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const run=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    for(const file of ['Bootstrap.lua',...(shipped?['Data/Quests/QuestTemplates_01.lua']:[]),'Core.lua','QuestTemplates.lua'])
      run(readFixtureFile(new URL(file,addon),'utf8'));
    run('function UnitName() return "小明" end\nfunction UnitRace() return "人类","Human" end');
    body(run);
  }finally{lua.lua_close(L);}
}
const render=(text,name='小明',race='Human',amount=n=>String(n*7+3))=>questTemplateParts(text)
  .map(p=>typeof p==='string'?p:p===-1?name:p===-2?race:amount(p)).join('');
const install=(run,original,chinese,id=999001)=>run('LegionChineseDB.QuestTemplates['+id+']={Objectives='+questTemplateLua(compileQuestTemplate(original,chinese))+'}');
function expect(run,original,id,field,chinese){
  run(`local original=${luaString(original)};local text,changed=LegionChinese.Translate("Quests",original,${id},${luaString(field)})
    assert(text==${luaString(chinese??original)} and changed==${chinese!==undefined},${luaString(id+':'+field+':'+original.slice(0,55))})`);
}

test('reviewed snapshot binds 33 fields; three class-title candidates remain deferred',()=>{
  assert.equal(snapshot.quests.length,33);assert.equal(snapshot.deferred.length,3);
  assert.equal(snapshot.quests.filter(q=>q.field==='Objectives').length,23);
  assert.equal(snapshot.quests.filter(q=>q.field==='Description').length,10);
  assert.equal(snapshot.quests.filter(q=>q.translations.some(t=>t.locale==='zhCN')).length,25);
  assert.equal(snapshot.quests.reduce((n,q)=>n+q.translations.length,0),55);
  assert.deepEqual(snapshot.deferred.map(q=>q.id).sort(),[46141,46143,46147]);
  for(const source of snapshot.sources.filter(s=>s.provenance==='community-client-capture')){
    assert.equal(source.officialChineseVerified,false);assert.equal(source.build,26365);
    assert.match(source.sha256,/^[a-f0-9]{64}$/);assert.match(source.revision,/^[a-f0-9]{40}$/);
  }
  for(const q of snapshot.quests)for(const t of q.translations){
    assert.ok(!supportsTokens(t.text),'global unsupported-token guard remains strict');
    assert.doesNotThrow(()=>compileQuestTemplate(q.original,t.text));
  }
});

test('all 55 reviewed language records match complete rendered originals and preserve mismatches',()=>runtime(run=>{
  for(const q of snapshot.quests)for(const t of q.translations){
    const compiled=compileQuestTemplate(q.original,t.text);
    run('LegionChineseDB.QuestTemplates['+q.id+']={'+q.field+'='+questTemplateLua(compiled)+'}');
    const original=render(q.original),chinese=render(t.text,'小明','人类');
    expect(run,original,q.id,q.field,chinese);
    expect(run,'Different source. '+original,q.id,q.field);
    expect(run,original+' Additional requirements.',q.id,q.field);
    expect(run,original,999999,q.field);
    expect(run,original,q.id,'Completion');
    expect(run,q.original,q.id,q.field); // unexpanded source variables
    expect(run,'已经是中文。',q.id,q.field);
  }
}));

test('shipped resource and TOC include every selected template with Simplified priority',()=>{
  const toc=fs.readFileSync(new URL('LegionChinese.toc',addon),'utf8').replaceAll('\\','/');
  assert.ok(toc.includes('Data/Quests/QuestTemplates_01.lua'));
  assert.ok(toc.indexOf('Core.lua')<toc.indexOf('QuestTemplates.lua'));
  assert.ok(toc.indexOf('QuestTemplates.lua')<toc.indexOf('UI.lua'));
  runtime(run=>{
    for(const q of snapshot.quests){
      const selected=q.translations.find(t=>t.locale==='zhCN')??q.translations.find(t=>t.locale==='zhTW');
      expect(run,render(q.original),q.id,q.field,render(selected.text,'小明','人类'));
    }
    for(const q of snapshot.deferred)expect(run,q.original.replace('$ct','Highlord'),q.id,q.field);
  },{shipped:true});
});

test('server quantities remain bound by token identity, including reordered and repeated slots',()=>runtime(run=>{
  run('function GetQuestObjectiveInfo() error("visible objective order is not authoritative") end');
  const original='Collect $1oa apples and $2oa pears; use $1oa apples.';
  install(run,original,'先带来$2oa个梨和$1oa个苹果，再使用$1oa个苹果。');
  for(const [a,b] of [[4,12],[12,4],[0,1],[2147483647,77]])expect(run,`Collect ${a} apples and ${b} pears; use ${a} apples.`,999001,'Objectives',`先带来${b}个梨和${a}个苹果，再使用${a}个苹果。`);
  for(const a of ['-1','+5','01','1.5','1,000','2147483648','99999999999999999999999','1 2'])
    expect(run,`Collect ${a} apples and 12 pears; use ${a} apples.`,999001,'Objectives');
  expect(run,'Collect 4 apples and 12 pears; use 5 apples.',999001,'Objectives');
  expect(run,'Collect 4 oranges and 12 pears; use 4 apples.',999001,'Objectives');
  expect(run,'Collect 4 apples and 12 pears; use 4 apples.'+' '.repeat(16400),999001,'Objectives');
}));

test('quest window and selected journal reuse the shipped variable fields through production UI entry points',()=>runtime(run=>{
  run(fs.readFileSync(new URL('ui-fixture.lua',import.meta.url),'utf8'));
  for(const file of runtimeFiles.filter(f=>!['Core.lua','QuestTemplates.lua'].includes(f)))run(fs.readFileSync(new URL(file,addon),'utf8'));
  run('function UnitName() return "小明" end;function UnitRace() return "人类","Human" end');
  for(const id of [48067,32268]){
    const q=snapshot.quests.find(q=>q.id===id),t=q.translations.find(t=>t.locale==='zhCN')??q.translations[0];
    const widget=q.field==='Objectives'?'QuestInfoObjectivesText':'QuestInfoDescriptionText';
    for(const journal of [false,true])run(`
      QuestInfoFrame.questLog=${journal}
      function GetQuestID() return ${id} end
      function GetQuestLogSelection() return 2 end
      function GetQuestLogTitle() return "title",1,0,false,false,false,0,${id} end
      ${widget}:SetText(${luaString(render(q.original))})
      LegionChinese.UpdateQuestInfo()
      assert(${widget}:GetText()==${luaString(render(t.text,'小明','人类'))})
      ${widget}:SetText("Server customized this quest.")
      LegionChinese.UpdateQuestInfo()
      assert(${widget}:GetText()=="Server customized this quest.")
    `);
  }
},{shipped:true}));

test('player/race bindings require known values, preserve literal names and do not cache player state',()=>runtime(run=>{
  install(run,'Hello $p, the $r. Please come back.','你好$p，这位$r。请回来。');
  expect(run,'Hello 小明, the Human. Please come back.',999001,'Objectives','你好小明，这位人类。请回来。');
  expect(run,'Hello SomebodyElse, the Human. Please come back.',999001,'Objectives');
  run('function UnitName() return "Ann.%" end;function UnitRace() return "兽人","Orc" end');
  expect(run,'Hello Ann.%, the Orc. Please come back.',999001,'Objectives','你好Ann.%，这位兽人。请回来。');
  expect(run,'Hello Ann.%, the Human. Please come back.',999001,'Objectives');
  run('UnitName=nil');
  expect(run,'Hello Ann.%, the Orc. Please come back.',999001,'Objectives');
  run('function UnitName() return "Ann.%" end;UnitRace=nil');
  expect(run,'Hello Ann.%, the Orc. Please come back.',999001,'Objectives');
  run('function UnitRace() return "Unknown","CUSTOM" end');
  expect(run,'Hello Ann.%, the Unknown. Please come back.',999001,'Objectives');
}));

test('existing matched translations win and source literals are checked without scanning the database',()=>runtime(run=>{
  const source='Collect $1oa apples near the river.';
  install(run,source,'在河边收集$1oa个苹果。');
  const original='Collect 10 apples near the river.';
  run(`LegionChineseDB.Quests[999001]={Objectives="已有简体译文。"}
    LegionChineseDB.QuestSources[999001]={Objectives={[${luaString(fingerprint(normalize(original)))}]=true}}
    local calls=0;local old=LegionChinese.TranslateQuestTemplate
    LegionChinese.TranslateQuestTemplate=function(...) calls=calls+1;return old(...) end`);
  expect(run,original,999001,'Objectives','已有简体译文。');
  run('local old=LegionChinese.Fingerprint;local calls=0;LegionChinese.Fingerprint=function(s) calls=calls+1;return old(s) end\nassert(LegionChinese.TranslateQuestTemplate(1,"Objectives","unknown")==nil and calls==0)');
}));

test('compiler rejects unknown tokens, mismatched counts and ambiguous slots',()=>{
  for(const token of ['$ct','$pc','$pr','$1os','$0oa','$33oa','$P','$CT'])
    assert.throws(()=>compileQuestTemplate('Please collect '+token+' apples.','请收集'+token+'个苹果。'));
  assert.throws(()=>compileQuestTemplate('Collect $1oa apples.','请收集$2oa个苹果。'));
  assert.throws(()=>compileQuestTemplate('Collect $1oa apples and $1oa pears.','请收集$1oa个苹果。'));
  assert.throws(()=>compileQuestTemplate('Collect $1oa$2oa apples.','请收集$1oa$2oa个苹果。'));
  assert.throws(()=>compileQuestTemplate('Collect $1oa 2 apples.','请收集$1oa个苹果。'));
  assert.throws(()=>compileQuestTemplate('Collect $1oa apples.','请收集$1oa个苹果~1~。'));
  assert.throws(()=>compileQuestTemplate('$1oa','苹果$1oa'));
});

test('build refuses altered snapshots and emits only Chinese text and source fingerprints',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lcn-quest-variables-'));
  try{
    fs.mkdirSync(path.join(root,'data'));fs.mkdirSync(path.join(root,'docs'));
    const file='data/quest-variables-735.json',raw=JSON.stringify(snapshot);
    fs.writeFileSync(path.join(root,file),raw);
    const manifest={questVariables:{file,sha256:crypto.createHash('sha256').update(raw).digest('hex')}};
    const {generated,audit}=buildQuestVariables({root,manifest,version:'1.3.5'});
    assert.deepEqual(audit.counts,{quests:33,fields:33,byLocale:{zhCN:25,zhTW:8},objectiveAmount:23,playerName:10,deferred:3});
    const resource=fs.readFileSync(path.join(root,'AddOns/LegionChinese',generated[0].replaceAll('\\','/')),'utf8');
    assert.ok(!resource.includes('Collect ')&&!resource.includes('$1oa')&&!resource.includes('$p'));
    fs.appendFileSync(path.join(root,file),' ');
    assert.throws(()=>buildQuestVariables({root,manifest,version:'1.3.5'}),/hash mismatch/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
