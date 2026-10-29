-- SPDX-License-Identifier: GPL-2.0-or-later
local A = LegionChinese
local installed = false
local windowHooked = false
local referenceHooked = false
local eventFrame
local chatFrames = setmetatable({}, { __mode = "k" })
local pending = setmetatable({}, { __mode = "k" })
local owners = setmetatable({}, { __mode = "kv" })
-- Dependencies point to weak entry sets. Only live pending records retain a
-- bucket, so neither this index nor a record keeps trimmed history alive.
local waiting = setmetatable({}, { __mode = "v" })
local tooltipHooks = setmetatable({}, { __mode = "k" })
local queuedIDs = {}
local refreshQueued = false
local mapsRequested = false
local translate = A.Hyperlinks.Translate
local parseLink = A.Hyperlinks.Parse
local safeChinese = A.Hyperlinks.IsSafeChinese

local function requestMaps(missing)
    if
        missing
        and missing.keystone
        and not mapsRequested
        and C_ChallengeMode
        and type(C_ChallengeMode.RequestMapInfo) == "function"
    then
        mapsRequested = true
        C_ChallengeMode.RequestMapInfo()
    end
end

local events = {
    "SAY",
    "YELL",
    "WHISPER",
    "WHISPER_INFORM",
    "BN_WHISPER",
    "BN_WHISPER_INFORM",
    "PARTY",
    "PARTY_LEADER",
    "RAID",
    "RAID_LEADER",
    "RAID_WARNING",
    "GUILD",
    "OFFICER",
    "CHANNEL",
    "INSTANCE_CHAT",
    "INSTANCE_CHAT_LEADER",
}

local function hasHistory(frame)
    if not frame or frame.IsForbidden and frame:IsForbidden() then
        return false
    end
    local buffer = frame.historyBuffer
    return buffer
        and type(buffer.EnumerateIndexedEntries) == "function"
        and type(buffer.GetEntryAtIndex) == "function"
        and type(buffer.GetNumElements) == "function"
        and type(frame.MarkDisplayDirty) == "function"
end

local function setPending(frame, entry, missing)
    local record = pending[entry]
    if record then
        for id, bucket in pairs(record.items) do
            if not missing or not missing[id] then
                bucket[entry] = nil
                if not next(bucket) and waiting[id] == bucket then
                    waiting[id] = nil
                end
            end
        end
    end
    if not missing then
        pending[entry] = nil
        owners[entry] = nil
        return
    end
    for id in pairs(missing) do
        local bucket = waiting[id]
        if not bucket then
            bucket = setmetatable({}, { __mode = "k" })
            waiting[id] = bucket
        end
        bucket[entry] = true
        missing[id] = bucket
    end
    record = record or {}
    record.items = missing
    pending[entry] = record
    owners[entry] = frame
end

local function updateEntry(frame, entry, names)
    if type(entry) ~= "table" then
        return false
    end
    if type(entry.message) ~= "string" then
        setPending(frame, entry, nil)
        return false
    end
    -- Translate the live entry so other addons' changes and names already
    -- resolved before a client-cache eviction both remain intact.
    local text, _, missing = translate(entry.message, names)
    setPending(frame, entry, missing)
    requestMaps(missing)
    if text ~= entry.message then
        entry.message = text
        return true
    end
    return false
end

local function observeBuffer(frame)
    local methods = chatFrames[frame]
    if methods and methods.buffer ~= frame.historyBuffer then
        methods.buffer = frame.historyBuffer
        methods.generation = (methods.generation or 0) + 1
        methods.frontSerial = 0
    end
    return methods
end

local function rememberPosition(entry, index, methods)
    local record = pending[entry]
    if record and methods then
        record.position = index - methods.frontSerial
        record.generation = methods.generation
    end
end

