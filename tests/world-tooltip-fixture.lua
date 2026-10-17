UIParent={};WorldFrame={};mouseFocus=WorldFrame;mouseoverUnit=nil
function GetMouseFocus() return mouseFocus end
function UnitExists(unit) return unit=="mouseover" and mouseoverUnit~=nil end
function GetLocale() return "zhCN" end
GameTooltip=ScriptFrame();GameTooltip.shown=false;GameTooltip.owner=UIParent
GameTooltipTextLeft1=Widget("");GameTooltipTextLeft2=Widget("unchanged extra line")
function GameTooltip:IsShown() return self.shown end
function GameTooltip:IsForbidden() return self.forbidden end
function GameTooltip:GetOwner() return self.owner end
function GameTooltip:GetUnit() return self.unitName,self.unit end
function GameTooltip:GetItem() return self.item,self.itemLink end
function GameTooltip:GetSpell() return self.spell,self.spellRank,self.spellID end
function GameTooltip:Show()
    self.resizes=(self.resizes or 0)+1
    if not self.shown then self.shown=true;self:Fire("OnShow") end
end
function GameTooltip:Hide() self.shown=false;self:Fire("OnHide") end
GameTooltip:SetScript("OnUpdate",function(self) self.nativeUpdates=(self.nativeUpdates or 0)+1 end)
function WorldHover(text)
    GameTooltip:Fire("OnTooltipCleared")
    GameTooltipTextLeft1:SetText(text)
    GameTooltip.unitName=nil;GameTooltip.unit=nil;GameTooltip.item=nil;GameTooltip.itemLink=nil;GameTooltip.spell=nil;GameTooltip.spellID=nil;GameTooltip.spellRank=nil
    GameTooltip.owner=UIParent;mouseFocus=WorldFrame;mouseoverUnit=nil
    GameTooltip:Show();GameTooltip:Fire("OnUpdate",0.016)
end
