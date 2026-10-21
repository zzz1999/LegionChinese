import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {runtimeFiles} from '../scripts/resource-layout.mjs';

// Execute the shipped files in production order, without the compatibility
// injections used by older focused UI fixtures.
function run(setup,body,{hooksOnly=false}={}){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const read=file=>fs.readFileSync(new URL('../AddOns/LegionChinese/'+file,import.meta.url),'utf8');
  const exec=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    exec(read('Bootstrap.lua'));exec(read('Core.lua'));
    exec(fs.readFileSync(new URL('ui-fixture.lua',import.meta.url),'utf8'));
    exec(`function Row(scope,source,text)
      local A,D=LegionChinese,LegionChineseDB
      local id=#D.CatalogStrings+1;D.CatalogStrings[id]=text
      D.CatalogTexts[scope]=D.CatalogTexts[scope] or {}
      D.CatalogTexts[scope][A.Fingerprint(A.Normalize(source))]=id
    end`);
    exec(setup);
    for(const file of hooksOnly?['Hooks.lua']:runtimeFiles.filter(f=>f!=='Core.lua'))exec(read(file));
    exec('local A,D=LegionChinese,LegionChineseDB\n'+body);
  }finally{lua.lua_close(L)}
}

test('stable profession roots acquire hooks for children created and replaced after load',()=>run(`
  TradeSkillFrame={DetailsFrame={Contents={}}}
  Row("Profession","A recipe source","配方来源")
`, `
  local root=TradeSkillFrame
  for i=1,2 do
    local widget=Widget("A recipe source")
    root.DetailsFrame.Contents.SourceText=widget
    frames[1]:Fire("OnEvent","ADDON_LOADED","LateProfessionWidgets")
    assert(TradeSkillFrame==root and widget:GetText()=="配方来源")
    widget:SetText("A recipe source");assert(widget:GetText()=="配方来源")
  end
`));

test('nested dialogue widgets and growing collection lists acquire bindings without root replacement',()=>run(`
  TalkingHeadFrame={TextFrame={}}
  MountJournal={ListScrollFrame={buttons={}}}
  Row("Collection","Known mount","已有坐骑")
`, `
  Row("Dialogue","Known dialogue","已有对白")
  local text=Widget("");TalkingHeadFrame.TextFrame.Text=text
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateDialogueWidgets")
  text:SetText("Known dialogue");assert(text:GetText()=="已有对白")
  for i=1,2 do
    local name=Widget("Known mount")
    MountJournal.ListScrollFrame.buttons[i]={name=name}
    frames[1]:Fire("OnEvent","ADDON_LOADED","LateMountWidgets")
    name:SetText("Known mount");assert(name:GetText()=="已有坐骑")
  end
  local replacement=Widget("Known mount")
  MountJournal.ListScrollFrame.buttons[1].name=replacement
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateMountReplacement")
  replacement:SetText("Known mount");assert(replacement:GetText()=="已有坐骑")
  local installs=0;local original=A.InstallCollections
  A.InstallCollections=function(...)installs=installs+1;return original(...)end
  for i=1,100 do frames[1]:Fire("OnEvent","ADDON_LOADED","UnrelatedAddon") end
  assert(installs==0,"unchanged nested targets must skip installers")
`));

test('a pre-existing child that becomes a text widget later gains its binding',()=>run(`
  TradeSkillFrame={DetailsFrame={Contents={SourceText={}}}}
  Row("Profession","A recipe source","配方来源")
`, `
  local widget=TradeSkillFrame.DetailsFrame.Contents.SourceText
  local native=Widget("A recipe source")
  for key,value in pairs(native) do widget[key]=value end
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateTextMethods")
  widget:SetText("A recipe source");assert(widget:GetText()=="配方来源")
`));

test('late global nameplate and tooltip setters work even when their containers already existed',()=>run(`
  GameTooltip={};CompactUnitFrame_UpdateName=nil
`, `
  local frame={name=Widget("Known NPC"),unit="nameplate1"}
  function UnitGUID()return "Creature-0-1-1-1-700001-0001" end
  function UnitName()return "Known NPC" end
  function UnitIsPlayer()return false end
  function UnitPlayerControlled()return false end
  D.NPCLabelNames[700001]={[A.NameFingerprint("Known NPC")]="已核实名称"}
  function CompactUnitFrame_UpdateName(frame)frame.name:SetText(UnitName(frame.unit))end
  local writes=0;A.UpdateClientDescriptionTooltip=function()writes=writes+1 end
  function GameTooltip:SetCurrencyByID()return "native",nil,3 end
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateSetters")
  CompactUnitFrame_UpdateName(frame);assert(frame.name:GetText()=="已核实名称")
  local a,b,c=GameTooltip:SetCurrencyByID(1)
  assert(writes==1 and a=="native" and b==nil and c==3)
`));

test('chat and description hooks sharing a tooltip remain stable on unrelated addon loads',()=>run(`
  GameTooltip=ScriptFrame()
  function GameTooltip:SetHyperlink(link)self.link=link end
`, `
  local installs,attachments=0,0
  local install=A.InstallChatItemLinks;local nativeHook=hooksecurefunc
  A.InstallChatItemLinks=function(...)installs=installs+1;return install(...)end
  function hooksecurefunc(...)attachments=attachments+1;return nativeHook(...)end
  for i=1,100 do frames[1]:Fire("OnEvent","ADDON_LOADED","UnrelatedAddon") end
  assert(installs==0 and attachments==0,"shared hooks must not repeatedly replace one another")
`));

test('replaced quest handlers translate after addon events without duplicate callbacks',()=>run('', `
  D.Quests[1]={Description="可靠正文"};AllowQuestSource(1,"Description","Original body")
  local writes=0;local update=A.UpdateQuestInfo
  A.UpdateQuestInfo=function(...)writes=writes+1;return update(...)end
  function QuestInfo_Display()QuestInfoDescriptionText:SetText("Original body");return 1,nil,3 end
  for i=1,20 do frames[1]:Fire("OnEvent","ADDON_LOADED","ReplacementQuestUI") end
  local a,b,c=QuestInfo_Display()
  assert(QuestInfoDescriptionText:GetText()=="可靠正文")
  assert(writes==1 and a==1 and b==nil and c==3)
`));

test('shared hooks recover replacements and missing methods, reuse restored hooks and preserve each feature',()=>run('', `
  local _,m1=A.Hooks.ForFeature("one");local _,m2=A.Hooks.ForFeature("two")
  local first,second,attached=0,0,0
  local nativeHook=hooksecurefunc
  function hooksecurefunc(...)attached=attached+1;return nativeHook(...)end
  local object={}
  assert(m1(object,"Method",function()first=first+1 end)==false)
  assert(m2(object,"Method",function()second=second+1 end)==false)
  function object:Method()return "first",nil,3 end
  A.Hooks.Refresh();local saved=object.Method
  local a,b,c=object:Method();assert(a=="first" and b==nil and c==3)
  function object:Method()return "replacement",nil,4 end
  for i=1,20 do A.Hooks.Refresh() end
  a,b,c=object:Method();assert(a=="replacement" and b==nil and c==4)
  object.Method=saved;A.Hooks.Refresh();object:Method()
  assert(first==3 and second==3 and attached==2)
`,{hooksOnly:true}));
