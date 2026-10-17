-- SPDX-License-Identifier: GPL-2.0-or-later
local A,D=LegionChinese,LegionChineseDB
local states=setmetatable({}, {__mode="k"})
local installed=setmetatable({}, {__mode="k"})

local function linkItemID(link)
    if type(link)~="string" then return end
    local payload=link:match("|H([^|]+)|h") or link
    -- Native Legion keystones start with a challenge map ID, not an item ID.
    if A.ParseKeystoneLink(payload) then return 138019 end
    local kind,id,rest=payload:match("^(%a+):(%d+)(.*)$")
    if kind=="item" and (rest=="" or rest:sub(1,1)==":") then return tonumber(id) end
end

local function translateLine(source,entries)
    if type(source)~="string" or A.IsChinese(source) then return end
    local prefix,body,suffix=source:match("^(%s*)(.-)(%s*)$")
    local color,plain=body:match("^(|c%x%x%x%x%x%x%x%x)(.-)|r$")
    if color then prefix=prefix..color;suffix="|r"..suffix;body=plain end
    -- Preserve a native full-line color and flavor-text quotes. Other markup
    -- is deliberately excluded, including linked text added by other addons.
    if body:find("|",1,true) then return end
    if body:sub(1,1)=='"' and body:sub(-1)=='"' then
        prefix=prefix..'"';suffix='"'..suffix;body=body:sub(2,-2)
    end
    local text=entries[A.NameFingerprint(body) or ""]
    if text then return prefix..text..suffix end
end

function A.ClearItemTooltip(tooltip) states[tooltip]=nil end

function A.UpdateItemTooltip(tooltip)
    if not tooltip or (tooltip~=GameTooltip and tooltip~=ItemRefTooltip)
        or (tooltip.IsForbidden and tooltip:IsForbidden()) then return end
    if not tooltip.IsShown or not tooltip:IsShown() or not tooltip.GetName
        or not tooltip.NumLines or not tooltip.GetItem then return end
    local name=tooltip:GetName()
    if not name then return end
    local unitName,unit,spell,rank,spellID
    if tooltip.GetUnit then unitName,unit=tooltip:GetUnit() end
    if tooltip.GetSpell then spell,rank,spellID=tooltip:GetSpell() end
    if unitName or unit or spell or rank or spellID then A.ClearItemTooltip(tooltip);return end
    local state=states[tooltip]
    local item,link=tooltip:GetItem()
    local id
    if link then id=linkItemID(link)
    elseif not item and state then id=state.fallbackID end
    local entries=id and D.ItemDescriptions[id]
    if not entries then A.ClearItemTooltip(tooltip);return end
    if not state or state.itemID~=id then
        state={itemID=id,fallbackID=state and state.fallbackID,lines={}};states[tooltip]=state
    end
    local enabled,changed=A.Enabled(),false
    for i=2,tooltip:NumLines() do
        local widget=_G[name.."TextLeft"..i]
        if widget and not (widget.IsForbidden and widget:IsForbidden()) then
            local source=widget:GetText()
            local cached=state.lines[i]
            if not cached or cached.widget~=widget or (source~=cached.source and source~=cached.text) then
                cached={widget=widget,source=source,text=translateLine(source,entries)};state.lines[i]=cached
            end
            if enabled and cached.text and source~=cached.text then
                A.SetFont(widget);widget:SetText(cached.text);changed=true
            elseif not enabled and cached.text and source==cached.text then
                widget:SetText(cached.source);changed=true
            end
        end
    end
    if changed then tooltip:Show() end -- Recompute wrapping with the native tooltip.
end

local function setFallback(tooltip,id)
    local state=states[tooltip]
    if id and D.ItemDescriptions[id] then
        -- OnTooltipSetItem can already have translated the lines inside the
        -- native setter. Retain those originals for /lcn off.
        if not state or state.itemID~=id then state={lines={}} end
        state.fallbackID=id;states[tooltip]=state
    else states[tooltip]=nil end
    A.UpdateItemTooltip(tooltip)
end

function A.InstallItemTooltips()
    local tooltips={GameTooltip,ItemRefTooltip}
    for i=1,2 do
        local tooltip=tooltips[i]
        if tooltip and not installed[tooltip] and tooltip.HookScript
            and not (tooltip.IsForbidden and tooltip:IsForbidden()) then
            installed[tooltip]=true
            -- Keep cleanup active while disabled: these native frames are reused
            -- for units, spells and links, even when our translator is off.
            tooltip:HookScript("OnTooltipCleared",A.ClearItemTooltip)
            tooltip:HookScript("OnHide",A.ClearItemTooltip)
            tooltip:HookScript("OnTooltipSetUnit",A.ClearItemTooltip)
            tooltip:HookScript("OnTooltipSetSpell",A.ClearItemTooltip)
            tooltip:HookScript("OnTooltipSetItem",A.UpdateItemTooltip)
            tooltip:HookScript("OnShow",A.UpdateItemTooltip)
            tooltip:HookScript("OnUpdate",A.UpdateItemTooltip)
            if tooltip.SetHyperlink then
                hooksecurefunc(tooltip,"SetHyperlink",function(self,link) setFallback(self,linkItemID(link)) end)
            end
            if tooltip.SetBagItem then
                hooksecurefunc(tooltip,"SetBagItem",function(self,bag,slot)
                    setFallback(self,GetContainerItemID and GetContainerItemID(bag,slot))
                end)
            end
        end
    end
end

function A.RefreshItemTooltips()
    A.UpdateItemTooltip(GameTooltip)
    A.UpdateItemTooltip(ItemRefTooltip)
end
