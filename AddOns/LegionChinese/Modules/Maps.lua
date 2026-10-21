-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local bind=A.BindCatalog
function A.UpdateMapLocationTooltip(owner)
    local tooltip=WorldMapTooltip
    if not owner or not owner.GetName or owner.IsForbidden and owner:IsForbidden()
        or not tooltip or tooltip.IsForbidden and tooltip:IsForbidden() or not tooltip.GetOwner
        or tooltip:GetOwner()~=owner or not tooltip.IsShown or not tooltip:IsShown() then return end
    local name=owner:GetName()
    if type(name)~="string" or not name:match("^WorldMapFramePOI%d+$") or _G[name]~=owner then return end
    local changed=false
    -- POI name and description only; leave its quest rewards and live timer.
    for i=1,2 do if A.ApplyCatalogText(_G["WorldMapTooltipTextLeft"..i],"World") then changed=true end end
    if changed and tooltip.Show then tooltip:Show() end
end

function A.InstallMapLabels(hook,hookMethod)
    for _,widget in pairs({WorldMapFrameAreaLabel,WorldMapFrameAreaDescription,MinimapZoneText,ZoneTextString,SubZoneTextString}) do bind(hookMethod,widget,"World") end
    hook("WorldMapPOI_OnEnter",A.UpdateMapLocationTooltip)
end
