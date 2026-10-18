import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {fingerprint,normalize} from '../scripts/text.mjs';
import {compatibleLegacyQuest} from '../scripts/dialogue.mjs';

const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
const data=new URL('Data/',addon);
const files=fs.readdirSync(data);
const lines=prefix=>files.filter(f=>f.startsWith(prefix+'_')).flatMap(f=>fs.readFileSync(new URL(f,data),'utf8').split('\n'));
const completion="Return to Salanar the Horseman at Death's Breach in Plaguelands: The Scarlet Enclave.";
function shippedCompletion(){
  const key=fingerprint(normalize(completion));
  const row=lines('Completions').find(line=>line.startsWith(`D.Completions["${key}"]=`));
  assert.ok(row,'the reported return instruction must ship in the new data');
  const id=row.match(/=(\d+)$/)[1];
  const text=lines('Strings').find(line=>line.startsWith(`D.Strings[${id}]=`));
  assert.ok(text);
  return row+'\n'+text;
}
function run(code,{tracker=false,welcome=false,rows=''}={}){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{const status=lauxlib.luaL_dostring(L,to_luastring(source));assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));};
  const read=url=>fs.readFileSync(url,'utf8');
  try{
    execute(read(new URL('Bootstrap.lua',addon)));
    execute('local D=LegionChineseDB\n'+rows);
    execute(read(new URL('Core.lua',addon)));
    execute(read(new URL('./ui-fixture.lua',import.meta.url)));
    if(tracker)execute(read(new URL('./tracker-fixture.lua',import.meta.url)));
    if(welcome){execute(read(new URL('./welcome-fixture.lua',import.meta.url)));execute(read(new URL('Welcome.lua',addon)));}
    execute(read(new URL('UI.lua',addon)));
    execute('local A,D=LegionChinese,LegionChineseDB\n'+code);
  }finally{lua.lua_close(L);}
}

test('the screenshot return instruction translates in the sidebar with shipped data and native fonts',()=>{
  const quest=lines('Quests').find(line=>line.startsWith('D.Quests[12680]='));
  run(`
    local module=QUEST_TRACKER_MODULE
    local block=NewQuestBlock(12680)
    module:SetBlockHeader(block,"阿彻鲁斯战马",1,true,12680)
    local line=module:AddObjective(block,"QuestComplete",trackerCompletion,nil,true)
    assert(line==block.lines.QuestComplete,"secure hook must preserve the original return")
    assert(line.Text.text=="去东瘟疫之地：血色领地找死亡裂口的骑手萨拉纳尔。")
    assert(line.Text.font=="Fonts\\\\ARKai_T.ttf" and line.Text.fontChanges==0)
    assert(block.HeaderText.text=="阿彻鲁斯战马" and block.HeaderText.fontChanges==0)
    assert(line.height==42 and block.height==72,"translated height must reach layout")
    assert(line.state=="PRESENT" and line.check=="retained" and block.itemButton.id=="item" and block.poiButton.id=="poi")
    local nextLine=module:AddObjective(block,"Money","123 / 456")
    assert(nextLine.top==72 and nextLine.anchor==line,"the next row must follow translated height")
    local text,changed=A.Translate("Quests",trackerCompletion,12680,"CompletionLog")
    assert(changed and text==line.Text.text,"the quest log uses the same completion fallback")
    local changedSource="Return to Salanar the Horseman at a different camp."
    text,changed=A.Translate("Quests",changedSource,12680,"CompletionLog")
    assert(text==changedSource and not changed,"never guess a return destination from ID alone")
    D.Quests[12680].CompletionLog="已有军团再临交付译文。"
    text=A.Translate("Quests",trackerCompletion,12680,"CompletionLog")
    assert(text=="已有军团再临交付译文。","current data takes precedence")
  `,{tracker:true,rows:quest+'\n'+shippedCompletion()});
});

