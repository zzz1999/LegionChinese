-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
local hook, hookMethod, hookScript = A.Hooks.ForFeature("base")

local function installBase()
    hook("QuestInfo_Display", A.UpdateQuestInfo)
    -- Legion XML stores these handlers before addons load. Hook the actual
    -- frame script so translation runs after Blizzard has populated the text.
    hookScript(QuestFrameProgressPanel, "OnShow", A.UpdateProgress)
    hookScript(QuestFrameGreetingPanel, "OnShow", A.UpdateGreeting)
    -- QUEST_LOG_UPDATE also refreshes the greeting by calling this global.
    hook("QuestFrameGreetingPanel_OnShow", A.UpdateGreeting)
    hook("GossipFrameUpdate", A.UpdateGossip)
    hook("QuestFrame_ShowQuestPortrait", A.UpdateQuestPortrait)
    hook("StaticPopup_Show", A.UpdateGossipConfirmation)
    hookScript(ItemTextFrame, "OnEvent", A.UpdateBook)
    hook("QuestLogQuests_Update", A.UpdateQuestList)
    hookMethod(QUEST_TRACKER_MODULE, "SetBlockHeader", A.UpdateTrackerHeader)
    hookMethod(QUEST_TRACKER_MODULE, "AddObjective", A.UpdateTrackerObjective)
    hookMethod(BONUS_OBJECTIVE_TRACKER_MODULE, "AddObjective", A.UpdateTrackerObjective)
    hookMethod(WORLD_QUEST_TRACKER_MODULE, "AddObjective", A.UpdateTrackerObjective)
    hookMethod(SCENARIO_TRACKER_MODULE, "AddObjective", A.UpdateTrackerObjective)
    -- The player's XML stores the original callback before addon load; the
    -- global hook additionally catches internal resume/unit-change calls.
    hookScript(CastingBarFrame, "OnEvent", A.UpdateCastBar)
    hookScript(PetCastingBarFrame, "OnEvent", A.UpdateCastBar)
    hookScript(TargetFrameSpellBar, "OnEvent", A.UpdateCastBar)
    hookScript(FocusFrameSpellBar, "OnEvent", A.UpdateCastBar)
    hook("CastingBarFrame_OnEvent", A.UpdateCastBar)
    if A.InstallPetNames then
        A.InstallPetNames(hook, hookScript)
    end
    if A.UpdateWorldObjectTooltip then
        -- World objects have no OnTooltipSetUnit/Item event in Legion.
        hookScript(GameTooltip, "OnShow", A.UpdateWorldObjectTooltip)
        hookScript(GameTooltip, "OnUpdate", A.PollWorldObjectTooltip)
        hookScript(GameTooltip, "OnHide", A.ClearWorldObjectTooltip)
        hookScript(GameTooltip, "OnTooltipCleared", A.ClearWorldObjectTooltip)
    end
    if A.InstallItemTooltips then
        A.InstallItemTooltips()
    end
    if A.InstallExtraTooltips then
        A.InstallExtraTooltips()
    end
    if A.InstallChatItemLinks then
        A.InstallChatItemLinks()
    end
