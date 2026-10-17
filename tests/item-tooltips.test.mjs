import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {selectItemDescriptions} from '../scripts/item-descriptions.mjs';
import {nameKey} from '../scripts/client-names.mjs';
const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
const source=JSON.parse(fs.readFileSync(new URL('../data/item-descriptions.json',import.meta.url)));

test('reviewed item descriptions prefer Simplified, fall back to Traditional, and exclude later or conflicting text',()=>{
  const choose=translations=>selectItemDescriptions({schema:1,records:[{...source.records[0],translations}]});
  const tw=source.records[0].translations[0];
  const cn={...tw,locale:'zhCN',text:'简体说明'};
  assert.equal(choose([tw,cn])[0].locale,'zhCN');
  for(const invalid of [{...cn,text:'English'},{...cn,text:'$s1 中文'}, {...cn,verifiedBuild:30000}])
    assert.equal(choose([invalid,tw])[0].locale,'zhTW');
  assert.equal(choose([cn,{...cn,text:'冲突'},tw])[0].locale,'zhTW');
  assert.deepEqual(choose([]),[]);
  for(const changes of [{itemID:0},{original:'已有中文'},{originalSource:{verifiedBuild:30000}}])
    assert.throws(()=>selectItemDescriptions({schema:1,records:[{...source.records[0],...changes}]}));
});

test('shipped keystone description matches its hashed source and keeps unverified build provenance explicit',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../sources.json',import.meta.url)));
  const body=fs.readFileSync(new URL('../'+manifest.itemDescriptions.file,import.meta.url));
  assert.equal(crypto.createHash('sha256').update(body).digest('hex'),manifest.itemDescriptions.sha256);
  const audit=JSON.parse(fs.readFileSync(new URL('../docs/item-description-audit.json',import.meta.url)));
  assert.deepEqual(audit.records,selectItemDescriptions(source));
  assert.equal(audit.records[0].itemID,138019);
  assert.equal(audit.records[0].locale,'zhTW');assert.equal(audit.records[0].source.verifiedBuild,null);
  assert.equal(audit.records[0].key,nameKey(source.records[0].original));
  const data=fs.readFileSync(new URL('Data/ItemDescriptions_01.lua',addon),'utf8');
  assert.ok(data.includes(audit.records[0].text));assert.ok(!data.includes(source.records[0].original));
});

function run(code){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=text=>{const status=lauxlib.luaL_dostring(L,to_luastring(text));assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));};
  try{
    for(const file of ['Bootstrap.lua','Data/ItemDescriptions_01.lua','Data/WorldObjects_01.lua','Core.lua','ClientNames.lua','WorldObjects.lua','ItemTooltips.lua'])execute(fs.readFileSync(new URL(file,addon),'utf8'));
    for(const file of ['ui-fixture.lua','world-tooltip-fixture.lua','item-tooltip-fixture.lua'])execute(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
    execute(fs.readFileSync(new URL('UI.lua',addon),'utf8'));
    execute('local A,D=LegionChinese,LegionChineseDB\n'+code);
  }finally{lua.lua_close(L);}
}

test('bag and chat item tooltips translate only the known description, retaining quotes, color, native callbacks and fonts',()=>run(`
  GameTooltip:SetBagItem(0,1)
  assert(GameTooltipTextLeft6.text=='"'..translatedDescription..'"')
  assert(GameTooltipTextLeft1.text=="钥石：英灵殿" and GameTooltipTextLeft2.text=="史诗等级 12")
  assert(GameTooltipTextLeft4.text=="激励" and GameTooltipTextLeft5.text=="持续时间：4天")
  assert(GameTooltipTextLeft6.fontChanges==0 and GameTooltip.nativeItems==1)
  ItemRefTooltip.pendingText='|cffffff00"'..description..'"|r'
  local first,second,third=ItemRefTooltip:SetHyperlink("|cffa335ee|Hkeystone:138019:1477:12:1:2:3|h[Keystone]|h|r")
  assert(first=="native result" and second==nil and third==3)
  assert(ItemRefTooltipTextLeft6.text=='|cffffff00"'..translatedDescription..'"|r')
  local writes=ItemRefTooltipTextLeft6.writes
  for i=1,20 do ItemRefTooltip:Fire("OnUpdate",0.016) end
  assert(ItemRefTooltipTextLeft6.writes==writes and ItemRefTooltip.nativeUpdates==20)
  SlashCmdList.LEGIONCHINESE("off")
  assert(GameTooltipTextLeft6.text=='"'..description..'"')
  assert(ItemRefTooltipTextLeft6.text==ItemRefTooltip.pendingText)
  SlashCmdList.LEGIONCHINESE("on")
  assert(GameTooltipTextLeft6.text=='"'..translatedDescription..'"')
`));

