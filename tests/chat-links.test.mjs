import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
function run(code,{native=false,beforeUI=''}={}){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=text=>{const status=lauxlib.luaL_dostring(L,to_luastring(text));assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));};
  try{
    for(const file of ['Bootstrap.lua','Core.lua','ChatLinks.lua'])execute(fs.readFileSync(new URL(file,addon),'utf8'));
    execute(fs.readFileSync(new URL('ui-fixture.lua',import.meta.url),'utf8'));
    execute(`filters={};itemNames={};queries={};mapNames={};mapQueries={};mapRequests=0
      function ChatFrame_AddMessageEventFilter(event,filter)
        filters[event]=filters[event] or {};table.insert(filters[event],filter)
      end
      function GetItemInfo(link) queries[#queries+1]=link;return itemNames[link] end
      C_ChallengeMode={GetMapInfo=function(id) mapQueries[#mapQueries+1]=id;return mapNames[id] end,
        RequestMapInfo=function() mapRequests=mapRequests+1 end}
      function SendChatMessage() error("Must not send or change chat messages") end`);
    if(native)execute(fs.readFileSync(new URL('chat-frame-fixture.lua',import.meta.url),'utf8'));
    if(beforeUI)execute(beforeUI);
    execute(fs.readFileSync(new URL('UI.lua',addon),'utf8'));
    execute('local A=LegionChinese\n'+code);
  }finally{lua.lua_close(L);}
}

test('foreign item link captions use the exact client variant while preserving color, payload, surrounding text and event arguments',()=>run(`
  local payload="item:19019::::::::110:250::5:2:123:456:::"
  itemNames[payload]="雷霆之怒，逐风者的祝福之剑"
  local link="|cffff8000|H"..payload.."|h[Furia del Trueno]|h|r"
  local message="Vendo "..link.." por 500 oro."
  local args={n=14,"Author-Realm",nil,"Global",false,55,"Player-1",nil,"Tail"}
  local function pack(...) return {n=select("#",...),...} end
  local result=pack(filters.CHAT_MSG_CHANNEL[1]({},"CHAT_MSG_CHANNEL",message,(unpack or table.unpack)(args,1,args.n)))
  assert(result.n==16 and result[1]==false)
  assert(result[2]=="Vendo |cffff8000|H"..payload.."|h["..itemNames[payload].."]|h|r por 500 oro.")
  for i=1,args.n do assert(result[i+2]==args[i]) end
  assert(queries[1]==payload)
`));

test('each link is resolved independently without translating Chinese captions, other link types or ordinary chat',()=>run(`
  itemNames["item:1"]="简体名称";itemNames["item:2:bonus"]="繁體名稱"
  local message="hola |Hitem:1|h[Nombre]|h / |Hitem:2:bonus|h[Name]|h / |Hitem:1|h[已有中文]|h"
  local _,text=A.TranslateChatItemLinks(nil,nil,message)
  assert(text=="hola |Hitem:1|h[简体名称]|h / |Hitem:2:bonus|h[繁體名稱]|h / |Hitem:1|h[已有中文]|h")
  for _,untouched in ipairs({"Vendo Name", "|Hspell:1|h[Nombre]|h", "|Hkeystone:138019:197:12|h[Keystone (12)]|h",
    "|Hitem:138019|h[Keystone (12)]|h", "|Hplayer:Name|h[Name]|h", "|Hitem:1oops|h[Name]|h", "||Hitem:1||h[Name]||h", "|Hitem:1|hBroken"}) do
    local filtered,replacement=A.TranslateChatItemLinks(nil,nil,untouched)
    assert(filtered==false and replacement==nil,untouched)
  end
  assert(#queries==2)
`));

test('filter fallback preserves uncached names and uses newly available Chinese without delaying messages',()=>run(`
  local message="|Hitem:1|h[Nombre]|h"
  local filtered,text=A.TranslateChatItemLinks(nil,nil,message);assert(filtered==false and text==nil)
  itemNames["item:1"]="English Name"
  filtered,text=A.TranslateChatItemLinks(nil,nil,message);assert(filtered==false and text==nil)
  itemNames["item:1"]="已缓存中文"
  filtered,text=A.TranslateChatItemLinks(nil,nil,message);assert(filtered==false and text=="|Hitem:1|h[已缓存中文]|h")
  itemNames["item:1"]="无效|H文字"
  assert(select(2,A.TranslateChatItemLinks(nil,nil,message))==nil)
  GetItemInfo=nil;assert(A.TranslateChatItemLinks(nil,nil,message)==false)
`));

