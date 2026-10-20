-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local installed=false
local windowHooked=false
local referenceHooked=false
local eventFrame
local chatFrames=setmetatable({}, {__mode="k"})
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

local function nativeOrOffline(name,category,id)
    if safeChinese(name) then return name end
    local names=LegionChineseDB.LinkNames and LegionChineseDB.LinkNames[category]
    return names and names[id]
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
        return nativeOrOffline(apiName(EJ_GetEncounterInfo,1,id),"Encounter",id)
    elseif journalType==2 then
        local info=apiName(C_EncounterJournal and C_EncounterJournal.GetSectionInfo,1,id)
        return nativeOrOffline(type(info)=="table" and info.title,"JournalSection",id)
    end
end

-- Resolve semantic links, never arbitrary text enclosed in square brackets.
-- Each resolver uses the linked ID; the payload itself is left untouched.
local function linkedName(kind,id,payload,caption,journalType)
    if kind=="item" then
        if id==138019 then return end -- A generic keystone item lacks a dungeon.
        local name=apiName(GetItemInfo,1,payload)
        if safeChinese(name) then return name,id end
        return A.ResolveItemName and A.ResolveItemName(caption,id,payload),id
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
        return nativeOrOffline(apiName(GetAchievementInfo,2,id),"Achievement",id)
    elseif kind=="currency" then
        return nativeOrOffline(apiName(GetCurrencyInfo,1,id),"Currency",id)
    elseif kind=="talent" then
        return apiName(GetTalentInfoByID,2,id,apiName(GetActiveSpecGroup,1) or 1)
    elseif kind=="battlepet" then
        return nativeOrOffline(apiName(C_PetJournal and C_PetJournal.GetPetInfoBySpeciesID,1,id),"BattlePet",id)
    elseif kind=="battlePetAbil" then
        return nativeOrOffline(apiName(C_PetBattles and C_PetBattles.GetAbilityInfoByID,2,id),"BattlePetAbility",id)
    elseif kind=="journal" then
        return journalName(id,journalType),"journal"
    elseif kind=="instancelock" then
        return LegionChineseDB.InstanceMaps[id]
    end
end

