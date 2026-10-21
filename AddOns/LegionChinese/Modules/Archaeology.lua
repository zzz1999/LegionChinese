-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local bind=A.BindCatalog
local function digsite(owner)
    if not LE_MAP_LANDMARK_TYPE_DIGSITE or not owner or owner.IsForbidden and owner:IsForbidden()
        or owner.landmarkType~=LE_MAP_LANDMARK_TYPE_DIGSITE or not owner.GetName then return end
    local name=owner:GetName()
    return type(name)=="string" and name:match("^WorldMapFramePOI%d+$") and _G[name]==owner
end
local function mapLabel(source)
    local owner=GetMouseFocus and GetMouseFocus()
    -- Untimed dig sites use a deferred area label, not WorldMapTooltip. Resolve
    -- at its native SetText, against the real POI still under the mouse then.
    if not digsite(owner) or owner.name~=source then return end
    local text=A.FindCatalog("Profession",source)
    return text and A.Render(text)
end
local function raceText(source)
    -- The native race label appends live fragment counts or a quality label.
    -- Resolve just its complete name, preserving the exact native suffix.
    local name,suffix=source:match("^(.-)(|n%d+/%d+)$")
    if not name then name,suffix=source:match("^(.-)(\n%d+/%d+)$") end
    if not name then name,suffix=source:match("^(.-)( %(%d+/%d+%))$") end
    if not name then name,suffix=source:match("^(.-)( %- .+)$") end
    name=name or source;suffix=suffix or ""
    local text=A.FindCatalog("Profession",name)
    return text and A.Render(text)..suffix
end
local function artifact(hookMethod,page)
    if not page or page.IsForbidden and page:IsForbidden() then return end
    bind(hookMethod,page.artifactName,"Profession")
    local child=page.historyScroll and page.historyScroll.child
    bind(hookMethod,child and child.text,"Profession")
    A.BindResolvedText(hookMethod,page.raceRarity,raceText)
end
local function summary(hookMethod,page)
    if not page or page.IsForbidden and page:IsForbidden() then return end
    for i=1,12 do
        local button=page["race"..i]
        if button and not (button.IsForbidden and button:IsForbidden()) then A.BindResolvedText(hookMethod,button.raceName,raceText) end
    end
end
local function completed(hookMethod,page)
    if not page or page.IsForbidden and page:IsForbidden() then return end
    for i=1,12 do
        local button=page["artifact"..i]
        if button and not (button.IsForbidden and button:IsForbidden()) then
            bind(hookMethod,button.artifactName,"Profession")
            A.BindResolvedText(hookMethod,button.artifactSubText,raceText)
        end
    end
end
local function refresh(hookMethod)
    local frame=ArchaeologyFrame
    if not frame or frame.IsForbidden and frame:IsForbidden() then return end
    artifact(hookMethod,frame.artifactPage);summary(hookMethod,frame.summaryPage);completed(hookMethod,frame.completedPage)
    bind(hookMethod,frame.raceFilterDropDown and frame.raceFilterDropDown.Text,"Profession")
end
function A.InstallArchaeology(hook,hookMethod)
    A.BindResolvedText(hookMethod,WorldMapFrameAreaLabel,mapLabel)
    hook("ArchaeologyFrame_CurrentArtifactUpdate",function(page) artifact(hookMethod,page) end)
    hook("ArchaeologyFrame_UpdateSummary",function(page) summary(hookMethod,page) end)
    hook("ArchaeologyFrame_UpdateComplete",function(page) completed(hookMethod,page) end)
    hook("ArchaeologyFrame_OnShow",function() refresh(hookMethod) end)
    hook("UIDropDownMenu_SetText",function(dropdown)
        local frame=ArchaeologyFrame
        if frame and dropdown and frame.raceFilterDropDown==dropdown then
            local name=dropdown.GetName and dropdown:GetName()
            bind(hookMethod,dropdown.Text or name and _G[name.."Text"],"Profession")
        end
    end)
    hook("UIDropDownMenu_AddButton",function(_,level)
        A.UpdateCatalogMenu(ArchaeologyFrame and ArchaeologyFrame.raceFilterDropDown,"Profession",level,raceText)
    end)
    hook("WorldMapPOI_OnEnter",function(owner)
        local tip=WorldMapTooltip
        if not digsite(owner)
            or not tip or tip.IsForbidden and tip:IsForbidden() or not tip.GetOwner or tip:GetOwner()~=owner then return end
        if A.ApplyCatalogText(WorldMapTooltipTextLeft1,"Profession") and tip.Show then tip:Show() end
    end)
    refresh(hookMethod)
end
