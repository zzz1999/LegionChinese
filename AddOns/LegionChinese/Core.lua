-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
local tags = { html=true, body=true, p=true, br=true, h1=true, h2=true, h3=true, h4=true, h5=true, h6=true, font=true, img=true }
local classes = { WARRIOR="战士", PALADIN="圣骑士", HUNTER="猎人", ROGUE="潜行者", PRIEST="牧师", DEATHKNIGHT="死亡骑士", SHAMAN="萨满祭司", MAGE="法师", WARLOCK="术士", MONK="武僧", DRUID="德鲁伊", DEMONHUNTER="恶魔猎手" }
local races = { Human="人类", Orc="兽人", Dwarf="矮人", NightElf="暗夜精灵", Scourge="亡灵", Tauren="牛头人", Gnome="侏儒", Troll="巨魔", Goblin="地精", BloodElf="血精灵", Draenei="德莱尼", Worgen="狼人", Pandaren="熊猫人", Nightborne="夜之子", HighmountainTauren="至高岭牛头人", VoidElf="虚空精灵", LightforgedDraenei="光铸德莱尼" }
-- Server text can contain English substitutions even on a Chinese client.
local englishClasses = { WARRIOR="Warrior", PALADIN="Paladin", HUNTER="Hunter", ROGUE="Rogue", PRIEST="Priest", DEATHKNIGHT="Death Knight", SHAMAN="Shaman", MAGE="Mage", WARLOCK="Warlock", MONK="Monk", DRUID="Druid", DEMONHUNTER="Demon Hunter" }
local englishRaces = { Human="Human", Orc="Orc", Dwarf="Dwarf", NightElf="Night Elf", Scourge="Undead", Tauren="Tauren", Gnome="Gnome", Troll="Troll", Goblin="Goblin", BloodElf="Blood Elf", Draenei="Draenei", Worgen="Worgen", Pandaren="Pandaren", Nightborne="Nightborne", HighmountainTauren="Highmountain Tauren", VoidElf="Void Elf", LightforgedDraenei="Lightforged Draenei" }

function A.ParseKeystoneLink(payload)
    if type(payload)~="string" then return end
    local mapID,level,rest=payload:match("^keystone:(%d+):(%d+)(.*)$")
    if not mapID then return end
    if tonumber(mapID)==138019 then
        -- Also accept the item-prefixed variant, without interpreting the
        -- generic item:138019 link as a particular dungeon or level.
        mapID=level;level,rest=rest:match("^:(%d+)(.*)$")
        if not level or (rest~="" and not rest:match("^:[%d:]*$")) then return end
    elseif not rest:match("^:%d+:%d+:%d+$") then
        -- Legion's native format is map:level:affix1:affix2:affix3.
        return
    end
    mapID,level=tonumber(mapID),tonumber(level)
    if mapID>0 and mapID<2147483648 and level>0 and level<2147483648 then return mapID,level end
end

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

