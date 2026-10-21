-- Native field names, setter order and pools follow the pinned 7.3.5 Gethe
-- snapshot documented in docs/COLLECTION-GARRISON-UI.md. Text comes from the
-- shipped client-data resources, not translated test expectations.
local A,D,E=LegionChinese,LegionChineseDB,Examples
gameplayCalls=0;toyCalls=0
function RichWidget(text)
    local widget=Widget(text)
    widget.font="Fonts\\ARKai_T.TTF"
    function widget:GetFont()return self.font,14,""end
    function widget:SetFont(font)self.font=font;self.fontChanges=self.fontChanges+1 end
    function widget:IsForbidden()return self.forbidden end
    function widget:GetHeight()
        if not self.text or self.text=="" then return 0 end
        return A.IsChinese(self.text) and 48 or 12
    end
    return widget
end
function Expect(widget,example,context)
    assert(widget:GetText()==A.PreserveTextColor(example.source,A.Render(example.text)),(context or "Expected shipped translation")..": "..tostring(widget:GetText()))
end
local function frame()
    local object=ScriptFrame();object.height=0
    function object:IsForbidden()return self.forbidden end
    function object:GetHeight()return self.height end
    function object:SetHeight(height)self.height=height end
    return object
end
function AbilityFrame()
    local object=frame()
    object.Name=RichWidget("");object.Description=RichWidget("");object.Details=RichWidget("");object.Amount=RichWidget("23% / 2/5")
    return object
end
function Pool(create)
    local pool={active={}}
    function pool:Acquire()local object=create();self.active[object]=true;return object,true end
    function pool:EnumerateActive()return pairs(self.active)end
    function pool:ReleaseAll()self.active={}end
    return pool
end
GameTooltip=frame();GameTooltip.name="GameTooltip"
function GameTooltip:GetName()return self.name end
function GameTooltip:NumLines()return self.count or 0 end
function GameTooltip:GetOwner()return self.owner end
function GameTooltip:Show()self.shows=(self.shows or 0)+1 end
function GameTooltip:GetItem()return nil end
function TooltipLines(lines,owner)
    GameTooltip.owner=owner;GameTooltip.count=#lines
    for i,text in ipairs(lines)do _G["GameTooltipTextLeft"..i]=RichWidget(text)end
end
D.ItemNames[700001]={"玩具名称",A.NameFingerprint and A.NameFingerprint("Known item") or A.Fingerprint("knownitem")}
function MakeToyBox()return {iconsFrame={spellButton1={itemID=700001,name=RichWidget("")}}}end
ToyBox=MakeToyBox()
function ToySpellButton_UpdateButton(button)button.name:SetText(button.itemID==700001 and "Known item" or "Unknown toy")end
function ToyBox_UpdateButtons()ToySpellButton_UpdateButton(ToyBox.iconsFrame.spellButton1)end
function GameTooltip:SetToyByItemID(id)
    toyCalls=toyCalls+1;self.itemID=id
    TooltipLines({"Known item",E.toy.source,"Use: 15 minutes, 200 gold"},{})
    return true
end
function UseToy()gameplayCalls=gameplayCalls+1;error("Translation must not use a toy")end
local function details()
    return {Name=RichWidget(""),LongName=RichWidget(""),Label=RichWidget(""),VariantSetsButton=RichWidget("")}
end
WardrobeSetsCollectionMixin={};WardrobeSetsCollectionScrollFrameMixin={}
function WardrobeSetsCollectionMixin:DisplaySet(id)
    self.currentSet=id
    local name=id==1 and E.set.source or "Server custom set"
    self.DetailsFrame.Name:SetText(name)
    self.DetailsFrame.truncatedName=self.DetailsFrame.Name:GetText()
    self.DetailsFrame.LongName:SetText(name)
end
function WardrobeSetsCollectionMixin:Refresh()self:DisplaySet(1)end
function WardrobeSetsCollectionScrollFrameMixin:Update()self.buttons[1].Name:SetText(E.setTW.source)end
WardrobeCollectionFrame={SetsCollectionFrame=setmetatable({DetailsFrame=details(),ScrollFrame=setmetatable({buttons={{Name=RichWidget(""),Label=RichWidget("")}}},{__index=WardrobeSetsCollectionScrollFrameMixin})},{__index=WardrobeSetsCollectionMixin}),searchBox=RichWidget(E.set.source)}
WardrobeOutfitDropDown={Text=RichWidget(E.set.source)}
WardrobeSetsTransmogModelMixin={RefreshTooltip=function(self)TooltipLines({E.set.source},self)end}
local wardrobeModel=frame();wardrobeModel.RefreshTooltip=WardrobeSetsTransmogModelMixin.RefreshTooltip
WardrobeCollectionFrame.SetsTransmogFrame={Models={wardrobeModel}}
function WardrobeCollectionFrame_SetAppearanceTooltip(owner,sources)
    TooltipLines({sources[1].name,"Item level 900 / 2 of 8"},owner)
