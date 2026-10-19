import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {renderChangelog} from '../scripts/changelog.mjs';
import {luaString} from '../scripts/text.mjs';

const version=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;

function run(code){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try {
    for(const file of ['../AddOns/LegionChinese/Bootstrap.lua','../AddOns/LegionChinese/Core.lua','./ui-fixture.lua',
      './welcome-fixture.lua','../AddOns/LegionChinese/Changelog.lua','../AddOns/LegionChinese/Welcome.lua','../AddOns/LegionChinese/UI.lua'])execute(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
    execute(code);
  } finally {lua.lua_close(L);}
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

test('about lists the packaged release notes and keeps long content scrollable on smaller screens',()=>run(`
  UIParent.height=540
  SlashCmdList.LEGIONCHINESE("about")
  local window=LegionChineseWelcomeFrame
  assert(window.changelogTitle:GetText()=="更新记录 · v${version}")
  assert(#window.changelogEntries==#LegionChinese.Changelog.entries)
  for i,entry in ipairs(window.changelogEntries) do
    assert(entry:GetText()=="• "..LegionChinese.Changelog.entries[i])
    entry.stringHeight=180 -- Deliberately long wrapping; this is not a font renderer.
  end
  LegionChinese.ShowWelcome()
  assert(window.height<=UIParent.height-40)
  assert(window.scroll:GetHeight()>0 and window.scroll:GetVerticalScrollRange()>0)
  assert(window.scroll.scrollChild==window.body and window.scroll.mouseWheel)
  assert(window.scroll.template=="UIPanelScrollFrameTemplate")
  local offset=0
  for _,row in ipairs(window.rows) do
    offset=offset+row.gap
    assert(row.widget.point[2]==window.body and row.widget.point[5]==-offset)
    offset=offset+(row.height or row.widget:GetStringHeight())
  end
  assert(window.body:GetHeight()==offset+12,"all rows fit inside the scroll child")
  assert(window.dismissButton.parent==window and window.dismissButton.point[1]=="BOTTOM")
  assert(window.header.parent==window and window.status.point[1]=="BOTTOMLEFT")
  window.scroll:SetVerticalScroll(window.scroll:GetVerticalScrollRange())
  assert(window.scroll:GetVerticalScroll()>0)
  window.downloadAddress.scripts.OnMouseUp(window.downloadAddress)
  assert(window.downloadAddress.highlighted and window.downloadAddress:GetText()=="https://www.curseforge.com/wow/addons/legionchinese")
  window.downloadAddress.scripts.OnEscapePressed(window.downloadAddress)
  assert(not window:IsShown())
  local frameCount=#frames
  SlashCmdList.LEGIONCHINESE("about")
  assert(window.scroll:GetVerticalScroll()==0 and #frames==frameCount)
`));

test('about remains usable without packaged notes and labels note versions honestly',()=>run(`
  LegionChinese.Changelog={version="1.2.14",entries={"已有记录"}}
  function GetAddOnMetadata() return "1.2.15" end
  LegionChinese.ShowWelcome()
  assert(LegionChineseWelcomeFrame.content[1]:GetText():find("1.2.15",1,true))
  assert(LegionChineseWelcomeFrame.changelogTitle:GetText()=="更新记录 · v1.2.14")
`));

test('missing notes do not prevent opening or dismissing the about window',()=>run(`
  LegionChinese.Changelog=nil
  LegionChinese.ShowWelcome()
  local window=LegionChineseWelcomeFrame
  assert(window.changelogEntries[1]:GetText():find("未附带更新记录",1,true))
  assert(window.feedbackAddress:GetText():find("/issues",1,true))
  window.dismissButton.scripts.OnClick()
  assert(not window:IsShown())
`));

test('changelog generation selects the requested version, strips Markdown and escapes WoW markup',()=>{
  const notes='# 更新记录\r\n\r\n## v1.0.1\r\n\r\n- **新增** `/lcn about`，参阅[说明](https://example.com)。\r\n  后续说明。\r\n- 保留 "引号"、\\路径和 |cffff0000文字|r。\r\n\r\n## v1.0.0\r\n\r\n- 旧记录。\r\n';
  const generated=renderChangelog(notes,'1.0.1');
  run(generated+`\n
    assert(LegionChinese.Changelog.version=="1.0.1" and #LegionChinese.Changelog.entries==2)
    assert(LegionChinese.Changelog.entries[1]=="新增 /lcn about，参阅说明。 后续说明。")
    assert(LegionChinese.Changelog.entries[2]==${luaString('保留 "引号"、\\路径和 ||cffff0000文字||r。')})
  `);
  assert.throws(()=>renderChangelog(notes,'1.0.2'),/Missing CHANGELOG/);
});
