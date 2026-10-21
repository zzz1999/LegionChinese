-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
if A.BindCatalog then return end
local writing=setmetatable({}, {__mode="k"})
function A.IsWriting(widget) return writing[widget] end

function A.IsTextWidget(widget)
    return widget and not (widget.IsForbidden and widget:IsForbidden()) and widget.GetText and widget.SetText
end
function A.PreserveTextColor(source,text)
    if type(source)~="string" or type(text)~="string" then return text end
    local color=source:match("^(|c%x%x%x%x%x%x%x%x)")
    if color and source:sub(-2)=="|r" and not text:match("^|c%x%x%x%x%x%x%x%x") then return color..text.."|r" end
    return text
end
local function write(widget,text,html)
    A.SetFont(widget,html);widget:SetText(text)
end
function A.WriteText(widget,text,html)
    if not text or not widget or not widget.SetText or widget.IsForbidden and widget:IsForbidden() or writing[widget] then return false end
    writing[widget]=true
    local ok,message=pcall(write,widget,text,html)
    writing[widget]=nil
    if not ok then error(message) end
    return true
end
function A.ApplyCatalogText(widget,scope)
    if not A.IsTextWidget(widget) or writing[widget] then return false end
    local source,text=widget:GetText()
    if scope=="Objective" and type(source)=="string" then
        local prefix=source:match("^(%-%s+)") or ""
        local changed;text,changed=A.Translate("Objectives",source:sub(#prefix+1))
        if not changed then return false end
        text=prefix..text
    else text=A.FindCatalog(scope,source);text=text and A.Render(text) end
    return A.WriteText(widget,A.PreserveTextColor(source,text))
end
function A.BindCatalog(hookMethod,widget,scope)
    if not A.IsTextWidget(widget) then return end
    hookMethod(widget,"SetText",function(self) A.ApplyCatalogText(self,scope) end)
    return A.ApplyCatalogText(widget,scope)
end

-- Resolvers see the current source and current widget context on every write.
-- Do not capture an item/follower ID from a recycled row's first use.
function A.BindResolvedText(hookMethod,widget,resolve,slot)
    if not A.IsTextWidget(widget) then return end
    local function apply(self,source)
        if A.IsWriting(self) or type(source)~="string" then return false end
        return A.WriteText(self,A.PreserveTextColor(source,resolve(source)))
    end
    hookMethod(widget,"SetText",apply,slot)
    return apply(widget,widget:GetText())
end

function A.BindCatalogPool(hookMethod,pool,bind,slot)
    if not pool or pool.IsForbidden and pool:IsForbidden() or type(pool.EnumerateActive)~="function" then return end
    local function refresh()
        for object in pool:EnumerateActive() do
            if object and not (object.IsForbidden and object:IsForbidden()) then bind(object) end
        end
    end
    -- Acquire has registered its object before returning to the caller. Bind
    -- there, so the caller's SetText/layout uses Chinese on the first display.
    hookMethod(pool,"Acquire",refresh,slot)
    refresh()
end

function A.UpdateCatalogTooltip(tooltip,scope,firstName,allNames)
    if not tooltip or tooltip.IsForbidden and tooltip:IsForbidden() or not tooltip.GetName or not tooltip.NumLines then return end
    local name=tooltip:GetName()
    if type(name)~="string" then return end
    local changed=false
    for i=1,tooltip:NumLines() do
        local widget=_G[name.."TextLeft"..i]
        if A.IsTextWidget(widget) then
            local source=widget:GetText()
            local text=(i==1 or allNames) and firstName and firstName(source)
            text=text or A.FindCatalog(scope,source)
            if text and A.WriteText(widget,A.PreserveTextColor(source,A.Render(text))) then changed=true end
        end
    end
    if changed and tooltip.Show then tooltip:Show() end
    return changed
end

function A.UpdateCatalogMenu(menu,scope,level,resolve)
    if not menu or UIDROPDOWNMENU_INIT_MENU~=menu then return end
    local list=_G["DropDownList"..(level or 1)]
    if list and list.IsForbidden and list:IsForbidden() then return end
    local button=list and _G["DropDownList"..(level or 1).."Button"..(list.numButtons or 0)]
    if not button or button.IsForbidden and button:IsForbidden() then return end
    local name=button.GetName and button:GetName()
    local widget=type(name)=="string" and _G[name.."NormalText"] or button.GetFontString and button:GetFontString() or button.NormalText
    if not A.IsTextWidget(widget) then return end
    local source=widget:GetText()
    if type(source)~="string" then return end
    local text=resolve and resolve(source) or A.FindCatalog(scope,source)
    if text then A.WriteText(widget,A.PreserveTextColor(source,A.Render(text))) end
    -- Shared dropdown buttons are also used for player text. Never bind their
    -- SetText method; only this known menu's current population may translate.
end
