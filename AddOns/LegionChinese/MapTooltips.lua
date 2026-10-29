-- SPDX-License-Identifier: GPL-2.0-or-later
local A = LegionChinese
local writing = false

function A.UpdateMapQuestTooltip(tooltip, source)
    if
        writing
        or tooltip ~= WorldMapTooltip
        or not tooltip
        or tooltip.IsForbidden and tooltip:IsForbidden()
        or not tooltip.GetOwner
        or type(source) ~= "string"
        or source:find("|", 1, true)
        or A.IsChinese(source)
    then
        return
    end
    local owner = tooltip:GetOwner()
    if not owner or owner.IsForbidden and owner:IsForbidden() or not owner.GetName then
        return
    end
    local name = owner:GetName()
    -- Legion's available-quest pins have an index, not a quest ID. Only use
    -- the unambiguous title index after confirming the live quest-line name.
    if
        type(name) ~= "string"
        or not name:match("^WorldMapStoryLine%d+$")
        or _G[name] ~= owner
        or not C_Questline
        or not C_Questline.GetQuestlineInfoByIndex
        or not C_Questline.GetNumAvailableQuestlines
    then
        return
    end
    local index = owner.index
    if
        type(index) ~= "number"
        or index < 1
        or index % 1 ~= 0
        or index > C_Questline.GetNumAvailableQuestlines()
    then
        return
    end
    local _, questName = C_Questline.GetQuestlineInfoByIndex(index)
    if questName ~= source then
        return
    end
    local widget = WorldMapTooltipTextLeft1
    if
        not widget
        or not widget.GetText
        or not widget.SetText
        or widget.IsForbidden and widget:IsForbidden()
        or widget:GetText() ~= source
    then
        return
    end
    local text, changed = A.Translate("Titles", source)
    if not changed then
        return
    end
    writing = true
    A.SetFont(widget)
    widget:SetText(text)
    writing = false
    -- The stock pin adds status/floor lines and calls Show after SetText.
    -- Its normal layout sizes the translated title; no polling is required.
end

local function usable(widget)
    return widget and not (widget.IsForbidden and widget:IsForbidden())
end

-- Keep the quest context supplied by the native map handler. A multi-quest
-- blob can append several quests to the same tooltip, so never translate all
-- its lines using the last quest ID.
function A.UpdateQuestMapLines(tooltip, id, title, completion)
    if
        writing
        or not usable(tooltip)
        or not tooltip.GetName
        or not tooltip.NumLines
        or type(id) ~= "number"
        or id <= 0
        or type(title) ~= "string"
    then
        return
    end
    local name = tooltip:GetName()
    if not name then
        return
    end
    local start
    for i = 1, tooltip:NumLines() do
        local widget = _G[name .. "TextLeft" .. i]
        if usable(widget) and widget.GetText and widget:GetText() == title then
            start = i
        end
    end
    if not start then
        return
    end
    writing = true
    local changed = A.Apply(_G[name .. "TextLeft" .. start], "Quests", id, "Title", title)
    for i = start + 1, tooltip:NumLines() do
        local widget = _G[name .. "TextLeft" .. i]
        if usable(widget) and widget.GetText then
            local source = widget:GetText()
            -- Only native dashed objective/return lines, never rewards,
            -- faction standing, time remaining or other tooltip sections.
            local prefix, body
            if type(source) == "string" then
                prefix, body = source:match("^(%-%s*)(.+)$")
            end
            if body then
                local text, updated
                if completion and completion ~= "" and body == completion then
                    text, updated = A.Translate("Quests", body, id, "CompletionLog")
                else
                    text, updated = A.Translate("Objectives", body, id)
                end
                if updated then
                    A.SetFont(widget)
                    widget:SetText(prefix .. text)
                    changed = true
                end
            end
        end
    end
    if changed and tooltip.Show then
        tooltip:Show()
    end
    writing = false
end

function A.UpdateLoggedQuestMapTooltip(_, index)
    if not GetQuestLogTitle or type(index) ~= "number" or index < 1 then
        return
    end
    local title, _, _, _, _, _, _, id = GetQuestLogTitle(index)
    A.UpdateQuestMapLines(
        WorldMapTooltip,
        id,
        title,
        GetQuestLogCompletionText and GetQuestLogCompletionText(index)
    )
end

function A.UpdateTaskMapTooltip(tooltip)
    if writing or tooltip ~= WorldMapTooltip or not usable(tooltip) or not tooltip.GetOwner then
        return
    end
    local owner = tooltip:GetOwner()
    if not usable(owner) or not owner.GetName then
        return
    end
    local name = owner:GetName()
    if
        type(name) ~= "string"
        or not name:match("^WorldMapFrameTaskPOI%d+$")
        or _G[name] ~= owner
        or not C_TaskQuest
        or not C_TaskQuest.GetQuestInfoByQuestID
    then
        return
    end
    local id = owner.questID
    if type(id) ~= "number" or id <= 0 or HaveQuestData and not HaveQuestData(id) then
        return
    end
    A.UpdateQuestMapLines(tooltip, id, C_TaskQuest.GetQuestInfoByQuestID(id))
end

function A.InstallMapTooltips(hookMethod, hook)
    hookMethod(WorldMapTooltip, "SetText", A.UpdateMapQuestTooltip)
    hookMethod(WorldMapTooltip, "Show", A.UpdateTaskMapTooltip)
    if hook then
        hook("WorldMapQuestPOI_SetTooltip", A.UpdateLoggedQuestMapTooltip)
        hook("WorldMapQuestPOI_AppendTooltip", A.UpdateLoggedQuestMapTooltip)
    end
end