test('Legion keystone captions use the linked dungeon and level for native and item-prefixed links',()=>run(`
  mapNames[197]="英灵殿";mapNames[210]="群星庭院"
  CHALLENGE_MODE_KEYSTONE_HYPERLINK="钥石：%s (%d)"
  local hall="keystone:197:12:6:3:9"
  local court="keystone:138019:210:18:6:3:9"
  local message="LFM |cffa335ee|H"..hall.."|h[Piedra angular: Cámaras del Valor (12)]|h|r / |H"..court.."|h[Keystone: Court of Stars (18)]|h"
  NativeChatMessage(ChatFrame1,"CHAT_MSG_CHANNEL",message)
  local entry=ChatFrame1.historyBuffer:GetEntryAtIndex(1)
  assert(entry.message=="[12:34] [Global] [Sender]: LFM |cffa335ee|H"..hall.."|h[钥石：英灵殿 (12)]|h|r / |H"..court.."|h[钥石：群星庭院 (18)]|h")
  assert(#queries==0 and mapQueries[1]==197 and mapQueries[2]==210 and mapRequests==0)
  SlashCmdList.LEGIONCHINESE("off")
  assert(entry.message=="[12:34] [Global] [Sender]: "..message)
  SlashCmdList.LEGIONCHINESE("on")
  assert(entry.message:find("[钥石：英灵殿 (12)]",1,true))
`,{native:true}));

test('keystone translation supports Traditional Chinese and the official fallback format without item cache APIs',()=>run(`
  local link="|Hkeystone:197:12:6:3:9|h[Keystone: Halls of Valor (12)]|h"
  GetItemInfo=nil;mapNames[197]="英靈殿"
  CHALLENGE_MODE_KEYSTONE_HYPERLINK="鑰石：%s(%d)"
  assert(select(2,A.TranslateChatItemLinks(nil,nil,link))=="|Hkeystone:197:12:6:3:9|h[鑰石：英靈殿(12)]|h")
  mapNames[197]="英灵殿"
  for _,format in ipairs({"Keystone: %s (%d)","无效%s%s%s", "不安全|H%s (%d)"}) do
    CHALLENGE_MODE_KEYSTONE_HYPERLINK=format
    assert(select(2,A.TranslateChatItemLinks(nil,nil,link))=="|Hkeystone:197:12:6:3:9|h[钥石：英灵殿 (12)]|h")
  end
`));

test('late challenge map data updates existing keystones and ordinary items independently with one map request',()=>run(`
  local message="|Hkeystone:197:12:6:3:9|h[Keystone]|h |Hitem:1|h[Nombre]|h"
  ChatFrame1:AddMessage(message);ChatFrame2:AddMessage(message)
  local entry=ChatFrame1.historyBuffer:GetEntryAtIndex(1)
  assert(entry.message==message and mapRequests==1)
  itemNames["item:1"]="中文物品";ItemDataReceived(1,true);FlushChatTimers()
  assert(entry.message==message:gsub("%[Nombre%]","[中文物品]"))
  mapNames[197]="英灵殿"
  for _,frame in ipairs(frames) do frame:Fire("OnEvent","CHALLENGE_MODE_MAPS_UPDATE") end
  assert(#timers==1);FlushChatTimers()
  for _,frame in ipairs({ChatFrame1,ChatFrame2}) do
    assert(frame.historyBuffer:GetEntryAtIndex(1).message=="|Hkeystone:197:12:6:3:9|h[钥石：英灵殿 (12)]|h |Hitem:1|h[中文物品]|h")
    assert(frame.addCalls==1 and frame.scrollOffset==3 and frame.overrideFadeTimestamp==10)
  end
  assert(entry.timestamp==100 and mapRequests==1)
`,{native:true}));

