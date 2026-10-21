import {readFixtureFile,listFixtureFiles} from './addon-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {QuestSourceIndex} from '../scripts/quest-sources.mjs';
import {fingerprint,normalize,luaString} from '../scripts/text.mjs';
import {withQuestSources} from './quest-fixture.mjs';

const base={ID:'101',LogTitle:'A task',LogDescription:'Collect 10 fangs.',QuestDescription:'Hello, $n. Ask a $c.',VerifiedBuild:26972};
const chinese={Title:'一个任务',Objectives:'收集10颗牙齿。',Description:'你好，$n。去询问$c。'};
const world={kind:'world',file:'world.sql'};
function fixture(){
  const index=new QuestSourceIndex();
  index.collect('quest_template',base,world);
  return {index,finish:()=>index.finish(new Map([['101',base]]),new Map([['101',chinese]]))};
}
test('quest source keys retain exact quantities, fields and known foreign languages',()=>{
  const {index,finish}=fixture();
  index.collect('quest_template_locale',{...base,locale:'esES',LogDescription:'Reúne 10 colmillos.'},world);
  for(const invalid of [{...base,locale:'zhCN',LogDescription:'收集牙齿。'},{...base,locale:'frFR',LogDescription:'Invalid later text',VerifiedBuild:30000}]){
    index.collect('quest_template_locale',invalid,world);
  }
  const result=finish(),row=result.rows.get('101');
  assert.deepEqual(new Set(row.Objectives),new Set(['Collect 10 fangs.','Reúne 10 colmillos.'].map(text=>fingerprint(normalize(text)))));
  assert.ok(!row.Objectives.includes(fingerprint(normalize('Collect 12 fangs.'))));
  assert.equal(result.audit.fields,3);
  assert.equal(result.rows.has('102'),false);
});
test('secondary source identities and reviewed supplements cannot authorize unrelated quest fields',()=>{
  const {index,finish}=fixture(),other={kind:'dialogue-world',file:'other.sql'};
  index.collect('quest_template',{...base,LogDescription:'Collect 12 fangs.'},other);
  index.collect('quest_template_locale',{...base,locale:'esES',LogDescription:'Changed foreign requirements.'},other);
  assert.ok(!finish().rows.get('101').Objectives.includes(fingerprint(normalize('Changed foreign requirements.'))));
  index.addReviewed(101,'Description','A reviewed alternate description.');
  index.addReviewed(999,'Description','A reviewed alternate description.');
  assert.ok(finish().rows.get('101').Description.includes(fingerprint(normalize('A reviewed alternate description.'))));
  assert.equal(finish().rows.has('999'),false);
  const empty=new QuestSourceIndex().finish(new Map(),new Map([['101',chinese]]));
  assert.equal(empty.rows.size,0);assert.equal(empty.audit.unmatchedFields.length,3);
});
test('a newer same-version source needs exact paired Chinese when its quest context differs or is missing',()=>{
  const {index,finish}=fixture(),other={kind:'dialogue-world',file:'newer.sql'};
  index.collect('quest_template',{...base,LogDescription:'Another objective.'},other);
  index.collect('quest_template_locale',{...base,locale:'zhTW',LogDescription:'另一個目標。'},other);
  const key=fingerprint(normalize('Another objective.'));
  assert.ok(!finish().rows.get('101').Objectives.includes(key));
  index.collect('quest_template_locale',{...base,locale:'zhCN',LogDescription:chinese.Objectives},other);
  assert.ok(finish().rows.get('101').Objectives.includes(key));
  const unseen=new QuestSourceIndex();
  unseen.collect('quest_template',base,other);
  assert.equal(unseen.finish(new Map(),new Map([['101',chinese]])).rows.size,0);
  unseen.collect('quest_template_locale',{...base,locale:'zhCN',LogTitle:chinese.Title,LogDescription:chinese.Objectives},other);
  assert.ok(unseen.finish(new Map(),new Map([['101',chinese]])).rows.get('101').Objectives.length);
});
test('live quest translation requires full matching text and preserves changed server requirements',()=>{
  const {index,finish}=fixture();
  index.collect('quest_template_locale',{...base,locale:'esES',LogDescription:'Reúne 10 colmillos.'},world);
  const row=finish().rows.get('101');
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const run=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    for(const file of ['Bootstrap.lua','Core.lua'])run(readFixtureFile(new URL('../AddOns/LegionChinese/'+file,import.meta.url),'utf8'));
    run(`local D=LegionChineseDB
      D.Quests[101]={${Object.entries(chinese).map(([field,text])=>`${field}=${luaString(text)}`).join(',')}}
      D.QuestSources[101]={${Object.entries(row).map(([field,keys])=>`${field}={${keys.map(key=>`[${luaString(key)}]=true`).join(',')}}`).join(',')}}
      function UnitName() return "小明" end
      function UnitClass() return "法师","MAGE" end
      local A=LegionChinese
      assert(A.Translate("Quests","Collect 10 fangs.",101,"Objectives")=="收集10颗牙齿。")
      assert(A.Translate("Quests","Reúne 10 colmillos.",101,"Objectives")=="收集10颗牙齿。")
      assert(A.Translate("Quests","Hello, 小明. Ask a Mage.",101,"Description")=="你好，小明。去询问法师。")
      for _,original in ipairs({"Collect 12 fangs.","Collect 10 tusks.","New custom task.","已有中文。","已有繁體中文。"}) do
        local text,changed=A.Translate("Quests",original,101,"Objectives")
        assert(text==original and not changed,"changed or native text")
      end
      assert(A.Translate("Quests","Collect 10 fangs.",102,"Objectives")=="Collect 10 fangs.")
      assert(A.Translate("Quests","Collect 10 fangs.",101,"Description")=="Collect 10 fangs.")
      D.QuestSources[101]=nil
      assert(A.Translate("Quests","Collect 10 fangs.",101,"Objectives")=="Collect 10 fangs.","missing keys never bypass validation")
    `);
  }finally{lua.lua_close(L);}
});

test('the shipped Totem of Infliction data cannot replace a modified 12-fang requirement with 10',()=>{
  const folder=new URL('../AddOns/LegionChinese/Data/',import.meta.url);
  const rows=listFixtureFiles(folder).filter(file=>file.startsWith('Quests_'))
    .flatMap(file=>readFixtureFile(new URL(file,folder),'utf8').split('\n'));
  const row=rows.find(line=>line.startsWith('D.Quests[101]='));
  assert.ok(row);
  const record=JSON.parse(readFixtureFile(new URL('../data/quest-supplement-735.json',import.meta.url),'utf8'))
    .quests.find(quest=>quest.id===101).fields.Objectives;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const run=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    for(const file of ['Bootstrap.lua','Core.lua'])run(readFixtureFile(new URL('../AddOns/LegionChinese/'+file,import.meta.url),'utf8'));
    run(`local D=LegionChineseDB
      ${withQuestSources(row)}
      local A=LegionChinese
      local original=${luaString(record.english)}
      local text,changed=A.Translate("Quests",original,101,"Objectives")
      assert(changed and text==${luaString(record.text)})
      original=original:gsub("10 Ghoul Fangs","12 Ghoul Fangs")
      text,changed=A.Translate("Quests",original,101,"Objectives")
      assert(text==original and not changed,"server changes must remain visible")
    `);
  }finally{lua.lua_close(L);}
});
