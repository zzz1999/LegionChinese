-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
local castTranslations = {}
local castEvents = {
    UNIT_SPELLCAST_START = true,
    UNIT_SPELLCAST_CHANNEL_START = true,
    UNIT_SPELLCAST_DELAYED = true,
    UNIT_SPELLCAST_CHANNEL_UPDATE = true,
    PLAYER_ENTERING_WORLD = true,
}

local function currentCast(bar)
    if not bar or not bar.unit or not bar.Text or not bar:IsShown() or bar.fadeOut then
        return
    end
    local name, subtext, text, texture, startTime, endTime, tradeSkill, castID, notInterruptible, spellID
    if bar.channeling and UnitChannelInfo then
        name, subtext, text, texture, startTime, endTime, tradeSkill, notInterruptible, spellID =
            UnitChannelInfo(bar.unit)
    elseif bar.casting and UnitCastingInfo then
        name, subtext, text, texture, startTime, endTime, tradeSkill, castID, notInterruptible, spellID =
            UnitCastingInfo(bar.unit)
        if castID ~= bar.castID then
            return
        end
    end
    if type(name) == "string" and type(text) == "string" and text ~= "" then
        return name, text, startTime, castID, spellID
    end
end

function A.UpdateCastBar(bar, event, unit, spellName, rank, castID, spellID)
    if
        not bar
        or (bar ~= CastingBarFrame and bar ~= PetCastingBarFrame and bar ~= TargetFrameSpellBar and bar ~= FocusFrameSpellBar)
        or bar.IsForbidden and bar:IsForbidden()
    then
        return
    end
    if event and not castEvents[event] then
        return
    end
    if event and event ~= "PLAYER_ENTERING_WORLD" and unit ~= bar.unit then
        return
    end
    local name, source, startTime, currentID, currentSpellID = currentCast(bar)
    if not name or A.IsChinese(source) or bar.Text:GetText() ~= source then
        return
    end

    -- Legion UnitCastingInfo returns the spell ID in position 10. Some server
    -- clients omit it; their start event can supply a validated fallback.
    -- The castID in position 8 / event argument 4 is an execution counter.
    local matchingEvent = event == "UNIT_SPELLCAST_START" and bar.casting and castID == bar.castID
        or event == "UNIT_SPELLCAST_CHANNEL_START"
            and bar.channeling
            and (spellName == name or spellName == source)
    local id = type(currentSpellID) == "number"
            and currentSpellID > 0
            and currentSpellID % 1 == 0
            and currentSpellID
        or nil
    if not id and matchingEvent and type(spellID) == "number" and spellID > 0 and spellID % 1 == 0 then
        id = spellID
    end
    local translated = A.ResolveSpellName and A.ResolveSpellName(source, id) or nil
    translated = translated or A.IsChinese(name) and name or nil
    local previous = castTranslations[bar]
    if
        not translated
        and previous
        and previous.unit == bar.unit
        and previous.name == name
        and previous.source == source
        and previous.startTime == startTime
        and previous.castID == currentID
        and previous.channeling == bar.channeling
        and (not id or id == previous.spellID)
    then
        translated = previous.translated
    end
    if not translated and GetSpellInfo then
        if id then
            local localized = GetSpellInfo(id)
            if A.IsChinese(localized) then
                translated = localized
            end
        end
        if not translated then
            local localized = GetSpellInfo(name)
            if A.IsChinese(localized) then
                translated = localized
            end
        end
    end
    if not translated then
        return
    end
    A.SetFont(bar.Text)
    bar.Text:SetText(translated)
    castTranslations[bar] = {
        unit = bar.unit,
        name = name,
        source = source,
        translated = translated,
        startTime = startTime,
        castID = currentID,
        channeling = bar.channeling,
        spellID = id,
    }
end

function A.RefreshCastBars()
    for _, key in ipairs({
        "CastingBarFrame",
        "PetCastingBarFrame",
        "TargetFrameSpellBar",
        "FocusFrameSpellBar",
    }) do
        A.UpdateCastBar(_G[key])
    end
end
