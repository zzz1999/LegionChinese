import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {numericSpellTemplate} from '../scripts/dynamic-spell-text.mjs';
import {selectClientDescription,buildClientDescriptions,descriptionSpecs} from '../scripts/client-descriptions.mjs';
import {nameKey} from '../scripts/client-names.mjs';
import {luaString} from '../scripts/text.mjs';

const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
const data=new URL('Data/',addon);
function shipped(prefix,needle){
  for(const f of fs.readdirSync(data).filter(f=>f.startsWith(prefix+'_'))){
    const row=fs.readFileSync(new URL(f,data),'utf8').split('\n').find(l=>l.startsWith(needle));
    if(row)return row;
  }
  assert.fail('Missing generated '+needle);
}
function run(code,{before='',rows='',fixtures=[]}={}){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const exec=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    for(const file of ['Bootstrap.lua','Core.lua','ClientNames.lua','MapTooltips.lua','ExtraTooltips.lua','ItemTooltips.lua','ClientDescriptions.lua','DialogueSurfaces.lua'])
      exec(fs.readFileSync(new URL(file,addon),'utf8'));
    exec('local D=LegionChineseDB\n'+rows);
    exec(fs.readFileSync(new URL('ui-fixture.lua',import.meta.url),'utf8'));
    for(const f of fixtures)exec(fs.readFileSync(new URL(f,import.meta.url),'utf8'));
    exec(before);
    exec(fs.readFileSync(new URL('UI.lua',addon),'utf8'));
    exec('local A,D=LegionChinese,LegionChineseDB\n'+code);
  }finally{lua.lua_close(L);}
}

test('client descriptions keep per-field Traditional fallback and require identical native pet expressions',()=>{
  assert.equal(selectClientDescription('Hello.','缺少$s1','現有說明。').locale,'zhTW');
  assert.equal(selectClientDescription('Deal [damage(1)] damage.','造成[damage(2)]伤害。','造成[damage(1)]傷害。',{petAbility:true}).locale,'zhTW');
  assert.equal(selectClientDescription('Deal [damage(1)] damage.','造成[damage(1)]伤害。'),undefined);
  assert.equal(selectClientDescription('Text.','含有|Hspell:1|h法术|h'),undefined);
  assert.equal(selectClientDescription('Text.','替换%s内容'),undefined);
  assert.equal(selectClientDescription('Source: |cffffd200Vendor|r|nTown','来源：|cffffd200商人|r|n城镇').text,'来源：商人\n城镇');
});

test('numeric spell templates reject unsupported formulas, durations, changed constants and token identity',()=>{
  const row=numericSpellTemplate('Deal $s1 damage to 3 targets.','对3个目标造成$s1点伤害。');
  assert.equal(row.text,'对3个目标造成{1}点伤害。');
  assert.deepEqual(row.constants,{'2':3});
  for(const [en,cn]of [
    ['Deal $s1 damage over $d.','在$d内造成$s1点伤害。'],
    ['Deal ${$s1*2} damage.','造成${$s1*2}点伤害。'],
    ['Deal $s1 damage.','造成$s2点伤害。'],
    ['Deal $s1 damage to 3 targets.','对5个目标造成$s1点伤害。'],
    ['Deal $s1 damage.','造成$s1点伤害%s。'],
    ['Deal $s1 damage.','造成$s1点伤害\u0001。'],
  ])assert.equal(numericSpellTemplate(en,cn),undefined);
  assert.equal(numericSpellTemplate('Deal $s1 damage.','造成$s2点伤害。','造成$s1點傷害。').locale,'zhTW');
});

