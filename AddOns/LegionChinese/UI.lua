-- SPDX-License-Identifier: GPL-2.0-or-later
local A = LegionChinese
local installed = {}
local installedScripts = {}
local installedMethods = {}
local function hook(name, callback)
    if not installed[name] and type(_G[name])=="function" then
        hooksecurefunc(name,function(...) if A.Enabled() then callback(...) end end)
        installed[name]=true
    end
end

local function hookMethod(object, name, callback)
    if not object or type(object[name])~="function" then return end
    local methods=installedMethods[object]
    if not methods then methods={};installedMethods[object]=methods end
    if methods[name] then return end
    hooksecurefunc(object,name,function(...) if A.Enabled() then callback(...) end end)
    methods[name]=true
end

local function hookScript(widget, event, callback)
    if not widget or type(widget.HookScript)~="function" then return end
    local events=installedScripts[widget]
    if not events then events={};installedScripts[widget]=events end
    if events[event] then return end
    widget:HookScript(event,function(...) if A.Enabled() then callback(...) end end)
    events[event]=true
end

local function currentQuest()
    if QuestInfoFrame and QuestInfoFrame.questLog then
        if GetQuestLogTitle and GetQuestLogSelection then
            local title,_,_,_,_,_,_,id=GetQuestLogTitle(GetQuestLogSelection())
            return id,title
        end
    elseif GetQuestID then return GetQuestID(),GetTitleText and GetTitleText() end
end

function A.UpdateQuestInfo()
    local id,title=currentQuest()
    A.Apply(QuestInfoTitleHeader,"Quests",id,"Title",title)
    A.Apply(QuestInfoDescriptionText,"Quests",id,"Description")
    A.Apply(QuestInfoObjectivesText,"Quests",id,"Objectives")
    A.Apply(QuestInfoRewardText,"Quests",id,"Completion")
    if QuestInfoObjectivesFrame and QuestInfoObjectivesFrame.Objectives then
        for _,widget in ipairs(QuestInfoObjectivesFrame.Objectives) do A.Apply(widget,"Objectives") end
    end
end

function A.UpdateProgress()
    local id=GetQuestID and GetQuestID()
    A.Apply(QuestProgressTitleText,"Quests",id,"Title",GetTitleText and GetTitleText())
    A.Apply(QuestProgressText,"Quests",id,"Progress")
end

function A.UpdateGossip()
    A.Apply(GossipGreetingText,"Gossip")
    for i=1,NUMGOSSIPBUTTONS or 32 do
        local button=_G["GossipTitleButton"..i]
        if button and button:IsShown() then
            if A.Apply(button,button.type=="Gossip" and "Gossip" or "Titles") and GossipResize then GossipResize(button) end
        end
    end
    if GossipGreetingScrollFrame and GossipGreetingScrollFrame.UpdateScrollChildRect then GossipGreetingScrollFrame:UpdateScrollChildRect() end
end

function A.UpdateGreeting()
    local changed=A.Apply(GreetingText,"Gossip")
    for i=1,MAX_NUM_QUESTS or 32 do
        local button=_G["QuestTitleButton"..i]
        if button and button:IsShown() and A.Apply(button,"Titles") then
            button:SetHeight(button:GetTextHeight()+2)
            changed=true
        end
    end
    if changed and QuestGreetingScrollFrame and QuestGreetingScrollFrame.UpdateScrollChildRect then QuestGreetingScrollFrame:UpdateScrollChildRect() end
end

