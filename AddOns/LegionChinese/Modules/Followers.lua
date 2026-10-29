-- SPDX-License-Identifier: GPL-2.0-or-later
local A = LegionChinese
local bind = A.BindCatalog
local abilityInfo = setmetatable({}, { __mode = "k" })
local translatedNames = setmetatable({}, { __mode = "k" })
local function usable(frame)
    return frame and not (frame.IsForbidden and frame:IsForbidden())
end
local function api(name, ...)
    local fn = C_Garrison and C_Garrison[name]
    if type(fn) ~= "function" then
        return
    end
    local ok, value = pcall(fn, ...)
    if ok then
        return value
    end
end
function A.ResolveFollowerName(source, info)
    if type(source) ~= "string" or A.IsChinese(source) or type(info) ~= "table" or info.isRenamed then
        return
    end
    local kind = info.followerTypeID
    if kind ~= (LE_FOLLOWER_TYPE_GARRISON_6_0 or 1) and kind ~= (LE_FOLLOWER_TYPE_GARRISON_7_0 or 4) then
        return
    end
    local id = info.garrFollowerID or info.garrisonFollowerID
    if type(id) ~= "number" or id <= 0 or id % 1 ~= 0 then
        return
    end
    local plain = source:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
    if plain:find("[|\r\n]") or info.name and info.name ~= plain then
        return
    end
    local original = api("GetFollowerNameByID", id)
    local text = A.Find("NPCNames", plain)
    -- The instance name must match the template's default, or its verified
    -- Chinese counterpart. Ships and player-renamed instances never qualify.
    if original == plain or text and original == text then
        return text
    end
end
local function name(hookMethod, widget, info)
    A.BindResolvedText(hookMethod, widget, function(source)
        return A.ResolveFollowerName(source, info())
    end)
end
local function height(widget)
    if usable(widget) and widget.GetHeight and (not widget.IsShown or widget:IsShown()) then
        return widget:GetHeight() or 0
    end
    return 0
end
local function resize(frame, delta)
    if delta ~= 0 and usable(frame) and frame.GetHeight and frame.SetHeight then
        frame:SetHeight(frame:GetHeight() + delta)
    end
end
local function restoreNameFont(widget)
    if A.IsTextWidget(widget) and translatedNames[widget] and widget:GetText() == translatedNames[widget] then
        A.SetFont(widget)
    end
end
local function abilityName(hookMethod, widget)
    if not A.IsTextWidget(widget) then
        return
    end
    local function apply(self)
        if not A.IsTextWidget(self) or A.IsWriting(self) then
            return
        end
        if translatedNames[self] and self:GetText() == translatedNames[self] then
            restoreNameFont(self)
            return
        end
        translatedNames[self] = nil
        if A.ApplyCatalogText(self, "Garrison") then
            translatedNames[self] = self:GetText()
        end
    end
    hookMethod(widget, "SetText", apply)
    -- ShowAbilities sets FontObject AFTER Name:SetText. Restore only a name
    -- translated by this binding, before the native width/layout calculation.
    hookMethod(widget, "SetFontObject", restoreNameFont)
    apply(widget)
end
local function ability(hookMethod, frame)
    if not usable(frame) then
        return 0
    end
    local before = height(frame.Name) + height(frame.Description) + height(frame.Details)
    abilityName(hookMethod, frame.Name)
    for _, field in ipairs({ "Description", "Details", "Category" }) do
        bind(hookMethod, frame[field], "Garrison")
    end
    A.BindResolvedText(hookMethod, frame.Description, function(source)
        local text = A.FindCatalog("Garrison", source)
        if text then
            return A.Render(text)
        end
        local info = frame.garrFollowerAbilityID
                and api("GetFollowerAbilityInfo", frame.garrFollowerAbilityID)
            or abilityInfo[frame]
        local extra = frame.extraDescriptionText
        if
            type(info) == "table"
            and type(info.description) == "string"
            and type(extra) == "string"
            and source == info.description .. extra
        then
            text = A.FindCatalog("Garrison", info.description)
            return text and A.Render(text) .. extra
        end
    end)
    A.BindResolvedText(hookMethod, frame.Details, function(source)
        local text = A.FindCatalog("Garrison", source)
        if text then
            return A.Render(text)
        end
        local info = abilityInfo[frame]
        local fn = C_Garrison and C_Garrison.GetFollowerAbilityCounterMechanicInfo
        if not info or type(fn) ~= "function" or type(GARRISON_ABILITY_COUNTERS_FORMAT) ~= "string" then
            return
        end
        local ok, _, counter = pcall(fn, info.id)
        if not ok or type(counter) ~= "string" then
            return
        end
        text = A.FindCatalog("Garrison", counter)
        if not text then
            return
        end
        local valid, expected = pcall(string.format, GARRISON_ABILITY_COUNTERS_FORMAT, counter)
        if valid and expected == source then
            local rendered, value = pcall(string.format, GARRISON_ABILITY_COUNTERS_FORMAT, A.Render(text))
            if rendered then
                return value
            end
        end
    end)
    local delta = height(frame.Name) + height(frame.Description) + height(frame.Details) - before
    -- Expanded list rows/equipment use fixed-height name-only templates. Their
    -- native setter returns that height to its caller; do not alter it later.
    if frame.Description or frame.Details then
        resize(frame, delta)
        return delta
    end
    return 0