test('shipped Fireball description copies live values with no formula evaluation and aura field stays isolated',()=>run(`
  assert(A.ResolveDynamicSpellText(133,"Description","Throws a fiery ball that causes 1,234.5 Fire damage.")=="投出一枚火球，造成1,234.5点火焰伤害。")
  for _,source in ipairs({"Throws a fiery ball that causes 123 Fire damage to all enemies.","造成123点伤害。","Throws a fiery ball that causes 1..2 Fire damage.","Throws a fiery ball that causes 1,23 Fire damage."}) do
    assert(A.ResolveDynamicSpellText(133,"Description",source)==nil)
  end
  assert(A.ResolveDynamicSpellText(133,"Aura","Throws a fiery ball that causes 123 Fire damage.")==nil)
  D.DynamicSpellTexts[9]={Description={Key=A.NameFingerprint("Deal ~v~ damage to ~v~ targets."),Text="对3个目标造成{1}点伤害。",Count=2,Constants={[2]=3},Equals={}}}
  assert(A.ResolveDynamicSpellText(9,"Description","Deal 55 damage to 3 targets.")=="对3个目标造成55点伤害。")
  assert(A.ResolveDynamicSpellText(9,"Description","Deal 55 damage to 4 targets.")==nil)
`,{rows:shipped('DynamicSpellTexts','D.DynamicSpellTexts[133]=')}));

test('world and bonus quest line zero translates as title before line layout, scenario objectives keep counters',()=>run(`
  D.Strings[1]="中文世界任务";D.Titles[A.Fingerprint(A.Normalize("World quest"))]=1
  D.Strings[2]="收集箭矢";D.Objectives[A.Fingerprint(A.Normalize("Arrows collected"))]=2
  for _,module in ipairs({BONUS_OBJECTIVE_TRACKER_MODULE,WORLD_QUEST_TRACKER_MODULE}) do
    local block=NewQuestBlock(42);block.module=module
    local title=module:AddObjective(block,0,"World quest")
    assert(title.Text:GetText()=="中文世界任务")
    local line=module:AddObjective(block,1,"Arrows collected: 2/10",nil,true)
    assert(line.Text:GetText()=="收集箭矢: 2/10" and line.top==title:GetHeight()+2)
    local timer=module:AddObjective(block,"TimeLeft","2 minutes")
    assert(timer.Text:GetText()=="2 minutes" and timer.top==block.height-timer:GetHeight()-2)
  end
  local block=NewQuestBlock(nil)
  assert(SCENARIO_TRACKER_MODULE:AddObjective(block,1,"Arrows collected: 1/2").Text:GetText()=="收集箭矢: 1/2")
  assert(SCENARIO_TRACKER_MODULE:AddObjective(block,2,"1/5 Arrows collected").Text:GetText()=="1/5 收集箭矢")
  assert(SCENARIO_TRACKER_MODULE:AddObjective(block,3,"2/5 Other criteria").Text:GetText()=="2/5 Other criteria")
  assert(OTHER_TRACKER_MODULE:AddObjective(NewQuestBlock(42),0,"World quest").Text:GetText()=="World quest")
`,{fixtures:['tracker-fixture.lua'],before:`
  BONUS_OBJECTIVE_TRACKER_MODULE=NewQuestTracker();WORLD_QUEST_TRACKER_MODULE=NewQuestTracker()
  SCENARIO_TRACKER_MODULE=NewQuestTracker()
`}));

