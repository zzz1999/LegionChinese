-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
local tags = {
    html = true,
    body = true,
    p = true,
    br = true,
    h1 = true,
    h2 = true,
    h3 = true,
    h4 = true,
    h5 = true,
    h6 = true,
    font = true,
    img = true,
}
local classes = {
    WARRIOR = "战士",
    PALADIN = "圣骑士",
    HUNTER = "猎人",
    ROGUE = "潜行者",
    PRIEST = "牧师",
    DEATHKNIGHT = "死亡骑士",
    SHAMAN = "萨满祭司",
    MAGE = "法师",
    WARLOCK = "术士",
    MONK = "武僧",
    DRUID = "德鲁伊",
    DEMONHUNTER = "恶魔猎手",
}
local races = {
    Human = "人类",
    Orc = "兽人",
    Dwarf = "矮人",
    NightElf = "暗夜精灵",
    Scourge = "亡灵",
    Tauren = "牛头人",
    Gnome = "侏儒",
    Troll = "巨魔",
    Goblin = "地精",
    BloodElf = "血精灵",
    Draenei = "德莱尼",
    Worgen = "狼人",
    Pandaren = "熊猫人",
    Nightborne = "夜之子",
    HighmountainTauren = "至高岭牛头人",
    VoidElf = "虚空精灵",
    LightforgedDraenei = "光铸德莱尼",
}
-- Server text can contain English substitutions even on a Chinese client.
local englishClasses = {
    WARRIOR = "Warrior",
    PALADIN = "Paladin",
    HUNTER = "Hunter",
    ROGUE = "Rogue",
    PRIEST = "Priest",
    DEATHKNIGHT = "Death Knight",
    SHAMAN = "Shaman",
    MAGE = "Mage",
    WARLOCK = "Warlock",
    MONK = "Monk",
    DRUID = "Druid",
    DEMONHUNTER = "Demon Hunter",
}
local englishRaces = {
    Human = "Human",
    Orc = "Orc",
    Dwarf = "Dwarf",
    NightElf = "Night Elf",
    Scourge = "Undead",
    Tauren = "Tauren",
    Gnome = "Gnome",
    Troll = "Troll",
    Goblin = "Goblin",
    BloodElf = "Blood Elf",
    Draenei = "Draenei",
    Worgen = "Worgen",
    Pandaren = "Pandaren",
    Nightborne = "Nightborne",
    HighmountainTauren = "Highmountain Tauren",
    VoidElf = "Void Elf",
    LightforgedDraenei = "Lightforged Draenei",
}

local function strip(text)
    text = text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
    text = text:gsub("|H[^|]*|h(.-)|h", "%1"):gsub("|[TA].-|[ta]", "")
    text = text:gsub("<([^>]+)>", function(body)
        local tag = body:match("^/?([%a%d]+)")
        if tag and tags[tag:lower()] then
            return " "
        end
        return "<" .. body .. ">"
    end)
    return text:gsub("&[Nn][Bb][Ss][Pp];", " ")
        :gsub("&[Qq][Uu][Oo][Tt];", '"')
        :gsub("&[Ll][Tt];", "<")
        :gsub("&[Gg][Tt];", ">")
        :gsub("&[Aa][Mm][Pp];", "&")
end