test('unresolved, malformed, already Chinese and generic keystone links retain their complete original caption',()=>run(`
  mapNames[197]="英灵殿";itemNames["item:138019"]="史诗钥石"
  for _,link in ipairs({"|Hkeystone:197:12:6:3:9|h[已有中文]|h", "|Hkeystone:1:12:6:3:9|h[Unknown]|h",
    "|Hkeystone:197:12oops:6:3:9|h[Bad]|h", "|Hkeystone:197:0:6:3:9|h[Bad]|h",
    "|Hkeystone:197:12|h[Bad]|h", "|Hkeystone:158923:197:12|h[Later expansion]|h",
    "|Hkeystone:138019:197:12oops|h[Bad]|h", "|Hkeystone:0:12:6:3:9|h[Bad]|h",
    "|Hitem:138019|h[Keystone: Halls of Valor (12)]|h", "||Hkeystone:197:12:6:3:9||h[Escaped]||h"}) do
    assert(select(2,A.TranslateChatItemLinks(nil,nil,link))==nil,link)
  end
  local link="|Hkeystone:197:12:6:3:9|h[Keystone]|h"
  for _,name in ipairs({"Halls of Valor","中文|Hitem:1|h[Bad]|h","中文\\n换行"}) do
    mapNames[197]=name;assert(select(2,A.TranslateChatItemLinks(nil,nil,link))==nil)
  end
  C_ChallengeMode.GetMapInfo=function() error("Unavailable map") end
  assert(select(2,A.TranslateChatItemLinks(nil,nil,link))==nil)
  C_ChallengeMode=nil;assert(select(2,A.TranslateChatItemLinks(nil,nil,link))==nil)
`));

test('native chat shows a cached Chinese caption immediately and keeps the exact item and formatted chat metadata',()=>run(`
  local payload="item:19019::::::::110:250::5:2:123:456:::"
  itemNames[payload]="雷霆之怒，逐风者的祝福之剑"
  local link="|cffff8000|H"..payload.."|h[Furia del Trueno]|h|r"
  NativeChatMessage(ChatFrame1,"CHAT_MSG_CHANNEL","Vendo "..link.." por 500 oro.")
  local entry=ChatFrame1.historyBuffer:GetEntryAtIndex(1)
  assert(entry.message=="[12:34] [Global] [Sender]: Vendo |cffff8000|H"..payload.."|h["..itemNames[payload].."]|h|r por 500 oro.")
  assert(entry.timestamp==100 and entry.r==0.25 and entry.g==0.5 and entry.b==0.75)
  assert(entry.extraData.n==5 and entry.extraData[1]==7 and entry.extraData[4]==nil and entry.extraData[5]==11)
  assert(ChatFrame1.addCalls==1 and #queries==1 and queries[1]==payload)
  SlashCmdList.LEGIONCHINESE("off")
  assert(entry.message=="[12:34] [Global] [Sender]: Vendo "..link.." por 500 oro.")
  SlashCmdList.LEGIONCHINESE("on")
  assert(entry.message:find("[雷霆之怒，逐风者的祝福之剑]",1,true))
`,{native:true}));

test('cache arrival translates the existing Spanish message in every native window without resending or reordering',()=>run(`
  local payload="item:19019::::::::110:250::5:2:123:456:::"
  local link="|cffff8000|H"..payload.."|h[Furia del Trueno]|h|r"
  for _,frame in ipairs({ChatFrame1,ChatFrame2}) do
    NativeChatMessage(frame,"CHAT_MSG_CHANNEL","Vendo "..link.." por 500 oro.")
    frame:AddMessage("A later ordinary message",1,1,1)
  end
  local entry=ChatFrame1.historyBuffer:GetEntryAtIndex(2)
  local metadata=entry.extraData
  local original=entry.message
  assert(original:find("[Furia del Trueno]",1,true))
  itemNames[payload]="雷霆之怒，逐风者的祝福之剑";clock=200
  ItemDataReceived(19019,true);ItemDataReceived(19019,true)
  assert(#timers==1,"item notifications are batched")
  FlushChatTimers()
  for _,frame in ipairs({ChatFrame1,ChatFrame2}) do
    assert(frame.historyBuffer:GetEntryAtIndex(2).message:find("[雷霆之怒，逐风者的祝福之剑]",1,true))
    assert(frame:GetNumMessages()==2 and frame.addCalls==2)
    assert(frame.historyBuffer:GetEntryAtIndex(1).message=="A later ordinary message")
    assert(frame.scrollOffset==3 and frame.overrideFadeTimestamp==10)
  end
  assert(entry==ChatFrame1.historyBuffer:GetEntryAtIndex(2) and entry.extraData==metadata)
  assert(entry.timestamp==100 and entry.r==0.25 and entry.g==0.5 and entry.b==0.75)
  assert(select(6,ChatFrame1:GetMessageInfo(1))==8,"native history reads the same updated entry")
`,{native:true}));