test('map logged quests and world quests translate only current quest blocks and keep reward lines',()=>run(`
  D.Strings[1]="中文地图任务";D.Titles[A.Fingerprint(A.Normalize("Map quest"))]=1
  D.Strings[2]="收集箭矢";D.Objectives[A.Fingerprint(A.Normalize("Arrows collected"))]=2
  WorldMapQuestPOI_SetTooltip(nil,1)
  assert(WorldMapTooltipTextLeft1:GetText()=="中文地图任务")
  assert(WorldMapTooltipTextLeft2:GetText()=="- 收集箭矢: 1/5")
  assert(WorldMapTooltipTextLeft3:GetText()=="Reward: 500 gold")
  WorldMapQuestPOI_AppendTooltip(nil,2)
  assert(WorldMapTooltipTextLeft4:GetText()=="Other server quest")
  assert(WorldMapTooltipTextLeft2:GetText()=="- 收集箭矢: 1/5")
  WorldMapTooltip.owner=WorldMapFrameTaskPOI1
  WorldMapTooltip:SetText("Map quest");WorldMapTooltip:AddLine("- Arrows collected: 4/5");WorldMapTooltip:Show()
  assert(WorldMapTooltipTextLeft1:GetText()=="中文地图任务" and WorldMapTooltipTextLeft2:GetText()=="- 收集箭矢: 4/5")
  WorldMapTooltip:SetText("Retrieving data");WorldMapTooltip:Show()
  assert(WorldMapTooltipTextLeft1:GetText()=="Retrieving data")
`,{before:`
  WorldMapTooltip={count=0}
  function WorldMapTooltip:GetName() return "WorldMapTooltip" end
  function WorldMapTooltip:NumLines() return self.count end
  function WorldMapTooltip:GetOwner() return self.owner end
  function WorldMapTooltip:SetText(text) self.count=0;self:AddLine(text) end
  function WorldMapTooltip:AddLine(text) self.count=self.count+1;_G["WorldMapTooltipTextLeft"..self.count]=Widget(text) end
  function WorldMapTooltip:Show() self.shows=(self.shows or 0)+1 end
  function GetQuestLogTitle(index) return index==1 and "Map quest" or "Other server quest",nil,nil,nil,nil,nil,nil,index end
  function WorldMapQuestPOI_SetTooltip(_,index)
    WorldMapTooltip:SetText(GetQuestLogTitle(index))
    WorldMapTooltip:AddLine("- Arrows collected: 1/5");WorldMapTooltip:AddLine("Reward: 500 gold");WorldMapTooltip:Show()
  end
  function WorldMapQuestPOI_AppendTooltip(_,index) WorldMapTooltip:AddLine(GetQuestLogTitle(index));WorldMapTooltip:Show() end
  WorldMapFrameTaskPOI1={questID=1,GetName=function() return "WorldMapFrameTaskPOI1" end}
  C_TaskQuest={GetQuestInfoByQuestID=function() return "Map quest" end}
`}));

test('currency tooltip and achievement widgets use shipped description keys and never reuse a different ID',()=>run(`
  GameTooltip:SetCurrencyByID(61)
  assert(GameTooltipTextLeft2:GetText():find("蒂凡妮",1,true))
  local button={id=6,label=Widget("Level 10"),description=Widget("Reach level 10."),hiddenDescription=Widget("Reach level 10."),reward=Widget("")}
  AchievementFrameAchievements_SetupButton(button)
  assert(button.description:GetText()=="升到10级。" and button.hiddenDescription:GetText()=="升到10级。")
  button.id=999999;button.description:SetText("Reach level 10.")
  assert(button.description:GetText()=="Reach level 10.")
  button.id=6;button.description:SetText("Reach level 20.")
  assert(button.description:GetText()=="Reach level 20.")
  D.ClientTextIndex.Achievement.Description={[A.NameFingerprint("Reach level 10.")]=6}
  button.id=nil;button.description:SetText("Reach level 10.")
  assert(button.description:GetText()=="Reach level 10.","a recycled button with no ID must wait for its new identity")
`,{rows:[shipped('ClientTexts','D.ClientTexts.Achievement[6]='),shipped('ClientTexts','D.ClientTexts.Currency[61]=')].join('\n'),before:`
  function AchievementFrameAchievements_SetupButton() end
  GameTooltip=ScriptFrame()
  GameTooltipTextLeft1=Widget("");GameTooltipTextLeft2=Widget("")
  function GameTooltip:GetName() return "GameTooltip" end
  function GameTooltip:NumLines() return 2 end
  function GameTooltip:Show() end
  function GameTooltip:SetCurrencyByID(id)
    GameTooltipTextLeft1:SetText("Dalaran Jewelcrafter's Token")
    GameTooltipTextLeft2:SetText("Tiffany Cartier's shop in Dalaran will gladly accept these tokens for unique jewelcrafting recipes.")
  end
`}));

