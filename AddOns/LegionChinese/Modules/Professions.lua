-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
local function usable(frame)
    return frame and not (frame.IsForbidden and frame:IsForbidden())
end
local function recipeID(details)
    local id = details.selectedRecipeID
    if type(id) == "number" and id > 0 and id % 1 == 0 then
        return id
    end
end
function A.InstallProfessions(hook, hookMethod)
    local frame = TradeSkillFrame
    local details = usable(frame) and frame.DetailsFrame
    local contents = usable(details) and details.Contents
    if not usable(contents) then
        return
    end
    local function current()
        return TradeSkillFrame == frame
            and usable(frame)
            and frame.DetailsFrame == details
            and usable(details)
            and details.Contents == contents
            and usable(contents)
    end
    A.BindResolvedText(hookMethod, contents.RecipeName, function(source)
        if not current() or A.IsChinese(source) then
            return
        end
        local id = recipeID(details)
        local name = id and D.Spells[id]
        if name and D.SpellNames[A.NameFingerprint(source) or ""] == name then
            return D.NameStrings[name]
        end
    end)
    A.BindResolvedText(hookMethod, contents.Description, function(source)
        if not current() or A.IsChinese(source) then
            return
        end
        local id = recipeID(details)
        local text = id and A.ResolveSpellText(id, "Description", source)
        text = text or A.FindCatalog("Profession", source)
        return text and A.Render(text)
    end)
    A.BindResolvedText(hookMethod, contents.SourceText, function(source)
        if not current() then
            return
        end
        local text = A.FindCatalog("Profession", source)
        return text and A.Render(text)
    end)
end
