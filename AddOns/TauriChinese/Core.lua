-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = TauriChinese, TauriChineseDB
local tags = { html=true, body=true, p=true, br=true, h1=true, h2=true, h3=true, h4=true, h5=true, h6=true, font=true, img=true }
local classes = { WARRIOR="战士", PALADIN="圣骑士", HUNTER="猎人", ROGUE="潜行者", PRIEST="牧师", DEATHKNIGHT="死亡骑士", SHAMAN="萨满祭司", MAGE="法师", WARLOCK="术士", MONK="武僧", DRUID="德鲁伊", DEMONHUNTER="恶魔猎手" }
local races = { Human="人类", Orc="兽人", Dwarf="矮人", NightElf="暗夜精灵", Scourge="亡灵", Tauren="牛头人", Gnome="侏儒", Troll="巨魔", Goblin="地精", BloodElf="血精灵", Draenei="德莱尼", Worgen="狼人", Pandaren="熊猫人", Nightborne="夜之子", HighmountainTauren="至高岭牛头人", VoidElf="虚空精灵", LightforgedDraenei="光铸德莱尼" }
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
local function replaceLiteral(text, needle, replacement)
    if not needle or needle == "" then return text end
    local result, pos = {}, 1
    while true do
        local first, last = text:find(needle, pos, true)
        if not first then result[#result+1] = text:sub(pos); break end
        local left = first > 1 and text:sub(first-1,first-1) or ""
        local right = text:sub(last+1,last+1)
        local boundary = not (needle:sub(1,1):match("[%w_]") and left:match("[%w_]"))
            and not (needle:sub(-1):match("[%w_]") and right:match("[%w_]"))
        result[#result+1] = text:sub(pos,first-1)
        result[#result+1] = boundary and replacement or text:sub(first,last)
        pos = last+1
    end
    return table.concat(result)
end

local function playerTokens(text)
    local name = UnitName and UnitName("player")
    local class = UnitClass and UnitClass("player")
    local race = UnitRace and UnitRace("player")
    for _, pair in ipairs({{name,"$N"},{class,"$C"},{race,"$R"}}) do
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
    local name = UnitName and UnitName("player")
    if name then
        local withoutName = replaceLiteral(text,name,"")
        -- A Chinese name embedded in an English sentence is not Chinese prose.
        -- A field consisting only of the name is conservatively left untouched.
        if withoutName:find("%a") or withoutName:find("[\128-\255]") then text=withoutName end
    end
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

function A.Normalize(text, dynamic)
    text = strip(text or "")
    if dynamic then text = playerTokens(text) end
    text = text:gsub("%$[Bb]", " "):gsub("%$([NnCcRr])%$?", function(token) return "~"..token:lower().."~" end)
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
    local values={n=(UnitName and UnitName("player")) or "", c=classes[classToken] or localizedClass or "", r=races[raceToken] or localizedRace or ""}
    text=text:gsub("%$([NnCcRr])%$?",function(token) return values[token:lower()] end):gsub("%$[Bb]","\n")
    if text:find("%$%a") then return nil end -- Preserve the original instead of exposing unsupported tokens.
    return text
end

function A.Translate(category, original, questID, field)
    if type(original)~="string" or original=="" or A.IsChinese(original) then return original,false end
    local replacement
    if category=="Quests" then
        local record=D.Quests[tonumber(questID)]
        replacement=record and record[field]
        if not replacement and field=="Title" then replacement=A.Find("Titles",original) end
        if not replacement and (field=="Progress" or field=="Completion") then replacement=A.Find("Gossip",original) end
    else
        replacement=A.Find(category,original)
        if not replacement and category=="Objectives" then
            local label,counter=original:match("^(.-)(%s*:%s*%d+%s*/%s*%d+.*)$")
            if label then
                local translated=A.Find(category,label)
                if translated then replacement=translated..counter end
            end
        end
    end
    if not replacement or not A.IsChinese(replacement) then return original,false end
    replacement=A.Render(replacement)
    if not replacement or replacement=="" then return original,false end
    return replacement,true
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

function A.Apply(widget, category, questID, field)
    if not widget or not widget.GetText or not widget.SetText then return false end
    local original=widget:GetText()
    local translated,changed=A.Translate(category,original,questID,field)
    if changed then
        local color=original:match("^(|c%x%x%x%x%x%x%x%x)")
        if color and original:sub(-2)=="|r" then translated=color..translated.."|r" end
        A.SetFont(widget)
        widget:SetText(translated)
    end
    return changed
end

function A.Enabled()
    return not TauriChineseSettings or TauriChineseSettings.enabled~=false
end
