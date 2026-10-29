import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {readFixtureFile,listFixtureFiles} from './addon-fixture.mjs';
import {runtimeFiles} from '../scripts/resource-layout.mjs';
import {fingerprint,variants,luaString} from '../scripts/text.mjs';
import {nameKey} from '../scripts/client-names.mjs';

const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
const data=new URL('Data/',addon),catalog=new Map(),values=new Map();
for(const file of listFixtureFiles(data)){
  if(!/^(CollectionTexts|ProfessionTexts|GarrisonTexts|WorldTexts|CatalogStrings)_/.test(file))continue;
  const body=readFixtureFile(new URL(file,data),'utf8');
  for(const match of body.matchAll(/^D\.CatalogTexts\.(\w+)\["([0-9a-f:]+)"\]=(\d+)$/gm))catalog.set(match[1]+':'+match[2],Number(match[3]));
  for(const match of body.matchAll(/^D\.CatalogStrings\[(\d+)\]=(.+)$/gm))values.set(Number(match[1]),match[2].trim());
}
const snapshot=JSON.parse(fs.readFileSync(new URL('../data/local-client-735.json',import.meta.url),'utf8'));
function pick(table,field,locale='zhCN',accept=()=>true){
  const row=snapshot.pairs.find(p=>p.table===table&&p.field===field&&p.locale===locale&&accept(p)
    &&values.get(catalog.get(p.scope+':'+fingerprint(variants(p.source)[0])))===luaString(p.text));
  assert.ok(row,`A shipped ${locale} ${table}.${field} pair is required`);
  return row;
}
const examples={
  toy:pick('Toy','SourceText_lang'),set:pick('TransmogSet','Name_lang'),setTW:pick('TransmogSet','Name_lang','zhTW'),
  artifact:pick('ResearchProject','Name_lang'),history:pick('ResearchProject','Description_lang'),race:pick('ResearchBranch','Name_lang'),site:pick('ResearchSite','Name_lang'),
  siteMap:pick('ResearchSite','Name_lang','zhCN',p=>!catalog.has('World:'+fingerprint(variants(p.source)[0]))),
  talent:pick('GarrTalent','Name_lang'),talentTW:pick('GarrTalent','Description_lang','zhTW'),
  source:pick('GarrFollower','AllianceSourceText_lang'),sourceTW:pick('GarrFollower','HordeSourceText_lang','zhTW'),
  ability:pick('GarrAbility','Name_lang'),abilityBody:pick('GarrAbility','Description_lang'),mechanic:pick('GarrMechanicType','Name_lang'),
  mechanicBody:pick('GarrMechanicType','Description_lang'),
  building:pick('GarrBuilding','AllianceName_lang'),buildingBody:pick('GarrBuilding','Description_lang'),buildingTip:pick('GarrBuilding','Tooltip_lang'),
  zone:pick('AreaTable','AreaName_lang','zhCN',p=>p.source==='Orgrimmar'),
  subzone:pick('AreaTable','AreaName_lang','zhCN',p=>p.source==='Valley of Wisdom'),
};
let resources='local D=LegionChineseDB\nExamples={}\n';
for(const [name,p] of Object.entries(examples)){
  const key=fingerprint(variants(p.source)[0]),id=catalog.get(p.scope+':'+key);
  resources+=`D.CatalogTexts.${p.scope}=D.CatalogTexts.${p.scope} or {}\nD.CatalogTexts.${p.scope}[${luaString(key)}]=${id}\nD.CatalogStrings[${id}]=${values.get(id)}\n`;
  resources+=`Examples.${name}={source=${luaString(p.source)},text=${luaString(p.text)}}\n`;
}
function shipped(category,key){
  const prefix=`D.${category}[${typeof key==='number'?key:luaString(key)}]=`;
  for(const file of listFixtureFiles(data).filter(f=>f.startsWith(category+'_'))){
    const line=readFixtureFile(new URL(file,data),'utf8').split('\n').find(l=>l.startsWith(prefix));
    if(line)return line;
  }
  assert.fail('Missing shipped test resource '+prefix);
}
for(const [id,source]of [[11479,'Transmute: Iron to Gold'],[11480,'Transmute: Mithril to Truesilver']]){
  const spell=shipped('Spells',id),stringID=Number(spell.match(/=(\d+)$/)[1]);
  resources+=[spell,shipped('NameStrings',stringID),shipped('SpellNames',nameKey(source)),shipped('SpellTexts',id)].join('\n')+'\n';
}
resources+=shipped('ItemNames',25)+'\n';
const baselineCache=new Map();
function read(file){
  if(!process.env.LCN_UI_FEATURE_BASELINE)return fs.readFileSync(new URL(file,addon),'utf8');
  if(!baselineCache.has(file)){
    try{baselineCache.set(file,execFileSync('git',['-c','safe.directory='+process.cwd(),'show','HEAD:AddOns/LegionChinese/'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']}))}
    catch{baselineCache.set(file,'')}
  }return baselineCache.get(file);
}
function run(body,setup=''){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const exec=source=>{const status=lauxlib.luaL_dostring(L,to_luastring(source));assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)))};
  try{
    const initial=process.env.LCN_UI_FEATURE_BASELINE?['Core.lua']:['DataAccess.lua','Text.lua','Core.lua'];
    exec(read('Bootstrap.lua'));for(const file of initial)exec(read(file));
    exec(fs.readFileSync(new URL('ui-fixture.lua',import.meta.url),'utf8'));
    exec(resources);exec(fs.readFileSync(new URL('collection-garrison-fixture.lua',import.meta.url),'utf8'));
    exec(fs.readFileSync(new URL('collection-garrison-regression-fixture.lua',import.meta.url),'utf8'));
    exec(fs.readFileSync(new URL('ui-fixes-fixture.lua',import.meta.url),'utf8'));
    exec(setup);
    for(const file of runtimeFiles.filter(f=>!initial.includes(f)))exec(read(file));
    exec('local A,D,E=LegionChinese,LegionChineseDB,Examples\n'+body);
  }finally{lua.lua_close(L)}
}

test('toy tiles and tooltips translate sources and item IDs, recycle rows and preserve native actions and unrelated tips',()=>run(`
  local tile=ToyBox.iconsFrame.spellButton1
  ToySpellButton_UpdateButton(tile)
  assert(tile.name:GetText()=="玩具名称" and tile.itemID==700001)
  GameTooltip:SetToyByItemID(700001)
  assert(GameTooltipTextLeft1:GetText()=="玩具名称");Expect(GameTooltipTextLeft2,E.toy)
  assert(GameTooltipTextLeft3:GetText()=="Use: 15 minutes, 200 gold" and toyCalls==1)
  tile.itemID=700002;ToySpellButton_UpdateButton(tile)
  assert(tile.name:GetText()=="Unknown toy" and tile.itemID==700002)
  tile.itemID=700001;tile.name:SetText("已有中文");assert(tile.name:GetText()=="已有中文")
  TooltipLines({E.toy.source},{});assert(GameTooltipTextLeft1:GetText()==E.toy.source)
  assert(gameplayCalls==0 and not GameTooltip.scripts.OnUpdate)
`));

test('wardrobe set list and details use shipped Simplified and Traditional text without touching saved outfits',()=>run(`
  local frame=WardrobeCollectionFrame.SetsCollectionFrame
  frame:DisplaySet(1);Expect(frame.DetailsFrame.Name,E.set);Expect(frame.DetailsFrame.LongName,E.set)
  assert(frame.DetailsFrame.truncatedName==A.Render(E.set.text),"Chinese is set before truncation/layout")
  frame.ScrollFrame:Update();Expect(frame.ScrollFrame.buttons[1].Name,E.setTW)
  assert(WardrobeOutfitDropDown.Text:GetText()==E.set.source)
  assert(WardrobeCollectionFrame.searchBox:GetText()==E.set.source)
  frame:DisplaySet(2);assert(frame.DetailsFrame.Name:GetText()=="Server custom set")
  assert(frame.currentSet==2 and gameplayCalls==0)
`));

test('wardrobe appearance tips resolve exact base names but preserve unknown bonus variants and source payloads',()=>run(`
  local source={sourceID=10,itemID=700001,name="Known item"}
  WardrobeCollectionFrame_SetAppearanceTooltip({}, {source},10)
  assert(GameTooltipTextLeft1:GetText()=="玩具名称" and source.name=="Known item" and source.sourceID==10)
  source.name="Known item of the Beast"
  WardrobeCollectionFrame_SetAppearanceTooltip({}, {source},10)
  assert(GameTooltipTextLeft1:GetText()==source.name)
  source.name="已有中文";WardrobeCollectionFrame_SetAppearanceTooltip({}, {source},10)
  assert(GameTooltipTextLeft1:GetText()==source.name)
`));

test('already copied wardrobe model methods translate without relying on later mixin changes',()=>run(`
  local model=WardrobeCollectionFrame.SetsTransmogFrame.Models[1]
  model:RefreshTooltip();Expect(GameTooltipTextLeft1,E.set)
  local nextModel=ScriptFrame()
  function nextModel:RefreshTooltip()TooltipLines({E.setTW.source},self)end
  WardrobeCollectionFrame.SetsTransmogFrame.Models[2]=nextModel
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateNativeModels")
  nextModel:RefreshTooltip();Expect(GameTooltipTextLeft1,E.setTW)
`));

test('archaeology current and completed artifacts translate complete names and histories while keeping progress and unknown formulas',()=>run(`
  local frame=ArchaeologyFrame
  ArchaeologyFrame_CurrentArtifactUpdate(frame.artifactPage)
  Expect(frame.artifactPage.artifactName,E.artifact);Expect(frame.artifactPage.historyScroll.child.text,E.history)
  assert(frame.artifactPage.solveFrame.statusBar.text:GetText()=="17 (+3) /50")
  frame.artifactPage.historyScroll.child.text:SetText("Damage: $s1")
  assert(frame.artifactPage.historyScroll.child.text:GetText()=="Damage: $s1")
  ArchaeologyFrame_UpdateComplete(frame.completedPage)
  Expect(frame.completedPage.artifact1.artifactName,E.artifact)
  assert(frame.completedPage.artifact1.artifactSubText:GetText()==A.Render(E.race.text).." - 普通")
  frame.artifactPage.artifactName:SetText("服务器考古项目")
  assert(frame.artifactPage.artifactName:GetText()=="服务器考古项目")
`));

test('archaeology race labels retain exact fragment counts, rarity suffixes and scoped dropdown text',()=>run(`
  ArchaeologyFrame_UpdateSummary(ArchaeologyFrame.summaryPage)
  assert(ArchaeologyFrame.summaryPage.race1.raceName:GetText()==A.Render(E.race.text).."|n9/35")
  UIDropDownMenu_SetText(ArchaeologyFrame.raceFilterDropDown,E.race.source)
  Expect(ArchaeologyFrame.raceFilterDropDown.Text,E.race)
  UIDropDownMenu_SetText(PlayerDropdown,E.race.source)
  assert(PlayerDropdown.Text:GetText()==E.race.source)
  ArchaeologyFrame.summaryPage.race1.raceName:SetText("A changed race|n1/20")
  assert(ArchaeologyFrame.summaryPage.race1.raceName:GetText()=="A changed race|n1/20")
`));

test('archaeology dig-site tips require a real native dig-site marker and preserve other map lines',()=>run(`
  WorldMapPOI_OnEnter(WorldMapFramePOI1);Expect(WorldMapTooltipTextLeft1,E.site)
  assert(WorldMapTooltipTextLeft2:GetText()=="Survey: 2/6")
  WorldMapFramePOI1.landmarkType=999;WorldMapPOI_OnEnter(WorldMapFramePOI1)
  assert(WorldMapTooltipTextLeft1:GetText()==E.site.source)
  local fake={GetName=function()return "WorldMapFramePOI1"end,landmarkType=LE_MAP_LANDMARK_TYPE_DIGSITE}
  WorldMapPOI_OnEnter(fake);assert(WorldMapTooltipTextLeft1:GetText()==E.site.source)
`));

test('only native archaeology, set-variant and recruiter menus translate, with player menus and shared button reuse unchanged',()=>run(`
  local function add(menu,text)
    UIDROPDOWNMENU_INIT_MENU=menu;DropDownList1.numButtons=0
    UIDropDownMenu_AddButton({text=text})
    return DropDownList1Button1:GetFontString()
  end
  local name=add(ArchaeologyFrame.raceFilterDropDown,E.race.source.." (9/35)")
  assert(name:GetText()==A.Render(E.race.text).." (9/35)")
  local variants=WardrobeCollectionFrame.SetsCollectionFrame.DetailsFrame.VariantSetsDropDown
  name=add(variants,E.setTW.source);Expect(name,E.setTW)
  name=add(GarrisonRecruiterFrame.Pick.ThreatDropDown,E.ability.source);Expect(name,E.ability)
  name=add(PlayerDropdown,E.ability.source);assert(name:GetText()==E.ability.source)
  name:SetText(E.set.source);assert(name:GetText()==E.set.source)
`));

test('research tooltips bind newly acquired native buttons and retain live costs, cooldowns and availability',()=>run(`
  local root=OrderHallTalentFrame
  local button=root.buttonPool:Acquire();button.talent={id=39}
  button:Fire("OnEnter")
  Expect(GameTooltipTextLeft1,E.talent);Expect(GameTooltipTextLeft2,E.talentTW)
  assert(GameTooltipTextLeft3:GetText()=="Time remaining: 7h 23m / Cost: 1234")
  button.talent={id=40};button.foreign=true;button:Fire("OnEnter")
  assert(GameTooltipTextLeft1:GetText()=="Unknown research" and button.talent.id==40 and gameplayCalls==0)
  local writes=GameTooltipTextLeft1.writes
  GameTooltip.owner={};button:Fire("OnEnter",true)
  assert(GameTooltipTextLeft1.writes==writes,"unrelated tooltip owners are untouched")
`));

test('follower names require matching template defaults and preserve player names, ship names and unknown translations',()=>run(`
  local frame=GarrisonMissionFrame.FollowerTab
  frame:ShowFollower("follower-one")
  assert(frame.Name:GetText()=="默认勇士");Expect(frame.Source.SourceText,E.source)
  assert(followers["follower-one"].name=="Known follower")
  frame:ShowFollower("renamed");assert(frame.Name:GetText()=="Player's own name")
  frame:ShowFollower("ship");assert(frame.Name:GetText()=="Known follower")
  frame:ShowFollower("unknown");assert(frame.Name:GetText()=="No reliable default")
  frame:ShowFollower("wrong-id");assert(frame.Name:GetText()=="Known follower")
  assert(A.ResolveFollowerName("Known follower",{name="Known follower",garrFollowerID="instance-guid",followerTypeID=1})==nil)
`));

test('recycled follower rows and source descriptions query the current instance, including Traditional fallback',()=>run(`
  local list=GarrisonMissionFrame.FollowerList
  list.current="follower-one";list:UpdateData()
  assert(list.listScroll.buttons[1].Follower.Name:GetText()=="默认勇士")
  list.current="renamed";list:UpdateData()
  assert(list.listScroll.buttons[1].Follower.Name:GetText()=="Player's own name")
  GarrisonMissionFrame.FollowerTab:ShowFollower("follower-two")
  Expect(GarrisonMissionFrame.FollowerTab.Source.SourceText,E.sourceTW)
  assert(followers["follower-two"].source==E.sourceTW.source)
`));

test('follower ability tooltips resize after first-use Chinese wrapping and keep live numeric fields',()=>run(`
  local frame=AbilityFrame()
  GarrisonFollowerTooltipTemplate_SetAbility(frame,{name=E.ability.source,description=E.abilityBody.source},true,1)
  Expect(frame.Name,E.ability);Expect(frame.Description,E.abilityBody)
  assert(frame:GetHeight()==frame.Name:GetHeight()+frame.Description:GetHeight()+14)
  assert(frame.Amount:GetText()=="23% / 2/5")
  GarrisonFollowerTooltipTemplate_SetAbility(frame,{name="Unknown ability",description="Use 7 troops"},true,1)
  assert(frame.Name:GetText()=="Unknown ability" and frame.Description:GetText()=="Use 7 troops")
  assert(frame:GetHeight()==frame.Name:GetHeight()+frame.Description:GetHeight()+14)
`));

test('follower descriptions preserve exact unlock suffixes and translated counter names keep the native format',()=>run(`
  local frame=AbilityFrame();frame.extraDescriptionText="|cffff0000Player's own suffix: 23%|r"
  GarrisonFollowerAbilityTooltipTemplate_SetAbility(frame,1,1)
  assert(frame.Description:GetText()==A.Render(E.abilityBody.text)..frame.extraDescriptionText)
  assert(frame.Name:GetText()==A.Render(E.ability.text))
  local wrapped=AbilityFrame();wrapped.wantCounter=true
  GarrisonFollowerTooltipTemplate_SetAbility(wrapped,{id=1,name=E.ability.source,description=E.abilityBody.source},true,1)
  assert(wrapped.Details:GetText()=="应对："..A.Render(E.mechanic.text))
  frame.Description:SetText("Modified effect 7 troops"..frame.extraDescriptionText)
  assert(frame.Description:GetText()=="Modified effect 7 troops"..frame.extraDescriptionText)
`));

test('follower tooltip reuse reads current template fields and cannot translate a subsequent custom ship name',()=>run(`
  local tip=FollowerTooltip()
  GarrisonFollowerTooltipTemplate_SetGarrisonFollower(tip,followers["follower-one"])
  assert(tip.Name:GetText()=="默认勇士")
  GarrisonFollowerTooltipTemplate_SetShipyardFollower(tip,followers.ship)
  assert(tip.Name:GetText()=="Known follower")
  GarrisonFollowerTooltipTemplate_SetGarrisonFollower(tip,followers["follower-one"])
  assert(tip.Name:GetText()=="默认勇士")
`));

test('recruit cards and ability pools translate before layout without changing recruitment data',()=>run(`
  GarrisonRecruitSelectFrame_UpdateRecruits(false)
  local card=GarrisonRecruitSelectFrame.FollowerSelection.Recruit1
  assert(card.Name:GetText()=="默认勇士")
  local page=GarrisonMissionFrame.FollowerTab
  local entry=page.abilitiesPool:Acquire();entry.Name:SetText(E.ability.source)
  Expect(entry.Name,E.ability)
  entry.Name:SetText("Unknown talent");assert(entry.Name:GetText()=="Unknown talent")
  assert(gameplayCalls==0)
`));

test('building details, lists and rank tooltips translate before native height calculation and leave costs and timers intact',()=>run(`
  local root=GarrisonBuildingFrame
  GarrisonBuildingInfoBox_ShowBuilding(8,true)
  Expect(root.InfoBox.Title,E.building);Expect(root.InfoBox.Description,E.buildingBody)
  GarrisonBuildingList_SelectTab({});Expect(root.BuildingList.Buttons[1].Name,E.building)
  GarrisonBuilding_ShowLevelTooltip(E.building.source,nil,8,{})
  Expect(root.BuildingLevelTooltip.Name,E.building);Expect(root.BuildingLevelTooltip.Rank1Tooltip,E.buildingTip)
  assert(root.BuildingLevelTooltip.layoutHeight==root.BuildingLevelTooltip.Rank1Tooltip:GetHeight())
  assert(root.InfoBox.Cost:GetText()=="1250 gold" and root.InfoBox.TimeLeft:GetText()=="1h 33m")
  assert(root.BuildingLevelTooltip.FollowerText:GetText()==E.building.source)
`));

test('building plot tooltips translate only the building line and never install a persistent hook on shared tooltip text',()=>run(`
  GarrisonPlot_ShowTooltip({})
  Expect(GameTooltipTextLeft1,E.building)
  assert(GameTooltipTextLeft2:GetText()==E.building.source,"player follower text stays original")
  GameTooltipTextLeft1:SetText(E.building.source)
  assert(GameTooltipTextLeft1:GetText()==E.building.source,"same font string reused for a player stays original")
`));

test('late children and replaced setters keep new features active without reinstalling for unrelated addons',()=>run(`
  ToyBox=MakeToyBox();ArchaeologyFrame=MakeArchaeology()
  GarrisonBuildingFrame.InfoBox.Description=RichWidget(Examples.buildingBody.source)
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateNativeChildren")
  ToySpellButton_UpdateButton(ToyBox.iconsFrame.spellButton1)
  assert(ToyBox.iconsFrame.spellButton1.name:GetText()=="玩具名称")
  Expect(GarrisonBuildingFrame.InfoBox.Description,E.buildingBody)
  ArchaeologyFrame_CurrentArtifactUpdate(ArchaeologyFrame.artifactPage);Expect(ArchaeologyFrame.artifactPage.artifactName,E.artifact)
  local installs=0
  for _,name in ipairs({"InstallToys","InstallWardrobe","InstallArchaeology","InstallResearch","InstallGarrisonFollowers","InstallGarrisonBuildings"}) do
    local original=A[name];A[name]=function(...)installs=installs+1;return original(...)end
  end
  for i=1,100 do frames[1]:Fire("OnEvent","ADDON_LOADED","UnrelatedAddon") end
  assert(installs==0)
`, 'ToyBox=nil;ArchaeologyFrame=nil'));

test('protected or missing optional surfaces preserve originals and native Chinese fonts',()=>run(`
  local root=GarrisonBuildingFrame
  root.InfoBox.Title.forbidden=true
  root.InfoBox.Title:SetText(E.building.source);assert(root.InfoBox.Title:GetText()==E.building.source)
  local name=ToyBox.iconsFrame.spellButton1.name
  local font=name.font
  ToySpellButton_UpdateButton(ToyBox.iconsFrame.spellButton1)
  assert(select(1,name:GetFont())==font)
  for _,tip in ipairs({GameTooltip}) do
    tip.forbidden=true;tip:SetToyByItemID(700001)
    assert(GameTooltipTextLeft2:GetText()==E.toy.source)
  end
  assert(gameplayCalls==0)
`));

test('ordinary dig sites use the deferred map label even when no world-name translation or tooltip exists',()=>run(`
  local tooltipOwner=WorldMapTooltip:GetOwner()
  WorldMapPOI_OnEnter(WorldMapFramePOI1)
  assert(WorldMapFrameAreaLabel:GetText()=="","native label is deferred")
  WorldMapFrame_EvaluateAreaLabels();Expect(WorldMapFrameAreaLabel,E.siteMap)
  assert(WorldMapFrameAreaDescription:GetText()=="Live survey progress: 2/6")
  assert(WorldMapTooltip:GetOwner()==tooltipOwner,"untimed sites do not create a tooltip")
  WorldMapFrame_EvaluateAreaLabels();Expect(WorldMapFrameAreaLabel,E.siteMap)
`, 'UseDeferredDigsiteMap()'));

test('dig-site label matching rejects other POIs, fake frames, changed names and a mouse that has left',()=>run(`
  local poi=WorldMapFramePOI1
  local function original(owner)
    WorldMapPOI_OnEnter(owner);WorldMapFrame_EvaluateAreaLabels()
    assert(WorldMapFrameAreaLabel:GetText()==E.siteMap.source)
  end
  poi.landmarkType=999;original(poi);poi.landmarkType=LE_MAP_LANDMARK_TYPE_DIGSITE
  original({name=E.siteMap.source,landmarkType=LE_MAP_LANDMARK_TYPE_DIGSITE,GetName=poi.GetName})
  WorldMapPOI_OnEnter(poi);WorldMapPOI_OnLeave(poi);WorldMapFrame_EvaluateAreaLabels()
  assert(WorldMapFrameAreaLabel:GetText()==E.siteMap.source)
  WorldMapPOI_OnEnter(poi);poi.name="Server custom site";WorldMapFrame_EvaluateAreaLabels()
  assert(WorldMapFrameAreaLabel:GetText()==E.siteMap.source)
  poi.name=E.siteMap.source;poi.forbidden=true;original(poi);poi.forbidden=nil
  MapMouseFocus={};WorldMapFrameAreaLabel:SetText(E.siteMap.source)
  assert(WorldMapFrameAreaLabel:GetText()==E.siteMap.source)
  MapMouseFocus=poi;WorldMapFrameAreaLabel:SetText("已有中文")
  assert(WorldMapFrameAreaLabel:GetText()=="已有中文")
`, 'UseDeferredDigsiteMap()'));

test('late or replaced map labels acquire the scoped dig-site binding without a new update loop',()=>run(`
  WorldMapFrameAreaLabel=RichWidget("")
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateMapLabel")
  WorldMapPOI_OnEnter(WorldMapFramePOI1);WorldMapFrame_EvaluateAreaLabels()
  Expect(WorldMapFrameAreaLabel,E.siteMap)
  WorldMapFrameAreaLabel.forbidden=true;WorldMapFrameAreaLabel:SetText(E.siteMap.source)
  assert(WorldMapFrameAreaLabel:GetText()==E.siteMap.source)
  assert(not frames[1].scripts.OnUpdate)
`, 'UseDeferredDigsiteMap();WorldMapFrameAreaLabel=nil'));

test('follower mechanic tips translate names and descriptions before first native height calculation and reuse cleanly',()=>run(`
  local owner={info={name=E.mechanic.source,description=E.mechanicBody.source},followerTypeID=1}
  local tip=GarrisonMissionMechanicTooltip
  for i=1,3 do
    GarrisonMissionMechanic_OnEnter(owner)
    Expect(tip.Name,E.mechanic);Expect(tip.Description,E.mechanicBody)
    assert(tip:GetHeight()==tip.Icon:GetHeight()+28+tip.Description:GetHeight())
  end
  assert(owner.info.name==E.mechanic.source and owner.info.description==E.mechanicBody.source)
  owner.info={name="Server custom threat",description="A changed effect, 23%"}
  GarrisonMissionMechanic_OnEnter(owner)
  assert(tip.Name:GetText()==owner.info.name and tip.Description:GetText()==owner.info.description)
  assert(tip:GetHeight()==tip.Icon:GetHeight()+28+tip.Description:GetHeight())
`, 'UseNativeMechanicTips()'));

test('counter-source tips translate their fixed names while retaining visibility, live layout and original payloads',()=>run(`
  local info={name=E.ability.source,counterName=E.mechanic.source,showCounters=true}
  local owner={info=info,followerTypeID=1}
  local tip=GarrisonMissionMechanicFollowerCounterTooltip
  GarrisonMissionMechanicFollowerCounter_OnEnter(owner)
  Expect(tip.Name,E.ability);Expect(tip.CounterName,E.mechanic)
  assert(tip.CounterName:IsShown() and info.counterName==E.mechanic.source)
  local height=tip.Title:GetHeight()+tip.Subtitle:GetHeight()+tip.Icon:GetHeight()+28
  assert(tip:GetHeight()==height+21+tip.CounterFrom:GetHeight()+tip.CounterIcon:GetHeight())
  info.showCounters=false;GarrisonMissionMechanicFollowerCounter_OnEnter(owner)
  assert(not tip.CounterName:IsShown() and tip:GetHeight()==height)
  info.name="服务器自定义";info.counterName="Unknown counter";info.showCounters=true
  GarrisonMissionMechanicFollowerCounter_OnEnter(owner)
  assert(tip.Name:GetText()==info.name and tip.CounterName:GetText()==info.counterName)
`, 'UseNativeMechanicTips()'));

test('late mechanic tooltips repair the first translated description height without cumulative growth',()=>run(`
  local owner={info={name=E.mechanic.source,description=E.mechanicBody.source},followerTypeID=1}
  GarrisonMissionMechanicTooltip=NewMechanicTooltip(false)
  for i=1,3 do
    GarrisonMissionMechanic_OnEnter(owner)
    local tip=GarrisonMissionMechanicTooltip
    Expect(tip.Name,E.mechanic);Expect(tip.Description,E.mechanicBody)
    assert(tip:GetHeight()==tip.Icon:GetHeight()+28+tip.Description:GetHeight())
  end
  local counter=NewMechanicTooltip(true);GarrisonMissionMechanicFollowerCounterTooltip=counter
  owner.info={name=E.ability.source,counterName=E.mechanic.source,showCounters=true}
  GarrisonMissionMechanicFollowerCounter_OnEnter(owner)
  Expect(counter.Name,E.ability);Expect(counter.CounterName,E.mechanic)
`, 'UseNativeMechanicTips();GarrisonMissionMechanicTooltip=nil;GarrisonMissionMechanicFollowerCounterTooltip=nil'));

test('mechanic hooks preserve redirects, unrelated tooltip text, protected frames and player names',()=>run(`
  local tip=GarrisonMissionMechanicTooltip
  local counter=GarrisonMissionMechanicFollowerCounterTooltip
  local a,b=tip.Name.writes,counter.Name.writes
  GarrisonMissionMechanic_OnEnter({followerTypeID=1})
  for _,info in ipairs({{traitID=1},{spellID=2},{counterID=3}})do
    GarrisonFollowerOptions[1].displayCounterAbilityInPlaceOfMechanic=true
    GarrisonMissionMechanicFollowerCounter_OnEnter({info=info,followerTypeID=1})
  end
  assert(redirectedTooltips==3 and a==tip.Name.writes and b==counter.Name.writes)
  local owner={info={name=E.mechanic.source,description=E.mechanicBody.source},followerTypeID=1}
  tip.forbidden=true;counter.forbidden=true
  GarrisonMissionMechanic_OnEnter(owner)
  assert(tip.Name:GetText()==E.mechanic.source and tip.Description:GetText()==E.mechanicBody.source)
  TooltipLines({E.mechanic.source},{});assert(GameTooltipTextLeft1:GetText()==E.mechanic.source)
  GarrisonMissionFrame.FollowerTab:ShowFollower("renamed")
  assert(GarrisonMissionFrame.FollowerTab.Name:GetText()=="Player's own name")
`, 'UseNativeMechanicTips()'));

test('already copied research methods stay Chinese across repeated timer updates and preserve countdown values',()=>run(`
  local button=ResearchButton
  button:Fire("OnEnter");Expect(GameTooltipTextLeft1,E.talent,"initial research hover")
  for remaining=16,13,-1 do
    ResearchTalents[39].timeRemaining=remaining;button:Refresh()
    Expect(GameTooltipTextLeft1,E.talent,"research refresh "..remaining);Expect(GameTooltipTextLeft2,E.talentTW)
    assert(GameTooltipTextLeft3:GetText()=="Time remaining: "..remaining)
    assert(GameTooltipTextLeft1.writes==1,"multiple hook paths must not write Chinese twice")
  end
  assert(ResearchTalents[39].name==E.talent.source and gameplayCalls==0)
`, 'UseNativeResearchPool()'));

test('research pool reuse, late pool replacement and inactive buttons retain current ownership and do not duplicate hooks',()=>run(`
  local pool=OrderHallTalentFrame.buttonPool
  pool:ReleaseAll();local button=pool:Acquire();assert(button==ResearchButton)
  ResearchTalents[40]={id=40,name="Server custom research",description="Cost changed to 4321",timeRemaining=9}
  button.talent=ResearchTalents[40];button:Fire("OnEnter");button:Refresh()
  assert(GameTooltipTextLeft1:GetText()==ResearchTalents[40].name and button.talent.id==40)
  OrderHallTalentFrame.buttonPool=NewResearchPool()
  local nextButton=OrderHallTalentFrame.buttonPool:Acquire();nextButton.talent=ResearchTalents[39]
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateResearchPool")
  for i=1,3 do
    A.InstallResearch(A.Hooks.ForFeature("research"))
    nextButton:Fire("OnEnter");nextButton:Refresh();Expect(GameTooltipTextLeft1,E.talent)
    assert(GameTooltipTextLeft1.writes==1)
  end
  local foreign={};TooltipLines({E.talent.source},foreign)
  nextButton:OnEnter(true);assert(GameTooltipTextLeft1:GetText()==E.talent.source)
  OrderHallTalentFrame.buttonPool:ReleaseAll();nextButton:Refresh()
  assert(GameTooltip:GetOwner()==foreign and GameTooltipTextLeft1:GetText()==E.talent.source)
`, 'UseNativeResearchPool()'));

test('follower skill names keep Chinese fonts after native font-object changes and before layout',()=>run(`
  local page=GarrisonMissionFrame.FollowerTab
  for _,landing in ipairs({false,true})do
    page.isLandingPage=landing
    page:ShowAbilities({abilities={{name=E.ability.source}}})
    for entry in page.abilitiesPool:EnumerateActive()do
      Expect(entry.Name,E.ability)
      assert(entry.layoutFont:lower():find("arkai",1,true),"font must be restored before layout")
      local font,size,flags=entry.Name:GetFont()
      assert(font==entry.layoutFont and size==(landing and 14 or 16) and flags=="OUTLINE")
    end
  end
`, 'UseNativeFollowerLayout("enUS")'));

test('recycled skill widgets clear translated-font state for unknown originals and protected labels',()=>run(`
  local page=GarrisonMissionFrame.FollowerTab
  page:ShowAbilities({abilities={{name=E.ability.source}}})
  local current;for entry in page.abilitiesPool:EnumerateActive()do current=entry end
  Expect(current.Name,E.ability)
  page:ShowAbilities({abilities={{name="Server custom skill"}}})
  assert(current.Name:GetText()=="Server custom skill" and current.Name.font:find("FRIZQT",1,true))
  page:ShowAbilities({abilities={{name="已有中文"}}})
  assert(current.Name:GetText()=="已有中文" and current.Name.font:find("FRIZQT",1,true))
  current.Name.forbidden=true
  page:ShowAbilities({abilities={{name=E.ability.source}}})
  assert(current.Name:GetText()==E.ability.source and current.Name.font:find("FRIZQT",1,true))
`, 'UseNativeFollowerLayout("enUS")'));

test('profession names and descriptions use the current recipe and shipped spell text before layout',()=>run(`
  local details=TradeSkillFrame.DetailsFrame;local c=details.Contents
  c.RecipeName:SetText("Transmute: Iron to Gold");c.Description:SetText("Turns a bar of Iron into a bar of Gold.")
  assert(c.RecipeName:GetText()=="点铁成金" and c.Description:GetText()=="将一块铁锭变成金锭。")
  details.selectedRecipeID=11480
  c.RecipeName:SetText("Transmute: Mithril to Truesilver");c.Description:SetText("Turns a bar of Mithril into a bar of Truesilver.")
  assert(c.RecipeName:GetText()=="转化秘银" and c.Description:GetText()=="将一块秘银锭变成真银锭。")
  assert(c.Description:GetHeight()==48 and gameplayCalls==0)
`, 'TradeSkillFrame={DetailsFrame={selectedRecipeID=11479,Contents={RecipeName=RichWidget(""),Description=RichWidget("")}}}'));

test('profession bindings reject wrong recipe IDs, changed wording, existing Chinese and protected parents',()=>run(`
  local d=TradeSkillFrame.DetailsFrame;local c=d.Contents
  c.RecipeName:SetText("Server custom recipe");c.Description:SetText("Turns two bars of Iron into a bar of Gold.")
  assert(c.RecipeName:GetText()=="Server custom recipe" and c.Description:GetText():find("two",1,true))
  d.selectedRecipeID=999999;c.RecipeName:SetText("Transmute: Iron to Gold")
  c.Description:SetText("Turns a bar of Iron into a bar of Gold.")
  assert(c.RecipeName:GetText()=="Transmute: Iron to Gold" and not A.IsChinese(c.Description:GetText()))
  d.selectedRecipeID=11479
  c.RecipeName:SetText("已有繁體名稱");c.Description:SetText("已有繁體說明")
  assert(c.RecipeName:GetText()=="已有繁體名稱" and c.Description:GetText()=="已有繁體說明")
  d.forbidden=true;c.RecipeName:SetText("Transmute: Iron to Gold");c.Description:SetText("Turns a bar of Iron into a bar of Gold.")
  assert(c.RecipeName:GetText()=="Transmute: Iron to Gold" and not A.IsChinese(c.Description:GetText()))
`, 'TradeSkillFrame={DetailsFrame={selectedRecipeID=11479,IsForbidden=function(self)return self.forbidden end,Contents={RecipeName=RichWidget(""),Description=RichWidget("")}}}'));

test('late recipe widgets bind on the existing root and numeric descriptions retain current values',()=>run(`
  local c=TradeSkillFrame.DetailsFrame.Contents;c.RecipeName=RichWidget("");c.Description=RichWidget("")
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateRecipeLabels")
  c.RecipeName:SetText("Transmute: Iron to Gold");assert(c.RecipeName:GetText()=="点铁成金")
  D.DynamicSpellTexts[11479]={Description={Key=A.NameFingerprint("Create ~v~ pieces from ~v~ units."),Text="从{2}份材料制作{1}件。",Count=2,Constants={[2]=3},Equals={}}}
  c.Description:SetText("Create 23 pieces from 3 units.");assert(c.Description:GetText()=="从3份材料制作23件。")
  c.Description:SetText("Create 23 pieces from 4 units.");assert(c.Description:GetText()=="Create 23 pieces from 4 units.")
`, 'TradeSkillFrame={DetailsFrame={selectedRecipeID=11479,Contents={}}}'));

test('wardrobe alternative item names retain native arrow and spacer textures and exclude unknown suffixes',()=>run(`
  local arrow,spacer=WARDROBE_TOOLTIP_CYCLE_ARROW_ICON,WARDROBE_TOOLTIP_CYCLE_SPACER_ICON
  local source={itemID=25,sourceID=25,name="Worn Shortsword"}
  WardrobeCollectionFrame_SetAppearanceTooltip({}, {source},25)
  local chinese=D.ItemNames[25][1]
  assert(GameTooltipTextLeft1:GetText()==chinese)
  assert(GameTooltipTextLeft2:GetText()==arrow..chinese and GameTooltipTextLeft3:GetText()==spacer..chinese)
  assert(GameTooltipTextLeft4:GetText()=="|TUnknown:1|tWorn Shortsword")
  assert(source.name=="Worn Shortsword")
  source.name="Worn Shortsword of the Beast";WardrobeCollectionFrame_SetAppearanceTooltip({}, {source},25)
  assert(GameTooltipTextLeft1:GetText()==source.name and GameTooltipTextLeft2:GetText()==arrow..source.name)
  source.name="已有中文";WardrobeCollectionFrame_SetAppearanceTooltip({}, {source},25)
  assert(GameTooltipTextLeft2:GetText()==arrow..source.name)
`, String.raw`
  WARDROBE_TOOLTIP_CYCLE_ARROW_ICON="|TInterface\\Transmogrify\\transmog-tooltip-arrow:12:11:-1:-1|t"
  WARDROBE_TOOLTIP_CYCLE_SPACER_ICON="|TInterface\\Common\\spacer:12:11:-1:-1|t"
  function WardrobeCollectionFrame_SetAppearanceTooltip(owner,sources)
    local name=sources[1].name
    TooltipLines({name,WARDROBE_TOOLTIP_CYCLE_ARROW_ICON..name,WARDROBE_TOOLTIP_CYCLE_SPACER_ICON..name,"|TUnknown:1|t"..name},owner)
  end
`));

test('native research confirmation variants translate names and retain exact costs, time and response data',()=>run(`
  local button=ScriptFrame();button.OnClick=GarrisonTalentButtonMixin.OnClick
  function button:GetParent()return OrderHallTalentFrame end
  for _,case in ipairs({{123,60},{456,0},{0,78}})do
    button.talent={id=39,name=E.talent.source,talentAvailability=1,researchCost=case[1],researchDuration=case[2]}
    button:OnClick()
    local popup=StaticPopup1;local text=popup.text:GetText()
    assert(text:find(A.Render(E.talent.text),1,true) and not text:find(E.talent.source,1,true))
    if case[1]>0 then assert(text:find(tostring(case[1]),1,true) and text:find("ResourceTexture",1,true))end
    if case[2]>0 then assert(text:find(tostring(case[2]).." seconds",1,true))end
    assert(popup.measured==text and popup.data.id==39 and popup.data.button==button)
    assert(button.talent.name==E.talent.source and gameplayCalls==0)
  end
`, 'UseResearchConfirmations()'));

test('research confirmation guards mismatched text, data, reused popup contexts and protected frames',()=>run(`
  local button=ScriptFrame();function button:GetParent()return OrderHallTalentFrame end
  button.talent={id=39,name=E.talent.source,researchCost=123,researchDuration=60}
  local data={id=39,hasTime=true,button=button}
  local source="Research "..E.talent.source.." for 123 ResourceTexture in 60 seconds?"
  for _,case in ipairs({"foreign","wrong-id","changed","forbidden","hidden","unknown","chinese"})do
    local which=case=="foreign" and "GOSSIP_CONFIRM" or "ORDER_HALL_TALENT_RESEARCH"
    data.id=case=="wrong-id" and 40 or 39
    button.talent.name=case=="unknown" and "Unknown research" or case=="chinese" and "已有中文" or E.talent.source
    local value=case=="changed" and source.." Custom warning." or source
    StaticPopup1.forbidden=case=="forbidden";StaticPopup1.hidden=case=="hidden"
    StaticPopup_Show(which,value,nil,data);assert(StaticPopup1.text:GetText()==value,case)
  end
  StaticPopup1.forbidden=nil;StaticPopup1.hidden=nil;button.talent.name=E.talent.source;data.id=39
  for i=1,10 do A.InstallResearch(A.Hooks.ForFeature("research")) end
  local resized=StaticPopup1.resizes
  local popup,empty,number=StaticPopup_Show("ORDER_HALL_TALENT_RESEARCH",source,nil,data)
  assert(popup==StaticPopup1 and empty==nil and number==3 and popup.resizes-resized==2)
  assert(popup.text:GetText():find(E.talent.text,1,true))
`, 'UseResearchConfirmations()'));

test('native minimap hover uses the same shipped World names as its label and preserves the status line',()=>run(`
  GameTooltip.owner=MinimapZoneTextButton
  MiniPVP="contested";CONTESTED_TERRITORY="Status / 2/6";Minimap_Update()
  Expect(MinimapZoneText,E.zone);Expect(GameTooltipTextLeft1,E.zone);Expect(GameTooltipTextLeft2,E.subzone)
  assert(GameTooltipTextLeft3:GetText()=="Status / 2/6" and GameTooltip:GetOwner()==MinimapZoneTextButton)
  MiniSubzone=MiniZone;Minimap_Update();Expect(GameTooltipTextLeft1,E.zone)
  assert(GameTooltipTextLeft2:GetText()=="")
`, 'UseMinimapTooltip()'));

test('minimap translation excludes other owners, stale labels, hidden and protected tooltips',()=>run(`
  for _,case in ipairs({"other","stale","hidden","forbidden"})do
    TooltipLines({E.zone.source,E.subzone.source},case=="other" and {} or MinimapZoneTextButton)
    GameTooltip.hidden=case=="hidden";GameTooltip.forbidden=case=="forbidden"
    if case=="stale" then GameTooltipTextLeft1:SetText("Unknown location");GameTooltipTextLeft2:SetText("Current timer: 23")end
    local first,second=GameTooltipTextLeft1:GetText(),GameTooltipTextLeft2:GetText()
    A.UpdateMinimapLocationTooltip()
    assert(GameTooltipTextLeft1:GetText()==first and GameTooltipTextLeft2:GetText()==second,case)
  end
`, 'UseMinimapTooltip()'));

test('native pools bind new objects once without active enumeration on Acquire and retain reuse and return values',()=>run(`
  local pool=NativeBindingPool(function()return {Name=RichWidget("")}end)
  local _,method=A.Hooks.ForFeature("linear-pool");local visits,enumerations=0,0
  local enumerate=pool.EnumerateActive
  function pool:EnumerateActive()enumerations=enumerations+1;return enumerate(self)end
  A.BindCatalogPool(method,pool,function(row)visits=visits+1;A.BindCatalog(method,row.Name,"Garrison")end)
  enumerations=0
  for i=1,16 do local row,new=pool:Acquire();assert(new);row.Name:SetText(E.ability.source);Expect(row.Name,E.ability)end
  assert(visits==16 and enumerations==0,"new native rows must not re-enumerate the active pool")
  pool:ReleaseAll()
  for i=1,16 do local row,new=pool:Acquire();assert(not new);row.Name:SetText(E.ability.source);Expect(row.Name,E.ability)end
  assert(visits==16 and enumerations==0,"reused native rows retain their bindings")
`, 'UseNativeBindingPool()'));

test('native pool installation covers existing inactive rows and explicit refresh repairs replacement child labels',()=>run(`
  local pool=NativeBindingPool(function()return {Name=RichWidget("")}end)
  local old=pool:Acquire();pool:Release(old)
  local _,method=A.Hooks.ForFeature("inactive-pool");local visits=0
  local function bind(row)visits=visits+1;A.BindCatalog(method,row.Name,"Garrison")end
  A.BindCatalogPool(method,pool,bind)
  local row,new=pool:Acquire();assert(row==old and not new and visits==1)
  row.Name:SetText(E.ability.source);Expect(row.Name,E.ability)
  row.Name=RichWidget(E.ability.source);A.BindCatalogPool(method,pool,bind)
  Expect(row.Name,E.ability);assert(visits==2)
  row.Name:SetText("Unknown skill");assert(row.Name:GetText()=="Unknown skill")
`, 'UseNativeBindingPool()'));

test('compatibility pools register each object once and native reset-method replacements safely fall back',()=>run(`
  local _,method=A.Hooks.ForFeature("compat-pool");local calls=0
  local pool=Pool(function()return ScriptFrame()end)
  A.BindCatalogPool(method,pool,function()calls=calls+1 end)
  for i=1,16 do pool:Acquire()end;assert(calls==16)
  local native=NativeBindingPool(function()return ScriptFrame()end)
  A.BindCatalogPool(method,native,function()calls=calls+1 end)
  native.resetterFunc=function()end
  native:Acquire();assert(calls==17,"an unhooked replacement uses the safe discovery path")
  A.Hooks.Refresh();native:Acquire();assert(calls==18)
  A.BindCatalogPool(method,native,function()calls=calls+1 end)
  local before=calls;native:Acquire();assert(calls==before+1)
`, 'UseNativeBindingPool()'));

for(const locale of ['zhCN','zhTW'])test(`${locale} follower skill layouts preserve their native font family, size and flags`,()=>run(`
  local page=GarrisonMissionFrame.FollowerTab
  page:ShowAbilities({abilities={{name=E.ability.source}}})
  for entry in page.abilitiesPool:EnumerateActive()do
    Expect(entry.Name,E.ability)
    local font,size,flags=entry.Name:GetFont()
    assert(font==entry.layoutFont and font:lower():find(${luaString(locale==='zhCN'?'arkai':'blei00d')},1,true))
    assert(size==16 and flags=="OUTLINE" and entry.Name.fontChanges==0)
  end
`, `UseNativeFollowerLayout(${luaString(locale)})`));
