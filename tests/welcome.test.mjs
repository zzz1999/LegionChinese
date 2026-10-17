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
  for(const file of ['../AddOns/TauriChinese/Bootstrap.lua','../AddOns/TauriChinese/Core.lua','./ui-fixture.lua',
    './welcome-fixture.lua','../AddOns/TauriChinese/Welcome.lua','../AddOns/TauriChinese/UI.lua'])execute(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
  execute(code);lua.lua_close(L);
}

test('first login defaults on and shows the welcome once, after settings have loaded',()=>run(`
  local event=frames[1].scripts.OnEvent
  event(frames[1],"ADDON_LOADED","AnotherAddon")
  assert(TauriChineseSettings==nil and TauriChineseWelcomeFrame==nil)
  event(frames[1],"ADDON_LOADED","TauriChinese")
  assert(TauriChineseSettings.enabled and TauriChineseWelcomeFrame==nil)
  event(frames[1],"PLAYER_LOGIN")
  local window=TauriChineseWelcomeFrame
  assert(window:IsShown() and TauriChineseSettings.welcomeSeen)
  assert(window.feedbackAddress:GetText()=="https://github.com/zzz1999/TauriChinese/issues")
  assert(window.feedbackAddress.autoFocus==false)
  assert(window.content[3]:GetText():find("zzz1999",1,true))
  assert(window.content[3]:GetText():find("WorldOfHuncraft",1,true))
  window.dismissButton.scripts.OnClick()
  event(frames[1],"PLAYER_LOGIN");event(frames[1],"ADDON_LOADED","OtherAddon")
  assert(not window:IsShown() and window.shows==1)
`));

test('saved dismissal survives another session and about can reopen without enabling translation',()=>run(`
  TauriChineseSettings={enabled=false,welcomeSeen=true}
  frames[1].scripts.OnEvent(frames[1],"PLAYER_LOGIN")
  assert(TauriChineseWelcomeFrame==nil and not TauriChinese.Enabled())
  SlashCmdList.TAURICHINESE("about")
  local window=TauriChineseWelcomeFrame
  assert(window:IsShown() and not TauriChinese.Enabled())
  assert(window.status:GetText():find("汉化已关闭",1,true))
  window.feedbackAddress.scripts.OnMouseUp(window.feedbackAddress)
  assert(window.feedbackAddress.highlighted)
  window.feedbackAddress:SetText("accidental edit")
  assert(window.feedbackAddress:GetText()=="https://github.com/zzz1999/TauriChinese/issues")
  window.feedbackAddress.scripts.OnEscapePressed(window.feedbackAddress)
  assert(not window:IsShown() and not window.feedbackAddress.focused)
  SlashCmdList.TAURICHINESE("about"); assert(window.shows==2 and #UISpecialFrames==1)
`));

test('upgrading a previously disabled installation shows information without changing its choice',()=>run(`
  TauriChineseSettings={enabled=false}
  frames[1].scripts.OnEvent(frames[1],"ADDON_LOADED","TauriChinese")
  frames[1].scripts.OnEvent(frames[1],"PLAYER_LOGIN")
  assert(TauriChineseWelcomeFrame:IsShown() and not TauriChinese.Enabled())
  assert(TauriChineseSettings.welcomeSeen==true)
`));
