-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
local empty = {}

local function lookup(index, source, condition)
    if not index or type(source) ~= "string" or source == "" or A.IsChinese(source) then
        return
    end
    local value
    if condition then
        value = index[A.Fingerprint(A.Normalize(source, false))]
            or index[A.Fingerprint(A.Normalize(source, true))]
        if value then
            value = A.Render(value)
        end
    else
        value = index[A.NameFingerprint(source) or ""]
    end
    if not value or not A.IsChinese(value) then
        return
    end
    local color = source:match("^(|c%x%x%x%x%x%x%x%x)")
    if color and source:sub(-2) == "|r" then
        value = color .. value .. "|r"
    end
    return value
end

local function setText(widget, text, html)
    return A.WriteText(widget, text, html)
end

function A.ResolveArtifactChoice(choiceID, responseID, field, source)
    if
        type(source) ~= "string"
        or A.IsChinese(source)
        or source:find("|H", 1, true)
        or source:find("|T", 1, true)
    then
        return
    end
    local choice = (A.Data.Get("ArtifactChoices") or empty)[tonumber(choiceID)]
    local option = choice and choice.Options[tonumber(responseID)]
    local index = choice and (field == "Question" and choice.Question or option and option[field])
    local text = index and index[A.Fingerprint(A.Normalize(source, false))]
    local color = source:match("^(|c%x%x%x%x%x%x%x%x)")
    if text and color and source:sub(-2) == "|r" then
        text = color .. text .. "|r"
    end
    return text
end

local function hookChoiceWidget(hookMethod, frame, option, widget, field)
    -- SimpleHTML has SetText without a FontString-style GetText on some
    -- supported clients. Its future writes must still receive the hook.
    if not widget or not widget.SetText or widget.IsForbidden and widget:IsForbidden() then
        return false
    end
    local function apply(self, source)
        if A.IsWriting(self) or type(source) ~= "string" or source == "" or A.IsChinese(source) then
            return
        end
        local text = A.ResolveArtifactChoice(frame.choiceID, option and option.optID, field, source)
        if not text and field == "Header" and A.ResolveQuestBoardHeader then
            text = A.ResolveQuestBoardHeader(frame.choiceID, option and option.optID, source)
        elseif not text and field == "Answer" and A.ResolveQuestBoardAnswer then
            text = A.ResolveQuestBoardAnswer(frame.choiceID, option and option.optID, source)
        end
        return setText(self, text, field == "Description")
    end
    hookMethod(widget, "SetText", apply)
    if widget.GetText then
        return apply(widget, widget:GetText())
    end
end

local function choiceWidgets(hookMethod, choice)
    if not choice or choice.IsForbidden and choice:IsForbidden() then
        return
    end
    hookChoiceWidget(hookMethod, choice, nil, choice.QuestionText, "Question")
    local changed = false
    for _, option in ipairs(choice.Options or {}) do
        if not (option.IsForbidden and option:IsForbidden()) then
            hookChoiceWidget(hookMethod, choice, option, option.OptionButton, "Answer")
            changed = hookChoiceWidget(hookMethod, choice, option, option.OptionText, "Description")
                or changed
            hookChoiceWidget(hookMethod, choice, option, option.Header and option.Header.Text, "Header")
        end
    end
    -- If installation followed an already populated dialog, schedule one
    -- native layout. Subsequent updates translate at SetText before measuring.
    if changed then
        if choice.SetPendingUpdate then
            choice:SetPendingUpdate()
        else
            choice.hasPendingUpdate = true
        end
    end
end

function A.ResolveArtifactTitle(source, appearanceID)
    local appearance = (A.Data.Get("ArtifactAppearances") or empty)[tonumber(appearanceID)]
    local set = appearance and (A.Data.Get("ArtifactAppearanceSets") or empty)[appearance.SetID]
    if appearance then
        return lookup(appearance.Name, source)
            or lookup(set and (A.Data.Get("ArtifactNames") or empty)[set.ArtifactID], source)
    end
    -- Queued trait-available banners contain the original title but no artifact
    -- ID. Only the globally unambiguous full title is safe after a weapon swap.
    return lookup((A.Data.Get("ArtifactTitleNames") or empty), source)
end

