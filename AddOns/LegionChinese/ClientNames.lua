-- SPDX-License-Identifier: GPL-2.0-or-later
local A,D=LegionChinese,LegionChineseDB

function A.ResolveItemName(source,id,payload)
    if type(source)~="string" or A.IsChinese(source) or id==138019 then return end
    local row=D.ItemNames and D.ItemNames[id]
    if not row then return end
    local body=type(payload)=="string" and payload:match("^item:(.*)$")
    if not body then return end
    local fields={};for value in (body..":"):gmatch("(.-):") do fields[#fields+1]=value end
    if tonumber(fields[1])~=id then return end
    -- A suffix or bonus list can change the displayed name. Only fall back to
    -- the base name if the complete visible name is itself that known base.
    if (fields[7] and fields[7]~="" and fields[7]~="0") or (tonumber(fields[13]) or 0)>0 then
        if A.NameFingerprint(source)~=row[2] then return end
    end
    return row[1]
end

function A.NameFingerprint(text)
    if type(text)~="string" or text=="" then return end
    -- Names do not contain player substitutions. A character called Fireball
    -- must not change the lookup key for the spell Fireball.
    return A.Fingerprint(text:gsub("|c%x%x%x%x%x%x%x%x",""):gsub("|r",""):lower():gsub("%s",""))
end

function A.ResolveSpellName(source,spellID)
    if A.IsChinese(source) then return end
    local id=type(spellID)=="number" and D.Spells[spellID]
    if id then return D.NameStrings[id] end
    -- Without an authoritative ID, match the actual displayed action. A
    -- generic API name such as "Unknown" must not replace a different label.
    id=D.SpellNames[A.NameFingerprint(source) or ""]
    return id and D.NameStrings[id]
end

local summons={}
local labels=setmetatable({}, {__mode="k"})
local installed=false

function A.RecordPetSummon(_,event,_,sourceGUID,_,_,_,destGUID)
    if event=="UNIT_DIED" or event=="UNIT_DESTROYED" then
        local known=summons[destGUID or ""];summons[destGUID or ""]=nil;return known~=nil
    end
    if event~="SPELL_SUMMON" or not destGUID or not UnitGUID or sourceGUID~=UnitGUID("player") then return end
    local now=GetTime and GetTime() or 0
    local count,oldest,oldestTime=0,nil,math.huge
    for guid,time in pairs(summons) do
        if now-time>3600 then summons[guid]=nil else
            count=count+1;if time<oldestTime then oldest,oldestTime=guid,time end
        end
    end
    if count>=128 and oldest then summons[oldest]=nil end
    summons[destGUID]=now
    return true
end

local function petIdentity(unit)
    if not UnitGUID or not UnitName or not unit then return end
    local guid=UnitGUID(unit)
    if type(guid)~="string" or not (guid:match("^Pet%-") or guid:match("^Creature%-")) then return end
    local mainPet=guid==UnitGUID("pet")
    local summoned=summons[guid]
    if not mainPet and not (summoned and (not GetTime or GetTime()-summoned<=3600)) then return end
    local name=UnitName(unit)
    if type(name)~="string" or name=="" then return end
    local entry=tonumber(guid:match("^[^-]+%-[^-]+%-[^-]+%-[^-]+%-[^-]+%-(%d+)%-"))
    return name,guid,entry,mainPet
end

function A.TranslatePetName(unit)
    local original,guid,entry,mainPet=petIdentity(unit)
    if not original then return end
    if A.IsChinese(original) then return original,guid end
    local family=UnitCreatureFamily and UnitCreatureFamily(unit)
    local familyID=D.CreatureFamilyNames[A.NameFingerprint(family) or ""]
    local record=D.Creatures[entry]
    local familyName=A.IsChinese(family) and family or familyID and D.NameStrings[familyID]
    if not familyName and record then familyName=D.NameStrings[D.CreatureFamilies[record[3]] or 0] end
    local key=A.NameFingerprint(original)
    local class
    if UnitClass then local _,token=UnitClass("player");class=token end
    if class=="HUNTER" then
        -- A renamed hunter pet must keep its name. Only translate a confirmed
        -- renameable default family label; never append a type to a nickname.
        if not mainPet or not PetCanBeRenamed or not PetCanBeRenamed() then return original,guid end
        local defaultID=D.CreatureFamilyNames[key]
        local defaultName=defaultID and D.NameStrings[defaultID]
        return defaultName and defaultName==familyName and defaultName or original,guid
    end
    if record and record[2]==key then return D.NameStrings[record[1]] or original,guid end
    local defaultID=D.CreatureFamilyNames[key]
    if defaultID and D.NameStrings[defaultID]==familyName then return familyName,guid end
    return original,guid
end

local function restoreLabel(widget,previous,unit)
    if previous and unit and UnitGUID and UnitName and UnitGUID(unit)==previous.guid and UnitName(unit)==previous.source
        and widget:GetText()==previous.text then widget:SetText(previous.source) end
    labels[widget]=nil
end

function A.ApplyPetName(widget,unit)
    if not widget or (widget.IsForbidden and widget:IsForbidden()) or not widget.GetText or not widget.SetText
        or (widget.IsShown and not widget:IsShown()) then return end
    local previous=labels[widget]
    local translated,guid=A.TranslatePetName(unit)
    if not translated then restoreLabel(widget,previous,unit);return end
    local original=UnitName(unit)
    local current=widget:GetText()
    if current~=original and not (previous and previous.guid==guid and previous.source==original and current==previous.text) then return end
    if current~=translated then
        if translated~=original then A.SetFont(widget) end
        widget:SetText(translated)
    end
    if translated~=original then labels[widget]={unit=unit,guid=guid,source=original,text=translated}
    else labels[widget]=nil end
end

function A.UpdatePetUnitFrame(frame)
    if frame and not (frame.IsForbidden and frame:IsForbidden()) and not frame.overrideName then A.ApplyPetName(frame.name,frame.unit) end
end

function A.UpdatePetTooltip(tooltip)
    if tooltip and tooltip.GetUnit then
        local _,unit=tooltip:GetUnit()
        if tooltip==GameTooltip then A.ApplyPetName(GameTooltipTextLeft1,unit) end
    end
end

function A.RefreshPetNames()
    for widget,previous in pairs(labels) do A.ApplyPetName(widget,previous.unit) end
    for _,key in ipairs({"PetFrame","TargetFrame","FocusFrame"}) do A.UpdatePetUnitFrame(_G[key]) end
    if C_NamePlate and C_NamePlate.GetNamePlates then
        for _,plate in ipairs(C_NamePlate.GetNamePlates()) do
            if not (plate.IsForbidden and plate:IsForbidden()) then A.UpdatePetUnitFrame(plate.UnitFrame) end
        end
    end
    A.UpdatePetTooltip(GameTooltip)
end

function A.InstallPetNames(hook,hookScript)
    hook("UnitFrame_Update",A.UpdatePetUnitFrame)
    hook("UnitFrame_OnEvent",function(frame,event) if event=="UNIT_NAME_UPDATE" then A.UpdatePetUnitFrame(frame) end end)
    hook("CompactUnitFrame_UpdateName",A.UpdatePetUnitFrame)
    hookScript(PetFrame,"OnEvent",A.UpdatePetUnitFrame)
    hookScript(GameTooltip,"OnTooltipSetUnit",A.UpdatePetTooltip)
    if installed then return end
    installed=true
    local events=CreateFrame("Frame")
    for _,event in ipairs({"COMBAT_LOG_EVENT_UNFILTERED","UNIT_PET","UNIT_NAME_UPDATE","PET_RENAMEABLE","PLAYER_ENTERING_WORLD"}) do events:RegisterEvent(event) end
    events:SetScript("OnEvent",function(_,event,...)
        if event=="COMBAT_LOG_EVENT_UNFILTERED" then
            local changed
            if CombatLogGetCurrentEventInfo then changed=A.RecordPetSummon(CombatLogGetCurrentEventInfo()) else changed=A.RecordPetSummon(...) end
            if changed then A.RefreshPetNames() end
        elseif event=="PLAYER_ENTERING_WORLD" then
            summons={};A.RefreshPetNames()
        else A.RefreshPetNames() end
    end)
end
