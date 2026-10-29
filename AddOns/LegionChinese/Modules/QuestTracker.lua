-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
-- Run inside the quest module's layout, before the next line/block is anchored.
-- Updating text after ObjectiveTracker_Update would leave stale heights and can
-- overlap later objectives, timers, item buttons and the next quest.
function A.UpdateTrackerHeader(module, block, text, _, _, questID)
    if not block or not block.HeaderText then
        return
    end
    local widget = block.HeaderText
    if A.Apply(widget, "Quests", questID or block.id, "Title", text) then
        block.height = module:SetStringText(widget, widget:GetText(), nil, OBJECTIVE_TRACKER_COLOR["Header"])
    end
end

function A.UpdateTrackerObjective(module, block, key, text, _, useFullHeight, _, colorStyle)
    local line = block and block.lines and block.lines[key]
    if
        not line
        or not line.Text
        or line.Text.IsForbidden and line.Text:IsForbidden()
        or line.Text:GetText() ~= text
    then
        return
    end
    local oldHeight = line:GetHeight()
    local changed
    if
        type(key) == "number"
        and key == 0
        and (module == BONUS_OBJECTIVE_TRACKER_MODULE or module == WORLD_QUEST_TRACKER_MODULE)
        and type(block.id) == "number"
        and block.id > 0
    then
        changed = A.Apply(line.Text, "Quests", block.id, "Title", text)
    elseif type(key) == "number" then
        changed = A.Apply(line.Text, "Objectives", block.id)
        if
            not changed
            and type(text) == "string"
            and (
                module == QUEST_TRACKER_MODULE
                or module == SCENARIO_TRACKER_MODULE
                or module == BONUS_OBJECTIVE_TRACKER_MODULE
                or module == WORLD_QUEST_TRACKER_MODULE
            )
        then
            -- Quest objectives and criteria may put counts before the label.
            -- Preserve live progress and match the complete objective wording.
            local prefix, body = text:match("^(%d+%s*/%s*%d+%s+)(.+)$")
            if body then
                local translated, updated = A.Translate("Objectives", body, block.id)
                if updated then
                    A.SetFont(line.Text)
                    line.Text:SetText(prefix .. translated)
                    changed = true
                end
            end
        end
    elseif key == "QuestComplete" then
        local index = GetQuestLogIndexByID and GetQuestLogIndexByID(block.id)
        local completion = index
            and index > 0
            and GetQuestLogCompletionText
            and GetQuestLogCompletionText(index)
        if completion and completion == text then
            changed = A.Apply(line.Text, "Quests", block.id, "CompletionLog", completion)
        end
    end
    if changed then
        local height = module:SetStringText(
            line.Text,
            line.Text:GetText(),
            useFullHeight,
            colorStyle,
            block.isHighlighted
        )
        line:SetHeight(height)
        block.height = block.height + height - oldHeight
    end
end

function A.RefreshTracker()
    if
        QUEST_TRACKER_MODULE
        and ObjectiveTrackerFrame
        and ObjectiveTrackerFrame.initialized
        and ObjectiveTracker_Update
    then
        ObjectiveTracker_Update(OBJECTIVE_TRACKER_UPDATE_MODULE_QUEST)
    end
end
