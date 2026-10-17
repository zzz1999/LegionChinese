-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = TauriChinese, TauriChineseDB
local tags = { html=true, body=true, p=true, br=true, h1=true, h2=true, h3=true, h4=true, h5=true, h6=true, font=true, img=true }
local classes = { WARRIOR="战士", PALADIN="圣骑士", HUNTER="猎人", ROGUE="潜行者", PRIEST="牧师", DEATHKNIGHT="死亡骑士", SHAMAN="萨满祭司", MAGE="法师", WARLOCK="术士", MONK="武僧", DRUID="德鲁伊", DEMONHUNTER="恶魔猎手" }
local races = { Human="人类", Orc="兽人", Dwarf="矮人", NightElf="暗夜精灵", Scourge="亡灵", Tauren="牛头人", Gnome="侏儒", Troll="巨魔", Goblin="地精", BloodElf="血精灵", Draenei="德莱尼", Worgen="狼人", Pandaren="熊猫人", Nightborne="夜之子", HighmountainTauren="至高岭牛头人", VoidElf="虚空精灵", LightforgedDraenei="光铸德莱尼" }
-- Server text can contain English substitutions even on a Chinese client.
local englishClasses = { WARRIOR="Warrior", PALADIN="Paladin", HUNTER="Hunter", ROGUE="Rogue", PRIEST="Priest", DEATHKNIGHT="Death Knight", SHAMAN="Shaman", MAGE="Mage", WARLOCK="Warlock", MONK="Monk", DRUID="Druid", DEMONHUNTER="Demon Hunter" }
local englishRaces = { Human="Human", Orc="Orc", Dwarf="Dwarf", NightElf="Night Elf", Scourge="Undead", Tauren="Tauren", Gnome="Gnome", Troll="Troll", Goblin="Goblin", BloodElf="Blood Elf", Draenei="Draenei", Worgen="Worgen", Pandaren="Pandaren", Nightborne="Nightborne", HighmountainTauren="Highmountain Tauren", VoidElf="Void Elf", LightforgedDraenei="Lightforged Draenei" }
A.font = "Interface\\AddOns\\TauriChinese\\Media\\LXGWWenKaiLite-Regular.ttf"

local function strip(text)
    text = text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
    text = text:gsub("|H[^|]*|h(.-)|h", "%1"):gsub("|[TA].-|[ta]", "")
    text = text:gsub("<([^>]+)>", function(body)
        local tag = body:match("^/?([%a%d]+)")
        if tag and tags[tag:lower()] then return " " end
        return "<" .. body .. ">"
    end)
    return text:gsub("&[Nn][Bb][Ss][Pp];", " "):gsub("&[Qq][Uu][Oo][Tt];", '"')
        :gsub("&[Ll][Tt];", "<"):gsub("&[Gg][Tt];", ">"):gsub("&[Aa][Mm][Pp];", "&")
end

