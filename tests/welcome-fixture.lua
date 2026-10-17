-- Model lifecycle, focus and text; this fixture does not simulate real rendering.
UISpecialFrames={};UIParent={};frames={}
local function region()
    local r={scripts={},shown=true,text=""}
    function r:SetScript(event,callback) self.scripts[event]=callback end
    function r:SetText(text)
        self.text=text
        if self.scripts.OnTextChanged then self.scripts.OnTextChanged(self) end
    end
    function r:GetText() return self.text end
    function r:GetFont() return self.font or STANDARD_TEXT_FONT or "OriginalFont",self.fontSize or 14,self.flags or "" end
    function r:SetFont(font,size,flags) self.font=font;self.fontSize=size;self.flags=flags;return true end
    function r:SetTextColor(...) self.color={...} end
    function r:SetJustifyH() end
    function r:SetJustifyV() end
    function r:SetWidth(value) self.width=value end
    function r:SetHeight(value) self.height=value end
    function r:SetSize(width,height) self.width=width;self.height=height end
    function r:SetPoint(...) self.point={...} end
    function r:GetStringHeight() return 32 end
    function r:GetFontString() self.fontString=self.fontString or region();return self.fontString end
    function r:CreateFontString(_,_,template) local child=region();child.template=template;return child end
    function r:Show() self.shown=true;self.shows=(self.shows or 0)+1 end
    function r:Hide() self.shown=false;if self.scripts.OnHide then self.scripts.OnHide(self) end end
    function r:IsShown() return self.shown end
    function r:SetFrameStrata() end
    function r:SetClampedToScreen() end
    function r:EnableMouse() end
    function r:SetMovable() end
    function r:RegisterForDrag() end
    function r:StartMoving() end
    function r:StopMovingOrSizing() end
    function r:SetAutoFocus(value) self.autoFocus=value end
    function r:SetMaxLetters() end
    function r:SetCursorPosition(value) self.cursor=value end
    function r:ClearFocus() self.focused=false end
    function r:HighlightText() self.highlighted=true end
    function r:RegisterEvent() end
    return r
end
function CreateFrame(kind,name,parent,template)
    local frame=region();frame.kind=kind;frame.template=template;frame.parent=parent
    if name then _G[name]=frame end
    if template=="BasicFrameTemplateWithInset" then frame.TitleText=region() end
    frames[#frames+1]=frame;return frame
end
function GetAddOnMetadata() return "0.1.2+build.test" end
