import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {fingerprint,normalize,luaString} from '../scripts/text.mjs';

const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
const data=new URL('Data/',addon);
const files=fs.readdirSync(data);
const readLines=prefix=>files.filter(f=>f.startsWith(prefix+'_')).flatMap(f=>fs.readFileSync(new URL(f,data),'utf8').split('\n'));
const bookText='Welcome to the Scourge. Now that you have entered your true service, you may find immense relief in your liberation from various mortal inconveniences. No bothersome sleeping to take up your time anymore, nor any great need for shelter from the elements, and you are even free from the mild irritation of cutting hair and nails! How delightful!';

test('reported death knight book and quest progress translate through XML-bound handlers with shipped data',()=>{
  const key=fingerprint(normalize(bookText));
  const bookRow=readLines('Books').find(line=>line.startsWith(`D.Books["${key}"]=`));
  assert.ok(bookRow,'page 3226 must be in the shipped book index');
  const stringID=bookRow.match(/=(\d+)$/)[1];
  const stringRow=readLines('Strings').find(line=>line.startsWith(`D.Strings[${stringID}]=`));
  const questRow=readLines('Quests').find(line=>line.startsWith('D.Quests[12680]='));
  assert.ok(stringRow&&questRow);
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try {
    execute(fs.readFileSync(new URL('Bootstrap.lua',addon),'utf8'));
    execute(`local D=LegionChineseDB\n${bookRow}\n${stringRow}\n${questRow}`);
    execute(fs.readFileSync(new URL('Core.lua',addon),'utf8'));
    execute(fs.readFileSync(new URL('./ui-fixture.lua',import.meta.url),'utf8'));
    execute(fs.readFileSync(new URL('UI.lua',addon),'utf8'));
    execute(`
      bookText=${luaString(bookText)}
      ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY")
      assert(ItemTextPageText.text=="欢迎加入天谴军。既然你已经真正地服役了，你会发觉你从那些不便的各种凡人痛苦中解脱。没有扰人的睡眠偷走你的时间，不需避难所躲避各种天灾，甚至连剪指甲跟头发都省了!真愉快!","reported book page")
      questID=12680;progressTitle="阿彻鲁斯战马";progressText="You don't want to walk forever, do you?"
      QuestFrameProgressPanel:Fire("OnShow")
      assert(QuestProgressTitleText.text==progressTitle,"Chinese title stays unchanged")
      assert(QuestProgressText.text=="你不想一直徒步行走，对吧?","reported quest progress")
      LegionChineseSettings={enabled=false}
      QuestFrameProgressPanel:Fire("OnShow");ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY")
      assert(QuestProgressText.text==progressText and ItemTextPageText.text==bookText)
    `);
  } finally {lua.lua_close(L);}
});