test('tracker title and objective layout respects counters, colors, line limits and reuse',()=>run(`
  D.Quests[42]={Title="很长的中文任务标题"}
  D.Strings[1]="收集箭矢";D.Objectives[A.Fingerprint(A.Normalize("Arrows collected"))]=1
  local module=QUEST_TRACKER_MODULE
  local block=NewQuestBlock(42)
  for pass=1,3 do
    block.height=0;block.currentLine=nil
    module:SetBlockHeader(block,"Collect Arrows",1,false,42)
    assert(block.height==28 and block.HeaderText.text=="很长的中文任务标题")
    local line=module:AddObjective(block,1,"Arrows collected: "..pass.."/15",nil,false,2,OBJECTIVE_TRACKER_COLOR.Complete)
    assert(line.Text.text=="收集箭矢: "..pass.."/15")
    assert(line.height==28 and block.height==58,"native double-line limit and no cumulative growth")
    assert(line.Text.color==OBJECTIVE_TRACKER_COLOR.Complete and line.Text.highlight and line.dash==2)
    local tail=module:AddObjective(block,"timer-label","00:30")
    assert(tail.top==58 and tail.anchor==line)
  end
  local native=module:AddObjective(block,2,"已有中文目标: 2/10")
  assert(native.Text.writes==1 and native.Text.fontChanges==0)
  local unknown=module:AddObjective(block,3,"Unknown objective: 2/5")
  assert(unknown.Text.text=="Unknown objective: 2/5")
  for _,key in ipairs({"Failed","ClickComplete","Money"}) do
    local special=module:AddObjective(block,key,"Arrows collected: 2/15")
    assert(special.Text.text=="Arrows collected: 2/15","special rows are not generic objectives")
  end
  local other=NewQuestBlock(42);other.module=OTHER_TRACKER_MODULE
  local foreign=OTHER_TRACKER_MODULE:AddObjective(other,1,"Arrows collected: 2/15")
  assert(foreign.Text.text=="Arrows collected: 2/15","other tracker modules stay untouched")
`,{tracker:true}));

test('tracker handles auto-completion, unknown quests, toggles and late-loaded modules safely',()=>run(`
  local block=NewQuestBlock(12680)
  local module=QUEST_TRACKER_MODULE
  local auto=module:AddObjective(block,"QuestComplete","Quest Complete!")
  assert(auto.Text.text=="Quest Complete!","auto-complete UI is not the return instruction")
  local unknown=NewQuestBlock(999999)
  module:AddObjective(unknown,"QuestComplete",trackerCompletion)
  assert(unknown.lines.QuestComplete.Text.text==trackerCompletion,"invalid quest-log index")
  trackerDraw=function()
    block.height=0;block.currentLine=nil
    module:SetBlockHeader(block,"阿彻鲁斯战马",1,true,12680)
    module:AddObjective(block,"QuestComplete",trackerCompletion,nil,true)
  end
  SlashCmdList.LEGIONCHINESE("off")
  assert(block.lines.QuestComplete.Text.text==trackerCompletion and trackerRefreshes==1)
  SlashCmdList.LEGIONCHINESE("on")
  assert(A.IsChinese(block.lines.QuestComplete.Text.text) and trackerRefreshes==2)
  local installed=module.AddObjective
  frames[1]:Fire("OnEvent","ADDON_LOADED","OtherAddon")
  assert(module.AddObjective==installed,"no duplicate method hooks")
  QUEST_TRACKER_MODULE=NewQuestTracker();module=QUEST_TRACKER_MODULE;block.module=module
  frames[1]:Fire("OnEvent","ADDON_LOADED","Blizzard_ObjectiveTracker")
  assert(A.IsChinese(block.lines.QuestComplete.Text.text) and trackerRefreshes==3,"install on a late module and refresh")
`,{tracker:true,rows:shippedCompletion()}));

test('Chinese clients retain native font faces, sizes and flags for text, buttons and book tags',()=>run(`
  for _,locale in ipairs({"zhCN","zhTW"}) do
    function GetLocale() return locale end
    local widget=Widget("English")
    function widget:GetFont() return "ClientCustomFont",17,"THICKOUTLINE" end
    A.SetFont(widget)
    assert(widget.fontChanges==0)
    A.SetFont({GetFontString=function() return widget end})
    assert(widget.fontChanges==0)
    local html={calls=0}
    function html:GetFont(tag) return "ClientFontFor"..tag,tag=="P" and 14 or 20,"OUTLINE" end
    function html:SetFont() self.calls=self.calls+1 end
    A.SetFont(html,true);assert(html.calls==0,"preserve every native HTML tag")
    D.Quests[42]={Title="中文任务"}
    assert(A.Apply(widget,"Quests",42,"Title") and widget.fontChanges==0)
  end
`));

