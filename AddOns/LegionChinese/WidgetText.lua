-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
function A.SetFont(widget, html, requestedSize)
    if not widget then
        return
    end
    if widget.GetFontString then
        widget = widget:GetFontString()
    end
    if not widget or not widget.SetFont then
        return
    end
    local locale = GetLocale and GetLocale()
    local native = locale == "zhCN" or locale == "zhTW"
    local function apply(tag)
        local font, size, flags
        if widget.GetFont then
            if html then
                font, size, flags = widget:GetFont(tag)
            else
                font, size, flags = widget:GetFont()
            end
        end
        -- A Chinese client already supplies the right face for each widget and
        -- HTML heading. Do not replace its font family or styling to mark translations.
        if native and font and not requestedSize then
            return
        end
        local target
        if native then
            target = font
                or STANDARD_TEXT_FONT
                or (locale == "zhTW" and "Fonts\\blei00d.TTF" or "Fonts\\ARKai_T.ttf")
        else
            target = "Fonts\\ARKai_T.ttf"
            local lower = font and font:lower() or ""
            if
                lower:find("arkai", 1, true)
                or lower:find("arhei", 1, true)
                or lower:find("bkai", 1, true)
                or lower:find("bhei", 1, true)
                or lower:find("blei", 1, true)
            then
                target = font
            end
        end
        local height = requestedSize or size or 14
        if target == font and height == size then
            return
        end
        if html then
            widget:SetFont(tag, target, height, flags or "")
        else
            widget:SetFont(target, height, flags or "")
        end
    end
    if html then
        for _, tag in ipairs({ "P", "H1", "H2", "H3" }) do
            apply(tag)
        end
    else
        apply()
    end
end

function A.Apply(widget, category, questID, field, sourceText)
    if not widget or not widget.GetText or not widget.SetText then
        return false
    end
    local original = widget:GetText()
    local first, last
    if sourceText ~= nil then
        if type(original) ~= "string" or type(sourceText) ~= "string" or sourceText == "" then
            return false
        end
        first, last = original:find(sourceText, 1, true)
        if not first then
            return false
        end -- The widget no longer shows this quest.
    end
    local translated, changed = A.Translate(category, sourceText or original, questID, field)
    if changed then
        if first then
            -- Replace only the raw title returned by the quest API; preserve
            -- level/party/ID prefixes, status suffixes and existing markup.
            translated = original:sub(1, first - 1) .. translated .. original:sub(last + 1)
        else
            local color = original:match("^(|c%x%x%x%x%x%x%x%x)")
            if color and original:sub(-2) == "|r" then
                translated = color .. translated .. "|r"
            end
        end
        A.SetFont(widget)
        widget:SetText(translated)
    end
    return changed
end
