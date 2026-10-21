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
