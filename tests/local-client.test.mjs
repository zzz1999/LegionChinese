import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {sameLocalIdentity,usableLocalPair,buildLocalClientData} from '../scripts/local-client-data.mjs';
import {ChineseTextIndex} from '../scripts/fallback.mjs';

const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function run(code,before=''){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const exec=source=>{const status=lauxlib.luaL_dostring(L,to_luastring(source));assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));};
  try{
    for(const file of ['Bootstrap.lua','Core.lua','ClientNames.lua','ItemTooltips.lua','LocalClient.lua'])exec(fs.readFileSync(new URL(file,addon),'utf8'));
    exec(fs.readFileSync(new URL('ui-fixture.lua',import.meta.url),'utf8'));
    exec('function UnitName() return "Alice" end');
    exec(`function LocalRow(scope,source,text)
      local D=LegionChineseDB;local id=#D.LocalClientValues+1;D.LocalClientValues[id]=text
      D.LocalClientTexts[scope]=D.LocalClientTexts[scope] or {}
      D.LocalClientTexts[scope][LegionChinese.Fingerprint(LegionChinese.Normalize(source))]=id
    end`);
    exec(before);
    exec(fs.readFileSync(new URL('UI.lua',addon),'utf8'));
    exec('local A,D=LegionChinese,LegionChineseDB\n'+code);
  }finally{lua.lua_close(L);}
}

test('client pair identity requires every non-language field, array member and exact integer ID',()=>{
  const row={ID:10,Name_lang:'中文',Parent:4,Flags:[1,2],Multiplier:0.3,BaseTag:'A_TAG'};
  const en={ID:'10',Name_lang:'Name',Parent:'4',Flags_0:'1',Flags_1:'2',Multiplier:'0.30000001192',BaseTag:'A_TAG'};
  assert.equal(sameLocalIdentity(row,en),true);
  for(const changed of [{ID:'11'},{Parent:'5'},{Flags_1:'3'},{Multiplier:'0.31'},{BaseTag:'B_TAG'}])
    assert.equal(sameLocalIdentity(row,{...en,...changed}),false);
  assert.equal(sameLocalIdentity(row,{...en,Flags_1:undefined}),false);
  assert.equal(sameLocalIdentity({ID:1000000000},{ID:'1000000001'}),false);
  assert.equal(sameLocalIdentity({ID:1,Mask:'18446744073709551615'},{ID:'1',Mask:'18446744073709551615'}),true);
  assert.equal(sameLocalIdentity({ID:1,Mask:'18446744073709551615'},{ID:'1',Mask:'18446744073709551614'}),false);
  assert.equal(sameLocalIdentity({ID:1,Mask:18446744073709551615},{ID:'1',Mask:'18446744073709551615'}),false);
});

test('client text rejects formulas, control text, mismatched player tokens and changed icons',()=>{
  assert.equal(usableLocalPair('Hello, $N!','你好，$N！','Dialogue'),true);
  assert.equal(usableLocalPair('Hello, $N!','你好，$R！','Dialogue'),false);
  assert.equal(usableLocalPair('Damage: $s1','伤害：$s1','Item'),false);
  assert.equal(usableLocalPair('Level %d','等级%d','System'),false);
  assert.equal(usableLocalPair('Price 5|Tcoin:0|t','价格5|Tothercoin:0|t','Collection'),false);
  assert.equal(usableLocalPair('Price 5|Tcoin:0|t','价格5|Tcoin:0|t','Collection'),true);
  assert.equal(usableLocalPair('Text','中文\u0001','Item'),false);
  assert.equal(usableLocalPair('已有中文','替换已有中文','Item'),false);
});

test('new core dictionary fills missing text, retains live objective counts, and preserves established translations',()=>run(`
  LocalRow("Objective","Arrows collected","收集箭矢")
  LocalRow("Title","A scenario","中文场景")
  LocalRow("Dialogue","Hello, $N!","你好，$N！")
  assert(select(1,A.Translate("Objectives","Arrows collected: 2/10"))=="收集箭矢: 2/10")
  assert(select(1,A.Translate("Quests","A scenario",999,"Title"))=="中文场景")
  assert(select(1,A.Translate("Gossip","Hello, Alice!"))=="你好，Alice！")
  D.Strings[1]="原有译文";D.Titles[A.Fingerprint(A.Normalize("A scenario"))]=1
  assert(select(1,A.Translate("Titles","A scenario"))=="原有译文")
  assert(select(1,A.Translate("Titles","Already customized scenario"))=="Already customized scenario")
  assert(select(1,A.Translate("Titles","原来就是中文"))=="原来就是中文")
`));

