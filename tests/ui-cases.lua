local A,D=TauriChinese,TauriChineseDB
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
ItemTextPageText.text=bookText;hooks.ItemTextFrame_OnEvent(nil,"ITEM_TEXT_READY");assert(ItemTextPageText.text=="第一页")
bookText="Page two";ItemTextPageText.text=bookText;hooks.ItemTextFrame_OnEvent(nil,"ITEM_TEXT_READY");assert(ItemTextPageText.text=="第二页")
bookText="原来的中文书页";ItemTextPageText.text=bookText;local writes=ItemTextPageText.writes
hooks.ItemTextFrame_OnEvent(nil,"ITEM_TEXT_READY");assert(ItemTextPageText.text==bookText and ItemTextPageText.writes==writes)
bookText="Unknown page";ItemTextPageText.text=bookText;hooks.ItemTextFrame_OnEvent(nil,"ITEM_TEXT_READY");assert(ItemTextPageText.text==bookText)
bookText="Page one";bookCreator="Author";ITEM_TEXT_FROM="From";hooks.ItemTextFrame_OnEvent(nil,"ITEM_TEXT_READY")
assert(ItemTextPageText.text=="第一页\n\nFrom\nAuthor\n")
TauriChineseSettings={enabled=false};bookText="Page two";ItemTextPageText.text=bookText
hooks.ItemTextFrame_OnEvent(nil,"ITEM_TEXT_READY");assert(ItemTextPageText.text==bookText)
GossipGreetingText.text="Hello there";hooks.GossipFrameUpdate();assert(GossipGreetingText.text=="Hello there")