local function refreshFrame(frame, names, readyEntries)
    if not hasHistory(frame) then
        return
    end
    local changed = false
    local methods = observeBuffer(frame)
    local buffer = frame.historyBuffer
    if readyEntries and methods then
        for entry in pairs(readyEntries) do
            local record = pending[entry]
            local index = record and record.position and record.position + methods.frontSerial
            -- Normal insertions shift all pending positions equally. Verify
            -- identity before using the index: other addons may trim/reorder.
            if
                record
                and record.generation == methods.generation
                and index
                and index >= 1
                and index <= buffer:GetNumElements()
                and buffer:GetEntryAtIndex(index) == entry
            then
                if updateEntry(frame, entry, names) then
                    changed = true
                end
                rememberPosition(entry, index, methods)
                readyEntries[entry] = nil
            end
        end
        if not next(readyEntries) then
            if changed then
                frame:MarkDisplayDirty()
            end
            return
        end
    end
    for index, entry in buffer:EnumerateIndexedEntries() do
        local retry = not readyEntries or readyEntries[entry]
        if readyEntries then
            readyEntries[entry] = nil
        end
        if retry and updateEntry(frame, entry, names) then
            changed = true
        end
        rememberPosition(entry, index, methods)
    end
    if readyEntries then
        for entry in pairs(readyEntries) do
            if owners[entry] == frame then
                setPending(frame, entry, nil)
            end
        end
    end
    -- Invalid positions fall back to the live buffer; removed entries are
    -- discarded instead of modifying detached history or a replacement line.
    -- A cache event retries only matching pending lines; login and refreshes
    -- still refresh all lines. Preserve metadata, order, fade and scroll state.
    if changed then
        frame:MarkDisplayDirty()
    end
end

function A.RefreshChatItemLinks(target)
    local names = {}
    if target then
        refreshFrame(target, names)
    else
        for frame in pairs(chatFrames) do
            refreshFrame(frame, names)
        end
    end
end

local function queueWaiting(itemID)
    local bucket = itemID and waiting[itemID]
    if not bucket or not next(bucket) then
        return
    end
    queuedIDs[itemID] = true
    if refreshQueued then
        return
    end
    refreshQueued = true
    local function flush()
        local ids = queuedIDs
        queuedIDs = {}
        refreshQueued = false
        local frames = {}
        for id in pairs(ids) do
            for entry in pairs(waiting[id] or {}) do
                local record, frame = pending[entry], owners[entry]
                if record and record.items[id] == waiting[id] and frame then
                    local ready = frames[frame]
                    if not ready then
                        ready = {}
                        frames[frame] = ready
                    end
                    ready[entry] = true
                end
            end
        end
        -- Share exact-variant lookups across windows in this batch only. Never
        -- persist cache misses: another item or journal event can resolve them.
        local names = {}
        for frame, ready in pairs(frames) do
            refreshFrame(frame, names, ready)
        end
    end
    if C_Timer and C_Timer.After then
        C_Timer.After(0.05, flush)
    else
        flush()
    end
end

local function tooltipReady(tooltip)
    if not next(pending) or not tooltip.GetItem or (tooltip.IsForbidden and tooltip:IsForbidden()) then
        return
    end
    local _, link = tooltip:GetItem()
    if type(link) == "string" then
        local payload = link:match("|H([^|]+)|h") or link
        if A.ParseKeystoneLink(payload) then
            queueWaiting("keystone")
        else
            queueWaiting(tonumber(payload:match("^item:(%d+)")))
        end
    end
end

local function referenceReady(link)
    if type(link) ~= "string" then
        return
    end
    local payload = link:match("|H([^|]+)|h") or link
    local kind = parseLink(payload)
    if kind == "journal" then
        queueWaiting("journal")
    else
        queueWaiting(payload)
    end
end

