import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';

function run(code){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  for(const file of ['../AddOns/LegionChinese/Bootstrap.lua','../AddOns/LegionChinese/Core.lua','./ui-fixture.lua',
    './welcome-fixture.lua','../AddOns/LegionChinese/Welcome.lua','../AddOns/LegionChinese/UI.lua'])execute(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
  execute(code);lua.lua_close(L);
}

test('first login translates automatically and shows the welcome once, after settings have loaded',()=>run(`
  local event=frames[1].scripts.OnEvent
  event(frames[1],"ADDON_LOADED","AnotherAddon")
  assert(LegionChineseSettings==nil and LegionChineseWelcomeFrame==nil)
  event(frames[1],"ADDON_LOADED","LegionChinese")
  assert(LegionChineseSettings.enabled==nil and LegionChineseWelcomeFrame==nil)
  event(frames[1],"PLAYER_LOGIN")
  local window=LegionChineseWelcomeFrame
  assert(window:IsShown() and LegionChineseSettings.welcomeSeen)
  assert(window.feedbackAddress:GetText()=="https://github.com/zzz1999/LegionChinese/issues")
  assert(window.feedbackAddress.autoFocus==false)
  assert(window.content[3]:GetText():find("zzz1999",1,true))
  assert(window.content[3]:GetText():find("WorldOfHuncraft",1,true))
  window.dismissButton.scripts.OnClick()
  event(frames[1],"PLAYER_LOGIN");event(frames[1],"ADDON_LOADED","OtherAddon")
  assert(not window:IsShown() and window.shows==1)
`));

test('saved dismissal survives another session and about reopens with automatic translation',()=>run(`
  LegionChineseSettings={enabled=false,welcomeSeen=true}
  frames[1].scripts.OnEvent(frames[1],"PLAYER_LOGIN")
  assert(LegionChineseWelcomeFrame==nil and LegionChineseSettings.enabled==nil)
  SlashCmdList.LEGIONCHINESE("about")
  local window=LegionChineseWelcomeFrame
  assert(window:IsShown() and LegionChineseSettings.enabled==nil)
  assert(window.status:GetText():find("插件加载后自动汉化",1,true))
  window.feedbackAddress.scripts.OnMouseUp(window.feedbackAddress)
  assert(window.feedbackAddress.highlighted)
  window.feedbackAddress:SetText("accidental edit")
  assert(window.feedbackAddress:GetText()=="https://github.com/zzz1999/LegionChinese/issues")
  window.feedbackAddress.scripts.OnEscapePressed(window.feedbackAddress)
  assert(not window:IsShown() and not window.feedbackAddress.focused)
  SlashCmdList.LEGIONCHINESE("about"); assert(window.shows==2 and #UISpecialFrames==1)
`));

test('upgrading a previously disabled installation removes the retired switch and translates immediately',()=>run(`
  LegionChineseSettings={enabled=false}
  frames[1].scripts.OnEvent(frames[1],"ADDON_LOADED","LegionChinese")
  frames[1].scripts.OnEvent(frames[1],"PLAYER_LOGIN")
  assert(LegionChineseWelcomeFrame:IsShown() and LegionChineseSettings.enabled==nil)
  assert(LegionChineseSettings.welcomeSeen==true)
  LegionChineseDB.Quests[1]={Title="中文任务"}
  QuestInfoTitleHeader.text="English title";hooks.QuestInfo_Display()
  assert(QuestInfoTitleHeader.text=="中文任务")
`));

test('retired commands and aliases only show help and never change automatic translation',()=>run(`
  LegionChineseSettings={enabled=false,welcomeSeen=true}
  local messages={};print=function(message) messages[#messages+1]=message end
  LegionChineseDB.Quests[1]={Title="中文任务"}
  for _,command in ipairs({"on","off","开","关",""," OFF "}) do
    SlashCmdList.LEGIONCHINESE(command)
    assert(LegionChineseSettings.enabled==nil and LegionChineseSettings.welcomeSeen)
    QuestInfoTitleHeader.text="English title";hooks.QuestInfo_Display()
    assert(QuestInfoTitleHeader.text=="中文任务")
    assert(LegionChineseWelcomeFrame==nil)
    assert(messages[#messages]:find("插件加载后自动汉化",1,true))
    assert(not messages[#messages]:find("/lcn on",1,true) and not messages[#messages]:find("/lcn off",1,true))
  end
  SlashCmdList.LEGIONCHINESE("关于")
  assert(LegionChineseWelcomeFrame:IsShown() and LegionChineseSettings.welcomeSeen)
`));
