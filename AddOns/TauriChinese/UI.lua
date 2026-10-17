-- SPDX-License-Identifier: GPL-2.0-or-later
local A = TauriChinese
local installed = {}
local function hook(name, callback)
    if not installed[name] and type(_G[name])=="function" then
        hooksecurefunc(name,function(...) if A.Enabled() then callback(...) end end)
        installed[name]=true
    end
end

local function currentQuestID()
    if QuestInfoFrame and QuestInfoFrame.questLog then
        if GetQuestLogTitle and GetQuestLogSelection then return select(8,GetQuestLogTitle(GetQuestLogSelection())) end
    elseif GetQuestID then return GetQuestID() end
end

function A.UpdateQuestInfo()
    local id=currentQuestID()
    A.Apply(QuestInfoTitleHeader,"Quests",id,"Title")
    A.Apply(QuestInfoDescriptionText,"Quests",id,"Description")
    A.Apply(QuestInfoObjectivesText,"Quests",id,"Objectives")
    A.Apply(QuestInfoRewardText,"Quests",id,"Completion")
    if QuestInfoObjectivesFrame and QuestInfoObjectivesFrame.Objectives then
        for _,widget in ipairs(QuestInfoObjectivesFrame.Objectives) do A.Apply(widget,"Objectives") end
    end
end

function A.UpdateProgress()
    local id=GetQuestID and GetQuestID()
    A.Apply(QuestProgressTitleText,"Quests",id,"Title")
    A.Apply(QuestProgressText,"Quests",id,"Progress")
end

function A.UpdateGossip()
    A.Apply(GossipGreetingText,"Gossip")
    for i=1,NUMGOSSIPBUTTONS or 32 do
        local button=_G["GossipTitleButton"..i]
        if button and button:IsShown() then
            if A.Apply(button,button.type=="Gossip" and "Gossip" or "Titles") and GossipResize then GossipResize(button) end
        end
    end
    if GossipGreetingScrollFrame and GossipGreetingScrollFrame.UpdateScrollChildRect then GossipGreetingScrollFrame:UpdateScrollChildRect() end
end

function A.UpdateGreeting()
    A.Apply(GreetingText,"Gossip")
    for i=1,32 do
        local button=_G["QuestTitleButton"..i]
        if button and button:IsShown() then A.Apply(button,"Titles") end
    end
end

function A.UpdateQuestList()
    local contents=QuestMapFrame and QuestMapFrame.QuestsFrame and QuestMapFrame.QuestsFrame.Contents
    if not contents then return end
    for _,button in ipairs(contents.Titles or {}) do
        if button:IsShown() and button.questLogIndex and button.Text then
            local id=select(8,GetQuestLogTitle(button.questLogIndex))
            local oldHeight=button.Text:GetStringHeight()
            if A.Apply(button.Text,"Quests",id,"Title") then
                button:SetHeight(button:GetHeight()+button.Text:GetStringHeight()-oldHeight)
            end
        end
    end
end

function A.UpdateBook(_,event)
    if event~="ITEM_TEXT_READY" or not ItemTextGetText or not ItemTextPageText then return end
    local original=ItemTextGetText()
    local translated,changed=A.Translate("Books",original)
    if not changed then return end
    local creator=ItemTextGetCreator and ItemTextGetCreator()
    if creator then translated=translated.."\n\n"..(ITEM_TEXT_FROM or "作者").."\n"..creator.."\n" end
    A.SetFont(ItemTextPageText,true)
    ItemTextPageText:SetText(translated)
    if ItemTextScrollFrame and ItemTextScrollFrame.UpdateScrollChildRect then
        local child=ItemTextScrollFrame:GetScrollChild()
        if child then child:SetHeight(1) end
        ItemTextScrollFrame:UpdateScrollChildRect()
        local range=ItemTextScrollFrame:GetVerticalScrollRange()
        if child and range and range>0 then child:SetHeight(ItemTextScrollFrame:GetHeight()+range+30) end
    end
end

local function install()
    hook("QuestInfo_Display",A.UpdateQuestInfo)
    hook("QuestFrameProgressPanel_OnShow",A.UpdateProgress)
    hook("QuestFrameGreetingPanel_OnShow",A.UpdateGreeting)
    hook("GossipFrameUpdate",A.UpdateGossip)
    hook("ItemTextFrame_OnEvent",A.UpdateBook)
    hook("QuestLogQuests_Update",A.UpdateQuestList)
end
local frame=CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_LOGIN")
frame:SetScript("OnEvent",function(_,event,addonName)
    if event=="PLAYER_LOGIN" or (event=="ADDON_LOADED" and addonName=="TauriChinese") then
        A.InitializeSettings()
    end
    install()
    if event=="PLAYER_LOGIN" and not TauriChineseSettings.welcomeSeen then A.ShowWelcome() end
end)
install()

SLASH_TAURICHINESE1="/tcn"
SlashCmdList.TAURICHINESE=function(command)
    A.InitializeSettings()
    command=(command or ""):lower():gsub("%s","")
    if command=="off" or command=="关" then
        TauriChineseSettings.enabled=false
        print("TauriChinese：已关闭，重新打开窗口后生效。")
    elseif command=="on" or command=="开" then
        TauriChineseSettings.enabled=true
        print("TauriChinese：已开启，已有中文保持不变，缺失译文保留原文。")
    elseif command=="about" or command=="关于" then
        A.ShowWelcome()
    else
        print("TauriChinese："..(A.Enabled() and "已开启" or "已关闭").."。/tcn on 开启，/tcn off 关闭，/tcn about 关于与反馈。")
    end
end
