import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {ChineseTextIndex} from '../scripts/fallback.mjs';
import {mergeQuestSupplement} from '../scripts/quest-supplement.mjs';
import {luaString} from '../scripts/text.mjs';
import {readFixtureFile,listFixtureFiles} from './addon-fixture.mjs';
import {withQuestSources} from './quest-fixture.mjs';

const sourceID='trinity-27869-zhtw-reviewed';
const snapshot=JSON.parse(fs.readFileSync(new URL('../data/quest-supplement-735.json',import.meta.url)));
const review=JSON.parse(fs.readFileSync(new URL('../docs/reviewed-traditional-quest-fields-audit.json',import.meta.url)));
const expected=new Map([[13381,['Title','Description','Objectives']],[14167,['Description','Objectives']],[14350,['Description','Objectives']]]);
const addon=new URL('../AddOns/LegionChinese/',import.meta.url),data=new URL('Data/',addon);

test('reviewed traditional fields preserve legacy provenance instead of claiming a Legion Chinese capture',()=>{
  const source=snapshot.sources.find(row=>row.id===sourceID);
  assert.equal(source.sourceBranch,'3.3.5');
  assert.equal(source.targetPatch,'7.3.5');
  assert.equal(source.provenance,'community-legacy-field-reviewed');
  assert.equal(source.officialChineseVerified,false);
  assert.equal(source.verifiedBuild,0);
  assert.match(source.evidence.bodySha256,/^[0-9a-f]{64}$/);
  assert.match(source.evidence.originalSqlSha256,/^[0-9a-f]{64}$/);
  assert.equal(review.records.length,7);
  const adopted=[];
  for(const quest of snapshot.quests)for(const [field,row] of Object.entries(quest.fields)){
    if(row.source!==sourceID)continue;
    adopted.push(quest.id+':'+field);
    assert.equal(row.locale,'zhTW');assert.equal(row.build,0);
    assert.equal(row.originalBuild,({13381:20182,14167:25549,14350:15595})[quest.id]);
    assert.equal(row.url,'https://github.com/TrinityCore/TrinityCore/issues/27869');
    assert.ok(review.records.some(r=>r.id===quest.id&&r.field===field&&r.english===row.english&&r.text===row.text));
  }
  assert.deepEqual(adopted.sort(),[...expected].flatMap(([id,fields])=>fields.map(field=>id+':'+field)).sort());
});

test('actual traditional supplement fills missing fields and retains an existing Simplified Chinese title',()=>{
  const baseQuests=new Map([...expected].map(([id])=>{
    const q=snapshot.quests.find(r=>r.id===id);
    return [String(id),{ID:String(id),LogTitle:q.identity.title,LogDescription:q.identity.objectives,
      QuestDescription:q.identity.description,VerifiedBuild:26972}];
  }));
  const questData=new Map([['13381',{Title:'现有简体标题'}]]);
  const audit=mergeQuestSupplement({root:fileURLToPath(new URL('../',import.meta.url)),
    manifest:JSON.parse(fs.readFileSync(new URL('../sources.json',import.meta.url))),baseQuests,questData,
    titles:new ChineseTextIndex(),gossip:new ChineseTextIndex(),completions:new ChineseTextIndex()});
  assert.equal(audit.fields,6);assert.equal(audit.preserved,1);
  assert.equal(questData.get('13381').Title,'现有简体标题');
  for(const row of review.records){
    if(row.id===13381&&row.field==='Title')continue;
    assert.equal(questData.get(String(row.id))[row.field],row.text);
  }
});

test('shipped traditional fields translate all seven originals but preserve changed NPCs, targets and cities',()=>{
  const quests=listFixtureFiles(data).filter(file=>file.startsWith('Quests_'))
    .flatMap(file=>readFixtureFile(new URL(file,data),'utf8').split('\n'))
    .filter(line=>expected.has(Number(/^D\.Quests\[(\d+)\]=/.exec(line)?.[1])))
    .map(withQuestSources);
  assert.equal(quests.length,3);
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const run=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    run(readFixtureFile(new URL('Bootstrap.lua',addon),'utf8'));
    run('local D=LegionChineseDB\n'+quests.join('\n'));
    run(readFixtureFile(new URL('Core.lua',addon),'utf8'));
    run('function UnitName() return "小明" end\nfunction UnitRace() return "牛头人","Tauren" end');
    for(const row of review.records){
      const original=row.english.replaceAll('$n','小明').replaceAll('$r','Tauren');
      const chinese=row.text.replaceAll('$n','小明').replaceAll('$r','牛头人').replace(/\$[bB]/g,'\n');
      const modified=row.id===14167?(row.field==='Objectives'?original.replace('Ironforge','Darnassus'):original.replace('Chapman','Nathanos')):
        row.id===14350?original.replaceAll('Nathanos','Sylvanas'):
        row.field==='Title'?'Custom '+original:row.field==='Objectives'?original.replace('Frostbrood Sentries','50 Frostbrood Sentries'):original.replace('Karen No','Another Pilot');
      assert.notEqual(modified,original);
      run(`local A=LegionChinese
        local text,changed=A.Translate("Quests",${luaString(original)},${row.id},${luaString(row.field)})
        assert(changed and text==${luaString(chinese)},${luaString(row.id+':'+row.field)})
        text,changed=A.Translate("Quests",${luaString(modified)},${row.id},${luaString(row.field)})
        assert(not changed and text==${luaString(modified)},"modified requirement must remain visible")
        for _,native in ipairs({"已有简体中文。","已有繁體中文。"}) do
          text,changed=A.Translate("Quests",native,${row.id},${luaString(row.field)})
          assert(not changed and text==native,"preserve native Chinese")
        end
        assert(not A.MatchesQuestSource(999999,${luaString(row.field)},${luaString(original)}),"wrong identity")
        text,changed=A.Translate("Quests",${luaString(original)},${row.id},"Progress")
        assert(not changed and text==${luaString(original)},"wrong field")
      `);
    }
  }finally{lua.lua_close(L);}
});
