-- Model the 7.3.5 QuestChoiceFrame population order and native sizing: IDs
-- precede SetText; SimpleHTML content is measured before the next frame.
choiceInfo={id=265,question="Which weapon should we pursue first?",options={}}
artifactInfo={title="Ashbringer",appearanceID=9}
appearanceRows={}
powerInfo={};powerLines={}
C_ArtifactUI={}
function C_ArtifactUI.GetArtifactInfo() return 128825,nil,nil,nil,nil,nil,nil,artifactInfo.appearanceID end
function C_ArtifactUI.GetPowerInfo(id) return powerInfo[id] end
function GameTooltip:GetName() return "GameTooltip" end
function GameTooltip:NumLines() return self.lineCount or 0 end
function GameTooltip:SetText(text)
    self:Fire("OnTooltipCleared");self.lineCount=1;GameTooltipTextLeft1:SetText(text)
end
function GameTooltip:SetArtifactPowerByID(id)
    self:Fire("OnTooltipCleared")
    self.lineCount=#powerLines[id]
    for i,text in ipairs(powerLines[id]) do
        local key="GameTooltipTextLeft"..i
        _G[key]=_G[key] or Widget("");_G[key]:SetText(text)
    end
    self:Show()
end

function LoadArtifactFrames()
    QuestChoiceFrame={Options={},QuestionText=Widget(""),updates=0}
    local choice=QuestChoiceFrame
    for i=1,4 do
        local option={OptionButton=Widget(""),OptionText=Widget(""),Header={Text=Widget("")}}
        function option.OptionText:GetContentHeight() return LegionChinese.IsChinese(self.text) and 180 or 400 end
        function option:SetHeight(value)
            if self.height~=value then self.height=value;choice.hasPendingUpdate=true end
        end
        choice.Options[i]=option
    end
    function choice:Update()
        self.updates=self.updates+1;self.hasPendingUpdate=false;self.choiceID=choiceInfo.id
        self.QuestionText:SetText(choiceInfo.question)
        for i,row in ipairs(choiceInfo.options) do
            local option=self.Options[i];option.optID=row.id
            option.OptionButton:SetText(row.answer or "Select")
            option.OptionText:SetText(row.description)
            option.Header.Text:SetText(row.header)
            option.confirmationText="CONFIRM_ARTIFACT_CHOICE"
        end
        local height=278
        for i=1,#choiceInfo.options do height=math.max(height,136+self.Options[i].OptionText:GetContentHeight()) end
        for i=1,#choiceInfo.options do self.Options[i]:SetHeight(height) end
        self.height=480+height-278
    end
    ArtifactFrame={PerksTab={TitleContainer={ArtifactName=Widget("")}},AppearancesTab={}}
    function ArtifactFrame.PerksTab.TitleContainer:RefreshTitle() self.ArtifactName:SetText(artifactInfo.title) end
    local tab=ArtifactFrame.AppearancesTab
    tab.slots={};tab.sets={};tab.appearanceSlotPool={}
    function tab.appearanceSlotPool:EnumerateActive()
        local i=0
        return function() i=i+1;if i<=#appearanceRows then return tab.slots[i] end end
    end
    function tab:AddAppearanceSlot(set,id,_,_,_,unlocked,condition)
        local slot=self.slots[self.currentIndex]
        if not slot then
            slot=ScriptFrame();self.slots[self.currentIndex]=slot
            slot:SetScript("OnEnter",function(s)
                if s.unlockConditionText then
                    GameTooltip.owner=s;GameTooltip:SetText(s.unlockConditionText);GameTooltip:Show()
                end
            end)
        end
        slot.appearanceID=id;slot.appearanceUnlocked=unlocked;slot.unlockConditionText=condition
    end
    function tab:Refresh()
        for i,row in ipairs(appearanceRows) do
            self.currentIndex=i
            local set=self.sets[i] or {Name=Widget(""),DescriptionTooltipArea={}};self.sets[i]=set
            set.Name:SetText(row.name);set.DescriptionTooltipArea.tooltip=row.description
            self:AddAppearanceSlot(set,row.id,0,0,0,row.unlocked,row.condition)
        end
    end
    ArtifactLevelUpToast={ArtifactName=Widget("")}
    function ArtifactLevelUpToast:PlayBanner(data) self.ArtifactName:SetText(data.name) end
end
