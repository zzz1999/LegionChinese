-- Model Legion's layout contract: each line is measured before the next line
-- and the full block are placed. This does not simulate real font rendering.
clientLocale="zhCN"
function GetLocale() return clientLocale end
OBJECTIVE_TRACKER_COLOR={Header={name="header"},Normal={name="normal"},Complete={name="complete"}}
OBJECTIVE_TRACKER_UPDATE_MODULE_QUEST=1
local defaults={lineSpacing=2}
function defaults:SetStringText(widget,text,full,color,highlight)
    widget:SetText(text)
    local height=widget:GetStringHeight()
    widget.height=full and height or math.min(height,28)
    widget.color=color or OBJECTIVE_TRACKER_COLOR.Normal
    widget.highlight=highlight
    return widget.height
end
function TrackerText(text)
    local widget=Widget(text)
    widget.font="Fonts\\ARKai_T.ttf";widget.size=13;widget.flags="OUTLINE"
    function widget:GetFont() return self.font,self.size,self.flags end
    function widget:SetFont(font,size,flags)
        self.font=font;self.size=size;self.flags=flags;self.fontChanges=self.fontChanges+1;return true
    end
    function widget:GetStringHeight() return LegionChinese.IsChinese(self.text) and 42 or 14 end
    function widget:GetHeight() return self.height or self:GetStringHeight() end
    return widget
end
function defaults:AddObjective(block,key,text,lineType,full,dash,color,empty)
    local line=block.lines[key]
    if not line then
        line={Text=TrackerText(""),state="PRESENT",check="retained"}
        function line:GetHeight() return self.height end
        function line:SetHeight(value) self.height=value end
        block.lines[key]=line
    end
    line.type=lineType;line.dash=dash
    line.height=self:SetStringText(line.Text,text,full,color,block.isHighlighted)
    line.top=block.height
    line.anchor=block.currentLine or block.HeaderText
    if not (empty and text=="") then block.height=block.height+line.height+self.lineSpacing end
    block.currentLine=line
    return line
end
function NewQuestTracker()
    local module=setmetatable({usedBlocks={}}, {__index=defaults})
    function module:SetBlockHeader(block,title,index,complete,id)
        block.height=self:SetStringText(block.HeaderText,title,nil,OBJECTIVE_TRACKER_COLOR.Header)
    end
    return module
end
QUEST_TRACKER_MODULE=NewQuestTracker()
OTHER_TRACKER_MODULE=setmetatable({}, {__index=defaults})
function NewQuestBlock(id)
    return {id=id,module=QUEST_TRACKER_MODULE,HeaderText=TrackerText(""),lines={},height=0,
        itemButton={id="item"},poiButton={id="poi"},isHighlighted=true}
end
trackerQuestID=12680
trackerCompletion="Return to Salanar the Horseman at Death's Breach in Plaguelands: The Scarlet Enclave."
function GetQuestLogIndexByID(id) return id==trackerQuestID and 1 or 0 end
function GetQuestLogCompletionText(index) if index==1 then return trackerCompletion end end
ObjectiveTrackerFrame={initialized=true}
trackerRefreshes=0
function ObjectiveTracker_Update(reason)
    assert(reason==OBJECTIVE_TRACKER_UPDATE_MODULE_QUEST)
    trackerRefreshes=trackerRefreshes+1
    if trackerDraw then trackerDraw() end
end