test('mount recycled widgets translate only complete known text, and protected widgets stay unchanged',()=>run(`
  LocalRow("Collection","A horse","中文坐骑")
  LocalRow("Collection","A patient horse.","一匹耐心的马。")
  MountJournal_UpdateMountDisplay()
  local info=MountJournal.MountDisplay.InfoButton
  assert(info.Name:GetText()=="中文坐骑" and info.Lore:GetText()=="一匹耐心的马。")
  info.Lore:SetText("A different horse.");assert(info.Lore:GetText()=="A different horse.")
  info.Name:SetText("已有坐骑中文");assert(info.Name:GetText()=="已有坐骑中文")
  info.Name.forbidden=true;info.Name:SetText("A horse");assert(info.Name:GetText()=="A horse")
`, `
  MountJournal={MountDisplay={InfoButton={Name=Widget(""),Source=Widget(""),Lore=Widget("")}}}
  function MountJournal.MountDisplay.InfoButton.Name:IsForbidden() return self.forbidden end
  function MountJournal_UpdateMountDisplay()
    local info=MountJournal.MountDisplay.InfoButton;info.Name:SetText("A horse");info.Lore:SetText("A patient horse.")
  end
`));

test('optional missing widgets do not block later zone labels and player ship names are never bound',()=>run(`
  LocalRow("World","A zone","中文区域")
  LocalRow("Garrison","Mission name","中文任务")
  MinimapZoneText:SetText("A zone");assert(MinimapZoneText:GetText()=="中文区域")
  GarrisonMissionFrame.FollowerTab.Name:SetText("Mission name")
  assert(GarrisonMissionFrame.FollowerTab.Name:GetText()=="Mission name")
  GarrisonMissionFrame.MissionTab.MissionPage.Stage.MissionDescription:SetText("Mission name")
  assert(GarrisonMissionFrame.MissionTab.MissionPage.Stage.MissionDescription:GetText()=="中文任务")
`, `
  WorldMapFrameAreaLabel=nil;MinimapZoneText=Widget("")
  GarrisonMissionFrame={FollowerTab={Name=Widget("")},MissionTab={MissionPage={Stage={MissionDescription=Widget("")}}}}
`));

test('shared item metadata preserves color and counts, caches writes, and checks real item identity',()=>run(`
  ItemRefTooltip.pendingText="|cff00ff00Set bonus|r"
  ItemRefTooltip:SetHyperlink("item:700000")
  assert(ItemRefTooltipTextLeft6:GetText()=="|cff00ff00套装奖励|r")
  local writes=ItemRefTooltipTextLeft6.writes
  for i=1,30 do ItemRefTooltip:Fire("OnUpdate",0.016) end
  assert(ItemRefTooltipTextLeft6.writes==writes)
  ItemRefTooltipTextLeft2:SetText("+1,234 Stamina")
  ItemRefTooltip:Fire("OnUpdate",0.1)
  assert(ItemRefTooltipTextLeft2:GetText()=="+1,234 Stamina")
  ItemRefTooltip.pendingText="Unrecognized bonus";ItemRefTooltip:SetHyperlink("item:700001")
  assert(ItemRefTooltipTextLeft6:GetText()=="Unrecognized bonus")
  ItemRefTooltip.spell="Spell";ItemRefTooltipTextLeft6:SetText("Set bonus")
  ItemRefTooltip:Fire("OnUpdate",0.1);assert(ItemRefTooltipTextLeft6:GetText()=="Set bonus")
  GameTooltip.noItemAPI=true;bagItemID=700000;GameTooltip.pendingText="Set bonus"
  GameTooltip:SetBagItem(0,1);assert(GameTooltipTextLeft6:GetText()=="套装奖励")
  GameTooltip:Fire("OnTooltipCleared");GameTooltip.itemLink=nil;GameTooltip.item=nil
  GameTooltipTextLeft6:SetText("Set bonus");GameTooltip:Fire("OnUpdate",0.1)
  assert(GameTooltipTextLeft6:GetText()=="Set bonus")
`, ['world-tooltip-fixture.lua','item-tooltip-fixture.lua'].map(file=>fs.readFileSync(new URL(file,import.meta.url),'utf8')).join('\n')+
  '\nLocalRow("Item","Set bonus","套装奖励")\n'));