end
local function mechanicTooltip(hookMethod, frame, counter)
    if not usable(frame) then
        return
    end
    local before = not counter and height(frame.Description) or 0
    local function field(widget)
        A.BindResolvedText(hookMethod, widget, function(source)
            if not usable(frame) then
                return
            end
            local text = A.FindCatalog("Garrison", source)
            return text and A.Render(text)
        end)
    end
    -- These dedicated native fields are mechanic/ability names, never editable
    -- follower or ship names. Do not bind the shared GameTooltip text instead.
    field(frame.Name)
    if counter then
        field(frame.CounterName)
    else
        field(frame.Description)
        -- A tooltip created after installation is first bound by the post-hook,
        -- after the native Icon + 28 + Description height has been calculated.
        resize(frame, height(frame.Description) - before)
    end
end
local function page(hookMethod, frame)
    if not usable(frame) then
        return
    end
    name(hookMethod, frame.Name, function()
        return api("GetFollowerInfo", frame.followerID)
    end)
    bind(hookMethod, frame.ClassSpec, "Garrison")
    bind(hookMethod, frame.Source and frame.Source.SourceText, "Garrison")
    bind(hookMethod, frame.AbilitiesFrame and frame.AbilitiesFrame.FlavorText, "Garrison")
    for _, pool in pairs({ frame.abilitiesPool, frame.equipmentPool }) do
        A.BindCatalogPool(hookMethod, pool, function(object)
            ability(hookMethod, object)
        end)
    end
end
local function list(hookMethod, frame)
    if not usable(frame) then
        return
    end
    for _, button in ipairs(frame.listScroll and frame.listScroll.buttons or {}) do
        local follower = button.Follower
        if usable(follower) then
            name(hookMethod, follower.Name, function()
                return follower.info
            end)
            for _, entry in ipairs(follower.Abilities or {}) do
                ability(hookMethod, entry)
            end
        end
    end
end
local function followerTooltip(hookMethod, frame, data)
    if not usable(frame) or type(data) ~= "table" then
        return
    end
    local delta = 0
    -- These fields are assigned BEFORE SetText by both native follower/ship
    -- setters. Reading them afresh prevents a prior follower's context from
    -- translating a custom ship name when the same tooltip is reused.
    name(hookMethod, frame.Name, function()
        local id = frame.garrisonFollowerID
        return { garrisonFollowerID = id, name = frame.name, followerTypeID = api("GetFollowerTypeByID", id) }
    end)
    bind(hookMethod, frame.ClassSpecName, "Garrison")
    for _, entries in pairs({ frame.Abilities, frame.Traits }) do
        for _, entry in ipairs(entries) do
            delta = delta + ability(hookMethod, entry)
        end
    end
    resize(frame, delta)
end
local function recruits(hookMethod)
    local root = GarrisonRecruitSelectFrame and GarrisonRecruitSelectFrame.FollowerSelection
    if not usable(root) then
        return
    end
    for i = 1, 3 do
        local frame = root["Recruit" .. i]
        if usable(frame) then
            local index = i
            name(hookMethod, frame.Name, function()
                local rows = api("GetAvailableRecruits")
                return type(rows) == "table" and rows[index]
            end)
            for _, section in pairs({ frame.Abilities, frame.Traits }) do
                if usable(section) then
                    for _, entry in ipairs(section.Entries or {}) do
                        ability(hookMethod, entry)
                    end
                    -- This version can create anonymous recruit entries before
                    -- putting them in its Entries array. Inspect this fixed
                    -- native container only, never all UI frames.
                    if section.GetChildren then
                        for _, entry in ipairs({ section:GetChildren() }) do
                            ability(hookMethod, entry)
                        end
                    end
                end
            end
        end
    end
