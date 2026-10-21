-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local writing=setmetatable({}, {__mode="k"})

local function usable(widget)
    return widget and not (widget.IsForbidden and widget:IsForbidden())
        and widget.GetText and widget.SetText
end

function A.ApplyLocalClientText(widget,scope)
    if not usable(widget) or writing[widget] then return false end
    local source=widget:GetText()
    local text
    if scope=="Objective" and type(source)=="string" then
        local prefix=source:match("^(%-%s+)") or ""
        local changed
        text,changed=A.Translate("Objectives",source:sub(#prefix+1))
        if not changed then return false end
        text=prefix..text
    else
        text=A.FindLocalClient(scope,source)
        text=text and A.Render(text)
    end
    if not text then return false end
    local color=source:match("^(|c%x%x%x%x%x%x%x%x)")
    if color and source:sub(-2)=="|r" and not text:match("^|c%x%x%x%x%x%x%x%x") then text=color..text.."|r" end
    writing[widget]=true
    A.SetFont(widget);widget:SetText(text)
    writing[widget]=nil
    return true
end

local function bind(hookMethod,widget,scope)
    if not usable(widget) then return end
    hookMethod(widget,"SetText",function(self) A.ApplyLocalClientText(self,scope) end)
    A.ApplyLocalClientText(widget,scope)
end

function A.UpdateLocalMapPOITooltip(owner)
    local tooltip=WorldMapTooltip
    if not owner or not owner.GetName or owner.IsForbidden and owner:IsForbidden()
        or not tooltip or tooltip.IsForbidden and tooltip:IsForbidden() or not tooltip.GetOwner
        or tooltip:GetOwner()~=owner or not tooltip.IsShown or not tooltip:IsShown() then return end
    local name=owner:GetName()
    if type(name)~="string" or not name:match("^WorldMapFramePOI%d+$") or _G[name]~=owner then return end
    local changed=false
    -- POI name and description only; leave its quest rewards and live timer.
    for i=1,2 do if A.ApplyLocalClientText(_G["WorldMapTooltipTextLeft"..i],"World") then changed=true end end
    if changed and tooltip.Show then tooltip:Show() end
end

local function mounts(hookMethod)
    local journal=MountJournal
    local info=journal and journal.MountDisplay and journal.MountDisplay.InfoButton
    if info then
        for _,field in ipairs({"Name","Source","Lore"}) do bind(hookMethod,info[field],"Collection") end
    end
    for _,button in ipairs(journal and journal.ListScrollFrame and journal.ListScrollFrame.buttons or {}) do
        bind(hookMethod,button.name,"Collection")
    end
end

local function missionList(self,hookMethod)
    for _,button in ipairs(self and self.listScroll and self.listScroll.buttons or {}) do
        bind(hookMethod,button.Title,"Garrison")
    end
end

local function missionPage(page,hookMethod)
    if not page then return end
    bind(hookMethod,page.Title,"Garrison")
    local stage=page.Stage
    if stage then
        bind(hookMethod,stage.MissionDescription,"Garrison")
        bind(hookMethod,stage.Location,"Garrison")
    end
    -- Follower/ship name fields are deliberately outside these fixed mission
    -- fields: ships can have player-authored names.
end

local function dungeonRewards(frame,hookMethod)
    if not frame then return end
    bind(hookMethod,frame.title,"GroupFinder")
    bind(hookMethod,frame.description,"GroupFinder")
    -- Reward quantities and editable premade-group listings are separate.
end

function A.InstallLocalClient(hook,hookMethod)
    for _,widget in pairs({WorldMapFrameAreaLabel,WorldMapFrameAreaDescription,MinimapZoneText,ZoneTextString,SubZoneTextString}) do
        bind(hookMethod,widget,"World")
    end
    bind(hookMethod,ScenarioStageBlock and ScenarioStageBlock.Name,"Title")
    bind(hookMethod,ScenarioStageBlock and ScenarioStageBlock.Description,"Objective")
    for _,name in ipairs({"ReputationDetailFactionName","ReputationDetailFactionDescription"}) do bind(hookMethod,_G[name],"Faction") end
    local details=TradeSkillFrame and TradeSkillFrame.DetailsFrame
    local contents=details and details.Contents
    if contents then
        bind(hookMethod,contents.Description,"Profession")
        bind(hookMethod,contents.SourceText,"Profession")
    end
    dungeonRewards(LFDQueueFrameRandomScrollFrameChildFrame,hookMethod)
    hook("LFGRewardsFrame_OnLoad",function(frame) dungeonRewards(frame,hookMethod) end)
    hook("LFGRewardsFrame_UpdateFrame",function(frame) dungeonRewards(frame,hookMethod) end)
    hook("AchievementButton_GetCriteria",function(index,offscreen)
        local criteria=_G["AchievementFrameCriteria"..(offscreen and "OffScreen" or "")..index]
        bind(hookMethod,criteria and criteria.name,"Objective")
    end)
    hook("WorldMapPOI_OnEnter",A.UpdateLocalMapPOITooltip)
    hook("MountJournal_UpdateMountList",function() mounts(hookMethod) end)
    hook("MountJournal_UpdateMountDisplay",function() mounts(hookMethod) end)
    mounts(hookMethod)
    hookMethod(GarrisonMissionListMixin,"Update",function(self) missionList(self,hookMethod) end)
    hookMethod(GarrisonFollowerMission,"ShowMissionStage",function(self)
        if self and self.GetMissionPage then missionPage(self:GetMissionPage(),hookMethod) end
    end)
    for _,frame in pairs({GarrisonMissionFrame,OrderHallMissionFrame,GarrisonShipyardFrame}) do
        local tab=frame and frame.MissionTab
        if tab then
            missionList(tab.MissionList,hookMethod);missionPage(tab.MissionPage,hookMethod)
            hookMethod(tab.MissionList,"Update",function(self) missionList(self,hookMethod) end)
        end
        hookMethod(frame,"ShowMissionStage",function(self)
            if self.GetMissionPage then missionPage(self:GetMissionPage(),hookMethod) end
        end)
    end
    hook("GarrisonMissionButton_SetInProgressTooltip",function()
        -- This setter's first line is a database mission name, not a player
        -- follower/ship name, reward title or editable group listing.
        if A.ApplyLocalClientText(GameTooltipTextLeft1,"Garrison") and GameTooltip and GameTooltip.Show then GameTooltip:Show() end
    end)
end
