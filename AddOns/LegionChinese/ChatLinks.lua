-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local installed=false
local windowHooked=false
local referenceHooked=false
local eventFrame
local chatFrames=setmetatable({}, {__mode="k"})
local originals=setmetatable({}, {__mode="k"})
local pending=setmetatable({}, {__mode="k"})
local tooltipHooks=setmetatable({}, {__mode="k"})
local queuedFrames=setmetatable({}, {__mode="k"})
local refreshQueued=false
local mapsRequested=false
local linkKinds={item=true,keystone=true,quest=true,spell=true,enchant=true,achievement=true,
    currency=true,talent=true,battlepet=true,battlePetAbil=true,journal=true,instancelock=true}
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

local function apiName(api,index,...)
    if type(api)~="function" then return end
    local result={pcall(api,...)}
    if result[1] then return result[index+1] end
end

local function parseLink(payload)
    local kind=payload:match("^(%a+):")
    if not linkKinds[kind] then return end
    if kind=="journal" then
        -- The first field is a type, not an ID: 0 instance, 1 boss, 2 section.
        local journalType,id=payload:match("^journal:([012]):(%d+):%d+$")
        if id and tonumber(id)>0 then return kind,tonumber(id),tonumber(journalType) end
    elseif kind=="instancelock" then
        -- Lockouts use a player GUID followed by a Map.db2 ID. Neither is an
        -- Encounter Journal instance ID; retain owner, difficulty and mask.
        local id=payload:match("^instancelock:Player%-%d+%-%x+:(%d+):%d+:%d+$")
        if id and tonumber(id)>0 then return kind,tonumber(id) end
    else
        local id,rest=payload:match("^%a+:(%d+)(.*)$")
        if id and (rest=="" or rest:sub(1,1)==":") then return kind,tonumber(id) end
    end
end

local function journalName(id,journalType)
    if journalType==0 then
        local name=LegionChineseDB.JournalInstances[id]
        if safeChinese(name) then return name end
        return apiName(EJ_GetInstanceInfo,1,id)
    elseif journalType==1 then
        return apiName(EJ_GetEncounterInfo,1,id)
    elseif journalType==2 then
        local info=apiName(C_EncounterJournal and C_EncounterJournal.GetSectionInfo,1,id)
        if type(info)=="table" then return info.title end
    end
end

-- Resolve semantic links, never arbitrary text enclosed in square brackets.
-- Each resolver uses the linked ID; the payload itself is left untouched.
local function linkedName(kind,id,payload,caption,journalType)
    if kind=="item" then
        if id==138019 then return end -- A generic keystone item lacks a dungeon.
        return apiName(GetItemInfo,1,payload),id
    elseif kind=="keystone" then
        if A.ParseKeystoneLink(payload) then return keystoneName(payload),"keystone" end
    elseif kind=="quest" then
        local name,changed=A.Translate("Quests",caption,id,"Title")
        if changed then return name end
        local link=apiName(GetQuestLink,1,id)
        if type(link)=="string" then
            local linkedID,title=link:match("|Hquest:(%d+)[^|]*|h%[([^|]-)%]|h")
            if tonumber(linkedID)==id then return title end
        end
    elseif kind=="spell" or kind=="enchant" then
        local name=apiName(GetSpellInfo,1,id)
        if safeChinese(name) then return name end
        if A.ResolveSpellName then return A.ResolveSpellName(caption,id) end
    elseif kind=="achievement" then
        return apiName(GetAchievementInfo,2,id)
    elseif kind=="currency" then
        return apiName(GetCurrencyInfo,1,id)
    elseif kind=="talent" then
        return apiName(GetTalentInfoByID,2,id,apiName(GetActiveSpecGroup,1) or 1)
    elseif kind=="battlepet" then
        return apiName(C_PetJournal and C_PetJournal.GetPetInfoBySpeciesID,1,id)
    elseif kind=="battlePetAbil" then
        return apiName(C_PetBattles and C_PetBattles.GetAbilityInfoByID,2,id)
    elseif kind=="journal" then
        return journalName(id,journalType),"journal"
    elseif kind=="instancelock" then
        return LegionChineseDB.InstanceMaps[id]
    end
end