test('other clients use available Blizzard Chinese fonts without bundled replacements',()=>run(`
  function GetLocale() return "enUS" end
  local function widget(available)
    local w={font="Fonts\\\\FRIZQT__.TTF",size=16,flags="OUTLINE",attempts={}}
    function w:GetFont() return self.font,self.size,self.flags end
    function w:SetFont(font,size,flags)
      self.attempts[#self.attempts+1]=font
      if font=="Fonts\\\\ARKai_T.ttf" and not available then return false end
      self.font=font;self.size=size;self.flags=flags;return true
    end
    return w
  end
  local present=widget(true);A.SetFont(present)
  assert(present.font=="Fonts\\\\ARKai_T.ttf" and #present.attempts==1 and present.size==16 and present.flags=="OUTLINE")
  A.SetFont(present);assert(#present.attempts==1)
  local absent=widget(false);A.SetFont(absent)
  assert(absent.font=="Fonts\\\\FRIZQT__.TTF" and #absent.attempts==1 and absent.size==16 and absent.flags=="OUTLINE")
  assert(A.fallbackFont==nil,"no bundled font dependency")
  local html={tags={},calls=0}
  function html:GetFont(tag) return self.tags[tag] or "Fonts\\\\FRIZQT__.TTF",tag=="P" and 14 or 20,"OUTLINE" end
  function html:SetFont(tag,font,size,flags) self.tags[tag]=font;self.calls=self.calls+1;assert(size==(tag=="P" and 14 or 20) and flags=="OUTLINE");return true end
  A.SetFont(html,true)
  assert(html.calls==4 and html.tags.P=="Fonts\\\\ARKai_T.ttf" and html.tags.H3==html.tags.P)
`));

test('welcome window uses game font templates and the client face for all its controls',()=>run(`
  function GetLocale() return "zhCN" end
  STANDARD_TEXT_FONT="Fonts\\\\ARKai_T.ttf"
  A.ShowWelcome()
  local window=LegionChineseWelcomeFrame
  for _,widget in ipairs(window.content) do
    assert(widget.template=="GameFontNormal" and widget:GetFont()==STANDARD_TEXT_FONT)
  end
  assert(window.TitleText:GetFont()==STANDARD_TEXT_FONT)
  assert(window.feedbackAddress:GetFont()==STANDARD_TEXT_FONT)
  assert(window.dismissButton:GetFontString():GetFont()==STANDARD_TEXT_FONT)
`,{welcome:true}));

test('legacy completion import requires unchanged quest identity and text',()=>{
  const base={ID:'12680',LogTitle:'Grand Theft Palomino',LogDescription:'Bring a horse.',QuestDescription:'Remember, $n.',QuestCompletionLog:''};
  const old={...base,QuestDescription:'Remember, $N.',QuestCompletionLog:completion};
  assert.equal(compatibleLegacyQuest(base,old),true);
  assert.equal(compatibleLegacyQuest({...base,QuestCompletionLog:completion},old),true);
  for(const field of ['ID','LogTitle','LogDescription','QuestDescription','QuestCompletionLog']){
    assert.equal(compatibleLegacyQuest({...base,[field]:'Changed'},old),false,field);
  }
  for(const field of ['LogTitle','LogDescription','QuestDescription'])assert.equal(compatibleLegacyQuest({...base,[field]:''},old),false);
  assert.equal(compatibleLegacyQuest(base,{...old,QuestCompletionLog:''}),false);
  assert.equal(compatibleLegacyQuest(base,{...old,QuestCompletionLog:'原文已经是中文。'}),false);
  assert.equal(compatibleLegacyQuest(base,{...old,VerifiedBuild:27843}),false);
  assert.equal(compatibleLegacyQuest({...base,VerifiedBuild:27843},old),false);
  assert.equal(compatibleLegacyQuest(undefined,old),false);
});
