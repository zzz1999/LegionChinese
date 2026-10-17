-- SPDX-License-Identifier: GPL-2.0-or-later
local A=LegionChinese
local installed=false
local events={"SAY","YELL","WHISPER","WHISPER_INFORM","BN_WHISPER","BN_WHISPER_INFORM",
    "PARTY","PARTY_LEADER","RAID","RAID_LEADER","RAID_WARNING","GUILD","OFFICER",
    "CHANNEL","INSTANCE_CHAT","INSTANCE_CHAT_LEADER"}

function A.TranslateChatItemLinks(_,_,message,...)
    if not A.Enabled() or type(message)~="string" or type(GetItemInfo)~="function" then return false end
    local changed=false
    local translated=message:gsub("()(|H(item:%d+[^|]*)|h)%[([^|]-)%](|h)",function(position,opening,payload,caption,closing)
        local original=opening.."["..caption.."]"..closing
        local itemID=tonumber(payload:match("^item:(%d+)"))
        local rest=payload:match("^item:%d+(.*)$")
        if itemID==138019 or (rest~="" and rest:sub(1,1)~=":") or A.IsChinese(caption)
            or (position>1 and message:sub(position-1,position-1)=="|") then return original end
        -- Query the entire item variant: suffixes and bonuses must not be
        -- discarded by looking up only its base ID. This is the client's cache,
        -- not an external translation service. An unavailable name stays as-is.
        local name=GetItemInfo(payload)
        if not A.IsChinese(name) or name:find("|",1,true) or name:find("[\r\n]") then return original end
        changed=true
        return opening.."["..name.."]"..closing
    end)
    if changed then return false,translated,... end
    return false
end

function A.InstallChatItemLinks()
    if installed or type(ChatFrame_AddMessageEventFilter)~="function" then return end
    for _,event in ipairs(events) do ChatFrame_AddMessageEventFilter("CHAT_MSG_"..event,A.TranslateChatItemLinks) end
    installed=true
end