function A.UpdateQuestList()
    local contents=QuestMapFrame and QuestMapFrame.QuestsFrame and QuestMapFrame.QuestsFrame.Contents
    if not contents then return end
    local quests,changed={},false
    for _,button in ipairs(contents.Titles or {}) do
        if button:IsShown() and button.questLogIndex and button.Text then
            local title,_,_,_,_,_,_,id=GetQuestLogTitle(button.questLogIndex)
            if id then quests[id]=button end
            local oldHeight=button.Text:GetStringHeight()
            if A.Apply(button.Text,"Quests",id,"Title",title) then
                button:SetHeight(button:GetHeight()+button.Text:GetStringHeight()-oldHeight)
                if button.Check and button.Check:IsShown() then
                    button.Check:SetPoint("LEFT",button.Text,button.Text:GetWrappedWidth()+2,0)
                end
                changed=true
            end
        end
    end
    -- Legion's objective pool is local to Blizzard, but its frames are named
    -- QLOF1, QLOF2, ... . Read existing frames only; do not allocate through
    -- QuestLog_GetObjectiveFrame or alter the quest-log selection.
    local i=1
    while _G["QLOF"..i] do
        local objective=_G["QLOF"..i]
        local button=quests[objective.questID]
        if button and objective:IsShown() and objective.Text then
            local original=objective.Text:GetText()
            local completion=GetQuestLogCompletionText and GetQuestLogCompletionText(button.questLogIndex)
            local oldHeight=objective.Text:GetStringHeight()
            local updated
            if completion and completion~="" and original==completion then
                updated=A.Apply(objective.Text,"Quests",objective.questID,"CompletionLog",completion)
            else
                updated=A.Apply(objective.Text,"Objectives")
            end
            if updated then
                local height=objective.Text:GetStringHeight()
                objective:SetHeight(height)
                button:SetHeight(button:GetHeight()+height-oldHeight)
                changed=true
            end
        end
        i=i+1
    end
    if changed and QuestScrollFrame and QuestScrollFrame.UpdateScrollChildRect then QuestScrollFrame:UpdateScrollChildRect() end
end

-- Run inside the quest module's layout, before the next line/block is anchored.
-- Updating text after ObjectiveTracker_Update would leave stale heights and can
-- overlap later objectives, timers, item buttons and the next quest.
function A.UpdateTrackerHeader(module, block, text, _, _, questID)
    if not block or not block.HeaderText then return end
    local widget=block.HeaderText
    if A.Apply(widget,"Quests",questID or block.id,"Title",text) then
        block.height=module:SetStringText(widget,widget:GetText(),nil,OBJECTIVE_TRACKER_COLOR["Header"])
    end
end

function A.UpdateTrackerObjective(module, block, key, text, _, useFullHeight, _, colorStyle)
    local line=block and block.lines and block.lines[key]
    if not line or not line.Text or line.Text:GetText()~=text then return end
    local oldHeight=line:GetHeight()
    local changed
    if type(key)=="number" then
        changed=A.Apply(line.Text,"Objectives")
    elseif key=="QuestComplete" then
        local index=GetQuestLogIndexByID and GetQuestLogIndexByID(block.id)
        local completion=index and index>0 and GetQuestLogCompletionText and GetQuestLogCompletionText(index)
        if completion and completion==text then changed=A.Apply(line.Text,"Quests",block.id,"CompletionLog",completion) end
    end
    if changed then
        local height=module:SetStringText(line.Text,line.Text:GetText(),useFullHeight,colorStyle,block.isHighlighted)
        line:SetHeight(height)
        block.height=block.height+height-oldHeight
    end
end

function A.RefreshTracker()
    if QUEST_TRACKER_MODULE and ObjectiveTrackerFrame and ObjectiveTrackerFrame.initialized and ObjectiveTracker_Update then
        ObjectiveTracker_Update(OBJECTIVE_TRACKER_UPDATE_MODULE_QUEST)
    end
end

local castTranslations={}
local castEvents={UNIT_SPELLCAST_START=true,UNIT_SPELLCAST_CHANNEL_START=true,
    UNIT_SPELLCAST_DELAYED=true,UNIT_SPELLCAST_CHANNEL_UPDATE=true,PLAYER_ENTERING_WORLD=true}

local function currentCast(bar)
    if not bar or not bar.unit or not bar.Text or not bar:IsShown() or bar.fadeOut then return end
    local name,subtext,text,texture,startTime,endTime,tradeSkill,castID,notInterruptible,spellID
    if bar.channeling and UnitChannelInfo then
        name,subtext,text,texture,startTime,endTime,tradeSkill,notInterruptible,spellID=UnitChannelInfo(bar.unit)
    elseif bar.casting and UnitCastingInfo then
        name,subtext,text,texture,startTime,endTime,tradeSkill,castID,notInterruptible,spellID=UnitCastingInfo(bar.unit)
        if castID~=bar.castID then return end
    end
    if type(name)=="string" and type(text)=="string" and text~="" then return name,text,startTime,castID,spellID end
