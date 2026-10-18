// Deterministic work counters in the existing Legion UI fixtures, not game FPS.
// An optional directory supplies older runtime Lua files for before/after checks.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';

const root=fileURLToPath(new URL('..',import.meta.url));
const addon=path.join(root,'AddOns/LegionChinese');
const baseline=process.argv[2]&&path.resolve(process.argv[2]);
if(baseline){
  for(const file of ['Core.lua','ChatLinks.lua','ItemTooltips.lua']){
    if(!fs.existsSync(path.join(baseline,file)))throw Error('Missing baseline runtime: '+file);
  }
}
function measure(files,fixtures,code){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=text=>{
    if(lauxlib.luaL_dostring(L,to_luastring(text))!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    for(const file of files){
      const old=baseline&&path.join(baseline,file);
      execute(fs.readFileSync(old&&fs.existsSync(old)?old:path.join(addon,file),'utf8'));
    }
    for(const file of fixtures)execute(fs.readFileSync(path.join(root,'tests',file),'utf8'));
    execute(code);
    lua.lua_getglobal(L,to_luastring('result'));
    return lua.lua_tonumber(L,-1);
  }finally{lua.lua_close(L);}
}

const fingerprintBytes=measure(['Bootstrap.lua','Core.lua'],[],`
  local source=string.rep("repeatable tooltip text ",8)
  local byte=string.byte;local count=0
  string.byte=function(text,...) count=count+1;return byte(text,...) end
  local first=LegionChinese.Fingerprint(source)
  for i=2,2000 do assert(LegionChinese.Fingerprint(source)==first) end
  string.byte=byte;result=count
`);
const itemQueries=measure(['Bootstrap.lua','Core.lua','ClientNames.lua','ChatLinks.lua'],
  ['ui-fixture.lua','chat-frame-fixture.lua'],`
  local names,queries={},0
  function GetItemInfo(link) queries=queries+1;return names[link] end
  LegionChinese.InstallChatItemLinks()
  ChatFrame1.historyBuffer.max=1000
  for i=1,800 do ChatFrame1:AddMessage("Ordinary player message "..i) end
  for i=1,200 do ChatFrame1:AddMessage("|Hitem:"..i.."|h[Uncached item]|h") end
  queries=0;names["item:1"]="中文物品"
  ItemDataReceived(1,true);FlushChatTimers()
  assert(ChatFrame1:GetNumMessages()==1000)
  assert(ChatFrame1.historyBuffer:GetEntryAtIndex(200).message=="|Hitem:1|h[中文物品]|h")
  result=queries
`);
const tooltipReads=measure(['Bootstrap.lua','Core.lua','ClientNames.lua','ItemTooltips.lua'],
  ['ui-fixture.lua','world-tooltip-fixture.lua','item-tooltip-fixture.lua'],`
  local A,D=LegionChinese,LegionChineseDB
  D.ItemDescriptions[138019]={[A.NameFingerprint(description)]=translatedDescription}
  A.InstallItemTooltips();ItemRefTooltip:SetHyperlink("item:138019")
  ItemRefTooltip.lineCount=30
  for i=7,30 do _G["ItemRefTooltipTextLeft"..i]=Widget("Additional item information "..i) end
  A.UpdateItemTooltip(ItemRefTooltip)
  local reads=0
  for i=2,30 do
    local widget=_G["ItemRefTooltipTextLeft"..i];local get=widget.GetText
    widget.GetText=function(self) reads=reads+1;return get(self) end
  end
  for i=1,120 do ItemRefTooltip:Fire("OnUpdate",1/120) end
  assert(ItemRefTooltipTextLeft6.text=='"'..translatedDescription..'"')
  assert(ItemRefTooltip.nativeUpdates==120)
  result=reads
`);

console.log(JSON.stringify({
  scope:'Simulated work counts; not in-game CPU time, memory usage or FPS',
  repeatedFingerprint:{calls:2000,bytesProcessed:fingerprintBytes},
  chatCacheArrival:{historyLines:1000,unresolvedLinks:200,itemQueries},
  stationaryTooltip:{lines:30,frames:120,simulatedSeconds:1,textReads:tooltipReads}
},null,2));
