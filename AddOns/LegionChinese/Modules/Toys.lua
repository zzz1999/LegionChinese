-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local function toyName(source,id)
    if type(id)~="number" or id<=0 or id%1~=0 then return end
    return A.ResolveItemName and A.ResolveItemName(source,id,"item:"..id)
end
local function button(hookMethod,widget)
    if not widget or widget.IsForbidden and widget:IsForbidden() then return end
    A.BindResolvedText(hookMethod,widget.name,function(source) return toyName(source,widget.itemID) end)
end
local function buttons(hookMethod)
    local icons=ToyBox and ToyBox.iconsFrame
    if not icons or icons.IsForbidden and icons:IsForbidden() then return end
    for i=1,18 do button(hookMethod,icons["spellButton"..i]) end
end
function A.InstallToys(hook,hookMethod)
    hook("ToySpellButton_UpdateButton",function(widget) button(hookMethod,widget) end)
    hook("ToyBox_UpdateButtons",function() buttons(hookMethod) end)
    for _,tooltip in pairs({GameTooltip,ItemRefTooltip}) do
        hookMethod(tooltip,"SetToyByItemID",function(self,id)
            A.UpdateCatalogTooltip(self,"Collection",function(source) return toyName(source,id) end)
            if A.UpdateItemTooltip then A.UpdateItemTooltip(self) end
        end)
    end
    buttons(hookMethod)
end