end

function A.UpdateCastBar(bar,event,unit,spellName,rank,castID,spellID)
    -- Only the original player/controlled-pet bars. A post-hook of the shared
    -- handler also receives target, focus and third-party bars.
    if not A.Enabled() or not bar or (bar~=CastingBarFrame and bar~=PetCastingBarFrame) then return end
    if event and not castEvents[event] then return end
    if event and event~="PLAYER_ENTERING_WORLD" and unit~=bar.unit then return end
    local name,source,startTime,currentID,currentSpellID=currentCast(bar)
    if not name or A.IsChinese(source) or bar.Text:GetText()~=source then return end

    -- Legion UnitCastingInfo returns the spell ID in position 10. Some server
    -- clients omit it; their start event can supply a validated fallback.
    -- The castID in position 8 / event argument 4 is an execution counter.
    local matchingEvent=event=="UNIT_SPELLCAST_START" and bar.casting and castID==bar.castID
        or event=="UNIT_SPELLCAST_CHANNEL_START" and bar.channeling and (spellName==name or spellName==source)
    local id=type(currentSpellID)=="number" and currentSpellID>0 and currentSpellID%1==0 and currentSpellID or nil
    if not id and matchingEvent and type(spellID)=="number" and spellID>0 and spellID%1==0 then id=spellID end
    local translated=A.ResolveSpellName and A.ResolveSpellName(source,id) or nil
    translated=translated or A.IsChinese(name) and name or nil
    local previous=castTranslations[bar]
    if not translated and previous and previous.unit==bar.unit and previous.name==name and previous.source==source
        and previous.startTime==startTime and previous.castID==currentID and previous.channeling==bar.channeling
        and (not id or id==previous.spellID) then
        translated=previous.translated
    end
    if not translated and GetSpellInfo then
        if id then
            local localized=GetSpellInfo(id)
            if A.IsChinese(localized) then translated=localized end
        end
        if not translated then
            local localized=GetSpellInfo(name)
            if A.IsChinese(localized) then translated=localized end
        end
    end
    if not translated then return end
    A.SetFont(bar.Text)
    bar.Text:SetText(translated)
    castTranslations[bar]={unit=bar.unit,name=name,source=source,translated=translated,
        startTime=startTime,castID=currentID,channeling=bar.channeling,spellID=id}
end

function A.RefreshCastBars()
    for _,key in ipairs({"CastingBarFrame","PetCastingBarFrame"}) do
        local bar=_G[key]
        if A.Enabled() then
            A.UpdateCastBar(bar)
        elseif bar then
            local previous=castTranslations[bar]
            local name,source=currentCast(bar)
            if previous and previous.unit==bar.unit and previous.name==name and previous.source==source
                and bar.Text:GetText()==previous.translated then bar.Text:SetText(source) end
        end
    end
end

function A.UpdateBook(_,event)
    if event~="ITEM_TEXT_READY" or not ItemTextGetText or not ItemTextPageText then return end
    local original=ItemTextGetText()
    local translated,changed=A.Translate("Books",original)
    if not changed then return end
    local creator=ItemTextGetCreator and ItemTextGetCreator()
    if creator then translated=translated.."\n\n"..(ITEM_TEXT_FROM or "作者").."\n"..creator.."\n" end
    A.SetFont(ItemTextPageText,true)
    ItemTextPageText:SetText(translated)
    if ItemTextScrollFrame and ItemTextScrollFrame.UpdateScrollChildRect then
        local child=ItemTextScrollFrame:GetScrollChild()
        if child then child:SetHeight(1) end
        ItemTextScrollFrame:UpdateScrollChildRect()
        local range=ItemTextScrollFrame:GetVerticalScrollRange()
        if child and range and range>0 then child:SetHeight(ItemTextScrollFrame:GetHeight()+range+30) end
    end
end

