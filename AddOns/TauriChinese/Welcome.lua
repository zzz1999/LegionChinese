-- SPDX-License-Identifier: GPL-2.0-or-later
local A = TauriChinese
local feedbackURL = "https://github.com/zzz1999/TauriChinese/issues"
local window

local function label(parent, text, size, color)
    local widget=parent:CreateFontString(nil,"OVERLAY","GameFontNormal")
    A.SetFont(widget,false,size or 14)
    widget:SetJustifyH("LEFT")
    widget:SetJustifyV("TOP")
    widget:SetWidth(504)
    color=color or {0.92,0.92,0.92}
    widget:SetTextColor(color[1],color[2],color[3])
    widget:SetText(text)
    return widget
end

function A.ShowWelcome()
    local settings=A.InitializeSettings()
    if not window then
        window=CreateFrame("Frame","TauriChineseWelcomeFrame",UIParent,"BasicFrameTemplateWithInset")
        window:Hide()
        window:SetSize(552,400)
        window:SetPoint("CENTER")
        window:SetFrameStrata("DIALOG")
        window:SetClampedToScreen(true)
        window:EnableMouse(true)
        window:SetMovable(true)
        window:RegisterForDrag("LeftButton")
        window:SetScript("OnDragStart",window.StartMoving)
        window:SetScript("OnDragStop",window.StopMovingOrSizing)
        A.SetFont(window.TitleText,false,14)
        window.TitleText:SetText("关于 TauriChinese")

        local version=(GetAddOnMetadata and GetAddOnMetadata("TauriChinese","Version")) or ""
        local heading=label(window,"TauriChinese  "..version,18,{1,0.82,0})
        heading:SetPoint("TOPLEFT",24,-44)

        local intro=label(window,"面向《魔兽世界》军团再临 7.3.5 的离线中文插件。\n任务、NPC 对话、书籍及读条名称：简体优先，繁体补充，缺失保留原文。已有中文保持不变。\n内置法术译名；宠物只翻译可靠的默认名称，随机名字及自定义名字保留。")
        intro:SetPoint("TOPLEFT",heading,"BOTTOMLEFT",0,-14)

        local credits=label(window,"作者与维护：zzz1999\n灵感来源：TauriHun（WorldOfHuncraft）\n感谢 TrinityCore、The Legion Preservation Project、MagicStorm、AzerothCore 和 Wago.Tools 的资料贡献。")
        credits:SetPoint("TOPLEFT",intro,"BOTTOMLEFT",0,-14)

        local feedback=label(window,"遇到缺失译文、显示异常，或有改进建议，请到 GitHub Issues 反馈。附上客户端版本、任务或 NPC 名称及截图，有助于定位问题。")
        feedback:SetPoint("TOPLEFT",credits,"BOTTOMLEFT",0,-14)

        local address=CreateFrame("EditBox",nil,window,"InputBoxTemplate")
        address:SetSize(494,24)
        address:SetPoint("TOPLEFT",feedback,"BOTTOMLEFT",5,-12)
        A.SetFont(address,false,14)
        address:SetAutoFocus(false)
        address:SetMaxLetters(200)
        address:SetText(feedbackURL)
        address:SetCursorPosition(0)
        address:SetScript("OnTextChanged",function(self)
            if self:GetText()~=feedbackURL then self:SetText(feedbackURL) end
        end)
        address:SetScript("OnMouseUp",function(self) self:HighlightText() end)
        address:SetScript("OnEscapePressed",function(self) self:ClearFocus();window:Hide() end)
        address:SetScript("OnEnterPressed",function(self) self:ClearFocus() end)
        window.feedbackAddress=address

        local hint=label(window,"点击网址后按 Ctrl+C 复制，再在浏览器中打开。",12,{0.75,0.75,0.75})
        hint:SetPoint("TOPLEFT",address,"BOTTOMLEFT",-5,-6)
        window.status=label(window,"",13,{1,0.82,0})
        window.status:SetPoint("TOPLEFT",hint,"BOTTOMLEFT",0,-14)

        local close=CreateFrame("Button",nil,window,"UIPanelButtonTemplate")
        close:SetSize(120,26)
        close:SetPoint("TOP",window.status,"BOTTOM",0,-18)
        close:SetText("知道了")
        A.SetFont(close,false,14)
        close:SetScript("OnClick",function() window:Hide() end)
        window.dismissButton=close
        window:SetScript("OnHide",function() address:ClearFocus() end)
        UISpecialFrames[#UISpecialFrames+1]="TauriChineseWelcomeFrame"
        window.content={heading,intro,credits,feedback,hint}
    end
    window.status:SetText((A.Enabled() and "汉化已开启" or "汉化已关闭").."。/tcn on 开启，/tcn off 关闭。\n使用 /tcn about 可再次打开此窗口。")
    local height=44+14+14+14+12+24+6+14+18+26+22
    for _,widget in ipairs(window.content) do height=height+widget:GetStringHeight() end
    window:SetHeight(height+window.status:GetStringHeight())
    window:Show()
    settings.welcomeSeen=true
end
