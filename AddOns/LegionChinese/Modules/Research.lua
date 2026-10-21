-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local function usable(frame) return frame and not (frame.IsForbidden and frame:IsForbidden()) end
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
        -- The native timer calls the method copied onto the real XML button.
        hookMethod(button,"OnEnter",tooltip)
        hookScript(button,"OnEnter",tooltip)
    end)
end
local function confirmation(data)
    local button=type(data)=="table" and data.button
    local talent=usable(button) and button.talent
    if type(talent)~="table" or talent.id~=data.id or not button.GetParent then return end
    local text=A.FindCatalog("Garrison",talent.name)
    if not text then return end
    text=A.Render(text)
    if not text then return end
    local parent=button:GetParent()
    if not usable(parent) then return end
    local _,_,texture=GetCurrencyInfo(parent.currency)
    local hasCost=talent.researchCost and talent.researchCost>0
    local hasTime=talent.researchDuration and talent.researchDuration>0
    if hasTime~=data.hasTime then return end
    local function format(name)
        if hasCost and hasTime then
            return string.format(ORDER_HALL_RESEARCH_CONFIRMATION,name,BreakUpLargeNumbers(talent.researchCost),texture,SecondsToTime(talent.researchDuration,false,true))
        elseif hasCost then
            return string.format(ORDER_HALL_RESEARCH_CONFIRMATION_NO_TIME,name,BreakUpLargeNumbers(talent.researchCost),texture)
        elseif hasTime then
            return string.format(ORDER_HALL_RESEARCH_CONFIRMATION_NO_COST,name,SecondsToTime(talent.researchDuration,false,true))
        end
    end
    return format(talent.name),format(text)
end
function A.UpdateResearchConfirmation(which,source,_,data)
    if which~="ORDER_HALL_TALENT_RESEARCH" then return end
    local ok,original,text=pcall(confirmation,data)
    if not ok or not original or source~=original or not text then return end
    for i=1,STATICPOPUP_NUMDIALOGS or 4 do
        local popup=_G["StaticPopup"..i]
        local widget=usable(popup) and (popup.text or _G["StaticPopup"..i.."Text"])
        if widget and popup.which==which and popup.data==data and popup.IsShown and popup:IsShown()
            and A.IsTextWidget(widget) and widget:GetText()==original and A.WriteText(widget,text) then
            if StaticPopup_Resize then StaticPopup_Resize(popup,which) end
        end
    end
end
function A.InstallResearch(hook,hookMethod,hookScript)
    hook("StaticPopup_Show",A.UpdateResearchConfirmation)
    hookMethod(GarrisonTalentButtonMixin,"OnEnter",tooltip)
    for _,frame in pairs({OrderHallTalentFrameMixin,OrderHallTalentFrame}) do
        hookMethod(frame,"OnLoad",function() bindButtons(hookMethod,hookScript) end)
        hookMethod(frame,"RefreshAllData",function() bindButtons(hookMethod,hookScript) end)
    end
    bindButtons(hookMethod,hookScript)
end