end
function MakeArchaeology()
    return {artifactPage={artifactName=RichWidget(""),raceRarity=RichWidget(""),historyScroll={child={text=RichWidget("")}},solveFrame={statusBar={text=RichWidget("17 (+3) /50")}}},
        summaryPage={race1={raceName=RichWidget("")}},completedPage={artifact1={artifactName=RichWidget(""),artifactSubText=RichWidget("")}},raceFilterDropDown={Text=RichWidget("")}}
end
ArchaeologyFrame=MakeArchaeology();PlayerDropdown={Text=RichWidget("")}
function ArchaeologyFrame_CurrentArtifactUpdate(page)
    page.artifactName:SetText(E.artifact.source);page.historyScroll.child.text:SetText(E.history.source)
    page.raceRarity:SetText(E.race.source.." - 普通")
end
function ArchaeologyFrame_UpdateSummary(page)page.race1.raceName:SetText(E.race.source.."|n9/35")end
function ArchaeologyFrame_UpdateComplete(page)
    page.artifact1.artifactName:SetText(E.artifact.source);page.artifact1.artifactSubText:SetText(E.race.source.." - 普通")
end
function UIDropDownMenu_SetText(dropdown,text)dropdown.Text:SetText(text)end
DropDownList1={numButtons=0}
function UIDropDownMenu_AddButton(info,level)
    local list=_G["DropDownList"..(level or 1)];list.numButtons=list.numButtons+1
    local button={NormalText=RichWidget(info.text)}
    button.name="DropDownList"..(level or 1).."Button"..list.numButtons
    function button:GetName()return self.name end
    function button:GetFontString()return self.NormalText end
    _G[button.name.."NormalText"]=button.NormalText
    _G["DropDownList"..(level or 1).."Button"..list.numButtons]=button
end
WardrobeCollectionFrame.SetsCollectionFrame.DetailsFrame.VariantSetsDropDown={}
GarrisonRecruiterFrame={Pick={ThreatDropDown={Text=RichWidget("")}}}
LE_MAP_LANDMARK_TYPE_DIGSITE=55
WorldMapFramePOI1={landmarkType=LE_MAP_LANDMARK_TYPE_DIGSITE,GetName=function()return "WorldMapFramePOI1"end}
WorldMapTooltip=frame()
function WorldMapTooltip:GetOwner()return self.owner end
function WorldMapTooltip:IsShown()return true end
function WorldMapTooltip:Show()end
function WorldMapPOI_OnEnter(owner)
    WorldMapTooltip.owner=owner
    WorldMapTooltipTextLeft1=RichWidget(E.site.source);WorldMapTooltipTextLeft2=RichWidget("Survey: 2/6")
end
OrderHallTalentFrame={buttonPool=Pool(function()
    local button=frame()
    button:SetScript("OnEnter",function(self,skip)
        if not skip then TooltipLines({self.foreign and "Unknown research" or E.talent.source,E.talentTW.source,"Time remaining: 7h 23m / Cost: 1234"},self)end
    end)
    return button
end)}
LE_FOLLOWER_TYPE_GARRISON_6_0=1;LE_FOLLOWER_TYPE_GARRISON_7_0=4;LE_FOLLOWER_TYPE_SHIPYARD_6_2=2
D.Strings[990001]="默认勇士";D.NPCNames[A.Fingerprint(A.Normalize("Known follower"))]=990001
followers={
    ["follower-one"]={name="Known follower",garrFollowerID=11,garrisonFollowerID=11,followerTypeID=1,source=E.source.source},
    ["follower-two"]={name="Known follower",garrFollowerID=12,garrisonFollowerID=12,followerTypeID=4,source=E.sourceTW.source},
    renamed={name="Player's own name",garrFollowerID=11,garrisonFollowerID=11,followerTypeID=1,source="Unknown source"},
    ship={name="Known follower",garrFollowerID=33,garrisonFollowerID=33,followerTypeID=2,source="Unknown source"},
    unknown={name="No reliable default",garrFollowerID=13,garrisonFollowerID=13,followerTypeID=1,source="Unknown source"},
    ["wrong-id"]={name="Known follower",garrFollowerID=14,garrisonFollowerID=14,followerTypeID=1,source="Unknown source"},
}
C_Garrison={GetFollowerInfo=function(id)return followers[id]end,
    GetFollowerNameByID=function(id)return id==14 and "Different template default" or id==13 and "No reliable default" or "Known follower" end,
    GetFollowerTypeByID=function(id)return id==33 and 2 or id==12 and 4 or 1 end,
    GetAvailableRecruits=function()return {followers["follower-one"]}end,
    ResearchTalent=function()gameplayCalls=gameplayCalls+1;error("Translation must not research")end}