local function translate(message,names)
    if type(message)~="string" then return message,false end
    local changed=false
    local missing
    local translated=message:gsub("()(|H(%a+:[^|]+)|h)%[([^|]-)%](|h)",function(position,opening,payload,caption,closing)
        local original=opening.."["..caption.."]"..closing
        local kind,id,journalType=parseLink(payload)
        if not kind or A.IsChinese(caption)
            or (position>1 and message:sub(position-1,position-1)=="|") then return original end
        -- Query the entire item variant: suffixes and bonuses must not be
        -- discarded by looking up only its base ID. This is the client's cache,
        -- not an external translation service. Cache only within this pass so
        -- an initially unavailable item can resolve when its data arrives.
        local name=names and names[payload]
        local waiting
        if name==nil then
            name,waiting=linkedName(kind,id,payload,caption,journalType)
            if not waiting and kind~="item" and kind~="keystone" then waiting=payload end
            if names then names[payload]=name or false end
        elseif name==false then
            if kind=="item" and tonumber(id)~=138019 then waiting=tonumber(id)
            elseif kind=="keystone" and A.ParseKeystoneLink(payload) then waiting="keystone"
            elseif kind=="journal" then waiting="journal"
            elseif kind~="item" and kind~="keystone" then waiting=payload end
        end
        if not A.IsChinese(name) then
            if waiting then missing=missing or {};missing[waiting]=true end
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

local function referenceReady(link)
    if type(link)~="string" then return end
    local payload=link:match("|H([^|]+)|h") or link
    local kind=parseLink(payload)
    if kind=="journal" then queueWaiting("journal") else queueWaiting(payload) end
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

function A.TranslateMonsterMessage(_,event,message,author,...)
    if not A.Enabled() or (event~="CHAT_MSG_MONSTER_EMOTE" and event~="CHAT_MSG_RAID_BOSS_EMOTE")
        or type(message)~="string" then return false end
    local translated,changed=A.Translate("Gossip",message)
    if not changed and type(author)=="string" and author~="" and message:sub(1,#author)==author then
        -- Some servers send the expanded name instead of the native %s token.
        translated,changed=A.Translate("Gossip","%s"..message:sub(#author+1))
    end
    if not changed then return false end
    -- ChatFrame formats monster emotes with the speaker twice. Permit only
    -- those string slots, never unexpected format directives from data.
    local format=translated:gsub("%%%%","")
    local count;format,count=format:gsub("%%s","")
    if count>2 or format:find("%%") then return false end
    local name=A.Find("NPCNames",author)
    if not safeChinese(name) then name=author end
    return false,translated,name,...
end

function A.InstallChatItemLinks()
    if not installed and type(ChatFrame_AddMessageEventFilter)=="function" then
        for _,event in ipairs(events) do ChatFrame_AddMessageEventFilter("CHAT_MSG_"..event,A.TranslateChatItemLinks) end
        ChatFrame_AddMessageEventFilter("CHAT_MSG_MONSTER_EMOTE",A.TranslateMonsterMessage)
        ChatFrame_AddMessageEventFilter("CHAT_MSG_RAID_BOSS_EMOTE",A.TranslateMonsterMessage)
        installed=true
    end
    if not eventFrame and type(CreateFrame)=="function" then
        eventFrame=CreateFrame("Frame")
        eventFrame:RegisterEvent("GET_ITEM_INFO_RECEIVED")
        eventFrame:RegisterEvent("CHALLENGE_MODE_MAPS_UPDATE")
        eventFrame:RegisterEvent("ADDON_LOADED")
        eventFrame:SetScript("OnEvent",function(_,event,itemID,success)
            if event=="CHALLENGE_MODE_MAPS_UPDATE" then queueWaiting("keystone")
            elseif event=="ADDON_LOADED" and itemID=="Blizzard_EncounterJournal" then queueWaiting("journal")
            elseif event=="GET_ITEM_INFO_RECEIVED" and success then queueWaiting(itemID) end
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
    -- Journal links open the guide, not ItemRefTooltip. Retry only after the
    -- user's click or its addon load; never open/select a dungeon ourselves.
    if not referenceHooked and type(SetItemRef)=="function" and hooksecurefunc then
        hooksecurefunc("SetItemRef",referenceReady)
        referenceHooked=true
    end
    local tooltips={GameTooltip,ItemRefTooltip}
    for i=1,2 do
        local tooltip=tooltips[i]
        if tooltip and not tooltipHooks[tooltip] and tooltip.HookScript
            and not (tooltip.IsForbidden and tooltip:IsForbidden()) then
            tooltipHooks[tooltip]=true
            tooltip:HookScript("OnTooltipSetItem",tooltipReady)
            tooltip:HookScript("OnShow",tooltipReady)
            if tooltip.SetHyperlink and hooksecurefunc then
                hooksecurefunc(tooltip,"SetHyperlink",function(_,link)
                    referenceReady(link)
                end)
            end
        end
    end
end