local function translate(message,names)
    if type(message)~="string" or not message:find("|H",1,true) then return message,false end
    local changed=false
    local missing
    local translated=message:gsub("()(|H(%a+:[^|]+)|h)([^|]-)(|h)",function(position,opening,payload,display,closing)
        local original=opening..display..closing
        -- Native battle-pet ability links have no square brackets. Resolve the
        -- semantic payload in either format and retain the sender's wrapper.
        local caption=display:match("^%[(.*)%]$")
        local bracketed=caption~=nil
        caption=caption or display
        local kind,id,journalType=parseLink(payload)
        if not kind or caption=="" or A.IsChinese(caption)
            or (position>1 and message:sub(position-1,position-1)=="|") then return original end
        -- Query the entire item variant: suffixes and bonuses must not be
        -- discarded by looking up only its base ID. This is the client's cache,
        -- not an external translation service. Cache only within this pass so
        -- an initially unavailable item can resolve when its data arrives.
        local cached=names and names[payload]
        local name,waiting
        if cached then
            name,waiting=cached.name,cached.waiting
        else
            name,waiting=linkedName(kind,id,payload,caption,journalType)
            if not waiting and kind~="item" and kind~="keystone" then waiting=payload end
            -- A cached foreign name is still pending, just like nil. Keep its
            -- dependency so every copy can retry when Chinese data arrives.
            if names then names[payload]={name=name,waiting=waiting} end
        end
        if not A.IsChinese(name) then
            if waiting then missing=missing or {};missing[waiting]=true end
            return original
        end
        if not safeChinese(name) then return original end
        changed=true
        return opening..(bracketed and "["..name.."]" or name)..closing
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
    -- Translate the live entry so other addons' changes and names already
    -- resolved before a client-cache eviction both remain intact.
    local text,_,missing=translate(entry.message,names)
    pending[entry]=missing and {frame=frame,items=missing} or nil
    requestMaps(missing)
    if text~=entry.message then entry.message=text;return true end
    return false
end

local function refreshFrame(frame,names,readyItems)
    if not hasHistory(frame) then return end
    local changed=false
    for _,entry in frame.historyBuffer:EnumerateIndexedEntries() do
        local retry=not readyItems
        local record=pending[entry]
        if readyItems and record then
            for itemID in pairs(readyItems) do
                if record.items[itemID] then retry=true;break end
            end
        end
        if retry and updateEntry(frame,entry,names) then changed=true end
    end
    -- Enumerate the live buffer so removed/replaced entries are never touched.
    -- A cache event retries only matching pending lines; login and refreshes
    -- still refresh all lines. Preserve metadata, order, fade and scroll state.
    if changed then frame:MarkDisplayDirty() end
end

function A.RefreshChatItemLinks(target)
    local names={}
    if target then refreshFrame(target,names)
    else for frame in pairs(chatFrames) do refreshFrame(frame,names) end end
end

local function queueWaiting(itemID)
    if not itemID then return end
    for _,record in pairs(pending) do
        if record.items[itemID] then
            local ready=queuedFrames[record.frame]
            if not ready then ready={};queuedFrames[record.frame]=ready end
            ready[itemID]=true
        end
    end
    if refreshQueued or not next(queuedFrames) then return end
    refreshQueued=true
    local function flush()
        local frames=queuedFrames
        queuedFrames=setmetatable({}, {__mode="k"});refreshQueued=false
        -- Share exact-variant lookups across windows in this batch only. Never
        -- persist cache misses: another item or journal event can resolve them.
        local names={}
        for frame,ready in pairs(frames) do refreshFrame(frame,names,ready) end
    end
    if C_Timer and C_Timer.After then C_Timer.After(0.05,flush) else flush() end
end

local function tooltipReady(tooltip)
    if not next(pending) or not tooltip.GetItem
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
    -- Native windows are handled after formatting, so we retain the original
    -- message entry and can update that same line after a cache miss.
    local methods=frame and chatFrames[frame]
    if methods and methods.AddMessage==frame.AddMessage and hasHistory(frame) then return false end
    local translated,changed,missing=translate(message,{})
    requestMaps(missing)
    if changed then return false,translated,... end
    return false
end

local monsterEvents={CHAT_MSG_MONSTER_EMOTE=true,CHAT_MSG_RAID_BOSS_EMOTE=true,CHAT_MSG_MONSTER_SAY=true,
    CHAT_MSG_MONSTER_YELL=true,CHAT_MSG_MONSTER_WHISPER=true,CHAT_MSG_RAID_BOSS_WHISPER=true}
function A.TranslateMonsterMessage(_,event,message,author,...)
    if not monsterEvents[event]
        or type(message)~="string" then return false end
    local emote=event=="CHAT_MSG_MONSTER_EMOTE" or event=="CHAT_MSG_RAID_BOSS_EMOTE"
    local translated,changed=A.Translate("Gossip",message)
    if emote and not changed and type(author)=="string" and author~="" and message:sub(1,#author)==author then
        -- Some servers send the expanded name instead of the native %s token.
        translated,changed=A.Translate("Gossip","%s"..message:sub(#author+1))
    end
    if not changed then return false end
    -- ChatFrame formats monster emotes with the speaker twice. Permit only
    -- those string slots, never unexpected format directives from data.
    if emote then
        local format=translated:gsub("%%%%","")
        local count;format,count=format:gsub("%%s","")
        if count>2 or format:find("%%") then return false end
    elseif translated:find("%s",1,true) then
        -- Ordinary speech has no speaker slots inside the message itself.
        return false
    else
        -- ChatFrame formats ALL monster messages, but only escapes percent
        -- signs for player messages. Keep shared dialogue data literal and
        -- escape it here, immediately before the native string.format call.
        translated=translated:gsub("%%","%%%%")
    end
    local name=A.Find("NPCNames",author)
    if not safeChinese(name) then name=author end
    return false,translated,name,...
end

function A.InstallChatItemLinks()
    if not installed and type(ChatFrame_AddMessageEventFilter)=="function" then
        for _,event in ipairs(events) do ChatFrame_AddMessageEventFilter("CHAT_MSG_"..event,A.TranslateChatItemLinks) end
        for event in pairs(monsterEvents) do ChatFrame_AddMessageEventFilter(event,A.TranslateMonsterMessage) end
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
