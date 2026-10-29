-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB

-- Walk a single quest/field template once. Source literals are length + hash,
-- not a broad wildcard search; foreign source text is not shipped. No calls to
-- GetQuestObjectiveInfo: its visible order need not equal the raw $noa index.
function A.TranslateQuestTemplate(id, field, original)
    local quest = D.QuestTemplates[tonumber(id)]
    local row = quest and quest[field]
    if
        not row
        or type(original) ~= "string"
        or #original > 16384
        or original:find("%$[%a%d]")
        or original:find("%d%s+%d")
    then
        return
    end
    local source = A.Normalize(original, false)
    local pos, values, context = 1, {}, {}
    for _, part in ipairs(row.source) do
        if type(part) == "table" then
            local literal = source:sub(pos, pos + part[1] - 1)
            if #literal ~= part[1] or A.Fingerprint(literal) ~= part[2] then
                return
            end
            pos = pos + part[1]
        else
            local token = row.values[part]
            local value, consumed
            if token > 0 then
                value = source:sub(pos, pos + 10):match("^%d+")
                if
                    not value
                    or #value > 10
                    or (#value > 1 and value:sub(1, 1) == "0")
                    or tonumber(value) > 2147483647
                then
                    return
                end
                consumed = #value
            else
                local entry = context[token]
                if not entry then
                    local translated, aliases = A.QuestVariableValue(token)
                    if not translated or not aliases then
                        return
                    end
                    entry = { translated, aliases }
                    context[token] = entry
                end
                for _, alias in ipairs(entry[2]) do
                    local normalized = A.Normalize(alias, false)
                    if normalized ~= "" and source:sub(pos, pos + #normalized - 1) == normalized then
                        consumed = #normalized
                        break
                    end
                end
                if not consumed then
                    return
                end
                value = entry[1]
            end
            if values[part] and values[part] ~= value then
                return
            end
            values[part] = value
            pos = pos + consumed
        end
    end
    if pos ~= #source + 1 then
        return
    end
    -- Function replacement leaves percent signs/player names literal. All slots
    -- were checked by the compiler and the full source matched before rendering.
    return (row.text:gsub("~(%d+)~", function(slot)
        return values[tonumber(slot)]
    end))
end