-- Literal matching prevents player names containing pattern metacharacters from
-- being interpreted as Lua patterns. ASCII word boundaries avoid replacing Ann in cannot.
-- Underscores are separators: book signatures commonly render as ___Alice.
local function replaceLiteral(text, needle, replacement)
    if not needle or needle == "" then return text end
    local result, pos = {}, 1
    while true do
        local first, last = text:find(needle, pos, true)
        if not first then result[#result+1] = text:sub(pos); break end
        local left = first > 1 and text:sub(first-1,first-1) or ""
        local right = text:sub(last+1,last+1)
        local boundary = not (needle:sub(1,1):match("%w") and left:match("%w"))
            and not (needle:sub(-1):match("%w") and right:match("%w"))
        result[#result+1] = text:sub(pos,first-1)
        result[#result+1] = boundary and replacement or text:sub(first,last)
        pos = last+1
    end
    return table.concat(result)
end

local function playerTokens(text)
    local name = UnitName and UnitName("player")
    local class, classToken, race, raceToken
    if UnitClass then class,classToken=UnitClass("player") end
    if UnitRace then race,raceToken=UnitRace("player") end
    for _, pair in ipairs({{name,"$N"},{class,"$C"},{race,"$R"},
        {englishClasses[classToken],"$C"},{englishRaces[raceToken],"$R"}}) do
        if pair[1] then
            text = replaceLiteral(text, pair[1], pair[2])
            text = replaceLiteral(text, pair[1]:lower(), pair[2])
            text = replaceLiteral(text, pair[1]:upper(), pair[2])
        end
    end
    return text
end

function A.IsChinese(text)
    if type(text) ~= "string" then return false end
    text = strip(text)
    if not text:find("[\128-\255]") then return false end
    local withoutTokens = playerTokens(text):gsub("%$[NCR]", "")
    -- A localized player name/class/race in English prose is not a Chinese
    -- sentence. Standalone Chinese names and labels remain untouched.
    if withoutTokens:find("%a") or withoutTokens:find("[\128-\255]") then text=withoutTokens end
    local i = 1
    while i <= #text do
        local a,b,c,d = text:byte(i,i+3)
        local code, length = a, 1
        if a >= 224 and a <= 239 and b and c then
            code = (a-224)*4096+(b-128)*64+c-128; length=3
        elseif a >= 240 and a <= 244 and b and c and d then
            code = (a-240)*262144+(b-128)*4096+(c-128)*64+d-128; length=4
        elseif a >= 192 and a <= 223 and b then length=2 end
        if (code >= 0x3400 and code <= 0x4dbf) or (code >= 0x4e00 and code <= 0x9fff)
            or (code >= 0xf900 and code <= 0xfaff) or (code >= 0x20000 and code <= 0x323af) then return true end
        i=i+length
    end
    return false
end

local function substituteTokens(text, values)
    local result, pos = {}, 1
    while true do
        local first = text:find("$",pos,true)
        if not first then result[#result+1]=text:sub(pos);break end
        result[#result+1]=text:sub(pos,first-1)
        local token=text:sub(first+1,first+1):lower()
        if values[token]~=nil then
            result[#result+1]=values[token];pos=first+2
            -- Some sources close $N/$C/$R with a dollar. It cannot consume
            -- the start of the next token, including unsupported tokens.
            if token~="b" and text:sub(pos,pos)=="$" and not text:sub(pos+1,pos+1):match("%a") then pos=pos+1 end
        else
            result[#result+1]="$";pos=first+1
        end
    end
    return table.concat(result)
end

function A.Normalize(text, dynamic)
    text = strip(text or "")
    if dynamic then text = playerTokens(text) end
    text = substituteTokens(text,{n="~n~",c="~c~",r="~r~",b=" "})
    return text:lower():gsub("%s", "")
end

local function hex(value)
    local result = ""
    for _=1,8 do
        local digit = value % 16
        result = ("0123456789abcdef"):sub(digit+1,digit+1)..result
        value = math.floor(value/16)
    end
    return result
end

function A.Fingerprint(text)
    -- Floating point also preserves Lua 5.1 arithmetic in test runtimes with integer subtypes.
    local a,b = 5381.0,0.0
    for i=1,#text do
        local byte = text:byte(i)
        a=(a*33.0+byte)%4294967296.0
        b=(b*65599.0+byte)%4294967296.0
    end
    return hex(a)..hex(b)..":"..#text
end

function A.Find(category, text)
    local index=D[category]
    if type(text)~="string" or text=="" or A.IsChinese(text) or not index then return nil end
    local id=index[A.Fingerprint(A.Normalize(text,false))]
    if not id then id=index[A.Fingerprint(A.Normalize(text,true))] end
    return id and D.Strings[id] or nil
end

function A.Render(text)
    if type(text)~="string" then return nil end
    local female=UnitSex and UnitSex("player")==3
    text=text:gsub("%$[Gg]%s*%((.-);(.-)%)",function(m,f) return female and f or m end)
        :gsub("%$[Gg]([^:;]*):([^;]*);",function(m,f) return female and f or m end)
    local localizedClass, classToken, localizedRace, raceToken
    if UnitClass then localizedClass,classToken=UnitClass("player") end
    if UnitRace then localizedRace,raceToken=UnitRace("player") end
    local values={n=(UnitName and UnitName("player")) or "", c=classes[classToken] or localizedClass or "", r=races[raceToken] or localizedRace or "", b="\n"}
    text=substituteTokens(text,values)
    if text:find("%$%a") then return nil end -- Preserve the original instead of exposing unsupported tokens.
    return text
end

local function findObjective(original)
    local replacement=A.Find("Objectives",original)
    if replacement then return replacement end
    local label=original:gsub("^|c%x%x%x%x%x%x%x%x",""):gsub("|r$","")
    local suffix,completion=""," ("..(COMPLETE or "Complete")..")"
    -- Blizzard appends this client-localized status after the server text.
    -- Remove only that exact suffix before language detection and lookup.
    if label:sub(-#completion)==completion then
        label=label:sub(1,-#completion-1);suffix=completion
    end
    replacement=A.Find("Objectives",label)
    if not replacement then
        local base,counter=label:match("^(.-)(%s*:%s*%d+%s*/%s*%d+%s*)$")
        if base then replacement=A.Find("Objectives",base);suffix=counter..suffix end
    end
    return replacement,suffix
end

function A.Translate(category, original, questID, field)
    if type(original)~="string" or original=="" then return original,false end
    local replacement,suffix
    if category=="Objectives" then
        replacement,suffix=findObjective(original)
    elseif A.IsChinese(original) then
        return original,false
    elseif category=="Quests" then
        local record=D.Quests[tonumber(questID)]
        replacement=record and record[field]
        if not replacement and field=="Title" then replacement=A.Find("Titles",original) end
        if not replacement and (field=="Progress" or field=="Completion") then replacement=A.Find("Gossip",original) end
    else
        replacement=A.Find(category,original)
    end
    if not replacement or not A.IsChinese(replacement) then return original,false end
    replacement=A.Render(replacement)
    if not replacement or replacement=="" then return original,false end
    return replacement..(suffix or ""),true
end

function A.SetFont(widget, html)
    if widget.GetFontString then widget=widget:GetFontString() end
    if not widget or not widget.SetFont then return end
    if html then
        for _,tag in ipairs({"P","H1","H2","H3"}) do
            local _,size,flags=widget:GetFont(tag)
            widget:SetFont(tag,A.font,size or 14,flags or "")
        end
    else
        local _,size,flags=widget:GetFont()
        widget:SetFont(A.font,size or 14,flags or "")
    end
end

function A.Apply(widget, category, questID, field, sourceText)
    if not widget or not widget.GetText or not widget.SetText then return false end
    local original=widget:GetText()
    local first,last
    if sourceText~=nil then
        if type(original)~="string" or type(sourceText)~="string" or sourceText=="" then return false end
        first,last=original:find(sourceText,1,true)
        if not first then return false end -- The widget no longer shows this quest.
    end
    local translated,changed=A.Translate(category,sourceText or original,questID,field)
    if changed then
        if first then
            -- Replace only the raw title returned by the quest API; preserve
            -- level/party/ID prefixes, status suffixes and existing markup.
            translated=original:sub(1,first-1)..translated..original:sub(last+1)
        else
            local color=original:match("^(|c%x%x%x%x%x%x%x%x)")
            if color and original:sub(-2)=="|r" then translated=color..translated.."|r" end
        end
        A.SetFont(widget)
        widget:SetText(translated)
    end
    return changed
end

function A.Enabled()
    return not TauriChineseSettings or TauriChineseSettings.enabled~=false
end

function A.InitializeSettings()
    if type(TauriChineseSettings)~="table" then TauriChineseSettings={} end
    if TauriChineseSettings.enabled==nil then TauriChineseSettings.enabled=true end
    return TauriChineseSettings
end