test('pet ability descriptions pass identical expressions to the native parser with current stats',()=>run(`
  local source="Deals [damage(1)] damage."
  D.ClientTexts.BattlePetAbility[77]={Description={[A.NameFingerprint(source)]="造成[damage(1)]点伤害。"}}
  local tip={Description=Widget("Deals 321 damage."),Name=Widget("Custom name")}
  local info={GetAbilityID=function() return 77 end,power=321}
  C_PetBattles={GetAbilityInfoByID=function() return 77,"Custom name",nil,nil,source end}
  function SharedPetAbilityTooltip_ParseText(info,text) return (text:gsub("%[damage%(1%)%]",tostring(info.power))) end
  A.UpdatePetAbilityDescription(tip,info)
  assert(tip.Description:GetText()=="造成321点伤害。")
  tip.Description:SetText("Another server description");A.UpdatePetAbilityDescription(tip,info)
  assert(tip.Description:GetText()=="Another server description")
`));

test('NPC bubbles are bounded and exclude player speech, forbidden bubbles and expired text',()=>run(`
  local source="A known line"
  D.Strings[1]="已有中文对白";D.Gossip[A.Fingerprint(A.Normalize(source))]=1
  local text=Widget(source)
  C_ChatBubbles={GetAllChatBubbles=function(forbidden) assert(forbidden==false);return {{GetRegions=function() return text end}} end}
  local f=ScriptFrame()
  A.RecordBubbleMessage(f,"CHAT_MSG_MONSTER_SAY",source)
  A.PollNPCBubbles(f,0.1);assert(text:GetText()=="已有中文对白")
  text:SetText(source);A.RecordBubbleMessage(f,"CHAT_MSG_SAY",source);A.RecordBubbleMessage(f,"CHAT_MSG_MONSTER_SAY",source)
  A.PollNPCBubbles(f,0.1);assert(text:GetText()==source)
  now=20;A.PollNPCBubbles(f,0.1);assert(f.scripts.OnUpdate==nil)
  text.IsForbidden=function() return true end
  A.RecordBubbleMessage(f,"CHAT_MSG_MONSTER_SAY",source);A.PollNPCBubbles(f,0.1);assert(text:GetText()==source)
`,{before:'now=0;function GetTime() return now end; function wipe(t) for k in pairs(t) do t[k]=nil end end'}));

test('overflowing player bubble evidence suspends translation instead of forgetting ambiguity',()=>run(`
  D.Strings[1]="已有中文";D.Gossip[A.Fingerprint(A.Normalize("Known line"))]=1
  local f=ScriptFrame()
  A.RecordBubbleMessage(f,"CHAT_MSG_MONSTER_SAY","Known line")
  for i=1,65 do A.RecordBubbleMessage(f,"CHAT_MSG_SAY","Player line "..i) end
  A.RecordBubbleMessage(f,"CHAT_MSG_MONSTER_SAY","Known line")
  assert(f.scripts.OnUpdate==nil)
  now=16;A.RecordBubbleMessage(f,"CHAT_MSG_MONSTER_SAY","Known line")
  assert(f.scripts.OnUpdate~=nil)
`,{before:'now=0;function GetTime() return now end; function wipe(t) for k in pairs(t) do t[k]=nil end end'}));

test('talking heads and cinematic NPC subtitles translate while player subtitle messages stay intact',()=>run(`
  D.Strings[1]="已有中文对白";D.Gossip[A.Fingerprint(A.Normalize("Known speech"))]=1
  TalkingHeadFrame.TextFrame.Text:SetText("Known speech")
  assert(TalkingHeadFrame.TextFrame.Text:GetText()=="已有中文对白")
  local subtitle=Widget("NPC: Known speech")
  CinematicFrame.Subtitles={subtitle}
  A.UpdateNPCSubtitle(CinematicFrame,"CHAT_MSG_MONSTER_SAY","Known speech","NPC",nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,true,false)
  assert(subtitle:GetText()=="NPC: 已有中文对白" and subtitleLayouts==1)
  subtitle:SetText("NPC: Known speech")
  A.UpdateNPCSubtitle(CinematicFrame,"CHAT_MSG_SAY","Known speech","NPC",nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,true,false)
  assert(subtitle:GetText()=="NPC: Known speech")
`,{before:`
  TalkingHeadFrame={TextFrame={Text=Widget("")},NameFrame={Name=Widget("")}}
  CinematicFrame=ScriptFrame();function CinematicFrame:IsShown() return true end
  subtitleLayouts=0;function CinematicFrame_OnDisplaySizeChanged() subtitleLayouts=subtitleLayouts+1 end
  SUBTITLE_FORMAT="%s: %s"
`}));

