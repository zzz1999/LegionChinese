-- SPDX-License-Identifier: GPL-2.0-or-later
local A,D=LegionChinese,LegionChineseDB
local states=setmetatable({}, {__mode="k"})
local installed=setmetatable({}, {__mode="k"})
local pollDelay=setmetatable({}, {__mode="k"})

local function linkItemID(link)
    if type(link)~="string" then return end
    local payload=link:match("|H([^|]+)|h") or link
    -- Native Legion keystones start with a challenge map ID, not an item ID.
    if A.ParseKeystoneLink(payload) then return 138019 end
    local kind,id,rest=payload:match("^(%a+):(%d+)(.*)$")
    if kind=="item" and (rest=="" or rest:sub(1,1)==":") then return tonumber(id) end
end

local function translateBody(body,entries,depth)
    if depth>3 then return end
    local color,plain=body:match("^(|c%x%x%x%x%x%x%x%x)(.-)|r$")
    if color then
        local text=translateBody(plain,entries,depth+1)
        if text then return color..text.."|r" end
        return
    end
    -- Try the actual database wording first: quotes can be part of the stored
    -- description as well as wrappers added by the native tooltip.
    if not body:find("|",1,true) then
        local text=entries[A.NameFingerprint(body) or ""]
        if text then return text end
    end
    if body:sub(1,1)=='"' and body:sub(-1)=='"' then
        local text=translateBody(body:sub(2,-2),entries,depth+1)
        if text then return '"'..text..'"' end
    end
end

local function translateLine(source,entries)
    if type(source)~="string" or A.IsChinese(source) then return end
    local prefix,body,suffix=source:match("^(%s*)(.-)(%s*)$")
    local text=translateBody(body,entries,0)
    if text then return prefix..text..suffix end
end

function A.ClearItemTooltip(tooltip)
    states[tooltip]=nil;pollDelay[tooltip]=0.1
end

function A.UpdateItemTooltip(tooltip)
    if not tooltip or (tooltip~=GameTooltip and tooltip~=ItemRefTooltip)
        or (tooltip.IsForbidden and tooltip:IsForbidden()) then return end
    if not tooltip.IsShown or not tooltip:IsShown() or not tooltip.GetName
        or not tooltip.NumLines or not tooltip.GetItem then return end
    pollDelay[tooltip]=0.1
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
    local itemName=id and D.ItemNames and D.ItemNames[id]
    if not entries and not itemName then A.ClearItemTooltip(tooltip);return end
    if not state or state.itemID~=id then
        state={itemID=id,fallbackID=state and state.fallbackID,lines={}};states[tooltip]=state
    end
    local changed=false
    for i=itemName and 1 or 2,entries and tooltip:NumLines() or 1 do
        local widget=_G[name.."TextLeft"..i]
        if widget and not (widget.IsForbidden and widget:IsForbidden()) then
            local source=widget:GetText()
            local cached=state.lines[i]
            if not cached or cached.widget~=widget or (source~=cached.source and source~=cached.text) then
                local translated
                if i==1 and A.ResolveItemName then translated=A.ResolveItemName(source,id,link and (link:match("|H([^|]+)|h") or link))
                elseif entries then translated=translateLine(source,entries) end
                cached={widget=widget,source=source,text=translated};state.lines[i]=cached
            end
            if cached.text and source~=cached.text then
                A.SetFont(widget);widget:SetText(cached.text);changed=true
            end
        end
    end
    if changed then tooltip:Show() end -- Recompute wrapping with the native tooltip.
end

local function pollItemTooltip(tooltip,elapsed)
    local remaining=(pollDelay[tooltip] or 0)-(elapsed or 0)
    if remaining>0.000001 then pollDelay[tooltip]=remaining;return end
    pollDelay[tooltip]=0.1
    A.UpdateItemTooltip(tooltip)
end

local function setFallback(tooltip,id)
    local state=states[tooltip]
    if id and (D.ItemDescriptions[id] or D.ItemNames and D.ItemNames[id]) then
        -- OnTooltipSetItem can already have translated the lines inside the
        -- native setter. Keep its line cache until the tooltip changes.
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
            -- These native frames are reused for units, spells and links.
            tooltip:HookScript("OnTooltipCleared",A.ClearItemTooltip)
            tooltip:HookScript("OnHide",A.ClearItemTooltip)
            tooltip:HookScript("OnTooltipSetUnit",A.ClearItemTooltip)
            tooltip:HookScript("OnTooltipSetSpell",A.ClearItemTooltip)
            tooltip:HookScript("OnTooltipSetItem",A.UpdateItemTooltip)
            tooltip:HookScript("OnShow",A.UpdateItemTooltip)
            -- Native show/item/setter events translate immediately. Polling
            -- catches later line changes, at most ten times per second instead
            -- of traversing every line each rendered frame.
            tooltip:HookScript("OnUpdate",pollItemTooltip)
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