local function installFrame(frame, hookMethod)
    if not hasHistory(frame) or type(frame.AddMessage) ~= "function" or not hooksecurefunc then
        return
    end
    local methods = chatFrames[frame]
    if not methods then
        methods = {}
        chatFrames[frame] = methods
    end
    local changed = methods.buffer ~= frame.historyBuffer
    observeBuffer(frame)
    for _, method in ipairs({ "AddMessage", "BackFillMessage" }) do
        if type(frame[method]) == "function" and methods[method] ~= frame[method] then
            local backfill = method == "BackFillMessage"
            hookMethod(frame, method, function(self)
                if not hasHistory(self) then
                    return
                end
                local buffer = self.historyBuffer
                local current = observeBuffer(self)
                if not backfill then
                    current.frontSerial = current.frontSerial + 1
                end
                local index = backfill and buffer:GetNumElements() or 1
                local entry = buffer:GetEntryAtIndex(index)
                if updateEntry(self, entry, {}) then
                    self:MarkDisplayDirty()
                end
                rememberPosition(entry, index, current)
            end)
            methods[method] = frame[method]
            changed = true
        end
    end
    return changed
end

local function frameChanged(frame)
    if not hasHistory(frame) or type(frame.AddMessage) ~= "function" then
        return false
    end
    local methods = chatFrames[frame]
    return not methods
        or methods.buffer ~= frame.historyBuffer
        or methods.AddMessage ~= frame.AddMessage
        or type(frame.BackFillMessage) == "function" and methods.BackFillMessage ~= frame.BackFillMessage
end

function A.ChatLinksChanged()
    if not installed and type(ChatFrame_AddMessageEventFilter) == "function" then
        return true
    end
    if
        type(FCF_OpenTemporaryWindow) == "function" and windowHooked ~= FCF_OpenTemporaryWindow
        or type(SetItemRef) == "function" and referenceHooked ~= SetItemRef
    then
        return true
    end
    for i = 1, NUM_CHAT_WINDOWS or 10 do
        if frameChanged(_G["ChatFrame" .. i]) then
            return true
        end
    end
    for _, name in ipairs(CHAT_FRAMES or {}) do
        if frameChanged(_G[name]) then
            return true
        end
    end
    for _, tooltip in pairs({ GameTooltip, ItemRefTooltip }) do
        if tooltip.HookScript and not (tooltip.IsForbidden and tooltip:IsForbidden()) then
            local record = tooltipHooks[tooltip]
            if
                not record
                or type(tooltip.SetHyperlink) == "function" and record.hyperlink ~= tooltip.SetHyperlink
            then
                return true
            end
        end
    end
    return false
end

function A.TranslateChatItemLinks(frame, _, message, ...)
    -- Native windows are handled after formatting, so we retain the original
    -- message entry and can update that same line after a cache miss.
    local methods = frame and chatFrames[frame]
    if methods and methods.AddMessage == frame.AddMessage and hasHistory(frame) then
        return false
    end
    local translated, changed, missing = translate(message, {})
    requestMaps(missing)
    if changed then
        return false, translated, ...
    end
    return false
end