end
local function refresh(hookMethod)
    for _, root in pairs({
        GarrisonMissionFrame,
        OrderHallMissionFrame,
        GarrisonBuildingFrame,
        GarrisonLandingPage,
        GarrisonRecruitSelectFrame,
    }) do
        if usable(root) then
            page(hookMethod, root.FollowerTab)
            list(hookMethod, root.FollowerList)
            hookMethod(root.FollowerTab, "ShowFollower", function(self)
                page(hookMethod, self)
            end)
            hookMethod(root.FollowerTab, "ShowAbilities", function(self)
                page(hookMethod, self)
            end)
            hookMethod(root.FollowerList, "UpdateData", function(self)
                list(hookMethod, self)
            end)
        end
    end
    local pick = GarrisonRecruiterFrame and GarrisonRecruiterFrame.Pick
    if usable(pick) then
        bind(hookMethod, pick.Counter and pick.Counter.Title, "Garrison")
        bind(hookMethod, pick.Counter and pick.Counter.Description, "Garrison")
        bind(hookMethod, pick.ThreatDropDown and pick.ThreatDropDown.Text, "Garrison")
    end
    recruits(hookMethod)
end
function A.InstallGarrisonFollowers(hook, hookMethod)
    mechanicTooltip(hookMethod, GarrisonMissionMechanicTooltip, false)
    mechanicTooltip(hookMethod, GarrisonMissionMechanicFollowerCounterTooltip, true)
    hookMethod(GarrisonFollowerList, "Setup", function(self)
        list(hookMethod, self)
    end)
    hookMethod(GarrisonFollowerList, "UpdateData", function(self)
        list(hookMethod, self)
    end)
    hookMethod(GarrisonFollowerTabMixin, "OnLoad", function(self)
        page(hookMethod, self)
    end)
    hookMethod(GarrisonFollowerTabMixin, "ShowFollower", function(self)
        page(hookMethod, self)
    end)
    hookMethod(GarrisonFollowerTabMixin, "ShowAbilities", function(self)
        page(hookMethod, self)
    end)
    hook("GarrisonFollowerList_SetButtonMode", function(_, button, mode)
        if mode == "FOLLOWER" and usable(button) and usable(button.Follower) then
            local frame = button.Follower
            name(hookMethod, frame.Name, function()
                return frame.info
            end)
        end
    end)
    hook("GarrisonFollowerButton_AddAbility", function(frame, index)
        if usable(frame) then
            ability(hookMethod, frame.Abilities and frame.Abilities[index])
        end
    end)
    hook("GarrisonFollowerTooltipTemplate_SetGarrisonFollower", function(frame, data)
        followerTooltip(hookMethod, frame, data)
    end)
    hook("GarrisonFollowerTooltipTemplate_SetAbility", function(frame, info)
        if usable(frame) then
            abilityInfo[frame] = info
            ability(hookMethod, frame)
        end
    end)
    hook("GarrisonFollowerAbilityTooltipTemplate_SetAbility", function(frame)
        ability(hookMethod, frame)
    end)
    hook("GarrisonMissionMechanic_OnEnter", function(owner)
        if not usable(owner) or type(owner.info) ~= "table" then
            return
        end
        local options = GarrisonFollowerOptions and GarrisonFollowerOptions[owner.followerTypeID]
        if options and options.displayCounterAbilityInPlaceOfMechanic and owner.counterAbility then
            return
        end
        mechanicTooltip(hookMethod, GarrisonMissionMechanicTooltip, false)
    end)
    hook("GarrisonMissionMechanicFollowerCounter_OnEnter", function(owner)
        if not usable(owner) or type(owner.info) ~= "table" then
            return
        end
        local info = owner.info
        local options = GarrisonFollowerOptions and GarrisonFollowerOptions[owner.followerTypeID]
        if
            info.traitID
            or info.spellID
            or options and options.displayCounterAbilityInPlaceOfMechanic and info.counterID
        then
            return
        end
        mechanicTooltip(hookMethod, GarrisonMissionMechanicFollowerCounterTooltip, true)
    end)
    hook("GarrisonRecruitSelectFrame_UpdateRecruits", function()
        recruits(hookMethod)
    end)
    hook("GarrisonRecruiterFrame_SetAbilityPreference", function()
        refresh(hookMethod)
    end)
    hook("UIDropDownMenu_AddButton", function(_, level)
        local pick = GarrisonRecruiterFrame and GarrisonRecruiterFrame.Pick
        A.UpdateCatalogMenu(pick and pick.ThreatDropDown, "Garrison", level)
    end)
    refresh(hookMethod)
end