-- Literal matching prevents player names containing pattern metacharacters from
-- being interpreted as Lua patterns. ASCII word boundaries avoid replacing Ann in cannot.
-- Underscores are separators: book signatures commonly render as ___Alice.
local function replaceLiteral(text, needle, replacement)
    if not needle or needle == "" then
        return text
    end
    local result, pos = {}, 1
    while true do
        local first, last = text:find(needle, pos, true)
        if not first then
            result[#result + 1] = text:sub(pos)
            break
        end
        local left = first > 1 and text:sub(first - 1, first - 1) or ""
        local right = text:sub(last + 1, last + 1)
        local boundary = not (needle:sub(1, 1):match("%w") and left:match("%w"))
            and not (needle:sub(-1):match("%w") and right:match("%w"))
        result[#result + 1] = text:sub(pos, first - 1)
        result[#result + 1] = boundary and replacement or text:sub(first, last)
        pos = last + 1
    end
    return table.concat(result)
end

local aliasState
local function playerAliases()
    local name = UnitName and UnitName("player")
    local class, classToken, race, raceToken
    if UnitClass then
        class, classToken = UnitClass("player")
    end
    if UnitRace then
        race, raceToken = UnitRace("player")
    end
    if
        aliasState
        and aliasState.name == name
        and aliasState.class == class
        and aliasState.classToken == classToken
        and aliasState.race == race
        and aliasState.raceToken == raceToken
    then
        return aliasState.aliases
    end
    local aliases, seen = {}, {}
    for _, pair in ipairs({
        { name, "$N" },
        { class, "$C" },
        { race, "$R" },
        { englishClasses[classToken], "$C" },
        { englishRaces[raceToken], "$R" },
    }) do
        if pair[1] then
            for _, value in ipairs({ pair[1], pair[1]:lower(), pair[1]:upper() }) do
                local key = value .. pair[2]
                if value ~= "" and not seen[key] then
                    seen[key] = true
                    aliases[#aliases + 1] = { value, pair[2] }
                end
            end
        end
    end
    aliasState = {
        name = name,
        class = class,
        classToken = classToken,
        race = race,
        raceToken = raceToken,
        aliases = aliases,
    }
    return aliases
end

local function playerTokens(text)
    for _, pair in ipairs(playerAliases()) do
        text = replaceLiteral(text, pair[1], pair[2])
    end
    return text
end

-- Return whether Han remains, and whether the remainder contains prose rather
-- than just spaces, numbers and punctuation (including Chinese punctuation).
local function textLanguage(text)
    local prose = false
    local i = 1
    while i <= #text do
        local a, b, c, d = text:byte(i, i + 3)
        local code, length = a, 1
        if a >= 224 and a <= 239 and b and c then
            code = (a - 224) * 4096 + (b - 128) * 64 + c - 128
            length = 3
        elseif a >= 240 and a <= 244 and b and c and d then
            code = (a - 240) * 262144 + (b - 128) * 4096 + (c - 128) * 64 + d - 128
            length = 4
        elseif a >= 192 and a <= 223 and b then
            code = (a - 192) * 64 + b - 128
            length = 2
        end
        if
            (code >= 0x3400 and code <= 0x4dbf)
            or (code >= 0x4e00 and code <= 0x9fff)
            or (code >= 0xf900 and code <= 0xfaff)
            or (code >= 0x20000 and code <= 0x323af)
        then
            return true
        end
        local punctuation = (code < 128 and not text:sub(i, i):match("%a"))
            or code == 0xa0
            or (code >= 0x2000 and code <= 0x206f)
            or (code >= 0x3000 and code <= 0x303f)
            or (code >= 0xff01 and code <= 0xff20)
            or (code >= 0xff3b and code <= 0xff40)
            or (code >= 0xff5b and code <= 0xff65)
        if not punctuation then
            prose = true
        end
        i = i + length
    end
    return false, prose
end

function A.IsChinese(text)
    if type(text) ~= "string" then
        return false
    end
    text = strip(text)
    if not text:find("[\128-\255]") then
        return false
    end
    local withoutTokens = playerTokens(text):gsub("%$[NCR]", "")
    local chinese, prose = textLanguage(withoutTokens)
    if chinese then
        return true
    end
    -- A Chinese name in foreign prose is a substitution, but "人类。" and
    -- "法师！" are complete Chinese labels and must remain Chinese.
    if prose then
        return false
    end
    return (textLanguage(text))
end

local function substituteTokens(text, values)
    local result, pos = {}, 1
    while true do
        local first = text:find("$", pos, true)
        if not first then
            result[#result + 1] = text:sub(pos)
            break
        end
        result[#result + 1] = text:sub(pos, first - 1)
        local token = text:sub(first + 1, first + 1):lower()
        if values[token] ~= nil and (token == "b" or not text:sub(first + 2, first + 2):match("%a")) then
            result[#result + 1] = values[token]
            pos = first + 2
            -- Some sources close $N/$C/$R with a dollar. It cannot consume
            -- the start of the next token, including unsupported tokens.
            if
                token ~= "b"
                and text:sub(pos, pos) == "$"
                and not text:sub(pos + 1, pos + 1):match("[%a%d]")
            then
                pos = pos + 1
            end
        else
            result[#result + 1] = "$"
            pos = first + 1
        end
    end
    return table.concat(result)
end

local normalized, normalizationKeys, normalizationSlot = {}, {}, 1
function A.Normalize(text, dynamic)
    local source = text or ""
    if not dynamic and normalized[source] then
        return normalized[source][1], normalized[source][2]
    end
    text = strip(source)
    if dynamic then
        text = playerTokens(text)
    end
    text = substituteTokens(text, { n = "~n~", c = "~c~", r = "~r~", b = " " })
    local value, count = text:lower():gsub("%s", "")
    if not dynamic and #source <= 2048 then
        local old = normalizationKeys[normalizationSlot]
        if old then
            normalized[old] = nil
        end
        normalized[source] = { value, count }
        normalizationKeys[normalizationSlot] = source
        normalizationSlot = normalizationSlot % 128 + 1
    end
    return value, count
end

local function hex(value)
    local result = ""
    for _ = 1, 8 do
        local digit = value % 16
        result = ("0123456789abcdef"):sub(digit + 1, digit + 1) .. result
        value = math.floor(value / 16)
    end
    return result
end

-- Fingerprints depend only on text, so a small FIFO is safe across player,
-- locale and translation changes. Bound both count and retained input length;
-- long book pages are hashed normally instead of occupying the cache.
local fingerprints, fingerprintKeys = {}, {}
local fingerprintSlot = 1
function A.Fingerprint(text)
    local cached = fingerprints[text]
    if cached then
        return cached
    end
    -- Floating point also preserves Lua 5.1 arithmetic in test runtimes with integer subtypes.
    local a, b = 5381.0, 0.0
    for i = 1, #text do
        local byte = text:byte(i)
        a = (a * 33.0 + byte) % 4294967296.0
        b = (b * 65599.0 + byte) % 4294967296.0
    end
    local key = hex(a) .. hex(b) .. ":" .. #text
    if #text <= 512 then
        local old = fingerprintKeys[fingerprintSlot]
        if old then
            fingerprints[old] = nil
        end
        fingerprints[text] = key
        fingerprintKeys[fingerprintSlot] = text
        fingerprintSlot = fingerprintSlot % 128 + 1
    end
    return key
end

function A.Render(text)
    if type(text) ~= "string" then
        return nil
    end
    local female = UnitSex and UnitSex("player") == 3
    text = text:gsub("%$[Gg]%s*%((.-);(.-)%)", function(m, f)
        return female and f or m
    end):gsub("%$[Gg]([^:;]*):([^;]*);", function(m, f)
        return female and f or m
    end)
    local localizedClass, classToken, localizedRace, raceToken
    if UnitClass then
        localizedClass, classToken = UnitClass("player")
    end
    if UnitRace then
        localizedRace, raceToken = UnitRace("player")
    end
    local values = {
        n = (UnitName and UnitName("player")) or "",
        c = classes[classToken] or localizedClass or "",
        r = races[raceToken] or localizedRace or "",
        b = "\n",
    }
    text = substituteTokens(text, values)
    if text:find("%$[%a%d]") then
        return nil
    end -- Preserve the original instead of exposing unsupported tokens.
    return text
end

-- Only the reviewed quest-template module consumes these token IDs. $p is a
-- player name; $r keeps the existing Chinese race map and known source aliases.
function A.QuestVariableValue(token)
    if token == -1 then
        local name = UnitName and UnitName("player")
        if type(name) == "string" and name ~= "" then
            return name, { name }
        end
    elseif token == -2 and UnitRace then
        local localized, race = UnitRace("player")
        local translated = races[race]
        if translated then
            local aliases = {}
            if englishRaces[race] then
                aliases[#aliases + 1] = englishRaces[race]
            end
            if type(localized) == "string" and localized ~= "" then
                aliases[#aliases + 1] = localized
            end
            return translated, aliases
        end
    end
end

A.Text = { Strip = strip, PlayerAliases = playerAliases }
