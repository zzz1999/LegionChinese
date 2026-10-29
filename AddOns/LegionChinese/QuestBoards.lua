-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB

local function currentOption(choiceID, responseID, source)
    if
        type(choiceID) ~= "number"
        or choiceID <= 0
        or type(responseID) ~= "number"
        or responseID <= 0
        or type(source) ~= "string"
        or A.IsChinese(source)
        or source:find("|", 1, true)
        or not GetQuestChoiceInfo
        or not GetQuestChoiceOptionInfo
    then
        return
    end
    local id, question, count = GetQuestChoiceInfo()
    if
        not id
        or id ~= choiceID
        or type(question) ~= "string"
        or type(count) ~= "number"
        or count < 1
        or count > 4
        or count % 1 ~= 0
    then
        return
    end
    local headers = D.QuestBoardHeaders[A.Fingerprint(A.Normalize(question, false))]
    if not headers then
        return
    end
    -- This board's response IDs are not available in the reviewed source.
    -- Match the complete live question and read the CURRENT response fields,
    -- so recycled cards and identically named options in other choices cannot
    -- borrow this translation.
    for i = 1, count do
        local optionID, answer, _, header = GetQuestChoiceOptionInfo(i)
        if optionID == responseID then
            return headers, answer, header
        end
    end
end

function A.ResolveQuestBoardHeader(choiceID, responseID, source)
    local headers, _, header = currentOption(choiceID, responseID, source)
    if headers and header == source then
        return headers[A.NameFingerprint(source)]
    end
end

function A.ResolveQuestBoardAnswer(choiceID, responseID, source)
    local text = A.FindCatalog("System", source)
    if not text then
        return
    end
    local headers, answer, header = currentOption(choiceID, responseID, source)
    if
        not headers
        or answer ~= source
        or type(header) ~= "string"
        or not headers[A.NameFingerprint(header)]
    then
        return
    end
    -- Only reuse a complete, unambiguous native UI string already verified
    -- against the same 7.3.5 client. Region prose is a separate data source.
    return A.Render(text)
end
