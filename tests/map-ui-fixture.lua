-- Available-quest pin flow copied in order from 7.3.5 WorldMapStoryLineTemplate.
questLines={"A Recent Discovery","Unknown custom quest"}
C_Questline={}
function C_Questline.GetNumAvailableQuestlines() return #questLines end
function C_Questline.GetQuestlineInfoByIndex(index) return "Story",questLines[index] end
function LoadMapTooltip()
    WorldMapTooltip=ScriptFrame()
    local tip=WorldMapTooltip
    WorldMapTooltipTextLeft1=Widget("")
    function tip:GetOwner() return self.owner end
    function tip:IsForbidden() return self.forbidden end
    function tip:SetOwner(owner) self.owner=owner end
    function tip:SetText(text)
        self.nativeSets=(self.nativeSets or 0)+1
        WorldMapTooltipTextLeft1:SetText(text);self.lines={}
    end
    function tip:AddLine(text) table.insert(self.lines,text) end
    function tip:Show()
        self.measuredTitle=WorldMapTooltipTextLeft1:GetText()
        self.shows=(self.shows or 0)+1
    end
    for i=1,2 do
        local name="WorldMapStoryLine"..i
        local pin={index=i}
        function pin:GetName() return name end
        function pin:IsForbidden() return self.forbidden end
        _G[name]=pin
    end
end
function MapHover(pin)
    local _,name=C_Questline.GetQuestlineInfoByIndex(pin.index)
    if name then
        WorldMapTooltip:SetOwner(pin)
        WorldMapTooltip:SetText(name)
        WorldMapTooltip:AddLine("可接任务")
        WorldMapTooltip:AddLine("位于下层")
        WorldMapTooltip:Show()
    end
end
function GetQuestChoiceInfo() return choiceInfo.id,choiceInfo.question,#choiceInfo.options end
function GetQuestChoiceOptionInfo(index)
    local row=choiceInfo.options[index]
    return row.id,row.answer,row.description,row.header
end