local function playerAliases()
    local name = UnitName and UnitName("player")
    local class, classToken, race, raceToken
    if UnitClass then class,classToken=UnitClass("player") end
    if UnitRace then race,raceToken=UnitRace("player") end
    local aliases,seen={},{}
    for _, pair in ipairs({{name,"$N"},{class,"$C"},{race,"$R"},
        {englishClasses[classToken],"$C"},{englishRaces[raceToken],"$R"}}) do
        if pair[1] then
            for _,value in ipairs({pair[1],pair[1]:lower(),pair[1]:upper()}) do
                local key=value..pair[2]
                if value~="" and not seen[key] then
                    seen[key]=true;aliases[#aliases+1]={value,pair[2]}
                end
            end
        end
    end
    return aliases
end

local function playerTokens(text)
    for _,pair in ipairs(playerAliases()) do text=replaceLiteral(text,pair[1],pair[2]) end
    return text
end

-- Return whether Han remains, and whether the remainder contains prose rather
-- than just spaces, numbers and punctuation (including Chinese punctuation).
local function textLanguage(text)
    local prose=false
    local i = 1
    while i <= #text do
        local a,b,c,d = text:byte(i,i+3)
        local code, length = a, 1
        if a >= 224 and a <= 239 and b and c then
            code = (a-224)*4096+(b-128)*64+c-128; length=3
        elseif a >= 240 and a <= 244 and b and c and d then
            code = (a-240)*262144+(b-128)*4096+(c-128)*64+d-128; length=4
        elseif a >= 192 and a <= 223 and b then code=(a-192)*64+b-128;length=2 end
        if (code >= 0x3400 and code <= 0x4dbf) or (code >= 0x4e00 and code <= 0x9fff)
            or (code >= 0xf900 and code <= 0xfaff) or (code >= 0x20000 and code <= 0x323af) then return true end
        local punctuation=(code<128 and not text:sub(i,i):match("%a")) or code==0xa0
            or (code>=0x2000 and code<=0x206f) or (code>=0x3000 and code<=0x303f)
            or (code>=0xff01 and code<=0xff20) or (code>=0xff3b and code<=0xff40)
            or (code>=0xff5b and code<=0xff65)
        if not punctuation then prose=true end
        i=i+length
    end
    return false,prose
end

function A.IsChinese(text)
    if type(text) ~= "string" then return false end
    text=strip(text)
    if not text:find("[\128-\255]") then return false end
    local withoutTokens=playerTokens(text):gsub("%$[NCR]", "")
    local chinese,prose=textLanguage(withoutTokens)
    if chinese then return true end
    -- A Chinese name in foreign prose is a substitution, but "人类。" and
    -- "法师！" are complete Chinese labels and must remain Chinese.
    if prose then return false end
    return (textLanguage(text))
end

local function substituteTokens(text, values)
    local result, pos = {}, 1
    while true do
        local first = text:find("$",pos,true)
        if not first then result[#result+1]=text:sub(pos);break end
        result[#result+1]=text:sub(pos,first-1)
        local token=text:sub(first+1,first+1):lower()
        if values[token]~=nil and (token=="b" or not text:sub(first+2,first+2):match("%a")) then
            result[#result+1]=values[token];pos=first+2
            -- Some sources close $N/$C/$R with a dollar. It cannot consume
            -- the start of the next token, including unsupported tokens.
            if token~="b" and text:sub(pos,pos)=="$" and not text:sub(pos+1,pos+1):match("[%a%d]") then pos=pos+1 end
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

-- Fingerprints depend only on text, so a small FIFO is safe across player,
-- locale and translation changes. Bound both count and retained input length;
-- long book pages are hashed normally instead of occupying the cache.
local fingerprints,fingerprintKeys={},{}
local fingerprintSlot=1
function A.Fingerprint(text)
    local cached=fingerprints[text]
    if cached then return cached end
    -- Floating point also preserves Lua 5.1 arithmetic in test runtimes with integer subtypes.
    local a,b = 5381.0,0.0
    for i=1,#text do
        local byte = text:byte(i)
        a=(a*33.0+byte)%4294967296.0
        b=(b*65599.0+byte)%4294967296.0
    end
    local key=hex(a)..hex(b)..":"..#text
    if #text<=512 then
        local old=fingerprintKeys[fingerprintSlot]
        if old then fingerprints[old]=nil end
        fingerprints[text]=key;fingerprintKeys[fingerprintSlot]=text
        fingerprintSlot=fingerprintSlot%128+1
    end
    return key
end

local function findDynamic(index,text,values)
    -- Each occurrence may be either a substituted player value or an ordinary
    -- word. For example only the first "mage" in "Hello, Mage; ask a mage"
    -- might be $C. Never replace all occurrences and guess a translation.
    local matches={}
    text=strip(text)
    for _,pair in ipairs(playerAliases()) do
        local pos=1
        while true do
            local first,last=text:find(pair[1],pos,true)
            if not first then break end
            local left=first>1 and text:sub(first-1,first-1) or ""
            local right=text:sub(last+1,last+1)
            if not (pair[1]:sub(1,1):match("%w") and left:match("%w"))
                and not (pair[1]:sub(-1):match("%w") and right:match("%w")) then
                matches[first]=matches[first] or {}
                matches[first][#matches[first]+1]={last=last,token=pair[2]}
            end
            pos=last+1
        end
    end
    local positions={};for first in pairs(matches) do positions[#positions+1]=first end
    table.sort(positions)
    if #positions==0 then return nil end
    local found,conflict,exhausted,leaves,bytes=nil,false,false,0,0
    local seen={}
    local function visit(pos,part,changed)
        if conflict or exhausted then return end
        local first
        for _,candidate in ipairs(positions) do if candidate>=pos then first=candidate;break end end
        if not first then
            if not changed then return end
            local normalized=A.Normalize(part..text:sub(pos),false)
            if seen[normalized] then return end
            seen[normalized]=true;leaves=leaves+1;bytes=bytes+#normalized
            -- Bound work on long/unusual server text. An incomplete search is
            -- uncertain, so it must preserve the original even after a hit.
            if leaves>256 or bytes>262144 then exhausted=true;return end
            local id=index[A.Fingerprint(normalized)]
            if id and values[id] then
                if found and values[found]~=values[id] then conflict=true else found=id end
            end
            return
        end
        local prefix=part..text:sub(pos,first-1)
        visit(first+1,prefix..text:sub(first,first),changed)
        for _,match in ipairs(matches[first]) do visit(match.last+1,prefix..match.token,true) end
    end
    -- Recursion depth also stays bounded independently of the leaf budget.
    if #positions>32 then return nil end
    visit(1,"",false)
    if not conflict and not exhausted then return found end
end

local function findText(index, text, values)
    if type(text)~="string" or text=="" or A.IsChinese(text) or not index then return nil end
    values=values or D.Strings
    local id=index[A.Fingerprint(A.Normalize(text,false))]
    if not id then id=findDynamic(index,text,values) end
    return id and values[id] or nil
end

local acceptedQuestSource={[true]=true}
function A.MatchesQuestSource(id,field,text)
    local quest=D.QuestSources[tonumber(id)]
    return findText(quest and quest[field],text,acceptedQuestSource)==true
end

function A.Find(category, text)
    return findText(D[category],text)
end

function A.FindQuestExtra(id,field,text)
    local quest=D.QuestExtras and D.QuestExtras[tonumber(id)]
    return findText(quest and quest[field],text)
end

function A.FindBookPage(anchor,page,text)
    local pages=anchor and D.BookContexts and D.BookContexts[anchor]
    local value=findText(pages and pages[page],text)
    return value and A.Render(value)
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
    if text:find("%$[%a%d]") then return nil end -- Preserve the original instead of exposing unsupported tokens.
    return text
end

local function findObjective(original,questID)
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
    if not replacement then replacement=A.FindQuestExtra(questID,"AreaDescription",label) end
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
        replacement,suffix=findObjective(original,questID)
    elseif A.IsChinese(original) then
        return original,false
    elseif category=="Quests" then
        local record=D.Quests[tonumber(questID)]
        if record and record[field] and A.MatchesQuestSource(questID,field,original) then
            replacement=record[field]
        end
        if not replacement and field=="Title" then replacement=A.Find("Titles",original) end
        if not replacement and field=="CompletionLog" then replacement=A.Find("Completions",original) end
        if not replacement and (field=="Progress" or field=="Completion") then
            local dialogue=D.QuestDialogue and D.QuestDialogue[tonumber(questID)]
            replacement=A.Find("Gossip",original) or findText(dialogue and dialogue[field],original)
        end
        if not replacement then replacement=A.FindQuestExtra(questID,field,original) end
    else
        replacement=A.Find(category,original)
    end
    if not replacement or not A.IsChinese(replacement) then return original,false end
    replacement=A.Render(replacement)
    if not replacement or replacement=="" then return original,false end
    return replacement..(suffix or ""),true
end

function A.SetFont(widget, html, requestedSize)
    if not widget then return end
    if widget.GetFontString then widget=widget:GetFontString() end
    if not widget or not widget.SetFont then return end
    local locale=GetLocale and GetLocale()
    local native=locale=="zhCN" or locale=="zhTW"
    local function apply(tag)
        local font,size,flags
        if widget.GetFont then
            if html then font,size,flags=widget:GetFont(tag) else font,size,flags=widget:GetFont() end
        end
        -- A Chinese client already supplies the right face for each widget and
        -- HTML heading. Do not replace its font family or styling to mark translations.
        if native and font and not requestedSize then return end
        local target
        if native then
            target=font or STANDARD_TEXT_FONT or (locale=="zhTW" and "Fonts\\blei00d.TTF" or "Fonts\\ARKai_T.ttf")
        else
            target="Fonts\\ARKai_T.ttf"
            local lower=font and font:lower() or ""
            if lower:find("arkai",1,true) or lower:find("arhei",1,true) or lower:find("bkai",1,true)
                or lower:find("bhei",1,true) or lower:find("blei",1,true) then target=font end
        end
        local height=requestedSize or size or 14
        if target==font and height==size then return end
        if html then widget:SetFont(tag,target,height,flags or "")
        else widget:SetFont(target,height,flags or "") end
    end
    if html then for _,tag in ipairs({"P","H1","H2","H3"}) do apply(tag) end else apply() end
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

function A.InitializeSettings()
    if type(LegionChineseSettings)~="table" then LegionChineseSettings={} end
    -- Translation runs whenever the addon is loaded. Only the welcome-window
    -- dismissal is a preference; discard the retired translation switch.
    LegionChineseSettings.enabled=nil
    return LegionChineseSettings
end