test('comparison tooltips retain per-item identity across native refreshes',()=>run(`
  D.ItemDescriptions[138019]={[A.NameFingerprint(description)]=translatedDescription}
  for _,tip in ipairs({ShoppingTooltip1,ShoppingTooltip2,ItemRefShoppingTooltip1,ItemRefShoppingTooltip2}) do
    tip:SetHyperlink("item:138019::::::::")
    local line=_G[tip:GetName().."TextLeft6"]
    assert(line:GetText()=='"'..translatedDescription..'"')
    tip:SetHyperlink("item:999999::::::::")
    assert(line:GetText()=='"'..description..'"')
    tip.pendingText="A server-specific effect";tip:SetHyperlink("item:138019::::::::")
    assert(line:GetText()=="A server-specific effect")
    tip.pendingText=nil;tip.forbidden=true;tip:SetHyperlink("item:138019::::::::")
    assert(line:GetText()=='"'..description..'"')
  end
`,{fixtures:['world-tooltip-fixture.lua','item-tooltip-fixture.lua'],before:`
  for _,name in ipairs({"ShoppingTooltip1","ShoppingTooltip2","ItemRefShoppingTooltip1","ItemRefShoppingTooltip2"}) do
    _G[name]=MakeItemTooltip(name)
  end
`}));

test('dynamic spell tooltips follow new live values and keep aura state separate',()=>run(`
  local tip=GameTooltip;tip.lineCount=2;tip.shown=true;tip.spell="Fireball";tip.spellID=133
  GameTooltipTextLeft1:SetText("Fireball")
  GameTooltipTextLeft2:SetText("Throws a fiery ball that causes 55 Fire damage.")
  tip:Fire("OnTooltipSetSpell")
  assert(GameTooltipTextLeft2:GetText()=="投出一枚火球，造成55点火焰伤害。")
  GameTooltipTextLeft2:SetText("Throws a fiery ball that causes 87 Fire damage.")
  tip:Fire("OnTooltipSetSpell")
  assert(GameTooltipTextLeft2:GetText()=="投出一枚火球，造成87点火焰伤害。")
  A.UpdateExtraTooltip(tip,"aura",133)
  assert(GameTooltipTextLeft2:GetText()=="Throws a fiery ball that causes 87 Fire damage.")
  tip:Fire("OnTooltipCleared");tip.spellID=999999;tip:Fire("OnTooltipSetSpell")
  assert(GameTooltipTextLeft2:GetText()=="Throws a fiery ball that causes 87 Fire damage.")
`,{rows:shipped('DynamicSpellTexts','D.DynamicSpellTexts[133]='),fixtures:['world-tooltip-fixture.lua'],before:`
  function GameTooltip:GetName() return "GameTooltip" end
  function GameTooltip:NumLines() return self.lineCount or 0 end
`}));

test('native target and focus cast bars translate active casts without changing stop/error text',()=>run(`
  D.NameStrings[1]="火球术";D.Spells[133]=1;D.SpellNames[A.NameFingerprint("Fireball")]=1
  for _,bar in ipairs({TargetFrameSpellBar,FocusFrameSpellBar}) do
    StartCast(bar,{name="Fireball",text="Fireball",apiSpellID=133,channel=bar==FocusFrameSpellBar})
    assert(bar.Text:GetText()=="火球术" and bar.value==1 and bar.maxValue==5)
  end
  TargetFrameSpellBar:Fire("OnEvent","UNIT_SPELLCAST_FAILED","target","Fireball","",77,133)
  A.RefreshCastBars();assert(TargetFrameSpellBar.Text:GetText()=="失败")
  StartCast(TargetCastBar,{name="Fireball",text="Fireball",apiSpellID=133})
  assert(TargetCastBar.Text:GetText()=="Fireball")
`,{fixtures:['castbar-fixture.lua'],before:`
  TargetFrameSpellBar=NewCastBar("target",true);FocusFrameSpellBar=NewCastBar("focus",true)
`}));

