-- SPDX-License-Identifier: GPL-2.0-or-later
local A,D=LegionChinese,LegionChineseDB

local function usable(widget)
    return widget and not (widget.IsForbidden and widget:IsForbidden())
end
local function plain(text)
    if type(text)~="string" then return end
    text=text:gsub("|c%x%x%x%x%x%x%x%x",""):gsub("|r",""):gsub("|n","\n")
    if text:find("[|$<>]") then return end
    return text
end

function A.ResolveClientText(kind,id,field,source,expressions)
    if type(source)~="string" or A.IsChinese(source) then return end
    local text=plain(source)
    if not text then return end
    local key=A.NameFingerprint(text)
    if not id then
        local index=D.ClientTextIndex[kind]
        id=index and index[field] and index[field][key]
    end
    local rows=D.ClientTexts[kind]
    local row=rows and rows[id]
    local value=row and row[field] and row[field][key]
    if value and (expressions or not value:find("[%[%]]")) then return value end
end

local function set(widget,text) return A.WriteText(widget,text) end

function A.ApplyClientText(widget,kind,id,field)
    if not usable(widget) or not widget.GetText then return false end
    return set(widget,A.ResolveClientText(kind,id,field,widget:GetText()))
end

local function bind(hookMethod,widget,kind,field,id)
    if not usable(widget) then return end
    local function resolve(source)
        local current=id and id()
        if id and not current then return end
        local translated=A.ResolveClientText(kind,current,field,source)
        if not translated and kind=="Adventure" and field=="Description" then
            translated=A.ResolveClientText(kind,nil,"Continue",source)
        end
        return translated
    end
    hookMethod(widget,"SetText",function(self,source)
        if A.IsWriting(self) then return end
        set(self,resolve(source))
    end)
    return widget.GetText and set(widget,resolve(widget:GetText()))
end

function A.UpdateClientDescriptionTooltip(tooltip,kind,id)
    if not usable(tooltip) or not tooltip.GetName or not tooltip.NumLines then return end
    local name=tooltip:GetName()
    if not name then return end
    local changed=false
    for i=1,tooltip:NumLines() do
        local widget=_G[name.."TextLeft"..i]
        for _,field in ipairs({"Name","Description","Reward","Source"}) do
            if A.ApplyClientText(widget,kind,id,field) then changed=true;break end
        end
    end
    if changed and tooltip.Show then tooltip:Show() end
end

function A.UpdatePetAbilityDescription(tooltip,info)
    if not usable(tooltip) or not info or not info.GetAbilityID or not C_PetBattles
        or not C_PetBattles.GetAbilityInfoByID then return end
    local id=info:GetAbilityID()
    local _,name,_,_,source=C_PetBattles.GetAbilityInfoByID(id)
    A.ApplyClientText(tooltip.Name,"BattlePetAbility",id,"Name")
    local widget=tooltip.Description
    if not usable(widget) or not widget.GetText or not SharedPetAbilityTooltip_ParseText then return end
    local text=A.ResolveClientText("BattlePetAbility",id,"Description",source,true)
    if not text then return end
    local ok,original=pcall(SharedPetAbilityTooltip_ParseText,info,source)
    if not ok or widget:GetText()~=original then return end
    local valid,translated=pcall(SharedPetAbilityTooltip_ParseText,info,text)
    if valid and type(translated)=="string" and not translated:find("[%[%]$]")
        and not translated:find("PARSING ERROR",1,true) and A.IsChinese(translated) then
        set(widget,translated)
        -- Blizzard sizes this tooltip on its next OnUpdate, after layout.
    end
end

function A.UpdatePetCardDescription(card)
    if not usable(card) or not card.PetInfo then return end
    local id=card.speciesID
    if card.petID and C_PetJournal and C_PetJournal.GetPetInfoByPetID then id=C_PetJournal.GetPetInfoByPetID(card.petID) end
    if not id then return end
    local info=card.PetInfo
    info.sourceText=A.ResolveClientText("BattlePet",id,"Source",info.sourceText) or info.sourceText
    local body=type(info.description)=="string" and info.description:match('^"(.*)"$')
    local text=A.ResolveClientText("BattlePet",id,"Description",body)
    if text then info.description='"'..text..'"' end
end

local function achievement(button,hookMethod)
    if not usable(button) then return end
    local id=function() return button.id end
    bind(hookMethod,button.label,"Achievement","Name",id)
    bind(hookMethod,button.description,"Achievement","Description",id)
    bind(hookMethod,button.hiddenDescription,"Achievement","Description",id)
    bind(hookMethod,button.reward,"Achievement","Reward",id)