test('keystone links and bags work when GetItem is unavailable, including enabling while already open',()=>run(`
  SlashCmdList.LEGIONCHINESE("off")
  ItemRefTooltip.noItemAPI=true;ItemRefTooltip:SetHyperlink("keystone:138019:197:12:1:2:3")
  assert(ItemRefTooltipTextLeft6.text=='"'..description..'"')
  SlashCmdList.LEGIONCHINESE("on")
  assert(ItemRefTooltipTextLeft6.text=='"'..translatedDescription..'"')
  GameTooltip.noItemAPI=true;GameTooltip:SetBagItem(0,1)
  assert(GameTooltipTextLeft6.text=='"'..translatedDescription..'"')
  SlashCmdList.LEGIONCHINESE("off")
  assert(ItemRefTooltipTextLeft6.text=='"'..description..'"' and GameTooltipTextLeft6.text=='"'..description..'"')
  ItemRefTooltip:Fire("OnTooltipCleared");ItemRefTooltip.itemLink=nil
  SlashCmdList.LEGIONCHINESE("on");assert(ItemRefTooltipTextLeft6.text=='"'..description..'"')
`));

test('unknown, existing Chinese, changed descriptions, other link types and forbidden frames stay untouched',()=>run(`
  for _,text in ipairs({"已有简体说明","原有繁體說明",description.." Changed","|Hitem:1|h"..description.."|h"}) do
    ItemRefTooltip.pendingText=text;ItemRefTooltip:SetHyperlink("item:138019")
    assert(ItemRefTooltipTextLeft6.text==text)
  end
  ItemRefTooltip.pendingText=description
  for _,link in ipairs({"item:1","spell:138019","quest:138019","item:138019wrong","keystone:158923:197:12"}) do
    ItemRefTooltip:SetHyperlink(link);assert(ItemRefTooltipTextLeft6.text==description)
  end
  ItemRefTooltip.forbidden=true;ItemRefTooltip:SetHyperlink("item:138019")
  assert(ItemRefTooltipTextLeft6.text==description)
  ItemRefTooltip.forbidden=nil;ItemRefTooltip:Hide();A.UpdateItemTooltip(ItemRefTooltip)
  assert(ItemRefTooltipTextLeft6.text==description)
`));

test('reused tips do not retain a former item identity or overwrite another addon or preexisting Chinese',()=>run(`
  ItemRefTooltip:SetHyperlink("item:138019")
  ItemRefTooltip.pendingText='"'..translatedDescription..'"';ItemRefTooltip:SetHyperlink("item:138019")
  SlashCmdList.LEGIONCHINESE("off");assert(ItemRefTooltipTextLeft6.text==ItemRefTooltip.pendingText)
  SlashCmdList.LEGIONCHINESE("on");ItemRefTooltip.pendingText=nil;ItemRefTooltip:SetHyperlink("item:138019")
  ItemRefTooltipTextLeft6:SetText("另一个插件的文字")
  SlashCmdList.LEGIONCHINESE("off");assert(ItemRefTooltipTextLeft6.text=="另一个插件的文字")
  SlashCmdList.LEGIONCHINESE("on");ItemRefTooltip:SetHyperlink("item:138019")
  ItemRefTooltip.noItemAPI=true;ItemRefTooltip.pendingText=description
  ItemRefTooltip:SetHyperlink("spell:138019");ItemRefTooltip:Fire("OnUpdate",0.016)
  assert(ItemRefTooltipTextLeft6.text==description)
  ItemRefTooltip:SetHyperlink("keystone:138019:197:12")
  ItemRefTooltip:Fire("OnTooltipSetUnit");ItemRefTooltipTextLeft6:SetText(description)
  ItemRefTooltip:Fire("OnUpdate",0.016);assert(ItemRefTooltipTextLeft6.text==description)
  GameTooltip:SetBagItem(0,1)
  GameTooltip:Fire("OnTooltipCleared");GameTooltip.item=nil;GameTooltip.itemLink=nil
  GameTooltip.lineCount=1;GameTooltipTextLeft1:SetText("Portal to Ashran")
  GameTooltip:Fire("OnUpdate",0.016);assert(GameTooltipTextLeft1.text=="到阿什兰的传送门")
`));

test('late tooltip creation installs each hook once and uses the WoW Chinese font on other client locales',()=>run(`
  function GetLocale() return "enUS" end
  for i=1,3 do frames[1]:Fire("OnEvent","ADDON_LOADED","OtherAddon") end
  assert(#ItemRefTooltip.scriptHooks.OnShow==1 and #ItemRefTooltip.scriptHooks.OnTooltipSetItem==1)
  ItemRefTooltip=MakeItemTooltip("ItemRefTooltip")
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateTooltip")
  ItemRefTooltip:SetHyperlink("item:138019")
  function ItemRefTooltipTextLeft6:SetFont(font) self.font=font;return true end
  ItemRefTooltip:SetHyperlink("item:138019")
  assert(ItemRefTooltipTextLeft6.font=="Fonts\\\\ARKai_T.ttf")
  assert(#ItemRefTooltip.scriptHooks.OnShow==1)
`));
