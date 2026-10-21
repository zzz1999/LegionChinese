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

function A.UpdateMinimapLocationTooltip()
    local tip,owner=GameTooltip,MinimapZoneTextButton
    if not owner or owner.IsForbidden and owner:IsForbidden() or not tip
        or tip.IsForbidden and tip:IsForbidden() or not tip.GetOwner or tip:GetOwner()~=owner
        or not tip.IsShown or not tip:IsShown() then return end
    local zone=GetZoneText and GetZoneText()
    local subzone=GetSubZoneText and GetSubZoneText()
    local changed=false
    for i,source in pairs({zone,subzone~=zone and subzone or nil}) do
        local widget=_G["GameTooltipTextLeft"..i]
        if type(source)=="string" and source~="" and A.IsTextWidget(widget) and widget:GetText()==source then
            if A.ApplyCatalogText(widget,"World") then changed=true end
        end
    end
    if changed and tip.Show then tip:Show() end
end

function A.InstallMapLabels(hook,hookMethod)
    for _,widget in pairs({WorldMapFrameAreaLabel,WorldMapFrameAreaDescription,MinimapZoneText,ZoneTextString,SubZoneTextString}) do bind(hookMethod,widget,"World") end
    hook("WorldMapPOI_OnEnter",A.UpdateMapLocationTooltip)
    hook("Minimap_SetTooltip",A.UpdateMinimapLocationTooltip)
end