function A.UpdateArtifactTitle(self)
    local widget = self and self.ArtifactName
    if not widget or not widget.GetText or not C_ArtifactUI or not C_ArtifactUI.GetArtifactInfo then
        return
    end
    local appearanceID = select(8, C_ArtifactUI.GetArtifactInfo())
    setText(widget, A.ResolveArtifactTitle(widget:GetText(), appearanceID))
end

function A.UpdateArtifactAppearanceSet(_, frame, appearanceID)
    local appearance = (A.Data.Get("ArtifactAppearances") or empty)[tonumber(appearanceID)]
    local record = appearance and (A.Data.Get("ArtifactAppearanceSets") or empty)[appearance.SetID]
    if not record or not frame then
        return
    end
    if frame.Name and frame.Name.GetText then
        setText(frame.Name, lookup(record.Name, frame.Name:GetText()))
    end
    local area = frame.DescriptionTooltipArea
    if area then
        area.tooltip = lookup(record.Description, area.tooltip) or area.tooltip
    end
end

function A.ResolveArtifactCondition(appearanceID, source)
    local appearance = (A.Data.Get("ArtifactAppearances") or empty)[tonumber(appearanceID)]
    return appearance
        and lookup((A.Data.Get("ArtifactConditions") or empty)[appearance.ConditionID], source, true)
end

function A.UpdateArtifactAppearanceTooltip(slot)
    local tooltip = GameTooltip
    if
        not tooltip
        or tooltip.IsForbidden and tooltip:IsForbidden()
        or not tooltip.GetOwner
        or tooltip:GetOwner() ~= slot
        or not tooltip.IsShown
        or not tooltip:IsShown()
    then
        return
    end
    local widget = GameTooltipTextLeft1
    if not widget or not widget.GetText then
        return
    end
    local source = widget:GetText()
    -- Do not replace a different tooltip installed by another addon.
    if source ~= slot.unlockConditionText then
        return
    end
    local text = A.ResolveArtifactCondition(slot.appearanceID, source)
    if text then
        setText(widget, text)
        tooltip:Show()
    end
end

function A.UpdateArtifactAppearances(self, hookScript)
    local pool = self and self.appearanceSlotPool
    if not pool or not pool.EnumerateActive then
        return
    end
    for slot in pool:EnumerateActive() do
        hookScript(slot, "OnEnter", A.UpdateArtifactAppearanceTooltip)
        A.UpdateArtifactAppearanceTooltip(slot)
    end
end

function A.UpdateArtifactPowerTooltip(self, powerID)
    if not A.UpdateExtraTooltip then
        return
    end
    local record = (A.Data.Get("ArtifactPowerSpells") or empty)[tonumber(powerID)]
    local info = record and C_ArtifactUI and C_ArtifactUI.GetPowerInfo and C_ArtifactUI.GetPowerInfo(powerID)
    local spellID = type(info) == "table" and tonumber(info.spellID)
    -- Resolve the current rank through the live API. Never pick a rank from
    -- offline data or evaluate $s1 / $AP / conditional spell formulas here.
    A.UpdateExtraTooltip(self, "spell", spellID and record[spellID] and spellID or 0)
end

function A.InstallArtifacts(hookMethod, hookScript)
    local choice = QuestChoiceFrame
    for _, frame in pairs({ choice, QuestChoiceFrameMixin }) do
        hookMethod(frame, "Update", function(self)
            choiceWidgets(hookMethod, self)
        end)
    end
    choiceWidgets(hookMethod, choice)
    local artifact = ArtifactFrame
    if artifact then
        hookMethod(
            artifact.PerksTab and artifact.PerksTab.TitleContainer,
            "RefreshTitle",
            A.UpdateArtifactTitle
        )
        hookMethod(artifact.AppearancesTab, "AddAppearanceSlot", A.UpdateArtifactAppearanceSet)
        hookMethod(artifact.AppearancesTab, "Refresh", function(tab)
            A.UpdateArtifactAppearances(tab, hookScript)
        end)
    end
    hookMethod(ArtifactLevelUpToast, "PlayBanner", function(self)
        local widget = self.ArtifactName
        if widget and widget.GetText then
            setText(widget, A.ResolveArtifactTitle(widget:GetText()))
        end
    end)
    for _, tooltip in pairs({ GameTooltip, ItemRefTooltip }) do
        if not (tooltip.IsForbidden and tooltip:IsForbidden()) then
            hookMethod(tooltip, "SetArtifactPowerByID", A.UpdateArtifactPowerTooltip)
        end
    end
end
