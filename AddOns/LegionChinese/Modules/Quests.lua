-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
local function currentQuest()
    if QuestInfoFrame and QuestInfoFrame.questLog then
        if GetQuestLogTitle and GetQuestLogSelection then
            local title, _, _, _, _, _, _, id = GetQuestLogTitle(GetQuestLogSelection())
            return id, title
        end
    elseif GetQuestID then
        return GetQuestID(), GetTitleText and GetTitleText()
    end
end

function A.UpdateQuestInfo()
    local id, title = currentQuest()
    A.Apply(QuestInfoTitleHeader, "Quests", id, "Title", title)
    A.Apply(QuestInfoDescriptionText, "Quests", id, "Description")
    A.Apply(QuestInfoObjectivesText, "Quests", id, "Objectives")
    A.Apply(QuestInfoRewardText, "Quests", id, "Completion")
    if QuestInfoObjectivesFrame and QuestInfoObjectivesFrame.Objectives then
        for _, widget in ipairs(QuestInfoObjectivesFrame.Objectives) do
            A.Apply(widget, "Objectives", id)
        end
    end
end

function A.UpdateProgress()
    local id = GetQuestID and GetQuestID()
    A.Apply(QuestProgressTitleText, "Quests", id, "Title", GetTitleText and GetTitleText())
    A.Apply(QuestProgressText, "Quests", id, "Progress")
end

function A.UpdateGossip()
    A.Apply(GossipGreetingText, "Gossip")
    for i = 1, NUMGOSSIPBUTTONS or 32 do
        local button = _G["GossipTitleButton" .. i]
        if button and button:IsShown() then
            if A.Apply(button, button.type == "Gossip" and "Gossip" or "Titles") and GossipResize then
                GossipResize(button)
            end
        end
    end
    if GossipGreetingScrollFrame and GossipGreetingScrollFrame.UpdateScrollChildRect then
        GossipGreetingScrollFrame:UpdateScrollChildRect()
    end
end

function A.UpdateGreeting()
    local changed = A.Apply(GreetingText, "Gossip")
    for i = 1, MAX_NUM_QUESTS or 32 do
        local button = _G["QuestTitleButton" .. i]
        if button and button:IsShown() and A.Apply(button, "Titles") then
            button:SetHeight(button:GetTextHeight() + 2)
            changed = true
        end
    end
    if changed and QuestGreetingScrollFrame and QuestGreetingScrollFrame.UpdateScrollChildRect then
        QuestGreetingScrollFrame:UpdateScrollChildRect()
    end
end

function A.UpdateQuestList()
    local contents = QuestMapFrame and QuestMapFrame.QuestsFrame and QuestMapFrame.QuestsFrame.Contents
    if not contents then
        return
    end
    local quests, changed = {}, false
    for _, button in ipairs(contents.Titles or {}) do
        if button:IsShown() and button.questLogIndex and button.Text then
            local title, _, _, _, _, _, _, id = GetQuestLogTitle(button.questLogIndex)
            if id then
                quests[id] = button
            end
            local oldHeight = button.Text:GetStringHeight()
            if A.Apply(button.Text, "Quests", id, "Title", title) then
                button:SetHeight(button:GetHeight() + button.Text:GetStringHeight() - oldHeight)
                if button.Check and button.Check:IsShown() then
                    button.Check:SetPoint("LEFT", button.Text, button.Text:GetWrappedWidth() + 2, 0)
                end
                changed = true
            end
        end
    end
    -- Legion's objective pool is local to Blizzard, but its frames are named
    -- QLOF1, QLOF2, ... . Read existing frames only; do not allocate through
    -- QuestLog_GetObjectiveFrame or alter the quest-log selection.
    local i = 1
    while _G["QLOF" .. i] do
        local objective = _G["QLOF" .. i]
        local button = quests[objective.questID]
        if button and objective:IsShown() and objective.Text then
            local original = objective.Text:GetText()
            local completion = GetQuestLogCompletionText and GetQuestLogCompletionText(button.questLogIndex)
            local oldHeight = objective.Text:GetStringHeight()
            local updated
            if completion and completion ~= "" and original == completion then
                updated = A.Apply(objective.Text, "Quests", objective.questID, "CompletionLog", completion)
            else
                updated = A.Apply(objective.Text, "Objectives", objective.questID)
            end
            if updated then
                local height = objective.Text:GetStringHeight()
                objective:SetHeight(height)
                button:SetHeight(button:GetHeight() + height - oldHeight)
                changed = true
            end
        end
        i = i + 1
    end
    if changed and QuestScrollFrame and QuestScrollFrame.UpdateScrollChildRect then
        QuestScrollFrame:UpdateScrollChildRect()
    end
end

function A.UpdateQuestPortrait(parent, _, text, name)
    local id, stage
    if parent == QuestFrame then
        id = GetQuestID and GetQuestID()
        stage = QuestFrameRewardPanel and QuestFrameRewardPanel:IsShown() and "PortraitTurnIn"
            or "PortraitGiver"
    else
        if GetQuestLogTitle and GetQuestLogSelection then
            local _, _, _, _, _, _, _, selected = GetQuestLogTitle(GetQuestLogSelection())
            id = selected
        end
        stage = "PortraitGiver"
    end
    A.Apply(QuestNPCModelNameText, "Quests", id, stage .. "Name", name)
    if A.Apply(QuestNPCModelText, "Quests", id, stage .. "Text", text) and QuestFrame_UpdatePortraitText then
        QuestFrame_UpdatePortraitText(QuestNPCModelText:GetText())
    end
end

function A.UpdateGossipConfirmation(which)
    if which ~= "GOSSIP_CONFIRM" then
        return
    end
    for i = 1, STATICPOPUP_NUMDIALOGS or 4 do
        local popup = _G["StaticPopup" .. i]
        if popup and popup.which == which and popup:IsShown() then
            A.Apply(popup.text or _G["StaticPopup" .. i .. "Text"], "Gossip")
        end
    end
end