C_Garrison.GetFollowerAbilityInfo=function()return {name=E.ability.source,description=E.abilityBody.source}end
C_Garrison.GetFollowerAbilityCounterMechanicInfo=function()return 1,E.mechanic.source end
GARRISON_ABILITY_COUNTERS_FORMAT="应对：%s"
GarrisonFollowerTabMixin={};GarrisonFollowerList={}
function GarrisonFollowerTabMixin:ShowFollower(id)
    self.followerID=id
    local info=followers[id]
    self.Name:SetText(info.name);self.Source.SourceText:SetText(info.source)
end
function GarrisonFollowerTabMixin:ShowAbilities()end
function GarrisonFollowerList:UpdateData()
    local button=self.listScroll.buttons[1]
    GarrisonFollowerList_SetButtonMode(self,button,"FOLLOWER")
    button.Follower.info=followers[self.current];button.Follower.Name:SetText(button.Follower.info.name)
end
function GarrisonFollowerList_SetButtonMode()end
GarrisonMissionFrame={FollowerTab=setmetatable({Name=RichWidget(""),Source={SourceText=RichWidget("")},abilitiesPool=Pool(AbilityFrame)},{__index=GarrisonFollowerTabMixin}),
    FollowerList=setmetatable({current="follower-one",listScroll={buttons={{Follower={Name=RichWidget("")}}}}},{__index=GarrisonFollowerList})}
function GarrisonFollowerTooltipTemplate_SetAbility(ability,info,detailed)
    ability.Name:SetText(info.name);ability.Description:SetText(detailed and info.description or "")
    if ability.wantCounter then ability.Details:SetText(string.format(GARRISON_ABILITY_COUNTERS_FORMAT,E.mechanic.source))end
    ability:SetHeight(ability.Name:GetHeight()+ability.Description:GetHeight()+14)
end
function GarrisonFollowerAbilityTooltipTemplate_SetAbility(ability,id)
    ability.garrFollowerAbilityID=id
    ability.Name:SetText(E.ability.source);ability.Description:SetText(E.abilityBody.source..(ability.extraDescriptionText or ""))
    ability:SetHeight(ability.Name:GetHeight()+ability.Description:GetHeight()+14)
end
function FollowerTooltip()local tip=frame();tip.Name=RichWidget("");tip.Abilities={};tip.Traits={};return tip end
function GarrisonFollowerTooltipTemplate_SetGarrisonFollower(tip,info)
    tip.garrisonFollowerID=info.garrisonFollowerID;tip.name=info.name;tip.Name:SetText(info.name)
end
GarrisonFollowerTooltipTemplate_SetShipyardFollower=GarrisonFollowerTooltipTemplate_SetGarrisonFollower
GarrisonRecruitSelectFrame={FollowerSelection={Recruit1={Name=RichWidget("")}}}
function GarrisonRecruitSelectFrame_UpdateRecruits()
    GarrisonRecruitSelectFrame.FollowerSelection.Recruit1.Name:SetText(followers["follower-one"].name)
end
GarrisonBuildingFrame={InfoBox={Title=RichWidget(""),Description=RichWidget(""),Cost=RichWidget("1250 gold"),TimeLeft=RichWidget("1h 33m")},
    BuildingList={Buttons={{Name=RichWidget("")}}},BuildingLevelTooltip={Name=RichWidget(""),Rank1Tooltip=RichWidget(""),FollowerText=RichWidget(E.building.source)}}
function GarrisonBuildingInfoBox_ShowBuilding(id)
    local info=GarrisonBuildingFrame.InfoBox
    info.ID=id;info.Title:SetText(E.building.source);info.Description:SetText(E.buildingBody.source)
end
function GarrisonBuildingList_SelectTab()GarrisonBuildingFrame.BuildingList.Buttons[1].Name:SetText(E.building.source)end
function GarrisonBuilding_ShowLevelTooltip(name)
    local tip=GarrisonBuildingFrame.BuildingLevelTooltip
    tip.Name:SetText(name);tip.Rank1Tooltip:SetText(E.buildingTip.source);tip.layoutHeight=tip.Rank1Tooltip:GetHeight()
end
function GarrisonPlot_ShowTooltip(owner)TooltipLines({E.building.source,E.building.source},owner)end