end
local features = {
    {
        key = "artifacts",
        installer = "InstallArtifacts",
        hooks = "method-script",
        addons = { "Blizzard_ArtifactUI", "Blizzard_QuestChoice", "Blizzard_ArtifactRelicForgeUI" },
        targets = {
            "QuestChoiceFrame",
            "ArtifactFrame",
            "ArtifactLevelUpToast",
            "GameTooltip",
            "ItemRefTooltip",
        },
    },
    {
        key = "map-tooltips",
        installer = "InstallMapTooltips",
        hooks = "method-global",
        addons = { "Blizzard_WorldMap" },
        targets = { "WorldMapTooltip", "WorldMapQuestPOI_SetTooltip", "WorldMapQuestPOI_AppendTooltip" },
    },
    {
        key = "descriptions",
        installer = "InstallClientDescriptions",
        hooks = "standard",
        addons = {
            "Blizzard_AchievementUI",
            "Blizzard_Collections",
            "Blizzard_EncounterJournal",
            "Blizzard_TokenUI",
        },
        targets = {
            "AchievementFrame",
            "PetJournal",
            "EncounterJournal",
            "GameTooltip",
            "ItemRefTooltip",
            "AchievementButton_OnLoad",
            "AchievementFrameAchievements_SetupButton",
            "SharedPetBattleAbilityTooltip_SetAbility",
            "PetJournal_UpdatePetCard",
            "EncounterJournal_ToggleHeaders",
            "EncounterJournal_SetUpOverview",
            "EncounterJournal_SetBullets",
        },
    },
    {
        key = "dialogue",
        installer = "InstallDialogueSurfaces",
        hooks = "standard",
        addons = { "Blizzard_TalkingHeadUI" },
        targets = { "TalkingHeadFrame", "CinematicFrame" },
    },
    {
        key = "map-labels",
        installer = "InstallMapLabels",
        hooks = "standard",
        addons = { "Blizzard_WorldMap" },
        targets = {
            "WorldMapFrameAreaLabel",
            "WorldMapFrameAreaDescription",
            "MinimapZoneText",
            "MinimapZoneTextButton",
            "GameTooltip",
            "ZoneTextString",
            "SubZoneTextString",
            "WorldMapPOI_OnEnter",
            "Minimap_SetTooltip",
        },
    },
    {
        key = "collections",
        installer = "InstallCollections",
        hooks = "standard",
        addons = { "Blizzard_Collections" },
        targets = { "MountJournal", "MountJournal_UpdateMountList", "MountJournal_UpdateMountDisplay" },
    },
    {
        key = "toys",
        installer = "InstallToys",
        hooks = "standard",
        addons = { "Blizzard_Collections" },
        targets = {
            "ToyBox",
            "GameTooltip",
            "ItemRefTooltip",
            "ToySpellButton_UpdateButton",
            "ToyBox_UpdateButtons",
        },
    },
    {
        key = "wardrobe",
        installer = "InstallWardrobe",
        hooks = "standard",
        addons = { "Blizzard_Collections" },
        targets = {
            "WardrobeCollectionFrame",
            "WardrobeSetsCollectionMixin",
            "WardrobeSetsCollectionScrollFrameMixin",
            "WardrobeItemsModelMixin",
            "WardrobeSetsTransmogModelMixin",
            "WardrobeCollectionFrame_SetAppearanceTooltip",
        },
    },
    {
        key = "professions",
        installer = "InstallProfessions",
        hooks = "standard",
        addons = { "Blizzard_TradeSkillUI" },
        targets = { "TradeSkillFrame" },
    },
    {
        key = "archaeology",
        installer = "InstallArchaeology",
        hooks = "standard",
        addons = { "Blizzard_ArchaeologyUI", "Blizzard_WorldMap" },
        targets = {
            "ArchaeologyFrame",
            "ArchaeologyFrame_CurrentArtifactUpdate",
            "ArchaeologyFrame_UpdateSummary",
            "ArchaeologyFrame_UpdateComplete",
            "ArchaeologyFrame_OnShow",
            "WorldMapTooltip",
            "WorldMapPOI_OnEnter",
        },
    },
    {
        key = "reputation",
        installer = "InstallReputation",
        hooks = "standard",
        addons = { "Blizzard_ReputationUI" },
        targets = { "ReputationDetailFactionName", "ReputationDetailFactionDescription" },
    },
    {
        key = "garrison",
        installer = "InstallGarrison",
        hooks = "standard",
        addons = {
            "Blizzard_GarrisonUI",
            "Blizzard_OrderHallUI",
            "Blizzard_GarrisonShipyardUI",
            "Blizzard_GarrisonMissionUI",
        },
        targets = {
            "GarrisonMissionFrame",
            "OrderHallMissionFrame",
            "GarrisonShipyardFrame",
            "GarrisonMissionListMixin",
            "GarrisonFollowerMission",
            "GarrisonMissionButton_SetInProgressTooltip",
        },
    },
    {
        key = "followers",
        installer = "InstallGarrisonFollowers",
        hooks = "standard",
        addons = { "Blizzard_GarrisonTemplates", "Blizzard_GarrisonUI", "Blizzard_OrderHallUI" },
        targets = {
            "GarrisonMissionFrame",
            "OrderHallMissionFrame",
            "GarrisonBuildingFrame",
            "GarrisonLandingPage",
            "GarrisonRecruiterFrame",
            "GarrisonRecruitSelectFrame",
            "GarrisonFollowerList",
            "GarrisonFollowerTabMixin",
            "GarrisonFollowerList_SetButtonMode",
            "GarrisonFollowerButton_AddAbility",
            "GarrisonFollowerTooltipTemplate_SetGarrisonFollower",
            "GarrisonFollowerTooltipTemplate_SetAbility",
            "GarrisonFollowerAbilityTooltipTemplate_SetAbility",
            "GarrisonRecruitSelectFrame_UpdateRecruits",
            "GarrisonRecruiterFrame_SetAbilityPreference",
        },
    },
    {
        key = "buildings",
        installer = "InstallGarrisonBuildings",
        hooks = "standard",
        addons = { "Blizzard_GarrisonUI" },
        targets = {
            "GarrisonBuildingFrame",
            "GarrisonBuildingInfoBox_ShowBuilding",
            "GarrisonBuildingList_SelectTab",
            "GarrisonBuilding_ShowLevelTooltip",
            "GarrisonBuildingFrame_UpdateBuildingList",
            "GarrisonBuildingFrameLevelIcon_OnEnter",
            "GarrisonPlot_ShowTooltip",
        },
    },
    {
        key = "research",
        installer = "InstallResearch",
        hooks = "standard",
        addons = { "Blizzard_OrderHallUI" },
        targets = {
            "OrderHallTalentFrame",
            "OrderHallTalentFrameMixin",
            "GarrisonTalentButtonMixin",
            "GameTooltip",
        },
    },
    {
        key = "group-finder",
        installer = "InstallGroupFinder",
        hooks = "standard",
        addons = { "Blizzard_GroupFinder" },
        targets = {
            "LFDQueueFrameRandomScrollFrameChildFrame",
            "LFGRewardsFrame_OnLoad",
            "LFGRewardsFrame_UpdateFrame",
        },
    },
    {
        key = "scenario",
        installer = "InstallScenario",
        hooks = "standard",
        addons = { "Blizzard_ObjectiveTracker" },
        targets = { "ScenarioStageBlock", "SCENARIO_TRACKER_MODULE" },
    },
    {
        key = "criteria",
        installer = "InstallAchievementCriteria",
        hooks = "standard",
        addons = { "Blizzard_AchievementUI" },
        targets = { "AchievementFrameAchievementsContainer", "AchievementButton_GetCriteria" },
    },
}
-- Watch the actual binding targets as well as their roots. Blizzard and other
-- addons can finish constructing a child/list after its parent already exists.
-- These are fixed UI paths, not a scan of every global/frame on addon loads.
local childTargets = {
    artifacts = {
        "QuestChoiceFrame.Update",
        "QuestChoiceFrameMixin",
        "QuestChoiceFrame.QuestionText",
        "QuestChoiceFrame.Options.*.OptionButton",
        "QuestChoiceFrame.Options.*.OptionText",
        "QuestChoiceFrame.Options.*.Header.Text",
        "ArtifactFrame.PerksTab.TitleContainer",
        "ArtifactFrame.AppearancesTab",
    },
    descriptions = {
        "AchievementFrameAchievementsContainer.buttons.*.label",
        "AchievementFrameAchievementsContainer.buttons.*.description",
        "AchievementFrameAchievementsContainer.buttons.*.hiddenDescription",
        "AchievementFrameAchievementsContainer.buttons.*.reward",
        "EncounterJournal.encounter.info.encounterTitle",
        "EncounterJournal.encounter.infoFrame.description",
        "EncounterJournal.encounter.overviewFrame.loreDescription",
        "EncounterJournal.encounter.usedHeaders.*.description",
        "EncounterJournal.encounter.usedHeaders.*.button.title",
        "EncounterJournalTooltip.headerText",
    },
    dialogue = { "TalkingHeadFrame.TextFrame.Text", "TalkingHeadFrame.NameFrame.Name" },
    collections = {
        "MountJournal.MountDisplay.InfoButton.Name",
        "MountJournal.MountDisplay.InfoButton.Source",
        "MountJournal.MountDisplay.InfoButton.Lore",
        "MountJournal.ListScrollFrame.buttons.*.name",
    },
    professions = {
        "TradeSkillFrame.DetailsFrame.Contents.RecipeName",
        "TradeSkillFrame.DetailsFrame.Contents.Description",
        "TradeSkillFrame.DetailsFrame.Contents.SourceText",
    },
    ["group-finder"] = {
        "LFDQueueFrameRandomScrollFrameChildFrame.title",
        "LFDQueueFrameRandomScrollFrameChildFrame.description",
    },
    scenario = { "ScenarioStageBlock.Name", "ScenarioStageBlock.Description" },
    garrison = {},
    toys = {},
    wardrobe = {
        "WardrobeCollectionFrame.SetsCollectionFrame.DetailsFrame.Name",
        "WardrobeCollectionFrame.SetsCollectionFrame.DetailsFrame.LongName",
        "WardrobeCollectionFrame.SetsCollectionFrame.DetailsFrame.Label",
        "WardrobeCollectionFrame.SetsCollectionFrame.DetailsFrame.VariantSetsButton",
        "WardrobeCollectionFrame.SetsCollectionFrame.ScrollFrame.buttons.*.Name",
        "WardrobeCollectionFrame.SetsCollectionFrame.ScrollFrame.buttons.*.Label",
        "WardrobeCollectionFrame.ItemsCollectionFrame.Models.*",
        "WardrobeCollectionFrame.SetsTransmogFrame.Models.*",
    },
    archaeology = {
        "ArchaeologyFrame.artifactPage.artifactName",
        "ArchaeologyFrame.artifactPage.raceRarity",
        "ArchaeologyFrame.artifactPage.historyScroll.child.text",
        "ArchaeologyFrame.raceFilterDropDown.Text",
        "WorldMapFrameAreaLabel",
    },
    followers = {
        "GarrisonRecruiterFrame.Pick.Counter.Title",
        "GarrisonRecruiterFrame.Pick.Counter.Description",
        "GarrisonRecruiterFrame.Pick.ThreatDropDown.Text",
        "GarrisonRecruitSelectFrame.FollowerSelection",
        "GarrisonMissionMechanic_OnEnter",
        "GarrisonMissionMechanicFollowerCounter_OnEnter",
        "GarrisonMissionMechanicTooltip.Name",
        "GarrisonMissionMechanicTooltip.Description",
        "GarrisonMissionMechanicFollowerCounterTooltip.Name",
        "GarrisonMissionMechanicFollowerCounterTooltip.CounterName",
    },
    buildings = {
        "GarrisonBuildingFrame.InfoBox.Title",
        "GarrisonBuildingFrame.InfoBox.Description",
        "GarrisonBuildingFrame.BuildingLevelTooltip.Name",
        "GarrisonBuildingFrame.BuildingList.Buttons.*.Name",
    },
    research = { "OrderHallTalentFrame.buttonPool" },
}
for i = 1, 18 do
    childTargets.toys[#childTargets.toys + 1] = "ToyBox.iconsFrame.spellButton" .. i .. ".name"
end
for i = 1, 12 do
    childTargets.archaeology[#childTargets.archaeology + 1] = "ArchaeologyFrame.summaryPage.race"
        .. i
        .. ".raceName"
    childTargets.archaeology[#childTargets.archaeology + 1] = "ArchaeologyFrame.completedPage.artifact"
        .. i
        .. ".artifactName"
    childTargets.archaeology[#childTargets.archaeology + 1] = "ArchaeologyFrame.completedPage.artifact"
        .. i
        .. ".artifactSubText"
end
for i = 1, 3 do
    childTargets.buildings[#childTargets.buildings + 1] = "GarrisonBuildingFrame.BuildingLevelTooltip.Rank"
        .. i
        .. "Tooltip"
end
for _, root in ipairs({
    "GarrisonMissionFrame",
    "OrderHallMissionFrame",
    "GarrisonBuildingFrame",
    "GarrisonLandingPage",
    "GarrisonRecruitSelectFrame",
}) do
    for _, field in ipairs({
        "Name",
        "ClassSpec",
        "Source.SourceText",
        "AbilitiesFrame.FlavorText",
        "abilitiesPool",
        "equipmentPool",
    }) do
        childTargets.followers[#childTargets.followers + 1] = root .. ".FollowerTab." .. field
    end
    childTargets.followers[#childTargets.followers + 1] = root
        .. ".FollowerList.listScroll.buttons.*.Follower.Name"
end
for i = 1, 3 do
    local card = "EncounterJournal.suggestFrame.Suggestion" .. i
    for _, field in ipairs({
        "centerDisplay.title.text",
        "centerDisplay.description.text",
        "centerDisplay.button",
        "button",
    }) do
        childTargets.descriptions[#childTargets.descriptions + 1] = card .. "." .. field
    end
end
for _, root in ipairs({ "GarrisonMissionFrame", "OrderHallMissionFrame", "GarrisonShipyardFrame" }) do
    for _, field in ipairs({
        "MissionList.listScroll.buttons.*.Title",
        "MissionPage.Title",
        "MissionPage.Stage.MissionDescription",
        "MissionPage.Stage.Location",
    }) do
        childTargets.garrison[#childTargets.garrison + 1] = root .. ".MissionTab." .. field
    end
end
for _, feature in ipairs(features) do
    for _, name in ipairs(childTargets[feature.key] or {}) do
        feature.targets[#feature.targets + 1] = name
    end
end
local observed = {}
local baseTargets = {
    "QuestFrameProgressPanel",
    "QuestFrameGreetingPanel",
    "ItemTextFrame",
    "GossipGreetingText",
    "CastingBarFrame",
    "PetCastingBarFrame",
    "TargetFrameSpellBar",
    "FocusFrameSpellBar",
    "PetFrame",
    "GameTooltip",
    "ItemRefTooltip",
    "ShoppingTooltip1",
    "ShoppingTooltip2",
    "ItemRefShoppingTooltip1",
    "ItemRefShoppingTooltip2",
    "QUEST_TRACKER_MODULE",
    "BONUS_OBJECTIVE_TRACKER_MODULE",
    "WORLD_QUEST_TRACKER_MODULE",
    "SCENARIO_TRACKER_MODULE",
    "QuestInfo_Display",
    "QuestFrameGreetingPanel_OnShow",
    "GossipFrameUpdate",
    "QuestFrame_ShowQuestPortrait",
    "StaticPopup_Show",
    "QuestLogQuests_Update",
    "CastingBarFrame_OnEvent",
    "UnitFrame_Update",
    "UnitFrame_OnEvent",
    "CompactUnitFrame_UpdateName",
}
local paths = {}
local function compile(names)
    for _, name in ipairs(names) do
        local parts = {}
        for part in name:gmatch("[^.]+") do
            parts[#parts + 1] = part
        end
        paths[name] = parts
    end
end
compile(baseTargets)
for _, feature in ipairs(features) do
    compile(feature.targets)
end
local function targetsChanged(id, names, save)
    local previous = observed[id] or {}
    local changed = false
    local count = 0
    local function remember(value)
        count = count + 1
        value = value or false
        if previous[count] ~= value then
            changed = true
        end
        if save then
            previous[count] = value
        end
    end
    local function visit(value, parts, index)
        remember(value)
        if
            (type(value) ~= "table" and type(value) ~= "userdata")
            or value.IsForbidden and value:IsForbidden()
        then
            return
        end
        if index > #parts then
            remember(value.GetText)
            remember(value.SetText)
            return
        end
        if parts[index] == "*" then
            if type(value) == "table" then
                for _, child in ipairs(value) do
                    visit(child, parts, index + 1)
                end
            end
        else
            visit(value[parts[index]], parts, index + 1)
        end
    end
    for _, name in ipairs(names) do
        local parts = paths[name]
        visit(_G[parts[1]], parts, 2)
    end
    if #previous ~= count then
        changed = true
    end
    if save then
        for i = #previous, count + 1, -1 do
            previous[i] = nil
        end
    end
    if save then
        observed[id] = previous
    end
    return changed
end
local function install(addonName)
    A.Hooks.Refresh()
    local all = not addonName or addonName == "LegionChinese"
    if all or addonName == "Blizzard_ObjectiveTracker" or targetsChanged("base", baseTargets) then
        installBase()
        targetsChanged("base", baseTargets, true)
    end
    for _, feature in ipairs(features) do
        local relevant = all or targetsChanged(feature.key, feature.targets)
        for _, name in ipairs(feature.addons) do
            if name == addonName then
                relevant = true
            end
        end
        local installer = A[feature.installer]
        if relevant and installer then
            local global, method, script = A.Hooks.ForFeature(feature.key)
            if feature.hooks == "method-script" then
                installer(method, script)
            elseif feature.hooks == "method-global" then
                installer(method, global)
            else
                installer(global, method, script)
            end
        end
        targetsChanged(feature.key, feature.targets, true)
    end
    if A.ChatLinksChanged and A.ChatLinksChanged() then
        A.InstallChatItemLinks()
    end
end
local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_LOGIN")
frame:SetScript("OnEvent", function(_, event, addonName)
    if event == "PLAYER_LOGIN" or (event == "ADDON_LOADED" and addonName == "LegionChinese") then
        A.InitializeSettings()
        -- A lookup during initial installation may have met an unfinished
        -- main-addon dependency. Retry once that dependency is ready.
        A.Data.ResetFailures()
    end
    install(event == "ADDON_LOADED" and addonName or nil)
    if event == "PLAYER_LOGIN" or (event == "ADDON_LOADED" and addonName == "Blizzard_ObjectiveTracker") then
        A.RefreshTracker()
    end
    if event == "PLAYER_LOGIN" then
        A.RefreshCastBars()
        if A.RefreshPetNames then
            A.RefreshPetNames()
        end
        if A.RefreshChatItemLinks then
            A.RefreshChatItemLinks()
        end
    end
    if event == "PLAYER_LOGIN" and not LegionChineseSettings.welcomeSeen then
        A.ShowWelcome()
    end
end)
install()

SLASH_LEGIONCHINESE1 = "/lcn"
SlashCmdList.LEGIONCHINESE = function(command)
    A.InitializeSettings()
    command = (command or ""):lower():gsub("%s", "")
    if command == "about" or command == "关于" then
        A.ShowWelcome()
    else
        print("LegionChinese：插件加载后自动汉化。/lcn about 查看介绍与反馈。")
    end
end
