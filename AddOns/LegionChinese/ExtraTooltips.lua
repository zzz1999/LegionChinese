-- SPDX-License-Identifier: GPL-2.0-or-later
local A, D = LegionChinese, LegionChineseDB
local states = setmetatable({}, { __mode = "k" })
local installed = setmetatable({}, { __mode = "k" })

local function clear(self)
    states[self] = nil
end
local function usable(self)
    return self
        and not (self.IsForbidden and self:IsForbidden())
        and self.GetName
        and self.NumLines
        and self.IsShown
        and self:IsShown()
end
local function matchText(text, entries)
    if type(text) ~= "string" or A.IsChinese(text) or not entries then
        return
    end
    local prefix, body, suffix = text:match("^(%s*)(.-)(%s*)$")
    local color, plain = body:match("^(|c%x%x%x%x%x%x%x%x)(.-)|r$")
    local value = entries[A.NameFingerprint(plain or body) or ""]
    if not value then
        local inner = (plain or body):match("^<(.-)>$")
        local title = inner and entries[A.NameFingerprint(inner) or ""]
        if title then
            value = "<" .. title .. ">"
        end
    end
    if value then
        return prefix .. (color or "") .. value .. (color and "|r" or "") .. suffix
    end
end

function A.ResolveDynamicSpellText(id, field, source)
    local row = D.DynamicSpellTexts[id]
    local spec = row and row[field]
    if not spec or type(source) ~= "string" or A.IsChinese(source) then
        return
    end
    local text = source:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
    if text:find("[|$~{}]") or #text > 8192 then
        return
    end
    local values = {}
    local skeleton = text:gsub("%d[%d,.]*", function(value)
        local body, tail = value:match("^(.-)([.,]*)$")
        values[#values + 1] = body
        return "~v~" .. tail
    end)
    if #values ~= spec.Count or A.NameFingerprint(skeleton) ~= spec.Key then
        return
    end
    for _, value in ipairs(values) do
        local compact = value:gsub(",", "")
        if not compact:match("^%d+%.?%d*$") then
            return
        end
        if value:find(",", 1, true) then
            local integer = value:match("^(%d[%d,]*)")
            local first, rest = integer:match("^(%d+)(,.*)$")
            if not first or #first > 3 or rest:gsub(",%d%d%d", "") ~= "" then
                return
            end
        end
    end
    for index, constant in pairs(spec.Constants) do
        if tonumber((values[index]:gsub(",", ""))) ~= constant then
            return
        end
    end
    for _, pair in ipairs(spec.Equals) do
        if values[pair[1]] ~= values[pair[2]] then
            return
        end
    end
    local translated = spec.Text:gsub("{(%d+)}", function(index)
        return values[tonumber(index)] or ""
    end)
    if translated:find("[{}$]") then
        return
    end
    local color = source:match("^(|c%x%x%x%x%x%x%x%x)")
    return color and source:sub(-2) == "|r" and color .. translated .. "|r" or translated
end

function A.ResolveSpellText(id, field, source, includeRank)
    local row = D.SpellTexts[id]
    return row and (matchText(source, row[field]) or includeRank and matchText(source, row.Rank))
        or A.ResolveDynamicSpellText(id, field, source)
end

function A.UpdateExtraTooltip(self, kind, id)
    if not self or (self.IsForbidden and self:IsForbidden()) then
        return
    end
    local state = states[self]
    if kind then
        if state and state.kind == "spell" and kind == "aura" and state.id == id then
            for _, line in pairs(state.lines) do
                if line.text and line.widget:GetText() == line.text then
                    line.widget:SetText(line.source)
                end
            end
        end
        if not state or state.kind ~= kind or state.id ~= id then
            state = { kind = kind, id = id, lines = {} }
            states[self] = state
        end
    elseif not state then
        return
    end
    if not usable(self) then
        return
    end
    kind, id = state.kind, state.id
    local spell = D.SpellTexts[id]
    local titles = kind == "unit" and D.NPCTitles[id]
    local names = kind == "unit" and D.NPCLabelNames[id]
    if
        kind ~= "unit" and not spell and not D.Spells[id] and not D.DynamicSpellTexts[id]
        or kind == "unit" and not titles and not names
    then
        clear(self)
        return
    end
    local changed = false
    for i = 1, self:NumLines() do
        local widget = _G[self:GetName() .. "TextLeft" .. i]
        if widget and widget.GetText and not (widget.IsForbidden and widget:IsForbidden()) then
            local source = widget:GetText()
            local previous = state.lines[i]
            if
                not previous
                or previous.widget ~= widget
                or source ~= previous.source and source ~= previous.text
            then
                local text
                if kind == "unit" then
                    if i == 1 then
                        text = matchText(source, names)
                    else
                        text = matchText(source, titles)
                    end
                elseif i == 1 then
                    text = A.ResolveSpellName(source, id)
                else
                    local field = kind == "aura" and "Aura" or "Description"
                    text = A.ResolveSpellText(id, field, source, true)
                end
                previous = { widget = widget, source = source, text = text }
                state.lines[i] = previous
            end
            if previous.text and source ~= previous.text then
                A.SetFont(widget)
                widget:SetText(previous.text)
                changed = true
            end
        end
    end
    if kind ~= "unit" and spell and spell.Rank then
        for i = 1, 2 do
            local widget = _G[self:GetName() .. "TextRight" .. i]
            if widget and widget.GetText and not (widget.IsForbidden and widget:IsForbidden()) then
                local key = "right" .. i
                local source = widget:GetText()
                local previous = state.lines[key]
                if
                    not previous
                    or previous.widget ~= widget
                    or source ~= previous.source and source ~= previous.text
                then
                    previous = { widget = widget, source = source, text = matchText(source, spell.Rank) }
                    state.lines[key] = previous
                end
                if previous.text and source ~= previous.text then
                    A.SetFont(widget)
                    widget:SetText(previous.text)
                    changed = true
                end
            end
        end
    end
    if changed then
        self:Show()
    end
end

local function spell(self)
    local _, _, id = self:GetSpell()
    if id then
        A.UpdateExtraTooltip(self, "spell", id)
    else
        clear(self)
    end
end
local function unit(self)
    local _, token = self:GetUnit()
    if not token or not UnitGUID or UnitIsPlayer and UnitIsPlayer(token) then
        clear(self)
        return
    end
    local guid = UnitGUID(token)
    local id = type(guid) == "string" and tonumber(guid:match("^Creature%-%d+%-%d+%-%d+%-%d+%-(%d+)%-"))
    if id then
        A.UpdateExtraTooltip(self, "unit", id)
    else
        clear(self)
    end
end
function A.InstallExtraTooltips()
    for _, self in pairs({ GameTooltip, ItemRefTooltip }) do
        if
            self
            and self.HookScript
            and not installed[self]
            and not (self.IsForbidden and self:IsForbidden())
        then
            installed[self] = true
            self:HookScript("OnTooltipCleared", clear)
            self:HookScript("OnHide", clear)
            self:HookScript("OnTooltipSetItem", clear)
            self:HookScript("OnShow", function(tooltip)
                A.UpdateExtraTooltip(tooltip)
            end)
            if self.GetSpell then
                self:HookScript("OnTooltipSetSpell", spell)
            end
            if self.GetUnit then
                self:HookScript("OnTooltipSetUnit", unit)
            end
            for _, method in ipairs({ "SetUnitAura", "SetUnitBuff", "SetUnitDebuff" }) do
                if self[method] then
                    local api = method == "SetUnitBuff" and UnitBuff
                        or method == "SetUnitDebuff" and UnitDebuff
                        or UnitAura
                    hooksecurefunc(self, method, function(tooltip, token, index, filter)
                        if not api then
                            clear(tooltip)
                            return
                        end
                        -- 7.3.5 includes rank and nameplateShowPersonal before spellID.
                        local _, _, _, _, _, _, _, _, _, _, id = api(token, index, filter)
                        if id then
                            A.UpdateExtraTooltip(tooltip, "aura", id)
                        else
                            clear(tooltip)
                        end
                    end)
                end
            end
        end
    end
end
function A.RefreshExtraTooltips()
    A.UpdateExtraTooltip(GameTooltip)
    A.UpdateExtraTooltip(ItemRefTooltip)
end