local function install()
    hook("QuestInfo_Display",A.UpdateQuestInfo)
    -- Legion XML stores these handlers before addons load. Hook the actual
    -- frame script so translation runs after Blizzard has populated the text.
    hookScript(QuestFrameProgressPanel,"OnShow",A.UpdateProgress)
    hookScript(QuestFrameGreetingPanel,"OnShow",A.UpdateGreeting)
    -- QUEST_LOG_UPDATE also refreshes the greeting by calling this global.
    hook("QuestFrameGreetingPanel_OnShow",A.UpdateGreeting)
    hook("GossipFrameUpdate",A.UpdateGossip)
    hookScript(ItemTextFrame,"OnEvent",A.UpdateBook)
    hook("QuestLogQuests_Update",A.UpdateQuestList)
    hookMethod(QUEST_TRACKER_MODULE,"SetBlockHeader",A.UpdateTrackerHeader)
    hookMethod(QUEST_TRACKER_MODULE,"AddObjective",A.UpdateTrackerObjective)
    -- The player's XML stores the original callback before addon load; the
    -- global hook additionally catches internal resume/unit-change calls.
    hookScript(CastingBarFrame,"OnEvent",A.UpdateCastBar)
    hookScript(PetCastingBarFrame,"OnEvent",A.UpdateCastBar)
    hook("CastingBarFrame_OnEvent",A.UpdateCastBar)
    if A.InstallPetNames then A.InstallPetNames(hook,hookScript) end
    if A.UpdateWorldObjectTooltip then
        -- World objects have no OnTooltipSetUnit/Item event in Legion.
        hookScript(GameTooltip,"OnShow",A.UpdateWorldObjectTooltip)
        hookScript(GameTooltip,"OnUpdate",A.UpdateWorldObjectTooltip)
        hookScript(GameTooltip,"OnHide",A.ClearWorldObjectTooltip)
        hookScript(GameTooltip,"OnTooltipCleared",A.ClearWorldObjectTooltip)
    end
    if A.InstallItemTooltips then A.InstallItemTooltips() end
    if A.InstallChatItemLinks then A.InstallChatItemLinks() end
end
local frame=CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_LOGIN")
frame:SetScript("OnEvent",function(_,event,addonName)
    if event=="PLAYER_LOGIN" or (event=="ADDON_LOADED" and addonName=="LegionChinese") then
        A.InitializeSettings()
    end
    install()
    if event=="PLAYER_LOGIN" or (event=="ADDON_LOADED" and addonName=="Blizzard_ObjectiveTracker") then A.RefreshTracker() end
    if event=="PLAYER_LOGIN" then
        A.RefreshCastBars()
        if A.RefreshPetNames then A.RefreshPetNames() end
        if A.RefreshChatItemLinks then A.RefreshChatItemLinks() end
    end
    if event=="PLAYER_LOGIN" and not LegionChineseSettings.welcomeSeen then A.ShowWelcome() end
end)
install()

SLASH_LEGIONCHINESE1="/lcn"
SlashCmdList.LEGIONCHINESE=function(command)
    A.InitializeSettings()
    command=(command or ""):lower():gsub("%s","")
    if command=="off" or command=="关" then
        LegionChineseSettings.enabled=false
        if A.RefreshWorldObjectTooltip then A.RefreshWorldObjectTooltip() end
        if A.RefreshItemTooltips then A.RefreshItemTooltips() end
        A.RefreshTracker()
        A.RefreshCastBars()
        if A.RefreshPetNames then A.RefreshPetNames() end
        if A.RefreshChatItemLinks then A.RefreshChatItemLinks() end
        print("LegionChinese：已关闭，重新打开窗口后生效。")
    elseif command=="on" or command=="开" then
        LegionChineseSettings.enabled=true
        if A.RefreshWorldObjectTooltip then A.RefreshWorldObjectTooltip() end
        if A.RefreshItemTooltips then A.RefreshItemTooltips() end
        A.RefreshTracker()
        A.RefreshCastBars()
        if A.RefreshPetNames then A.RefreshPetNames() end
        if A.RefreshChatItemLinks then A.RefreshChatItemLinks() end
        print("LegionChinese：已开启，已有中文保持不变，缺失译文保留原文。")
    elseif command=="about" or command=="关于" then
        A.ShowWelcome()
    else
        print("LegionChinese："..(A.Enabled() and "已开启" or "已关闭").."。/lcn on 开启，/lcn off 关闭，/lcn about 关于与反馈。")
    end
end
