hooks={};frames={};SlashCmdList={};questID=1;bookText="Page one";bookCreator=nil
function hooksecurefunc(name,callback) hooks[name]=callback end
function CreateFrame()
    local frame={};function frame:RegisterEvent() end;function frame:SetScript(_,callback) self.callback=callback end
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
function QuestFrameProgressPanel_OnShow() end
function QuestFrameGreetingPanel_OnShow() end
function GossipFrameUpdate() end
function ItemTextFrame_OnEvent() end
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
