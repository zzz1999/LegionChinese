-- The buffer/entry layout and display invalidation follow the 7.3.5 snapshot:
-- https://github.com/Gethe/wow-ui-source/blob/67ecbf5ce0e50cc7483c2295caecf410460f0994/SharedXML/ScrollingMessageFrame.lua
-- No fake SetMessageInfo or chat replay API: only existing entry.message changes.
timers={};clock=100
C_Timer={After=function(_,callback) table.insert(timers,callback) end}
function FlushChatTimers()
    local batch=timers;timers={}
    for _,callback in ipairs(batch) do callback() end
end
function GetTime() return clock end
function ChatWindow(name)
    local frame=ScriptFrame()
    frame.name=name;frame.scrollOffset=3;frame.overrideFadeTimestamp=10
    frame.addCalls=0;frame.dirtyCalls=0
    local buffer={entries={},max=120}
    function buffer:GetNumElements() return #self.entries end
    function buffer:GetEntryAtIndex(index) return self.entries[index] end
    function buffer:EnumerateIndexedEntries() return ipairs(self.entries) end
    function buffer:PushFront(entry)
        table.insert(self.entries,1,entry)
        if #self.entries>self.max then table.remove(self.entries) end
    end
    function buffer:PushBack(entry) table.insert(self.entries,entry) end
    frame.historyBuffer=buffer
    function frame:IsForbidden() return self.forbidden end
    function frame:MarkDisplayDirty() self.dirtyCalls=self.dirtyCalls+1;self.isDisplayDirty=true end
    function frame:PackageEntry(message,r,g,b,...)
        local extraData={n=select('#',...),...}
        return {message=message,r=r,g=g,b=b,extraData=extraData,timestamp=GetTime()}
    end
    function frame:AddMessage(message,r,g,b,...)
        self.addCalls=self.addCalls+1
        self.historyBuffer:PushFront(self:PackageEntry(message,r,g,b,...))
        self:MarkDisplayDirty()
    end
    function frame:BackFillMessage(message,r,g,b,...)
        self.historyBuffer:PushBack(self:PackageEntry(message,r,g,b,...))
        self:MarkDisplayDirty()
    end
    function frame:GetNumMessages() return self.historyBuffer:GetNumElements() end
    function frame:GetMessageInfo(index)
        local entry=self.historyBuffer:GetEntryAtIndex(self:GetNumMessages()-index+1)
        if entry then return entry.message,entry.r,entry.g,entry.b,(unpack or table.unpack)(entry.extraData,1,entry.extraData.n) end
    end
    function frame:Clear() error('Do not clear or replay chat history') end
    function frame:SetFont() error('Preserve the native Chinese chat font') end
    _G[name]=frame
    return frame
end
NUM_CHAT_WINDOWS=2
CHAT_FRAMES={'ChatFrame1','ChatFrame2'}
ChatWindow('ChatFrame1');ChatWindow('ChatFrame2')
function FCF_OpenTemporaryWindow()
    local frame=ChatWindow('ChatFrame11')
    table.insert(CHAT_FRAMES,'ChatFrame11')
    frame:AddMessage('Restored |Hitem:1|h[Nombre]|h')
    return frame
end
function NativeChatMessage(frame,event,message,...)
    for _,filter in ipairs(filters[event] or {}) do
        local blocked,replacement=filter(frame,event,message,...)
        if blocked then return end
        message=replacement or message
    end
    frame:AddMessage('[12:34] [Global] [Sender]: '..message,0.25,0.5,0.75,7,8,9,nil,11)
end
function ItemDataReceived(id,success)
    for _,frame in ipairs(frames) do
        if frame.registered and frame.registered.GET_ITEM_INFO_RECEIVED then frame:Fire('OnEvent','GET_ITEM_INFO_RECEIVED',id,success) end
    end
end
GameTooltip=ScriptFrame();ItemRefTooltip=ScriptFrame()
function GameTooltip:GetItem() return self.itemName,self.itemLink end
ItemRefTooltip.GetItem=GameTooltip.GetItem
function GameTooltip:SetHyperlink(link) self.link=link end
ItemRefTooltip.SetHyperlink=GameTooltip.SetHyperlink
