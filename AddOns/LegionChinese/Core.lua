-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
-- Generated resources have resolved these temporary shared references.
D.SharedStrings = nil
local strip = A.Text.Strip
local playerAliases = A.Text.PlayerAliases

local function findDynamic(index, text, values)
    -- Each occurrence may be either a substituted player value or an ordinary
    -- word. For example only the first "mage" in "Hello, Mage; ask a mage"
    -- might be $C. Never replace all occurrences and guess a translation.
    local matches = {}
    text = strip(text)
    for _, pair in ipairs(playerAliases()) do
        local pos = 1
        while true do
            local first, last = text:find(pair[1], pos, true)
            if not first then
                break
            end
            local left = first > 1 and text:sub(first - 1, first - 1) or ""
            local right = text:sub(last + 1, last + 1)
            if
                not (pair[1]:sub(1, 1):match("%w") and left:match("%w"))
                and not (pair[1]:sub(-1):match("%w") and right:match("%w"))
            then
                matches[first] = matches[first] or {}
                matches[first][#matches[first] + 1] = { last = last, token = pair[2] }
            end
            pos = last + 1
        end
    end
    local positions = {}
    for first in pairs(matches) do
        positions[#positions + 1] = first
    end
    table.sort(positions)
    if #positions == 0 then
        return nil
    end
    local found, conflict, exhausted, leaves, bytes = nil, false, false, 0, 0
    local seen = {}
    local function visit(pos, part, changed)
        if conflict or exhausted then
            return
        end
        local first
        for _, candidate in ipairs(positions) do
            if candidate >= pos then
                first = candidate
                break
            end
        end
        if not first then
            if not changed then
                return
            end
            local normalized = A.Normalize(part .. text:sub(pos), false)
            if seen[normalized] then
                return
            end
            seen[normalized] = true
            leaves = leaves + 1
            bytes = bytes + #normalized
            -- Bound work on long/unusual server text. An incomplete search is
            -- uncertain, so it must preserve the original even after a hit.
            if leaves > 256 or bytes > 262144 then
                exhausted = true
                return
            end
            local id = index[A.Fingerprint(normalized)]
            if id and values[id] then
                if found and values[found] ~= values[id] then
                    conflict = true
                else
                    found = id
                end
            end
            return
        end
        local prefix = part .. text:sub(pos, first - 1)
        visit(first + 1, prefix .. text:sub(first, first), changed)
        for _, match in ipairs(matches[first]) do
            visit(match.last + 1, prefix .. match.token, true)
        end
    end
    -- Recursion depth also stays bounded independently of the leaf budget.
    if #positions > 32 then
        return nil
    end
    visit(1, "", false)
    if not conflict and not exhausted then
        return found
    end
end

local function lookupText(index, text, values)
    if not index then
        return nil
    end
    values = values or D.Strings
    local id = index[A.Fingerprint(A.Normalize(text, false))]
    if not id then
        id = findDynamic(index, text, values)
    end
    return id and values[id] or nil
end

local function findText(index, text, values)
    if type(text) ~= "string" or text == "" or A.IsChinese(text) then
        return nil
    end
    return lookupText(index, text, values)
end

local acceptedQuestSource = { [true] = true }
function A.MatchesQuestSource(id, field, text)
    local quest = D.QuestSources[tonumber(id)]
    return findText(quest and quest[field], text, acceptedQuestSource) == true
end

function A.FindCatalog(scope, text, dynamic)
    if type(text) ~= "string" or text == "" or #text > 32768 or A.IsChinese(text) then
        return
    end
    local index = A.Data.Catalog(scope)
    local values = D.CatalogStrings
    if not index or not values then
        return
    end
    if dynamic then
        return lookupText(index, text, values)
    end
    local id = index[A.Fingerprint(A.Normalize(text, false))]
    return id and values[id]
end

local localCategories = { Titles = "Title", Objectives = "Objective", Gossip = "Dialogue" }
function A.Find(category, text)
    if type(text) ~= "string" or text == "" or A.IsChinese(text) then
        return
    end
    local translated = lookupText(A.Data.Get(category), text)
    if translated then
        return translated
    end
    local scope = localCategories[category]
    return scope and A.FindCatalog(scope, text, true)
end

function A.FindQuestExtra(id, field, text)
    local quest = D.QuestExtras and D.QuestExtras[tonumber(id)]
    return findText(quest and quest[field], text)
end

function A.FindBookPage(anchor, page, text)
    local pages = anchor and D.BookContexts and D.BookContexts[anchor]
    local value = findText(pages and pages[page], text)
    return value and A.Render(value)
end

local function findObjective(original, questID)
    local replacement = A.Find("Objectives", original)
    if replacement then
        return replacement
    end
    local label = original:gsub("^|c%x%x%x%x%x%x%x%x", ""):gsub("|r$", "")
    local suffix, completion = "", " (" .. (COMPLETE or "Complete") .. ")"
    -- Blizzard appends this client-localized status after the server text.
    -- Remove only that exact suffix before language detection and lookup.
    if label:sub(-#completion) == completion then
        label = label:sub(1, -#completion - 1)
        suffix = completion
    end
    replacement = A.Find("Objectives", label)
    if not replacement then
        replacement = A.FindQuestExtra(questID, "AreaDescription", label)
    end
    if not replacement then
        local base, counter = label:match("^(.-)(%s*:%s*%d+%s*/%s*%d+%s*)$")
        if base then
            replacement = A.Find("Objectives", base)
            suffix = counter .. suffix
        end
    end
    return replacement, suffix
end

local function findQuestReturn(original)
    local name = original:match("^Return to (.+)%.$")
    if not name or name:find("[<>|$%c]") or name:match("^%s") or name:match("%s$") then
        return nil
    end
    -- This sentence is an addon-authored rule, not an official full-text
    -- translation. Only use the existing conflict-checked NPC name index;
    -- never infer a recipient from quest ID or expand player-name tokens.
    local id = D.NPCNames[A.Fingerprint(A.Normalize(name, false))]
    local translated = id and D.Strings[id]
    if type(translated) ~= "string" or not A.IsChinese(translated) or translated:find("[<>|$%c]") then
        return nil
    end
    return "返回" .. translated .. "处。"
end

function A.Translate(category, original, questID, field)
    if type(original) ~= "string" or original == "" then
        return original, false
    end
    local replacement, suffix
    if category == "Objectives" then
        replacement, suffix = findObjective(original, questID)
    elseif A.IsChinese(original) then
        return original, false
    elseif category == "Quests" then
        local record = D.Quests[tonumber(questID)]
        if record and record[field] and A.MatchesQuestSource(questID, field, original) then
            replacement = record[field]
        end
        if not replacement and field == "Title" then
            replacement = A.Find("Titles", original)
        end
        if not replacement and field == "CompletionLog" then
            replacement = A.Find("Completions", original)
        end
        if not replacement and (field == "Progress" or field == "Completion") then
            local dialogue = D.QuestDialogue and D.QuestDialogue[tonumber(questID)]
            replacement = A.Find("Gossip", original) or findText(dialogue and dialogue[field], original)
        end
        if not replacement then
            replacement = A.FindQuestExtra(questID, field, original)
        end
        if not replacement and A.TranslateQuestTemplate then
            local rendered = A.TranslateQuestTemplate(questID, field, original)
            if rendered then
                return rendered, true
            end
        end
        if not replacement and field == "CompletionLog" then
            replacement = findQuestReturn(original)
        end
    else
        replacement = A.Find(category, original)
    end
    if not replacement or not A.IsChinese(replacement) then
        return original, false
    end
    replacement = A.Render(replacement)
    if not replacement or replacement == "" then
        return original, false
    end
    return replacement .. (suffix or ""), true
end

function A.InitializeSettings()
    if type(LegionChineseSettings) ~= "table" then
        LegionChineseSettings = {}
    end
    -- Translation runs whenever the addon is loaded. Only the welcome-window
    -- dismissal is a preference; discard the retired translation switch.
    LegionChineseSettings.enabled = nil
    return LegionChineseSettings
end
