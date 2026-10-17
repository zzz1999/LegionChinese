import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
function run(code){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=text=>{const status=lauxlib.luaL_dostring(L,to_luastring(text));assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));};
  try{
    for(const file of ['Bootstrap.lua','Core.lua','ChatLinks.lua'])execute(fs.readFileSync(new URL(file,addon),'utf8'));
    execute(fs.readFileSync(new URL('ui-fixture.lua',import.meta.url),'utf8'));
    execute(`filters={};itemNames={};queries={}
      function ChatFrame_AddMessageEventFilter(event,filter)
        filters[event]=filters[event] or {};table.insert(filters[event],filter)
      end
      function GetItemInfo(link) queries[#queries+1]=link;return itemNames[link] end
      function SendChatMessage() error("Must not send or change chat messages") end`);
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

test('uncached or non-Chinese names stay intact without delaying chat; subsequent messages can use newly cached Chinese',()=>run(`
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