test('opening the Chinese item tooltip refreshes an earlier foreign caption even without a success event',()=>run(`
  NativeChatMessage(ChatFrame1,"CHAT_MSG_CHANNEL","|Hitem:1|h[Nombre]|h")
  local entry=ChatFrame1.historyBuffer:GetEntryAtIndex(1)
  itemNames["item:1"]="中文物品"
  ItemRefTooltip.itemName="中文物品";ItemRefTooltip.itemLink="|Hitem:1|h[中文物品]|h"
  ItemRefTooltip:Fire("OnTooltipSetItem");FlushChatTimers()
  assert(entry.message:find("[中文物品]",1,true) and ChatFrame1.addCalls==1)
`,{native:true}));

test('existing chat history is translated at login and when enabling, including messages received while disabled',()=>run(`
  frames[1]:Fire("OnEvent","PLAYER_LOGIN")
  assert(ChatFrame1.historyBuffer:GetEntryAtIndex(1).message=="Old |Hitem:1|h[已有资料]|h")
  SlashCmdList.LEGIONCHINESE("off")
  ChatFrame1:AddMessage("|Hitem:1|h[Nombre]|h")
  assert(ChatFrame1.historyBuffer:GetEntryAtIndex(1).message=="|Hitem:1|h[Nombre]|h")
  SlashCmdList.LEGIONCHINESE("on")
  assert(ChatFrame1.historyBuffer:GetEntryAtIndex(1).message=="|Hitem:1|h[已有资料]|h")
  assert(ChatFrame1.historyBuffer:GetEntryAtIndex(2).message=="Old |Hitem:1|h[已有资料]|h")
`,{native:true,beforeUI:'itemNames["item:1"]="已有资料";ChatFrame1:AddMessage("Old |Hitem:1|h[Nombre]|h");LegionChineseSettings={welcomeSeen=true}'}));

test('asynchronous variant lookup never substitutes a base item or changes other link types and Chinese captions',()=>run(`
  local first,second="item:1:0:0:0:0:0:100","item:1:0:0:0:0:0:200"
  local original="|H"..first.."|h[First]|h / |H"..second.."|h[Second]|h / |Hitem:2|h[原有中文]|h / |Hspell:1|h[Spell]|h"
  ChatFrame1:AddMessage(original)
  itemNames[first]="第一种后缀";itemNames["item:1"]="错误的基础物品"
  ItemDataReceived(1,true);FlushChatTimers()
  local entry=ChatFrame1.historyBuffer:GetEntryAtIndex(1)
  assert(entry.message==original:gsub("%[First%]","[第一种后缀]"))
  itemNames[second]="第二種後綴"
  ItemDataReceived(1,true);FlushChatTimers()
  assert(entry.message==original:gsub("%[First%]","[第一种后缀]"):gsub("%[Second%]","[第二種後綴]"))
  for _,query in ipairs(queries) do assert(query==first or query==second) end
`,{native:true}));

test('loot, addon-added lines, backfilled history and newly opened whisper windows use native message hooks',()=>run(`
  itemNames["item:1"]="中文名字"
  ChatFrame1:AddMessage("Loot |Hitem:1|h[Name]|h")
  ChatFrame1:BackFillMessage("Older |Hitem:1|h[Name]|h")
  assert(ChatFrame1.historyBuffer:GetEntryAtIndex(1).message=="Loot |Hitem:1|h[中文名字]|h")
  assert(ChatFrame1.historyBuffer:GetEntryAtIndex(2).message=="Older |Hitem:1|h[中文名字]|h")
  local temporary=FCF_OpenTemporaryWindow()
  assert(temporary.historyBuffer:GetEntryAtIndex(1).message=="Restored |Hitem:1|h[中文名字]|h")
  temporary:AddMessage("Whisper |Hitem:1|h[Name]|h")
  assert(temporary.historyBuffer:GetEntryAtIndex(1).message=="Whisper |Hitem:1|h[中文名字]|h")
  A.InstallChatItemLinks();A.InstallChatItemLinks()
  local count=#queries
  temporary:AddMessage("|Hitem:1|h[Name]|h")
  assert(#queries==count+1,"do not stack duplicate hooks")
`,{native:true}));