test('NPC unit labels require a Creature identity and complete name; pets and players remain protected',()=>run(`
  D.NPCLabelNames[19]={[A.NameFingerprint("Smith")]="铁匠"}
  units.target={guid="Creature-0-1-2-3-19-0001",name="Smith"}
  UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="铁匠")
  units.target.name="Other Smith";UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="Other Smith")
  units.target.name="Smith";units.target.guid="Pet-0-1-2-3-19-0001"
  UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="Smith")
  units.target.guid="Player-1-0001";UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="Smith")
  units.target.guid="Creature-0-1-2-3-19-0001";controlled=true
  UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="Smith")
  controlled=false;TargetFrame.name:SetText("Custom frame text")
  A.UpdatePetUnitFrame(TargetFrame);assert(TargetFrame.name:GetText()=="Custom frame text")
`,{fixtures:['pet-fixture.lua'],before:'function UnitPlayerControlled() return controlled end'}));

test('journal widgets and adventure cards handle native ID assignment order, layout and reuse',()=>run(`
  local function row(kind,id,field,source,text)
    D.ClientTexts[kind][id]=D.ClientTexts[kind][id] or {}
    D.ClientTexts[kind][id][field]={[A.NameFingerprint(source)]=text}
    D.ClientTextIndex[kind][field]=D.ClientTextIndex[kind][field] or {}
    D.ClientTextIndex[kind][field][A.NameFingerprint(source)]=id
  end
  row("Encounter",1,"Description","Boss lore","首领介绍")
  row("JournalSection",11,"Name","Shared heading","第一章")
  row("JournalSection",12,"Name","Shared heading","第二章")
  row("JournalSection",11,"Description","Known description","已核实章节说明")
  row("Adventure",90,"Description","A suggestion","已有冒险说明")
  row("Adventure",90,"Continue","Continue the adventure","继续冒险的说明")
  row("Adventure",90,"Button","Accept","接受")
  local e=EncounterJournal.encounter
  EncounterJournal.encounterID=1;e.infoFrame.description:SetText("Boss lore")
  assert(e.infoFrame.description:GetText()=="首领介绍")
  EncounterJournal.encounterID=2;e.infoFrame.description:SetText("Boss lore")
  assert(e.infoFrame.description:GetText()=="Boss lore")
  local overview={overviews={}}
  EncounterJournal_SetUpOverview(overview,11,1)
  assert(overview.overviews[1].button.title:GetText()=="第一章")
  EncounterJournal_SetUpOverview(overview,12,1)
  assert(overview.overviews[1].button.title:GetText()=="第二章")
  EncounterJournal_SetUpOverview(overview,99,1)
  assert(overview.overviews[1].button.title:GetText()=="Shared heading")
  local header={myID=11,description=Widget("Known description"),button={title=Widget("Shared heading")}}
  e.usedHeaders={header};EncounterJournal_ToggleHeaders()
  assert(header.description:GetText()=="已核实章节说明" and shifts==1)
  header.myID=12;header.description:SetText("Known description")
  assert(header.description:GetText()=="Known description")
  local bullets={Text=Widget("")}
  EncounterJournal_SetBullets(bullets,"Known description",false)
  assert(bullets.Text:GetText()=="已核实章节说明" and bullets.measuredText==bullets.Text:GetText())
  local card=EncounterJournal.suggestFrame.Suggestion1
  card.centerDisplay.description.text:SetText("A suggestion")
  card.button:SetText("Accept")
  assert(card.centerDisplay.description.text:GetText()=="已有冒险说明" and card.button:GetText()=="接受")
  card.centerDisplay.description.text:SetText("Continue the adventure")
  assert(card.centerDisplay.description.text:GetText()=="继续冒险的说明")
  card.centerDisplay.description.text:SetText("An unknown adventure")
  assert(card.centerDisplay.description.text:GetText()=="An unknown adventure")
`,{before:`
  EncounterJournal={encounter={infoFrame={description=Widget("")},usedHeaders={}},
    suggestFrame={Suggestion1={centerDisplay={description={text=Widget("")}},button=Widget("")}}}
  function EncounterJournal_ToggleHeaders() end
  shifts=0;function EncounterJournal_ShiftHeaders() shifts=shifts+1 end
  function EncounterJournal_SetUpOverview(self,id,index)
    local header=self.overviews[index] or {button={title=Widget("")}}
    self.overviews[index]=header
    header.button.title:SetText("Shared heading")
    header.sectionID=id
  end
  function EncounterJournal_SetBullets(object,source)
    object.Text:SetText(source);object.measuredText=object.Text:GetText()
  end
`}));

