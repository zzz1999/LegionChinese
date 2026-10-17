-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local installed=false
local windowHooked=false
local eventFrame
local chatFrames=setmetatable({}, {__mode="k"})
local originals=setmetatable({}, {__mode="k"})
local pending=setmetatable({}, {__mode="k"})
local tooltipHooks=setmetatable({}, {__mode="k"})
local queuedFrames=setmetatable({}, {__mode="k"})
local refreshQueued=false
local mapsRequested=false
local events={"SAY","YELL","WHISPER","WHISPER_INFORM","BN_WHISPER","BN_WHISPER_INFORM",
    "PARTY","PARTY_LEADER","RAID","RAID_LEADER","RAID_WARNING","GUILD","OFFICER",
    "CHANNEL","INSTANCE_CHAT","INSTANCE_CHAT_LEADER"}

local function safeChinese(text)
    return A.IsChinese(text) and not text:find("|",1,true) and not text:find("[\r\n]")
end

local function keystoneName(payload)
    local mapID,level=A.ParseKeystoneLink(payload)
    if not mapID then return end
    if not C_ChallengeMode or type(C_ChallengeMode.GetMapInfo)~="function" then return nil,"keystone" end
    local ok,name=pcall(C_ChallengeMode.GetMapInfo,mapID)
    if not ok or not safeChinese(name) then return nil,"keystone" end
    local format=CHALLENGE_MODE_KEYSTONE_HYPERLINK
    if safeChinese(format) and format:find("%%s") and format:find("%%d") then
        local success,caption=pcall(string.format,format,name,level)
        if success and safeChinese(caption) then return caption end
    end
    -- Official zhCN GlobalStrings, build 7.3.5.26972, record 36209.
    return string.format("钥石：%s (%d)",name,level)
end

local function requestMaps(missing)
    if missing and missing.keystone and not mapsRequested and C_ChallengeMode
        and type(C_ChallengeMode.RequestMapInfo)=="function" then
        mapsRequested=true
        C_ChallengeMode.RequestMapInfo()
    end
end

local function translate(message,names)
    if type(message)~="string" then return message,false end
    local changed=false
    local missing
    local translated=message:gsub("()(|H(%a+:%d+[^|]*)|h)%[([^|]-)%](|h)",function(position,opening,payload,caption,closing)
        local original=opening.."["..caption.."]"..closing
        local kind,id,rest=payload:match("^(%a+):(%d+)(.*)$")
        if (kind~="item" and kind~="keystone") or (rest~="" and rest:sub(1,1)~=":") or A.IsChinese(caption)
            or (position>1 and message:sub(position-1,position-1)=="|") then return original end
        -- Query the entire item variant: suffixes and bonuses must not be
        -- discarded by looking up only its base ID. This is the client's cache,
        -- not an external translation service. Cache only within this pass so
        -- an initially unavailable item can resolve when its data arrives.
        local name=names and names[payload]
        local waiting=kind=="item" and tonumber(id) or "keystone"
        if kind=="keystone" and not A.ParseKeystoneLink(payload) then return original end
        if name==nil then
            if kind=="keystone" then name=keystoneName(payload)
            elseif tonumber(id)==138019 or type(GetItemInfo)~="function" then return original
            else name=GetItemInfo(payload) end
            if names then names[payload]=name or false end
        end
        if not A.IsChinese(name) then
            missing=missing or {};missing[waiting]=true
            return original
        end
        if not safeChinese(name) then return original end
        changed=true
        return opening.."["..name.."]"..closing
    end)
    return translated,changed,missing
end

local function hasHistory(frame)
    local buffer=frame and frame.historyBuffer
    return frame and not (frame.IsForbidden and frame:IsForbidden()) and buffer
        and type(buffer.EnumerateIndexedEntries)=="function" and type(buffer.GetEntryAtIndex)=="function"
        and type(buffer.GetNumElements)=="function" and type(frame.MarkDisplayDirty)=="function"
end

local function updateEntry(frame,entry,names)
    if type(entry)~="table" or type(entry.message)~="string" then return false end
    local previous=originals[entry]
    -- A different addon may have replaced this line since our last update.
    -- Never restore a stale snapshot over its newer text.
    local source=previous and entry.message==previous.rendered and previous.source or entry.message
    local text,missing=source,nil
    if A.Enabled() then
        local changed
        -- Retain names already resolved in this entry even if the client's
        -- cache later evicts them while another link is still loading.
        text,changed,missing=translate(entry.message,names)
    end
    originals[entry]=text~=source and {source=source,rendered=text} or nil
    pending[entry]=missing and {frame=frame,items=missing} or nil
    requestMaps(missing)
    if text~=entry.message then entry.message=text;return true end
    return false
end

