import {readFixtureFile,listFixtureFiles} from './addon-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ChineseTextIndex,chooseChineseFields} from '../scripts/fallback.mjs';
import {fingerprint,normalize,luaString} from '../scripts/text.mjs';
import {selectBroadcast} from '../scripts/dialogue.mjs';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';

test('quest fields independently prefer Simplified, then usable Traditional, then remain absent',()=>{
  const selected=chooseChineseFields(
    {Title:'简体标题',Description:'',Progress:'损坏的$z文本',Completion:'English'},
    {Title:'繁體標題',Description:'繁體任務內容',Progress:'任務進度',Completion:''});
  assert.deepEqual(selected.values,{Title:'简体标题',Description:'繁體任務內容',Progress:'任務進度'});
  assert.deepEqual(selected.locales,{Title:'zhCN',Description:'zhTW',Progress:'zhTW'});
});

test('Traditional is a fallback regardless of insertion order or source quality rank',()=>{
  for(const locales of [['zhCN','zhTW'],['zhTW','zhCN']]){
    const index=new ChineseTextIndex();
    for(const locale of locales)index.add(locale,'A story',locale==='zhCN'?'简体故事':'繁體故事',locale==='zhCN'?-1:1);
    index.add('zhTW','Another story','另一個故事');
    index.finish();
    assert.equal(index.entries.get(fingerprint(normalize('A story'))),'简体故事');
    assert.equal(index.localeFor(fingerprint(normalize('Another story'))),'zhTW');
    assert.deepEqual(index.localeCounts,{zhCN:1,zhTW:1});
  }
});

test('a conflicting Simplified key falls back only to an unambiguous Traditional key',()=>{
  const index=new ChineseTextIndex();
  for(const source of ['Usable fallback','No safe fallback']){
    index.add('zhCN',source,'简体甲');index.add('zhCN',source,'简体乙');
    index.add('zhTW',source,'繁體甲');
  }
  index.add('zhTW','No safe fallback','繁體乙');index.finish();
  assert.equal(index.entries.get(fingerprint(normalize('Usable fallback'))),'繁體甲');
  assert.equal(index.entries.has(fingerprint(normalize('No safe fallback'))),false);
});

test('cross-locale fingerprint collisions cannot fall back',()=>{
  const index=new ChineseTextIndex(),key=fingerprint(normalize('A story'));
  index.add('zhCN','A story','简体故事');index.add('zhTW','A story','繁體故事');
  index.byLocale.zhTW.normalized.set(key,'a different source with the same hash');index.finish();
  assert.equal(index.entries.size,0);assert.equal(index.ambiguous.has(key),true);
});

test('Traditional broadcast revisions are selected independently from Simplified',()=>{
  const cn=new Map(),tw=new Map();
  const row={ID:'7',locale:'zhTW',Text_lang:'繁體對話',VerifiedBuild:26365};
  assert.equal(selectBroadcast(cn,row,'client'),false);
  selectBroadcast(tw,row,'client',2,'zhTW');
  selectBroadcast(tw,{...row,Text_lang:'後續版本',VerifiedBuild:27547},'later',2,'zhTW');
  assert.equal(tw.get('7').male,'繁體對話');
});

test('generated locale choice round-trips through Lua and preserves original Chinese and missing text',()=>{
  const index=new ChineseTextIndex();
  index.add('zhCN','Simplified exists','简体译文');index.add('zhTW','Simplified exists','繁體譯文');
  index.add('zhTW','Only Traditional','只有繁體譯文');index.finish();
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=code=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(code));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  for(const file of ['Bootstrap.lua','Core.lua'])execute(readFixtureFile(new URL('../AddOns/LegionChinese/'+file,import.meta.url),'utf8'));
  let id=0;
  for(const [key,text] of index.entries){
    id++;execute(`LegionChineseDB.Strings[${id}]=${luaString(text)}; LegionChineseDB.Gossip[${luaString(key)}]=${id}`);
  }
  execute(`local A=LegionChinese
    local text,changed=A.Translate("Gossip","Simplified exists"); assert(changed and text=="简体译文")
    text,changed=A.Translate("Gossip","Only Traditional"); assert(changed and text=="只有繁體譯文")
    for _,original in ipairs({"Missing translation","原有简体中文","原有繁體中文"}) do
      text,changed=A.Translate("Gossip",original); assert(not changed and text==original)
    end`);
  lua.lua_close(L);
});
