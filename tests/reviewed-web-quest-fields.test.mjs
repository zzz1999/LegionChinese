import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {compatibleSupplement} from '../scripts/quest-supplement.mjs';
import {luaString} from '../scripts/text.mjs';
import {readFixtureFile,listFixtureFiles} from './addon-fixture.mjs';
import {withQuestSources} from './quest-fixture.mjs';

const sourceID='cnwow-wowhead-crosschecked-20261024';
const snapshotBytes=fs.readFileSync(new URL('../data/quest-supplement-735.json',import.meta.url));
const snapshot=JSON.parse(snapshotBytes);
const review=JSON.parse(fs.readFileSync(new URL('../docs/reviewed-web-quest-fields-audit.json',import.meta.url)));
const expected=new Map([[12774,['Objectives']],[26398,['Objectives','Description']],[37841,['Objectives','Description']]]);
const addon=new URL('../AddOns/LegionChinese/',import.meta.url),data=new URL('Data/',addon);

test('reviewed web additions retain unknown Chinese build and per-field original evidence',()=>{
  const source=snapshot.sources.find(row=>row.id===sourceID);
  assert.equal(source.provenance,'community-web-crosschecked');
  assert.equal(source.officialChineseVerified,false);
  assert.equal(source.verifiedBuild,0);
  assert.equal(review.records.length,5);
  const manifest=JSON.parse(fs.readFileSync(new URL('../sources.json',import.meta.url)));
  assert.equal(manifest.questSupplement.sha256,crypto.createHash('sha256').update(snapshotBytes).digest('hex'));
  const adopted=[];
  for(const quest of snapshot.quests)for(const [field,row] of Object.entries(quest.fields)){
    if(row.source!==sourceID)continue;
    adopted.push(quest.id+':'+field);
    assert.equal(row.build,0);
    assert.ok(row.originalBuild>0&&row.originalBuild<=26972);
    assert.ok(row.url.endsWith('/quest/'+quest.id+'/'));
    assert.ok(row.corroboratingUrl.startsWith('https://www.wowhead.com/cn/quest='+quest.id+'/'));
    assert.ok(review.records.some(r=>r.id===quest.id&&r.field===field&&r.english===row.english&&r.text===row.text));
  }
  assert.deepEqual(adopted.sort(),[...expected].flatMap(([id,fields])=>fields.map(field=>id+':'+field)).sort());
});

test('reviewed task fields reject changed requirements, quest identity and later builds',()=>{
  for(const [id,fields] of expected){
    const quest=snapshot.quests.find(row=>row.id===id);
    const base={ID:String(id),LogTitle:quest.identity.title,LogDescription:quest.identity.objectives,
      QuestDescription:quest.identity.description,VerifiedBuild:26972};
    for(const field of fields){
      const row=quest.fields[field],column=field==='Objectives'?'LogDescription':'QuestDescription';
      assert.equal(compatibleSupplement(base,quest,field,row),true);
      for(const changed of [{...base,ID:id+1},{...base,LogTitle:'Server custom quest'},
        {...base,[column]:base[column]+' Complete an extra objective.'},{...base,VerifiedBuild:27843}]){
        assert.equal(compatibleSupplement(changed,quest,field,row),false);
      }
    }
  }
});

test('shipped quest resources translate all five fields and preserve native or modified server text',()=>{
  const questRows=listFixtureFiles(data).filter(file=>file.startsWith('Quests_'))
    .flatMap(file=>readFixtureFile(new URL(file,data),'utf8').split('\n'))
    .filter(line=>expected.has(Number(/^D\.Quests\[(\d+)\]=/.exec(line)?.[1])))
    .map(withQuestSources);
  assert.equal(questRows.length,expected.size);
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const run=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    run(readFixtureFile(new URL('Bootstrap.lua',addon),'utf8'));
    run('local D=LegionChineseDB\n'+questRows.join('\n'));
    run(readFixtureFile(new URL('Core.lua',addon),'utf8'));
    run('function UnitName() return "小明" end\nfunction UnitRace() return "牛头人","Tauren" end');
    for(const row of review.records){
      const original=row.english.replaceAll('$n','小明').replaceAll('$r','Tauren');
      const text=row.text.replaceAll('$n','小明').replaceAll('$r','牛头人').replace(/\$[bB]/g,'\n');
      const changedOriginal=row.id===12774?original.replace('Anduin','Varian'):
        row.id===26398?original.replaceAll('Saurfang','Garrosh'):original.replace('shipyard','barracks');
      assert.notEqual(changedOriginal,original);
      run(`local A=LegionChinese
        local text,changed=A.Translate("Quests",${luaString(original)},${row.id},${luaString(row.field)})
        assert(changed and text==${luaString(text)},${luaString(row.id+':'+row.field)})
        text,changed=A.Translate("Quests",${luaString(changedOriginal)},${row.id},${luaString(row.field)})
        assert(text==${luaString(changedOriginal)} and not changed,"changed NPC or objective must remain visible")
        for _,native in ipairs({"已有简体中文。","已有繁體中文。"}) do
          text,changed=A.Translate("Quests",native,${row.id},${luaString(row.field)})
          assert(text==native and not changed,"preserve native Chinese")
        end
        text,changed=A.Translate("Quests",${luaString(original)},999999,${luaString(row.field)})
        assert(text==${luaString(original)} and not changed,"wrong quest ID")
        text,changed=A.Translate("Quests",${luaString(original)},${row.id},"Progress")
        assert(text==${luaString(original)} and not changed,"wrong field")
      `);
    }
  }finally{lua.lua_close(L);}
});
