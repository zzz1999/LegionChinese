-- SPDX-License-Identifier: GPL-2.0-or-later
local A,D=LegionChinese,LegionChineseDB
local previous,cachedSource,cachedTranslation

function A.ClearWorldObjectTooltip()
    previous=nil;cachedSource=nil;cachedTranslation=nil
end

local function worldTooltip(tooltip)
    if tooltip~=GameTooltip or not tooltip or (tooltip.IsForbidden and tooltip:IsForbidden())
        or not tooltip:IsShown() or not WorldFrame or not GetMouseFocus or GetMouseFocus()~=WorldFrame then return end
    local owner=tooltip:GetOwner()
    if owner~=WorldFrame and owner~=UIParent then return end
    if UnitExists and UnitExists("mouseover") then return end
    local name,unit=tooltip:GetUnit()
    local item,itemLink=tooltip:GetItem()
    local spell,rank,spellID=tooltip:GetSpell()
    if name or unit or item or itemLink or spell or rank or spellID then return end
    local widget=GameTooltipTextLeft1
    if widget and not (widget.IsForbidden and widget:IsForbidden()) then return widget end
end

function A.UpdateWorldObjectTooltip(tooltip)
    local widget=worldTooltip(tooltip)
    if not widget then A.ClearWorldObjectTooltip();return end
    if previous and previous.widget~=widget then A.ClearWorldObjectTooltip() end
    local source=widget:GetText()
    if previous and source==previous.text then return end
    previous=nil
    if type(source)~="string" or source=="" or source:find("|",1,true) then return end
    -- Names have no player substitutions. Cache the lookup, not the widget:
    -- the engine may replace the text without hiding/recreating the tooltip.
    if source~=cachedSource then
        cachedSource=source
        cachedTranslation=D.WorldObjects[A.NameFingerprint(source)]
            or A.FindLocalClient and A.FindLocalClient("World",source)
    end
    if not cachedTranslation then return end
    A.SetFont(widget)
    previous={widget=widget,source=source,text=cachedTranslation}
    widget:SetText(cachedTranslation)
    tooltip:Show() -- Ask the native tooltip to recompute its size.
end

function A.RefreshWorldObjectTooltip()
    A.UpdateWorldObjectTooltip(GameTooltip)
end
