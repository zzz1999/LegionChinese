-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
function A.ParseKeystoneLink(payload)
    if type(payload) ~= "string" then
        return
    end
    local mapID, level, rest = payload:match("^keystone:(%d+):(%d+)(.*)$")
    if not mapID then
        return
    end
    if tonumber(mapID) == 138019 then
        -- Also accept the item-prefixed variant, without interpreting the
        -- generic item:138019 link as a particular dungeon or level.
        mapID = level
        level, rest = rest:match("^:(%d+)(.*)$")
        if not level or (rest ~= "" and not rest:match("^:[%d:]*$")) then
            return
        end
    elseif not rest:match("^:%d+:%d+:%d+$") then
        -- Legion's native format is map:level:affix1:affix2:affix3.
        return
    end
    mapID, level = tonumber(mapID), tonumber(level)
    if mapID > 0 and mapID < 2147483648 and level > 0 and level < 2147483648 then
        return mapID, level
    end
end

local linkKinds = {
    item = true,
    keystone = true,
    quest = true,
    spell = true,
    enchant = true,
    achievement = true,
    currency = true,
    talent = true,
    battlepet = true,
    battlePetAbil = true,
    journal = true,
    instancelock = true,
}
local function safeChinese(text)
    return A.IsChinese(text) and not text:find("|", 1, true) and not text:find("[\r\n]")
end

local function nativeOrOffline(name, category, id)
    if safeChinese(name) then
        return name
    end
    local names = LegionChineseDB.LinkNames and LegionChineseDB.LinkNames[category]
    return names and names[id]
end

local function keystoneName(payload)
    local mapID, level = A.ParseKeystoneLink(payload)
    if not mapID then
        return
    end
    if not C_ChallengeMode or type(C_ChallengeMode.GetMapInfo) ~= "function" then
        return nil, "keystone"
    end
    local ok, name = pcall(C_ChallengeMode.GetMapInfo, mapID)
    if not ok or not safeChinese(name) then
        return nil, "keystone"
    end
    local format = CHALLENGE_MODE_KEYSTONE_HYPERLINK
    if safeChinese(format) and format:find("%%s") and format:find("%%d") then
        local success, caption = pcall(string.format, format, name, level)
        if success and safeChinese(caption) then
            return caption
        end
    end
    -- Official zhCN GlobalStrings, build 7.3.5.26972, record 36209.
    return string.format("钥石：%s (%d)", name, level)
end

local function apiName(api, index, ...)
    if type(api) ~= "function" then
        return
    end
    local result = { pcall(api, ...) }
    if result[1] then
        return result[index + 1]
    end
end

local function parseLink(payload)
    local kind = payload:match("^(%a+):")
    if not linkKinds[kind] then
        return
    end
    if kind == "journal" then
        -- The first field is a type, not an ID: 0 instance, 1 boss, 2 section.
        local journalType, id = payload:match("^journal:([012]):(%d+):%d+$")
        if id and tonumber(id) > 0 then
            return kind, tonumber(id), tonumber(journalType)
        end
    elseif kind == "instancelock" then
        -- Lockouts use a player GUID followed by a Map.db2 ID. Neither is an
        -- Encounter Journal instance ID; retain owner, difficulty and mask.
        local id = payload:match("^instancelock:Player%-%d+%-%x+:(%d+):%d+:%d+$")
        if id and tonumber(id) > 0 then
            return kind, tonumber(id)
        end
    else
        local id, rest = payload:match("^%a+:(%d+)(.*)$")
        if id and (rest == "" or rest:sub(1, 1) == ":") then
            return kind, tonumber(id)
        end
    end
end

local function journalName(id, journalType)
    if journalType == 0 then
        local name = LegionChineseDB.JournalInstances[id]
        if safeChinese(name) then
            return name
        end
        return apiName(EJ_GetInstanceInfo, 1, id)
    elseif journalType == 1 then
        return nativeOrOffline(apiName(EJ_GetEncounterInfo, 1, id), "Encounter", id)
    elseif journalType == 2 then
        local info = apiName(C_EncounterJournal and C_EncounterJournal.GetSectionInfo, 1, id)
        return nativeOrOffline(type(info) == "table" and info.title, "JournalSection", id)
    end
end

