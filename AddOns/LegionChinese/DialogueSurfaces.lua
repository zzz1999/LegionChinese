-- SPDX-License-Identifier: GPL-2.0-or-later
local A = LegionChinese
local installed = false
local pending, playerText = {}, {}
local elapsed = 0
local blockedUntil = 0
local eventFrame
local function safe(widget)
    return widget and not (widget.IsForbidden and widget:IsForbidden())
end
local function dialogue(source)
    if type(source) ~= "string" or source:find("%%s") then
        return
    end
    local text, changed = A.Translate("Gossip", source)
    if changed and not text:find("%%s") then
        return text
    end
end
local function write(widget, text)
    return A.WriteText(widget, text)
end

function A.UpdateNPCSubtitle(
    frame,
    event,
    message,
    sender,
    language,
    channel,
    target,
    flag,
    zone,
    localID,
    name,
    instanceID,
    lineID,
    guid,
    bnID,
    mobile,
    isSubtitle,
    hideSender
)
    if
        (event ~= "CHAT_MSG_MONSTER_SAY" and event ~= "CHAT_MSG_MONSTER_YELL")
        or not isSubtitle
        or not safe(frame)
        or not frame.IsShown
        or not frame:IsShown()
    then
        return
    end
    local text = dialogue(message)
    if not text then
        return
    end
    local source = message
    if not hideSender then
        if type(SUBTITLE_FORMAT) ~= "string" or type(sender) ~= "string" then
            return
        end
        source = string.format(SUBTITLE_FORMAT, sender, message)
        text = string.format(SUBTITLE_FORMAT, sender, text)
    end
    local changed = false
    for _, widget in ipairs(frame.Subtitles or {}) do
        if safe(widget) and widget.GetText and widget:GetText() == source then
            write(widget, text)
            changed = true
        end
    end
    if changed and CinematicFrame_OnDisplaySizeChanged then
        CinematicFrame_OnDisplaySizeChanged(frame)
    end
end

local function scanRegion(widget, now, depth)
    if depth > 2 or not safe(widget) or widget.IsShown and not widget:IsShown() then
        return
    end
    if widget.GetText and widget.SetText then
        local source = widget:GetText()
        local entry = source and pending[source]
        if entry and entry.untilTime > now and not playerText[source] then
            write(widget, entry.text)
        end
    end
    if widget.GetRegions then
        for _, region in ipairs({ widget:GetRegions() }) do
            scanRegion(region, now, depth + 1)
        end
    end
    if widget.GetChildren then
        for _, child in ipairs({ widget:GetChildren() }) do
            scanRegion(child, now, depth + 1)
        end
    end
end

function A.PollNPCBubbles(self, delta)
    elapsed = elapsed + (delta or 0)
    if elapsed < 0.1 then
        return
    end
    elapsed = 0
    local now = GetTime and GetTime() or 0
    local active = false
    for source, entry in pairs(pending) do
        if entry.untilTime <= now then
            pending[source] = nil
        else
            active = true
        end
    end
    for source, time in pairs(playerText) do
        if time <= now then
            playerText[source] = nil
        end
    end
    if not active then
        self:SetScript("OnUpdate", nil)
        return
    end
    if not C_ChatBubbles or not C_ChatBubbles.GetAllChatBubbles then
        return
    end
    for i, bubble in ipairs(C_ChatBubbles.GetAllChatBubbles(false) or {}) do
        if i > 64 then
            break
        end
        scanRegion(bubble, now, 0)
    end
end

function A.RecordBubbleMessage(self, event, message)
    if type(message) ~= "string" or #message > 4096 then
        return
    end
    local now = GetTime and GetTime() or 0
    if now < blockedUntil then
        return
    end
    if event == "CHAT_MSG_SAY" or event == "CHAT_MSG_YELL" then
        -- Bubbles do not expose a speaker GUID. If a player said the same
        -- line, that text is ambiguous and must not be translated.
        playerText[message] = now + 15
        pending[message] = nil
    else
        local text = dialogue(message)
        if text then
            pending[message] = { text = text, untilTime = now + 15 }
        end
    end
    for _, entries in ipairs({ pending, playerText }) do
        local count = 0
        for key, value in pairs(entries) do
            local expiry = type(value) == "table" and value.untilTime or value
            if expiry <= now then
                entries[key] = nil
            else
                count = count + 1
            end
        end
        if count > 64 then
            wipe(entries)
            if entries == playerText then
                -- Forgetting player evidence must not make an ambiguous bubble
                -- eligible. Pause matching until all forgotten lines expire.
                wipe(pending)
                blockedUntil = now + 15
                self:SetScript("OnUpdate", nil)
            end
        end
    end
    if next(pending) then
        self:SetScript("OnUpdate", A.PollNPCBubbles)
    end
end

function A.InstallDialogueSurfaces(hook, hookMethod, hookScript)
    local head = TalkingHeadFrame
    local text = head and head.TextFrame and head.TextFrame.Text
    local name = head and head.NameFrame and head.NameFrame.Name
    hookMethod(text, "SetText", function(widget, source)
        if not A.IsWriting(widget) then
            write(widget, dialogue(source))
        end
    end)
    hookMethod(name, "SetText", function(widget, source)
        if A.IsWriting(widget) then
            return
        end
        local translated, changed = A.Translate("NPCNames", source)
        if changed then
            write(widget, translated)
        end
    end)
    hookScript(CinematicFrame, "OnEvent", A.UpdateNPCSubtitle)
    if installed then
        return
    end
    installed = true
    eventFrame = CreateFrame("Frame")
    for _, event in ipairs({
        "CHAT_MSG_MONSTER_SAY",
        "CHAT_MSG_MONSTER_YELL",
        "CHAT_MSG_SAY",
        "CHAT_MSG_YELL",
        "PLAYER_ENTERING_WORLD",
    }) do
        eventFrame:RegisterEvent(event)
    end
    eventFrame:SetScript("OnEvent", function(self, event, ...)
        if event == "PLAYER_ENTERING_WORLD" then
            pending = {}
            playerText = {}
            blockedUntil = 0
            self:SetScript("OnUpdate", nil)
        else
            A.RecordBubbleMessage(self, event, ...)
        end
    end)
end