end

local function journal(hookMethod)
    local root=EncounterJournal
    local e=root and root.encounter
    if not usable(e) then return end
    local id=function() return root.encounterID end
    bind(hookMethod,e.info and e.info.encounterTitle,"Encounter","Name",id)
    bind(hookMethod,e.infoFrame and e.infoFrame.description,"Encounter","Description",id)
    bind(hookMethod,e.overviewFrame and e.overviewFrame.loreDescription,"Encounter","Description",id)
    local changed=false
    for _,header in ipairs(e.usedHeaders or {}) do
        local section=function() return header.myID end
        changed=bind(hookMethod,header.description,"JournalSection","Description",section) or changed
        bind(hookMethod,header.button and header.button.title,"JournalSection","Name",section)
    end
    if changed and EncounterJournal_ShiftHeaders then EncounterJournal_ShiftHeaders(1) end
end

local function adventure(hookMethod)
    local frame=EncounterJournal and EncounterJournal.suggestFrame
    if not usable(frame) then return end
    for i=1,AJ_MAX_NUM_SUGGESTIONS or 3 do
        local card=frame["Suggestion"..i]
        local center=card and card.centerDisplay
        if usable(center) then
            -- Suggestions expose display indices, not stable DB2 row IDs.
            -- Use the field-specific, ambiguity-checked complete-text index.
            bind(hookMethod,center.title and center.title.text,"Adventure","Name")
            bind(hookMethod,center.description and center.description.text,"Adventure","Description")
            bind(hookMethod,card.button or center.button,"Adventure","Button")
        end
    end
    bind(hookMethod,EncounterJournalTooltip and EncounterJournalTooltip.headerText,"Adventure","Reward")
end

function A.InstallClientDescriptions(hook,hookMethod,hookScript)
    for _,tooltip in pairs({GameTooltip,ItemRefTooltip}) do
        if usable(tooltip) then
            hookMethod(tooltip,"SetHyperlink",function(self,link)
                if type(link)~="string" then return end
                local kind,id=link:match("^([^:]+):(%d+)")
                if kind=="achievement" then A.UpdateClientDescriptionTooltip(self,"Achievement",tonumber(id))
                elseif kind=="currency" then A.UpdateClientDescriptionTooltip(self,"Currency",tonumber(id)) end
            end)
            hookMethod(tooltip,"SetCurrencyByID",function(self,id) A.UpdateClientDescriptionTooltip(self,"Currency",id) end)
            hookMethod(tooltip,"SetCurrencyToken",function(self) A.UpdateClientDescriptionTooltip(self,"Currency") end)
            hookMethod(tooltip,"SetBackpackToken",function(self) A.UpdateClientDescriptionTooltip(self,"Currency") end)
            hookMethod(tooltip,"SetAchievementByID",function(self,id) A.UpdateClientDescriptionTooltip(self,"Achievement",id) end)
        end
    end
    hook("AchievementButton_OnLoad",function(button) achievement(button,hookMethod) end)
    hook("AchievementFrameAchievements_SetupButton",function(button) achievement(button,hookMethod) end)
    for _,button in ipairs(AchievementFrameAchievementsContainer and AchievementFrameAchievementsContainer.buttons or {}) do achievement(button,hookMethod) end
    hook("SharedPetBattleAbilityTooltip_SetAbility",A.UpdatePetAbilityDescription)
    hook("PetJournal_UpdatePetCard",A.UpdatePetCardDescription)
    hook("EncounterJournal_ToggleHeaders",function() journal(hookMethod) end)
    hook("EncounterJournal_SetUpOverview",function(self,sectionID,index)
        local header=self and self.overviews and self.overviews[index]
        -- Blizzard assigns sectionID AFTER SetText on a reused overview.
        -- Translate here with the new ID, never from a stale SetText binding.
        if header then A.ApplyClientText(header.button and header.button.title,"JournalSection",sectionID,"Name") end
    end)
    local bulletsWriting=false
    hook("EncounterJournal_SetBullets",function(object,source,hide)
        if bulletsWriting then return end
        local text=A.ResolveClientText("JournalSection",nil,"Description",source)
        if text then
            bulletsWriting=true
            EncounterJournal_SetBullets(object,text,hide)
            if object.Text then A.SetFont(object.Text) end
            bulletsWriting=false
        end
    end)
    journal(hookMethod)
    adventure(hookMethod)
end