-- Resolve semantic links, never arbitrary text enclosed in square brackets.
-- Each resolver uses the linked ID; the payload itself is left untouched.
local function linkedName(kind, id, payload, caption, journalType, cache)
    if kind == "item" then
        if id == 138019 then
            return
        end -- A generic keystone item lacks a dungeon.
        if not cache.itemQueried then
            cache.itemName = apiName(GetItemInfo, 1, payload)
            cache.itemQueried = true
        end
        local name = cache.itemName
        if safeChinese(name) then
            return name, id
        end
        return A.ResolveItemName and A.ResolveItemName(caption, id, payload), id
    elseif kind == "keystone" then
        if A.ParseKeystoneLink(payload) then
            return keystoneName(payload), "keystone"
        end
    elseif kind == "quest" then
        local name, changed = A.Translate("Quests", caption, id, "Title")
        if changed then
            return name
        end
        local link = apiName(GetQuestLink, 1, id)
        if type(link) == "string" then
            local linkedID, title = link:match("|Hquest:(%d+)[^|]*|h%[([^|]-)%]|h")
            if tonumber(linkedID) == id then
                return title
            end
        end
    elseif kind == "spell" or kind == "enchant" then
        local name = apiName(GetSpellInfo, 1, id)
        if safeChinese(name) then
            return name
        end
        if A.ResolveSpellName then
            return A.ResolveSpellName(caption, id)
        end
    elseif kind == "achievement" then
        return nativeOrOffline(apiName(GetAchievementInfo, 2, id), "Achievement", id)
    elseif kind == "currency" then
        return nativeOrOffline(apiName(GetCurrencyInfo, 1, id), "Currency", id)
    elseif kind == "talent" then
        return apiName(GetTalentInfoByID, 2, id, apiName(GetActiveSpecGroup, 1) or 1)
    elseif kind == "battlepet" then
        return nativeOrOffline(
            apiName(C_PetJournal and C_PetJournal.GetPetInfoBySpeciesID, 1, id),
            "BattlePet",
            id
        )
    elseif kind == "battlePetAbil" then
        return nativeOrOffline(
            apiName(C_PetBattles and C_PetBattles.GetAbilityInfoByID, 2, id),
            "BattlePetAbility",
            id
        )
    elseif kind == "journal" then
        return journalName(id, journalType), "journal"
    elseif kind == "instancelock" then
        return LegionChineseDB.InstanceMaps[id]
    end
end

local function translate(message, names)
    if type(message) ~= "string" or not message:find("|H", 1, true) then
        return message, false
    end
    local changed = false
    local missing
    local translated = message:gsub(
        "()(|H(%a+:[^|]+)|h)([^|]-)(|h)",
        function(position, opening, payload, display, closing)
            local original = opening .. display .. closing
            -- Native battle-pet ability links have no square brackets. Resolve the
            -- semantic payload in either format and retain the sender's wrapper.
            local caption = display:match("^%[(.*)%]$")
            local bracketed = caption ~= nil
            caption = caption or display
            local kind, id, journalType = parseLink(payload)
            if
                not kind
                or caption == ""
                or A.IsChinese(caption)
                or (position > 1 and message:sub(position - 1, position - 1) == "|")
            then
                return original
            end
            -- Query the entire item variant: suffixes and bonuses must not be
            -- discarded by looking up only its base ID. This is the client's cache,
            -- not an external translation service. Cache only within this pass so
            -- an initially unavailable item can resolve when its data arrives.
            local cache = names[payload]
            if not cache then
                cache = { captions = {} }
                names[payload] = cache
            end
            local cached = cache.captions[caption]
            local name, waiting
            if cached then
                name, waiting = cached.name, cached.waiting
            else
                name, waiting = linkedName(kind, id, payload, caption, journalType, cache)
                if not waiting and kind ~= "item" and kind ~= "keystone" then
                    waiting = payload
                end
                -- A cached foreign name is still pending, just like nil. Keep its
                -- dependency so every copy can retry when Chinese data arrives.
                -- Source-guarded fallback depends on the visible caption, even
                -- when two links share an ID and the exact same payload.
                cache.captions[caption] = { name = name, waiting = waiting }
            end
            if not A.IsChinese(name) then
                if waiting then
                    missing = missing or {}
                    missing[waiting] = true
                end
                return original
            end
            if not safeChinese(name) then
                return original
            end
            changed = true
            return opening .. (bracketed and "[" .. name .. "]" or name) .. closing
        end
    )
    return translated, changed, missing
end

A.Hyperlinks = { Translate = translate, Parse = parseLink, IsSafeChinese = safeChinese }
