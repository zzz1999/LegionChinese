-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local bind=A.BindCatalog
local function usable(frame) return frame and not (frame.IsForbidden and frame:IsForbidden()) end
local function refresh(hookMethod)
    local root=GarrisonBuildingFrame
    if not usable(root) then return end
    local info=root.InfoBox
    if usable(info) then bind(hookMethod,info.Title,"Garrison");bind(hookMethod,info.Description,"Garrison") end
    local tooltip=root.BuildingLevelTooltip
    if usable(tooltip) then
        bind(hookMethod,tooltip.Name,"Garrison")
        for i=1,3 do bind(hookMethod,tooltip["Rank"..i.."Tooltip"],"Garrison") end
    end
    local list=root.BuildingList
    if usable(list) then
        for _,button in ipairs(list.Buttons or {}) do if usable(button) then bind(hookMethod,button.Name,"Garrison") end end
    end
    -- FollowerText, costs, timers and upgrade availability remain native.
end
function A.InstallGarrisonBuildings(hook,hookMethod)
    for _,name in ipairs({"GarrisonBuildingInfoBox_ShowBuilding","GarrisonBuildingList_SelectTab","GarrisonBuilding_ShowLevelTooltip","GarrisonBuildingFrame_UpdateBuildingList"}) do
        hook(name,function() refresh(hookMethod) end)
    end
    hook("GarrisonBuildingFrameLevelIcon_OnEnter",function() A.UpdateCatalogTooltip(GameTooltip,"Garrison") end)
    hook("GarrisonPlot_ShowTooltip",function()
        -- The next line can contain a player's follower/ship name. Only the
        -- first line is the fixed building/plot description here.
        local tip=GameTooltip
        local name=usable(tip) and tip.GetName and tip:GetName()
        if type(name)=="string" and A.ApplyCatalogText(_G[name.."TextLeft1"],"Garrison") and tip.Show then tip:Show() end
    end)
    refresh(hookMethod)
end