test('a resolved name remains Chinese while another link loads, even if its client cache is later evicted',()=>run(`
  itemNames["item:1"]="第一件物品"
  local original="|Hitem:1|h[First]|h |Hitem:2|h[Second]|h"
  ChatFrame1:AddMessage(original)
  itemNames["item:1"]=nil;itemNames["item:2"]="第二件物品"
  ItemDataReceived(2,true);FlushChatTimers()
  assert(ChatFrame1.historyBuffer:GetEntryAtIndex(1).message=="|Hitem:1|h[第一件物品]|h |Hitem:2|h[第二件物品]|h")
  SlashCmdList.LEGIONCHINESE("off")
  assert(ChatFrame1.historyBuffer:GetEntryAtIndex(1).message==original)
`,{native:true}));

test('failed or unrelated item events do not rewrite history and disabling cancels queued translations',()=>run(`
  local original="|Hitem:1|h[Nombre]|h"
  ChatFrame1:AddMessage(original)
  ItemDataReceived(1,false);ItemDataReceived(2,true)
  assert(#timers==0)
  ItemDataReceived(1,true)
  itemNames["item:1"]="中文物品"
  SlashCmdList.LEGIONCHINESE("off");FlushChatTimers()
  assert(ChatFrame1.historyBuffer:GetEntryAtIndex(1).message==original)
  SlashCmdList.LEGIONCHINESE("on")
  assert(ChatFrame1.historyBuffer:GetEntryAtIndex(1).message=="|Hitem:1|h[中文物品]|h")
`,{native:true}));

test('refresh respects later edits, trimmed history, forbidden frames and unsafe translated names',()=>run(`
  local message="|Hitem:1|h[Nombre]|h"
  itemNames["item:1"]="中文物品";ChatFrame1:AddMessage(message)
  local entry=ChatFrame1.historyBuffer:GetEntryAtIndex(1)
  entry.message="Updated by another addon"
  SlashCmdList.LEGIONCHINESE("off")
  assert(entry.message=="Updated by another addon")
  SlashCmdList.LEGIONCHINESE("on")
  itemNames["item:1"]=nil;ChatFrame1:AddMessage(message)
  table.remove(ChatFrame1.historyBuffer.entries,1)
  itemNames["item:1"]="新的中文";ItemDataReceived(1,true);FlushChatTimers()
  assert(ChatFrame1:GetNumMessages()==1 and ChatFrame1.historyBuffer:GetEntryAtIndex(1)==entry)
  ChatFrame2.forbidden=true;ChatFrame2:AddMessage(message)
  A.RefreshChatItemLinks()
  assert(ChatFrame2.historyBuffer:GetEntryAtIndex(1).message==message)
  for _,name in ipairs({"中文|Hitem:2|h[欺骗]|h","中文\\n换行","中文\\r换行"}) do
    itemNames["item:1"]=name;ChatFrame1:AddMessage(message)
    assert(ChatFrame1.historyBuffer:GetEntryAtIndex(1).message==message)
  end
`,{native:true}));

test('chat filters install once, preserve settings and affect only messages received while enabled',()=>run(`
  for i=1,3 do frames[1]:Fire("OnEvent","ADDON_LOADED","OtherAddon") end
  local count=0
  for event,list in pairs(filters) do assert(#list==1);count=count+1 end
  assert(count==16 and filters.CHAT_MSG_WHISPER and filters.CHAT_MSG_BN_WHISPER and filters.CHAT_MSG_INSTANCE_CHAT)
  itemNames["item:1"]="中文"
  SlashCmdList.LEGIONCHINESE("off")
  assert(select(2,A.TranslateChatItemLinks(nil,nil,"|Hitem:1|h[Nombre]|h"))==nil)
  SlashCmdList.LEGIONCHINESE("on")
  assert(select(2,A.TranslateChatItemLinks(nil,nil,"|Hitem:1|h[Nombre]|h"))=="|Hitem:1|h[中文]|h")
  assert(A.TranslateChatItemLinks(nil,nil,nil)==false)
`));
