-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
local bookAnchor
function A.UpdateBook(_, event)
    if event == "ITEM_TEXT_BEGIN" or event == "ITEM_TEXT_CLOSED" then
        bookAnchor = nil
        return
    end
    if event ~= "ITEM_TEXT_READY" or not ItemTextGetText or not ItemTextPageText then
        return
    end
    local original = ItemTextGetText()
    local page = ItemTextGetPage and ItemTextGetPage()
    if page == 1 then
        bookAnchor = nil
        for _, dynamic in ipairs({ false, true }) do
            local key = A.Fingerprint(A.Normalize(original, dynamic))
            if LegionChineseDB.BookContexts[key] then
                bookAnchor = key
                break
            end
        end
    end
    local translated, changed = A.Translate("Books", original)
    if not changed and bookAnchor then
        translated = A.FindBookPage(bookAnchor, page, original)
        changed = translated ~= nil
    end
    if not changed then
        return
    end
    local creator = ItemTextGetCreator and ItemTextGetCreator()
    if creator then
        translated = translated .. "\n\n" .. (ITEM_TEXT_FROM or "作者") .. "\n" .. creator .. "\n"
    end
    A.SetFont(ItemTextPageText, true)
    ItemTextPageText:SetText(translated)
    if ItemTextScrollFrame and ItemTextScrollFrame.UpdateScrollChildRect then
        local child = ItemTextScrollFrame:GetScrollChild()
        if child then
            child:SetHeight(1)
        end
        ItemTextScrollFrame:UpdateScrollChildRect()
        local range = ItemTextScrollFrame:GetVerticalScrollRange()
        if child and range and range > 0 then
            child:SetHeight(ItemTextScrollFrame:GetHeight() + range + 30)
        end
    end
end