test('pet journal lore uses the selected species and leaves custom pet names intact',()=>run(`
  local card={speciesID=4,PetInfo={sourceText="Found in town",description='"Known pet lore"',name=Widget("My name")}}
  D.ClientTexts.BattlePet[4]={Source={[A.NameFingerprint("Found in town")]="在城镇获得"},
    Description={[A.NameFingerprint("Known pet lore")]="已有宠物介绍"}}
  PetJournal_UpdatePetCard(card)
  assert(card.PetInfo.sourceText=="在城镇获得" and card.PetInfo.description=='"已有宠物介绍"')
  assert(card.PetInfo.name:GetText()=="My name")
  card.petID="owned";card.PetInfo.description='"Known pet lore"'
  C_PetJournal={GetPetInfoByPetID=function() return 99 end}
  PetJournal_UpdatePetCard(card);assert(card.PetInfo.description=='"Known pet lore"')
`,{before:'function PetJournal_UpdatePetCard() end'}));

test('description imports verify build and bytes and omit ambiguous field-only lookups',()=>{
  const tempBase=fs.realpathSync(os.tmpdir());
  const folder=fs.mkdtempSync(path.join(tempBase,'lcn-descriptions-'));
  try{
    fs.mkdirSync(path.join(folder,'AddOns/LegionChinese/Data'),{recursive:true});
    fs.mkdirSync(path.join(folder,'docs'));
    const manifest={extraLinkTables:[]};
    for(const [table,,fields]of descriptionSpecs){
      for(const locale of ['enUS','zhCN','zhTW']){
        const values=locale==='enUS'?['Same text','Same text','Another text']:
          locale==='zhCN'?['第一条中文','不同的中文','']:['第一條中文','不同的中文','繁體補缺'];
        const csv=['ID,'+Object.keys(fields).join(','),...values.map((value,i)=>
          [i+1,...Object.keys(fields).map(()=>value)].join(','))].join('\n');
        const file=table+'-'+locale+'.csv';fs.writeFileSync(path.join(folder,file),csv);
        manifest.extraLinkTables.push({table,locale,file,build:'7.3.5.26972',sha256:crypto.createHash('sha256').update(csv).digest('hex')});
      }
    }
    const opts={root:folder,input:folder,manifest,version:'1.2.16'};
    const result=buildClientDescriptions(opts);
    assert.equal(result.audit.counts.Achievement.Description.zhTW,1);
    const generated=result.generated.map(f=>fs.readFileSync(path.join(folder,'AddOns/LegionChinese',f.replaceAll('\\','/')),'utf8')).join('\n');
    assert.ok(!generated.includes(`D.ClientTextIndex.Achievement.Description["${nameKey('Same text')}"]`));
    assert.ok(generated.includes(`D.ClientTextIndex.Achievement.Description["${nameKey('Another text')}"]=3`));
    manifest.extraLinkTables[0].build='8.0.1.27843';
    assert.throws(()=>buildClientDescriptions(opts),/Invalid description source/);
    manifest.extraLinkTables[0].build='7.3.5.26972';
    fs.appendFileSync(path.join(folder,manifest.extraLinkTables[0].file),'changed');
    assert.throws(()=>buildClientDescriptions(opts),/checksum/);
  }finally{
    assert.equal(path.dirname(fs.realpathSync(folder)),tempBase);
    fs.rmSync(folder,{recursive:true,force:true});
  }
});
