-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local bind=A.BindCatalog
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

function A.InstallGarrison(hook,hookMethod)
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
        if A.ApplyCatalogText(GameTooltipTextLeft1,"Garrison") and GameTooltip and GameTooltip.Show then GameTooltip:Show() end
    end)
end