test('map location tooltip checks a genuine native POI and leaves timer and reward lines intact',()=>run(`
  LocalRow("World","A place","中文地点")
  LocalRow("World","Place description.","地点说明。")
  WorldMapPOI_OnEnter(WorldMapFramePOI1)
  assert(WorldMapTooltipTextLeft1:GetText()=="中文地点" and WorldMapTooltipTextLeft2:GetText()=="地点说明。")
  assert(WorldMapTooltipTextLeft3:GetText()=="Reward: 100 gold")
  local fake={GetName=function() return "WorldMapFramePOI1" end}
  WorldMapPOI_OnEnter(fake)
  assert(WorldMapTooltipTextLeft1:GetText()=="A place")
`, `
  WorldMapFramePOI1={GetName=function() return "WorldMapFramePOI1" end}
  WorldMapTooltip={IsShown=function()return true end,GetOwner=function(self)return self.owner end,Show=function()end}
  function WorldMapPOI_OnEnter(owner)
    WorldMapTooltip.owner=owner;WorldMapTooltipTextLeft1=Widget("A place")
    WorldMapTooltipTextLeft2=Widget("Place description.");WorldMapTooltipTextLeft3=Widget("Reward: 100 gold")
  end
`));

test('native dungeon information and achievement criteria translate while reward values and group titles stay intact',()=>run(`
  LocalRow("GroupFinder","Dungeon name","中文地下城")
  LocalRow("GroupFinder","Dungeon introduction.","地下城介绍。")
  LocalRow("Objective","Win battles","赢得战斗")
  local frame=LFDQueueFrameRandomScrollFrameChildFrame
  LFGRewardsFrame_UpdateFrame(frame)
  assert(frame.title:GetText()=="中文地下城" and frame.description:GetText()=="地下城介绍。")
  assert(frame.rewardsDescription:GetText()=="100 gold")
  assert(PremadeGroupTitle:GetText()=="Dungeon name")
  local criteria=AchievementButton_GetCriteria(1,false)
  criteria.name:SetText("- Win battles: 2/5")
  assert(criteria.name:GetText()=="- 赢得战斗: 2/5")
  criteria.name:SetText("- A modified requirement")
  assert(criteria.name:GetText()=="- A modified requirement")
  local other=AchievementButton_GetCriteria(1,true)
  other.name:SetText("Win battles")
  assert(other.name:GetText()=="赢得战斗")
`, `
  LFDQueueFrameRandomScrollFrameChildFrame={title=Widget(""),description=Widget(""),rewardsDescription=Widget("")}
  PremadeGroupTitle=Widget("Dungeon name")
  function LFGRewardsFrame_UpdateFrame(frame)
    frame.title:SetText("Dungeon name");frame.description:SetText("Dungeon introduction.");frame.rewardsDescription:SetText("100 gold")
  end
  function AchievementButton_GetCriteria(index,offscreen)
    local name="AchievementFrameCriteria"..(offscreen and "OffScreen" or "")..index
    _G[name]=_G[name] or {name=Widget("")};return _G[name]
  end
`));

test('client snapshot rejects modified provenance, deduplicates existing keys, and falls back per language',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lcn-local-'));
  fs.mkdirSync(path.join(root,'AddOns/LegionChinese/Data'),{recursive:true});fs.mkdirSync(path.join(root,'docs'));
  const snapshot={schema:1,build:'7.3.5.26972',buildKey:'known-build',rootCKey:'known-root',tools:{},exclusions:[],tables:[{table:'Scenario'}],pairs:[
    {table:'Scenario',id:1,field:'Name_lang',scope:'Title',source:'Known scene',text:'中文场景',locale:'zhCN'},
    {table:'Scenario',id:2,field:'Name_lang',scope:'Title',source:'Traditional scene',text:'繁體場景',locale:'zhTW'},
  ]};
  const file=path.join(root,'snapshot.json');fs.writeFileSync(file,JSON.stringify(snapshot));
  const manifest={localClientSnapshot:{file:'snapshot.json',sha256:hash(fs.readFileSync(file)),buildKey:snapshot.buildKey,rootCKey:snapshot.rootCKey}};
  const base=new ChineseTextIndex();base.add('zhCN','Known scene','原有场景');base.finish();
  try{
    const built=buildLocalClientData({root,manifest,version:'1.3.0',baseIndexes:{Title:base}});
    assert.equal(built.audit.counts.Title.alreadyPresent,1);
    assert.deepEqual(built.audit.counts.Title.locales,{zhCN:0,zhTW:1});
    assert.ok(fs.readFileSync(path.join(root,'AddOns/LegionChinese',built.generated[0].replaceAll('\\','/')),'utf8').includes('繁體場景'));
    fs.appendFileSync(file,' ');
    assert.throws(()=>buildLocalClientData({root,manifest,version:'1.3.0'}),/checksum/);
  }finally{
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('lcn-local-'));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
