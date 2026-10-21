hooks={};frames={};SlashCmdList={};questID=1;bookText="Page one";bookCreator=nil
function hooksecurefunc(object,name,callback)
    if type(object)=="string" then callback=name;name=object;object=_G end
    if object==_G then hooks[name]=callback end
    local original=object[name]
    local function pack(...) return {n=select("#",...),...} end
    object[name]=function(...)
        local result=pack(original(...));callback(...)
        return (unpack or table.unpack)(result,1,result.n)
    end
end
function ScriptFrame()
    local frame={scripts={},scriptHooks={},registered={}}
    function frame:RegisterEvent(event) self.registered[event]=true end
    function frame:SetScript(event,callback) self.scripts[event]=callback end
    function frame:HookScript(event,callback)
        self.scriptHooks[event]=self.scriptHooks[event] or {}
        table.insert(self.scriptHooks[event],callback)
    end
    function frame:Fire(event,...)
        if self.scripts[event] then self.scripts[event](self,...) end
        for _,callback in ipairs(self.scriptHooks[event] or {}) do callback(self,...) end
    end
    return frame
end
function CreateFrame()
    local frame=ScriptFrame()
    frames[#frames+1]=frame;return frame
end
function Widget(text)
    local w={text=text,fontChanges=0,writes=0}
    function w:GetText() return self.text end
    function w:SetText(value) self.text=value;self.writes=self.writes+1 end
    function w:GetFont() return "OriginalFont",14,"" end
    function w:SetFont() self.fontChanges=self.fontChanges+1 end
    function w:IsShown() return true end
    function w:SetHeight() end
    return w
end
function GetQuestID() return questID end
function GetQuestLogSelection() return 1 end
function GetQuestLogTitle() return "Log title",1,0,false,false,false,0,2 end
function ItemTextGetText() return bookText end
function ItemTextGetCreator() return bookCreator end
function QuestInfo_Display() end
progressTitle="Progress title";progressText="Progress body";greetingText="Hello there"
function QuestFrameProgressPanel_OnShow()
    QuestProgressTitleText:SetText(progressTitle);QuestProgressText:SetText(progressText)
end
function QuestFrameGreetingPanel_OnShow() GreetingText:SetText(greetingText) end
function GossipFrameUpdate() end
function ItemTextFrame_OnEvent(_,event)
    if event=="ITEM_TEXT_READY" then
        local text=bookText
        if bookCreator then text=text.."\n\n"..ITEM_TEXT_FROM.."\n"..bookCreator.."\n" end
        ItemTextPageText:SetText(text)
    end
end
function QuestLogQuests_Update() end
QuestInfoFrame={questLog=false}
QuestInfoTitleHeader=Widget("English title")
QuestInfoDescriptionText=Widget("原有中文正文")
QuestInfoObjectivesText=Widget("Original objectives")
QuestInfoRewardText=Widget("Original reward")
QuestProgressTitleText=Widget("Progress title")
QuestProgressText=Widget("Progress body")
GossipGreetingText=Widget("Hello there")
GossipTitleButton1=Widget("Show me the goods");GossipTitleButton1.type="Gossip"
ItemTextPageText=Widget("")
GreetingText=Widget("")
-- XML function attributes capture the handler before addons load. Replacing
-- its global name later does not change this stored callback.
ItemTextFrame=ScriptFrame();ItemTextFrame:SetScript("OnEvent",ItemTextFrame_OnEvent)
QuestFrameProgressPanel=ScriptFrame();QuestFrameProgressPanel:SetScript("OnShow",QuestFrameProgressPanel_OnShow)
QuestFrameGreetingPanel=ScriptFrame();QuestFrameGreetingPanel:SetScript("OnShow",QuestFrameGreetingPanel_OnShow)
-- Explicit original text for synthetic quest fixtures; never authorize by ID alone.
function AllowQuestSource(id,field,...)
    local A,D=LegionChinese,LegionChineseDB
    D.QuestSources[id]=D.QuestSources[id] or {}
    D.QuestSources[id][field]=D.QuestSources[id][field] or {}
    for _,text in ipairs({...}) do D.QuestSources[id][field][A.Fingerprint(A.Normalize(text))]=true end
end