local monsterEvents = {
    CHAT_MSG_MONSTER_EMOTE = true,
    CHAT_MSG_RAID_BOSS_EMOTE = true,
    CHAT_MSG_MONSTER_SAY = true,
    CHAT_MSG_MONSTER_YELL = true,
    CHAT_MSG_MONSTER_WHISPER = true,
    CHAT_MSG_RAID_BOSS_WHISPER = true,
}
function A.TranslateMonsterMessage(_, event, message, author, ...)
    if not monsterEvents[event] or type(message) ~= "string" then
        return false
    end
    local emote = event == "CHAT_MSG_MONSTER_EMOTE" or event == "CHAT_MSG_RAID_BOSS_EMOTE"
    local translated, changed = A.Translate("Gossip", message)
    if
        emote
        and not changed
        and type(author) == "string"
        and author ~= ""
        and message:sub(1, #author) == author
    then
        -- Some servers send the expanded name instead of the native %s token.
        translated, changed = A.Translate("Gossip", "%s" .. message:sub(#author + 1))
    end
    if not changed then
        return false
    end
    -- ChatFrame formats monster emotes with the speaker twice. Permit only
    -- those string slots, never unexpected format directives from data.
    if emote then
        local format = translated:gsub("%%%%", "")
        local count
        format, count = format:gsub("%%s", "")
        if count > 2 or format:find("%%") then
            return false
        end
    elseif translated:find("%s", 1, true) then
        -- Ordinary speech has no speaker slots inside the message itself.
        return false
    else
        -- ChatFrame formats ALL monster messages, but only escapes percent
        -- signs for player messages. Keep shared dialogue data literal and
        -- escape it here, immediately before the native string.format call.
        translated = translated:gsub("%%", "%%%%")
    end
    local name = A.Find("NPCNames", author)
    if not safeChinese(name) then
        name = author
    end
    return false, translated, name, ...
end

function A.InstallChatItemLinks()
    local hook, hookMethod, hookScript = A.Hooks.ForFeature("chat-links")
    if not installed and type(ChatFrame_AddMessageEventFilter) == "function" then
        for _, event in ipairs(events) do
            ChatFrame_AddMessageEventFilter("CHAT_MSG_" .. event, A.TranslateChatItemLinks)
        end
        for event in pairs(monsterEvents) do
            ChatFrame_AddMessageEventFilter(event, A.TranslateMonsterMessage)
        end
        installed = true
    end
    if not eventFrame and type(CreateFrame) == "function" then
        eventFrame = CreateFrame("Frame")
        eventFrame:RegisterEvent("GET_ITEM_INFO_RECEIVED")
        eventFrame:RegisterEvent("CHALLENGE_MODE_MAPS_UPDATE")
        eventFrame:RegisterEvent("ADDON_LOADED")
        eventFrame:SetScript("OnEvent", function(_, event, itemID, success)
            if event == "CHALLENGE_MODE_MAPS_UPDATE" then
                queueWaiting("keystone")
            elseif event == "ADDON_LOADED" and itemID == "Blizzard_EncounterJournal" then
                queueWaiting("journal")
            elseif event == "GET_ITEM_INFO_RECEIVED" and success then
                queueWaiting(itemID)
            end
        end)
    end
    local names = {}
    local function installChat(frame)
        if installFrame(frame, hookMethod) then
            refreshFrame(frame, names)
        end
    end
    for i = 1, NUM_CHAT_WINDOWS or 10 do
        installChat(_G["ChatFrame" .. i])
    end
    for _, name in ipairs(CHAT_FRAMES or {}) do
        installChat(_G[name])
    end
    if
        windowHooked ~= FCF_OpenTemporaryWindow
        and type(FCF_OpenTemporaryWindow) == "function"
        and hooksecurefunc
    then
        hook("FCF_OpenTemporaryWindow", function()
            A.InstallChatItemLinks()
            A.RefreshChatItemLinks()
        end)
        windowHooked = FCF_OpenTemporaryWindow
    end
    -- Journal links open the guide, not ItemRefTooltip. Retry only after the
    -- user's click or its addon load; never open/select a dungeon ourselves.
    if referenceHooked ~= SetItemRef and type(SetItemRef) == "function" and hooksecurefunc then
        hook("SetItemRef", referenceReady)
        referenceHooked = SetItemRef
    end
    local tooltips = { GameTooltip, ItemRefTooltip }
    for i = 1, 2 do
        local tooltip = tooltips[i]
        if tooltip and tooltip.HookScript and not (tooltip.IsForbidden and tooltip:IsForbidden()) then
            local record = tooltipHooks[tooltip]
            if not record then
                record = {}
                tooltipHooks[tooltip] = record
                hookScript(tooltip, "OnTooltipSetItem", tooltipReady)
                hookScript(tooltip, "OnShow", tooltipReady)
            end
            if
                type(tooltip.SetHyperlink) == "function"
                and record.hyperlink ~= tooltip.SetHyperlink
                and hooksecurefunc
            then
                hookMethod(tooltip, "SetHyperlink", function(_, link)
                    referenceReady(link)
                end)
                record.hyperlink = tooltip.SetHyperlink
            end
        end
    end
end
