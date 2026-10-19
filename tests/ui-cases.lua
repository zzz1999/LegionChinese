local A,D=LegionChinese,LegionChineseDB
D.Quests[1]={Title="第一任务",Description="替代正文",Objectives="第一目标"}
D.Quests[2]={Title="第二任务",Description="第二正文"}
hooks.QuestInfo_Display()
assert(QuestInfoTitleHeader.text=="第一任务")
assert(QuestInfoDescriptionText.text=="原有中文正文" and QuestInfoDescriptionText.writes==0 and QuestInfoDescriptionText.fontChanges==0)
assert(QuestInfoObjectivesText.text=="第一目标")
assert(QuestInfoRewardText.text=="Original reward")
questID=2;QuestInfoTitleHeader.text="Second title";QuestInfoDescriptionText.text="Second body"
hooks.QuestInfo_Display();assert(QuestInfoTitleHeader.text=="第二任务" and QuestInfoDescriptionText.text=="第二正文")
QuestInfoFrame.questLog=true;questID=1;QuestInfoTitleHeader.text="Log title";hooks.QuestInfo_Display()
assert(QuestInfoTitleHeader.text=="第二任务")

local function add(category,original,chinese,id)
    D.Strings[id]=chinese;D[category][A.Fingerprint(A.Normalize(original))]=id
end
add("Gossip","Hello there","你好。",1);add("Gossip","Show me the goods","让我看看你的货物。",2)
hooks.GossipFrameUpdate();assert(GossipGreetingText.text=="你好。" and GossipTitleButton1.text=="让我看看你的货物。")
GossipGreetingText.text="Unknown dialogue";hooks.GossipFrameUpdate();assert(GossipGreetingText.text=="Unknown dialogue")

add("Books","Page one","第一页",3);add("Books","Page two","第二页",4)
ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY");assert(ItemTextPageText.text=="第一页")
bookText="Page two";ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY");assert(ItemTextPageText.text=="第二页")
bookText="原来的中文书页";local writes=ItemTextPageText.writes;local fonts=ItemTextPageText.fontChanges
ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY");assert(ItemTextPageText.text==bookText and ItemTextPageText.writes==writes+1 and ItemTextPageText.fontChanges==fonts)
bookText="Unknown page";ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY");assert(ItemTextPageText.text==bookText)
bookText="Page one";bookCreator="Author";ITEM_TEXT_FROM="From";ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY")
assert(ItemTextPageText.text=="第一页\n\nFrom\nAuthor\n")
bookCreator=nil
local previous=ItemTextPageText.text
ItemTextFrame:Fire("OnEvent","ITEM_TEXT_BEGIN");assert(ItemTextPageText.text==previous)

-- Reinstalling hooks after other addons load must not multiply handlers.
frames[1]:Fire("OnEvent","ADDON_LOADED","AnotherAddon")
frames[1]:Fire("OnEvent","ADDON_LOADED","LegionChinese")
assert(#ItemTextFrame.scriptHooks.OnEvent==1)
assert(#QuestFrameProgressPanel.scriptHooks.OnShow==1)
questID=1;D.Quests[1].Progress="尚未完成。"
progressTitle="原来的中文任务标题";progressText="Progress body"
QuestFrameProgressPanel:Fire("OnShow")
assert(QuestProgressTitleText.text==progressTitle and QuestProgressText.text=="尚未完成。")
questID=2;progressText="Unknown progress";QuestFrameProgressPanel:Fire("OnShow")
assert(QuestProgressText.text==progressText)
questID=1;progressText="原来的中文进度";QuestFrameProgressPanel:Fire("OnShow")
assert(QuestProgressText.text==progressText)
QuestFrameGreetingPanel:Fire("OnShow");assert(GreetingText.text=="你好。")
QuestFrameGreetingPanel_OnShow(QuestFrameGreetingPanel);assert(GreetingText.text=="你好。")

-- Frames loaded later are installed on ADDON_LOADED as well.
ItemTextFrame=ScriptFrame();ItemTextFrame:SetScript("OnEvent",ItemTextFrame_OnEvent)
frames[1]:Fire("OnEvent","ADDON_LOADED","LateFrames")
bookText="Page two";ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY")
assert(ItemTextPageText.text=="第二页" and #ItemTextFrame.scriptHooks.OnEvent==1)

-- Legacy preferences cannot disable any translation surface.
LegionChineseSettings={enabled=false};bookText="Page two"
ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY");assert(ItemTextPageText.text=="第二页")
progressText="Progress body";QuestFrameProgressPanel:Fire("OnShow");assert(QuestProgressText.text=="尚未完成。")
QuestFrameGreetingPanel:Fire("OnShow");assert(GreetingText.text=="你好。")
GossipGreetingText.text="Hello there";hooks.GossipFrameUpdate();assert(GossipGreetingText.text=="你好。")
