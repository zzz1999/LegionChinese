-- SPDX-License-Identifier: GPL-2.0-or-later
local A,D=LegionChinese,LegionChineseDB

function A.ResolveQuestBoardHeader(choiceID,responseID,source)
    if type(choiceID)~="number" or choiceID<=0 or type(responseID)~="number" or responseID<=0
        or type(source)~="string" or A.IsChinese(source) or source:find("|",1,true)
        or not GetQuestChoiceInfo or not GetQuestChoiceOptionInfo then return end
    local id,question,count=GetQuestChoiceInfo()
    if not id or id~=choiceID or type(question)~="string" or type(count)~="number"
        or count<1 or count>4 or count%1~=0 then return end
    local headers=D.QuestBoardHeaders[A.Fingerprint(A.Normalize(question,false))]
    if not headers then return end
    -- This board's response IDs are not available in the reviewed source.
    -- Match the complete live question and verify the CURRENT response header,
    -- so recycled cards and identically named options in other choices cannot
    -- borrow this translation.
    for i=1,count do
        local optionID,_,_,header=GetQuestChoiceOptionInfo(i)
        if optionID==responseID and header==source then
            return headers[A.NameFingerprint(source)]
        end
    end
end
