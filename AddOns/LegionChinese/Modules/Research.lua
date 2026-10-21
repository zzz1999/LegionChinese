-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local function tooltip(button)
    local tip=GameTooltip
    if not button or button.IsForbidden and button:IsForbidden() or not button.talent
        or not tip or not tip.GetOwner or tip:GetOwner()~=button then return end
    A.UpdateCatalogTooltip(tip,"Garrison")
end
local function bindButtons(hookMethod,hookScript)
    local frame=OrderHallTalentFrame
    if not frame or frame.IsForbidden and frame:IsForbidden() then return end
    A.BindCatalogPool(hookMethod,frame.buttonPool,function(button)
        -- The native timer directly calls a method copied by the XML mixin.
        -- Hook each real button as well as its mouse script and prototype.
        hookMethod(button,"OnEnter",tooltip)
        hookScript(button,"OnEnter",tooltip)
    end)
end
function A.InstallResearch(hook,hookMethod,hookScript)
    hookMethod(GarrisonTalentButtonMixin,"OnEnter",tooltip)
    for _,frame in pairs({OrderHallTalentFrameMixin,OrderHallTalentFrame}) do
        hookMethod(frame,"OnLoad",function() bindButtons(hookMethod,hookScript) end)
        hookMethod(frame,"RefreshAllData",function() bindButtons(hookMethod,hookScript) end)
    end
    bindButtons(hookMethod,hookScript)
end
