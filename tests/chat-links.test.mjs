import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
function questRows(ids){
  const wanted=new Set(ids),rows=[];
  for(const file of fs.readdirSync(new URL('Data/',addon)).filter(f=>f.startsWith('Quests_'))){
    for(const line of fs.readFileSync(new URL('Data/'+file,addon),'utf8').split('\n')){
      const id=Number(line.match(/^D\.Quests\[(\d+)\]/)?.[1]);
      if(wanted.delete(id))rows.push(line);
    }
  }
  assert.equal(wanted.size,0,'screenshot quests must be shipped');
  return 'local D=LegionChineseDB\n'+rows.join('\n');
}
const dungeonData=()=>fs.readFileSync(new URL('Data/DungeonNames.lua',addon),'utf8');
function run(code,{native=false,beforeUI=''}={}){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=text=>{const status=lauxlib.luaL_dostring(L,to_luastring(text));assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));};
  try{
    for(const file of ['Bootstrap.lua','Core.lua','ClientNames.lua','ChatLinks.lua'])execute(fs.readFileSync(new URL(file,addon),'utf8'));
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

test('a cache event retries only matching pending links and shares exact variants across windows',()=>run(`
  local first,second="item:1:0:100","item:2:0:200"
  for _,frame in ipairs({ChatFrame1,ChatFrame2}) do
    frame.historyBuffer.max=1000
    for i=1,800 do frame:AddMessage("Ordinary player message "..i) end
    for i=3,200 do frame:AddMessage("|Hitem:"..i.."|h[Waiting]|h") end
    frame:AddMessage("|H"..first.."|h[First]|h / |H"..second.."|h[Second]|h")
  end
  queries={};itemNames[first]="第一件物品";itemNames[second]="第二件物品"
  ItemDataReceived(1,true);ItemDataReceived(2,true);ItemDataReceived(1,true)
  assert(#timers==1);FlushChatTimers()
  assert(#queries==2,"only the two affected variants, once across both windows")
  assert((queries[1]==first and queries[2]==second) or (queries[2]==first and queries[1]==second))
  for _,frame in ipairs({ChatFrame1,ChatFrame2}) do
    assert(frame:GetNumMessages()==999)
    assert(frame.historyBuffer:GetEntryAtIndex(1).message=="|H"..first.."|h[第一件物品]|h / |H"..second.."|h[第二件物品]|h")
    assert(frame.historyBuffer:GetEntryAtIndex(2).message=="|Hitem:200|h[Waiting]|h")
  end
`,{native:true}));

test('shared foreign-name results retain pending retries for every copy and stop revisiting trimmed lines',()=>run(`
  local message="|Hitem:1|h[Foreign caption]|h"
  for _,frame in ipairs({ChatFrame1,ChatFrame2}) do
    frame:AddMessage(message);frame:AddMessage(message)
  end
  itemNames["item:1"]="Still a foreign name"
  queries={};ItemDataReceived(1,true);FlushChatTimers();assert(#queries==1)
  local removed=table.remove(ChatFrame1.historyBuffer.entries,1)
  itemNames["item:1"]="中文物品";queries={};ItemDataReceived(1,true);FlushChatTimers()
  assert(#queries==1 and removed.message==message)
  for _,frame in ipairs({ChatFrame1,ChatFrame2}) do
    for _,entry in frame.historyBuffer:EnumerateIndexedEntries() do
      assert(entry.message=="|Hitem:1|h[中文物品]|h")
    end
  end
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
  assert(count==18 and filters.CHAT_MSG_WHISPER and filters.CHAT_MSG_BN_WHISPER and filters.CHAT_MSG_INSTANCE_CHAT)
  itemNames["item:1"]="中文"
  SlashCmdList.LEGIONCHINESE("off")
  assert(select(2,A.TranslateChatItemLinks(nil,nil,"|Hitem:1|h[Nombre]|h"))==nil)
  SlashCmdList.LEGIONCHINESE("on")
  assert(select(2,A.TranslateChatItemLinks(nil,nil,"|Hitem:1|h[Nombre]|h"))=="|Hitem:1|h[中文]|h")
  assert(A.TranslateChatItemLinks(nil,nil,nil)==false)
`));


test('screenshot quest captions use shipped titles and preserve link IDs, level and surrounding player text',()=>run(`
  local message="is this bugged? |cffffff00|Hquest:11249:70|h[Stop the Ascension!]|h|r |Hquest:44287:110|h[DEADLY: Withered J'im]|h"
  ChatFrame1:AddMessage(message)
  local entry=ChatFrame1.historyBuffer:GetEntryAtIndex(1)
  assert(entry.message=="is this bugged? |cffffff00|Hquest:11249:70|h[阻止升华！]|h|r |Hquest:44287:110|h[致命：凋零者吉姆]|h")
  assert(#queries==0 and mapRequests==0)
  SlashCmdList.LEGIONCHINESE("off");assert(entry.message==message)
  SlashCmdList.LEGIONCHINESE("on");assert(entry.message:find("[阻止升华！]",1,true))
`,{native:true,beforeUI:questRows([11249,44287])}));

test('typed links query their own IDs for spells, recipes, achievements, currencies, talents and battle pets',()=>run(`
  function GetSpellInfo(id) assert(id==133);return "火球术" end
  function GetAchievementInfo(id) assert(id==6);return id,"10级" end
  function GetCurrencyInfo(id) assert(id==1220);return "职业大厅资源" end
  function GetTalentInfoByID(id) assert(id==200);return id,"中文天赋" end
  C_PetJournal={GetPetInfoBySpeciesID=function(id) assert(id==39);return "机械松鼠" end}
  C_PetBattles={GetAbilityInfoByID=function(id) assert(id==110);return id,"撕咬" end}
  local links={{"spell:133","火球术"},{"enchant:133:1","火球术"},{"achievement:6:Player-1:1:2:3:4:0:0:0:0","10级"},
    {"currency:1220","职业大厅资源"},{"talent:200:1","中文天赋"},{"battlepet:39:25:3:1500:300:280:BattlePet-0","机械松鼠"},
    {"battlePetAbil:110:1500:300:280","撕咬"}}
  for _,pair in ipairs(links) do
    local link="|H"..pair[1].."|h[Foreign]|h"
    assert(select(2,A.TranslateChatItemLinks(nil,nil,link))=="|H"..pair[1].."|h["..pair[2].."]|h")
  end
  assert(#queries==0)
  GetSpellInfo=function() return "Fireball" end
  LegionChineseDB.NameStrings[1]="离线法术名";LegionChineseDB.Spells[133]=1
  assert(select(2,A.TranslateChatItemLinks(nil,nil,"|Hspell:133|h[Fireball]|h"))=="|Hspell:133|h[离线法术名]|h")
`));

test('Chinese captions, plain brackets, unknown types and unavailable client APIs retain the original message',()=>run(`
  function GetAchievementInfo() error("invalid ID") end
  function GetQuestLink(id) return "|Hquest:123:110|h[另一个任务]|h" end
  for _,link in ipairs({"[Stop the Ascension!]", "|Hplayer:Name|h[Name]|h", "|Hunknown:1|h[Foreign]|h", "|Hquest:999|h[Unknown]|h",
    "|Hachievement:6|h[Foreign]|h", "|Htalent:200|h[Foreign]|h", "|Hcurrency:1220|h[Foreign]|h", "|Hbattlepet:1|h[Foreign]|h",
    "|Hquest:123bad|h[Foreign]|h", "||Hquest:123||h[Escaped]||h", "|Hquest:123|h[已有中文]|h"}) do
    assert(select(2,A.TranslateChatItemLinks(nil,nil,link))==nil,link)
  end
  assert(#queries==0 and mapRequests==0)
  assert(select(2,A.TranslateChatItemLinks(nil,nil,"|Hquest:123:110|h[Foreign]|h"))=="|Hquest:123:110|h[另一个任务]|h")
`));

test('known monster emotes use Chinese templates and NPC names without translating player messages or losing arguments',()=>run(`
  local D=LegionChineseDB
  D.Strings[1]="%s充满恐惧地想要转身逃跑！";D.Strings[2]="钢鬃掠夺者"
  D.Gossip[A.Fingerprint(A.Normalize("%s attempts to run away in fear!"))]=1
  D.NPCNames[A.Fingerprint(A.Normalize("Razormane Plunderer"))]=2
  local function pack(...) return {n=select("#",...),...} end
  for _,message in ipairs({"%s attempts to run away in fear!", "Razormane Plunderer attempts to run away in fear!"}) do
    local result=pack(A.TranslateMonsterMessage({},"CHAT_MSG_MONSTER_EMOTE",message,"Razormane Plunderer",nil,7,nil,"tail"))
    assert(result.n==7 and result[1]==false and result[3]=="钢鬃掠夺者" and result[4]==nil and result[5]==7 and result[7]=="tail")
    assert(string.format(result[2],result[3],result[3])=="钢鬃掠夺者充满恐惧地想要转身逃跑！")
  end
  assert(select(2,A.TranslateMonsterMessage(nil,"CHAT_MSG_SAY","%s attempts to run away in fear!","Player"))==nil)
  assert(select(2,A.TranslateMonsterMessage(nil,"CHAT_MSG_MONSTER_EMOTE","Unknown message","NPC"))==nil)
  for _,text in ipairs({"中文%d", "%s%s%s中文", "%q中文"}) do
    D.Strings[1]=text;assert(select(2,A.TranslateMonsterMessage(nil,"CHAT_MSG_MONSTER_EMOTE","%s attempts to run away in fear!","NPC"))==nil)
  end
  D.Strings[1]="%s充满恐惧地想要转身逃跑！"
  SlashCmdList.LEGIONCHINESE("off")
  assert(select(2,A.TranslateMonsterMessage(nil,"CHAT_MSG_MONSTER_EMOTE","%s attempts to run away in fear!","NPC"))==nil)
`));


test('opening a non-item link retries its previously unavailable client name in existing chat history',()=>run(`
  local payload="quest:999001:110"
  local message="|H"..payload.."|h[Uncached]|h"
  ChatFrame1:AddMessage(message)
  local entry=ChatFrame1.historyBuffer:GetEntryAtIndex(1)
  assert(entry.message==message)
  function GetQuestLink() return "|H"..payload.."|h[客户端中文任务]|h" end
  ItemRefTooltip:SetHyperlink(payload);FlushChatTimers()
  assert(entry.message=="|H"..payload.."|h[客户端中文任务]|h" and ChatFrame1.addCalls==1)
  SlashCmdList.LEGIONCHINESE("off");assert(entry.message==message)
`,{native:true}));

test('journal and lockout dungeon captions use shipped Chinese while preserving GUID, difficulty, progress and colors',()=>run(`
  function EJ_SelectInstance() error("Must not change the user's journal selection") end
  function EncounterJournal_LoadUI() error("Must not open the journal for a chat message") end
  local journal="journal:0:721:23"
  local lockout="instancelock:Player-3296-000957C8:1530:16:127"
  local message="LFM |cff66bbff|H"..journal.."|h[Halls of Valor]|h|r / |cffff8000|H"..lockout.."|h[Palacio de la Noche]|h|r"
  NativeChatMessage(ChatFrame1,"CHAT_MSG_CHANNEL",message)
  local entry=ChatFrame1.historyBuffer:GetEntryAtIndex(1)
  local translated="[12:34] [Global] [Sender]: LFM |cff66bbff|H"..journal.."|h[英灵殿]|h|r / |cffff8000|H"..lockout.."|h[暗夜要塞]|h|r"
  assert(entry.message==translated)
  assert(entry.timestamp==100 and entry.r==0.25 and entry.extraData.n==5 and ChatFrame1.scrollOffset==3)
  assert(#queries==0 and mapRequests==0)
  SlashCmdList.LEGIONCHINESE("off");assert(entry.message=="[12:34] [Global] [Sender]: "..message)
  SlashCmdList.LEGIONCHINESE("on");assert(entry.message==translated and ChatFrame1.addCalls==1)
`,{native:true,beforeUI:dungeonData()}));

test('journal instances, encounters and sections use distinct client APIs and the second numeric field',()=>run(`
  local calls=0
  function EJ_GetInstanceInfo(id) calls=calls+1;assert(id==999001);return "副本繁體名稱" end
  function EJ_GetEncounterInfo(id) calls=calls+1;assert(id==721);return "首领名称" end
  C_EncounterJournal={GetSectionInfo=function(id) calls=calls+1;assert(id==721);return {title="首领技能"} end}
  for _,pair in ipairs({{"journal:0:999001:0","副本繁體名稱"},{"journal:1:721:16","首领名称"},{"journal:2:721:16","首领技能"}}) do
    assert(select(2,A.TranslateChatItemLinks(nil,nil,"|H"..pair[1].."|h[Foreign]|h"))=="|H"..pair[1].."|h["..pair[2].."]|h")
  end
  assert(calls==3)
  -- Even when the record numbers coincide, a boss/section must not get a dungeon's name.
  EJ_GetEncounterInfo=nil;C_EncounterJournal=nil
  assert(select(2,A.TranslateChatItemLinks(nil,nil,"|Hjournal:1:721:16|h[Unknown boss]|h"))==nil)
  assert(select(2,A.TranslateChatItemLinks(nil,nil,"|Hjournal:2:721:16|h[Unknown section]|h"))==nil)
  -- Map 721 is a different record from journal instance 721.
  assert(select(2,A.TranslateChatItemLinks(nil,nil,"|Hinstancelock:Player-1-0000ABCD:721:16:127|h[Foreign]|h"))==
    "|Hinstancelock:Player-1-0000ABCD:721:16:127|h[火焰之地，地形2]|h")
  -- This Map record has no Simplified name in the 7.3.5 client export.
  assert(select(2,A.TranslateChatItemLinks(nil,nil,"|Hinstancelock:Player-1-0000ABCD:1032:1:0|h[Foreign]|h"))==
    "|Hinstancelock:Player-1-0000ABCD:1032:1:0|h[寵物對戰 - 翠玉林]|h")
`,{beforeUI:dungeonData()}));

test('invalid dungeon payloads, unsupported journal kinds, ordinary text and already Chinese captions remain unchanged',()=>run(`
  for _,payload in ipairs({"journal:0:721", "journal:0:721:23oops", "journal:0:721:23:1", "journal:0:0:23",
    "journal:3:721:23", "journal:0:1477:23", "journal:0:999001:23", "instancelock:Player-1-0000ABCD:999001:16:127",
    "instancelock:Player-1-0000ABCD:1530:16:127:1", "instancelock:Player-1-0000ABCD:1530:16:127oops",
    "instancelock:Name:1530:16:127", "instancelock:Player-1-0000ABCD:1530:16", "instancelock:Player-1-0000ABCD:0:16:127"}) do
    assert(select(2,A.TranslateChatItemLinks(nil,nil,"|H"..payload.."|h[Unknown]|h"))==nil,payload)
  end
  for _,message in ipairs({"Halls of Valor HOV [Halls of Valor]", "|Hjournal:0:721:23|h[英靈殿]|h",
    "||Hjournal:0:721:23||h[Halls of Valor]||h", "|Hplayer:Halls|h[Halls of Valor]|h"}) do
    assert(select(2,A.TranslateChatItemLinks(nil,nil,message))==nil,message)
  end
  local message="|Hjournal:0:999001:0|h[Unknown]|h"
  for _,name in ipairs({"Unknown", "中文|Hitem:1", "中文\\n换行"}) do
    function EJ_GetInstanceInfo() return name end
    assert(select(2,A.TranslateChatItemLinks(nil,nil,message))==nil)
  end
  EJ_GetInstanceInfo=function() error("Unavailable") end
  assert(select(2,A.TranslateChatItemLinks(nil,nil,message))==nil)
`,{beforeUI:dungeonData()}));

test('loading or clicking the journal retries pending dungeon names without replaying chat or hooking twice',()=>run(`
  local payload="journal:0:999001:23"
  local message="|H"..payload.."|h[Uncached]|h"
  ChatFrame1:AddMessage(message);ChatFrame2:AddMessage(message)
  local first=ChatFrame1.historyBuffer:GetEntryAtIndex(1)
  local calls=0
  function EJ_GetInstanceInfo(id) calls=calls+1;assert(id==999001);return "后加载的副本" end
  for _,frame in ipairs(frames) do frame:Fire("OnEvent","ADDON_LOADED","UnrelatedAddon") end
  assert(first.message==message and #timers==0)
  for _,frame in ipairs(frames) do frame:Fire("OnEvent","ADDON_LOADED","Blizzard_EncounterJournal") end
  assert(#timers==1);FlushChatTimers()
  assert(first.message=="|H"..payload.."|h[后加载的副本]|h")
  assert(ChatFrame2.historyBuffer:GetEntryAtIndex(1).message==first.message)
  EJ_GetInstanceInfo=nil;ChatFrame1:AddMessage(message)
  function EJ_GetInstanceInfo() calls=calls+1;return "点击后可用的副本" end
  A.InstallChatItemLinks();A.InstallChatItemLinks()
  SetItemRef(payload);assert(refClicks==1 and #timers==1);FlushChatTimers()
  assert(ChatFrame1.historyBuffer:GetEntryAtIndex(1).message=="|H"..payload.."|h[点击后可用的副本]|h")
  assert(ChatFrame1.addCalls==2 and ChatFrame2.addCalls==1 and ChatFrame1.scrollOffset==3)
  SlashCmdList.LEGIONCHINESE("off");assert(first.message==message)
`,{native:true,beforeUI:'refClicks=0; function SetItemRef() refClicks=refClicks+1 end'}));