function A.RefreshChatItemLinks(target)
    local names={}
    local function refresh(frame)
        if not hasHistory(frame) then return end
        local changed=false
        for _,entry in frame.historyBuffer:EnumerateIndexedEntries() do
            if updateEntry(frame,entry,names) then changed=true end
        end
        -- Legion already stores the complete formatted line in a Lua buffer.
        -- Change only its text, preserving timestamp, colors, extraData, order,
        -- fade timers and scroll offset. Do not clear or replay chat events.
        if changed then frame:MarkDisplayDirty() end
    end
    if target then refresh(target) else for frame in pairs(chatFrames) do refresh(frame) end end
end

local function queueWaiting(itemID)
    if not A.Enabled() or not itemID then return end
    for _,record in pairs(pending) do
        if record.items[itemID] then queuedFrames[record.frame]=true end
    end
    if refreshQueued or not next(queuedFrames) then return end
    refreshQueued=true
    local function flush()
        local frames=queuedFrames
        queuedFrames=setmetatable({}, {__mode="k"});refreshQueued=false
        for frame in pairs(frames) do A.RefreshChatItemLinks(frame) end
    end
    if C_Timer and C_Timer.After then C_Timer.After(0.05,flush) else flush() end
end

local function tooltipReady(tooltip)
    if not A.Enabled() or not next(pending) or not tooltip.GetItem
        or (tooltip.IsForbidden and tooltip:IsForbidden()) then return end
    local _,link=tooltip:GetItem()
    if type(link)=="string" then
        local payload=link:match("|H([^|]+)|h") or link
        if A.ParseKeystoneLink(payload) then queueWaiting("keystone")
        else queueWaiting(tonumber(payload:match("^item:(%d+)"))) end
    end
end

local function installFrame(frame)
    if not hasHistory(frame) or type(frame.AddMessage)~="function" or not hooksecurefunc then return end
    local methods=chatFrames[frame]
    if not methods then methods={};chatFrames[frame]=methods end
    for _,method in ipairs({"AddMessage","BackFillMessage"}) do
        if type(frame[method])=="function" and methods[method]~=frame[method] then
            local backfill=method=="BackFillMessage"
            hooksecurefunc(frame,method,function(self)
                if not hasHistory(self) then return end
                local buffer=self.historyBuffer
                local entry=buffer:GetEntryAtIndex(backfill and buffer:GetNumElements() or 1)
                if updateEntry(self,entry,{}) then self:MarkDisplayDirty() end
            end)
            methods[method]=frame[method]
        end
    end
end

function A.TranslateChatItemLinks(frame,_,message,...)
    if not A.Enabled() then return false end
    -- Native windows are handled after formatting, so we retain the original
    -- caption for /lcn off and can update that same line after a cache miss.
    local methods=frame and chatFrames[frame]
    if methods and methods.AddMessage==frame.AddMessage and hasHistory(frame) then return false end
    local translated,changed,missing=translate(message,{})
    requestMaps(missing)
    if changed then return false,translated,... end
    return false
end

function A.InstallChatItemLinks()
    if not installed and type(ChatFrame_AddMessageEventFilter)=="function" then
        for _,event in ipairs(events) do ChatFrame_AddMessageEventFilter("CHAT_MSG_"..event,A.TranslateChatItemLinks) end
        installed=true
    end
    if not eventFrame and type(CreateFrame)=="function" then
        eventFrame=CreateFrame("Frame")
        eventFrame:RegisterEvent("GET_ITEM_INFO_RECEIVED")
        eventFrame:RegisterEvent("CHALLENGE_MODE_MAPS_UPDATE")
        eventFrame:SetScript("OnEvent",function(_,event,itemID,success)
            if event=="CHALLENGE_MODE_MAPS_UPDATE" then queueWaiting("keystone")
            elseif success then queueWaiting(itemID) end
        end)
    end
    for i=1,NUM_CHAT_WINDOWS or 10 do installFrame(_G["ChatFrame"..i]) end
    for _,name in ipairs(CHAT_FRAMES or {}) do installFrame(_G[name]) end
    if not windowHooked and type(FCF_OpenTemporaryWindow)=="function" and hooksecurefunc then
        hooksecurefunc("FCF_OpenTemporaryWindow",function()
            A.InstallChatItemLinks();A.RefreshChatItemLinks()
        end)
        windowHooked=true
    end
    local tooltips={GameTooltip,ItemRefTooltip}
    for i=1,2 do
        local tooltip=tooltips[i]
        if tooltip and not tooltipHooks[tooltip] and tooltip.HookScript
            and not (tooltip.IsForbidden and tooltip:IsForbidden()) then
            tooltipHooks[tooltip]=true
            tooltip:HookScript("OnTooltipSetItem",tooltipReady)
            tooltip:HookScript("OnShow",tooltipReady)
        end
    end
end
