import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {selectItemDescriptions} from '../scripts/item-descriptions.mjs';
import {nameKey} from '../scripts/client-names.mjs';
const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
const source=JSON.parse(fs.readFileSync(new URL('../data/item-descriptions.json',import.meta.url)));
const descriptionFiles=fs.readFileSync(new URL('LegionChinese.toc',addon),'utf8').split(/\r?\n/)
  .filter(file=>/^Data\\ItemDescriptions_\d+\.lua$/.test(file)).map(file=>file.replaceAll('\\','/'));

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
  const data=descriptionFiles.map(file=>fs.readFileSync(new URL(file,addon),'utf8')).join('\n');
  assert.ok(data.includes(audit.records[0].text));assert.ok(!data.includes(source.records[0].original));
  assert.ok(audit.counts.client.selected>16000);assert.equal(audit.sources.length,3);
  assert.equal(audit.counts.entries,audit.clientRecords.length+audit.records.length);
  assert.equal(audit.clientRecords.find(row=>row.itemID===32760).locale,'zhTW');
  assert.ok(!audit.clientRecords.some(row=>row.itemID===20731)); // Unresolved enchantment values stay native.
});

function run(code){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=text=>{const status=lauxlib.luaL_dostring(L,to_luastring(text));assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));};
  try{
    for(const file of ['Bootstrap.lua',...descriptionFiles,'Data/WorldObjects_01.lua','Core.lua','ClientNames.lua','WorldObjects.lua','ItemTooltips.lua'])execute(fs.readFileSync(new URL(file,addon),'utf8'));
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
  A.RefreshItemTooltips()
  assert(ItemRefTooltipTextLeft6.text=='|cffffff00"'..translatedDescription..'"|r')
  assert(GameTooltipTextLeft6.text=='"'..translatedDescription..'"')
`));

test('item polling stays bounded for known and unknown items even with legacy disabled settings',()=>run(`
  ItemRefTooltip:SetHyperlink("item:138019")
  local reads=0
  for i=2,6 do
    local widget=_G["ItemRefTooltipTextLeft"..i];local get=widget.GetText
    widget.GetText=function(self) reads=reads+1;return get(self) end
  end
  for i=1,120 do ItemRefTooltip:Fire("OnUpdate",1/120) end
  assert(reads==50 and ItemRefTooltip.nativeUpdates==120)
  LegionChineseSettings={enabled=false};reads=0
  for i=1,120 do ItemRefTooltip:Fire("OnUpdate",1/120) end
  assert(reads==50 and ItemRefTooltip.nativeUpdates==240)
  assert(ItemRefTooltipTextLeft6.text=='"'..translatedDescription..'"')
  ItemRefTooltip:SetHyperlink("item:1")
  local getItem=ItemRefTooltip.GetItem;local itemReads=0
  ItemRefTooltip.GetItem=function(self) itemReads=itemReads+1;return getItem(self) end
  for i=1,120 do ItemRefTooltip:Fire("OnUpdate",1/120) end
  assert(itemReads==10,"unmatched items must not reset the polling interval each frame")
`));

test('native item events and refreshes translate immediately while late line changes appear on the next poll',()=>run(`
  ItemRefTooltip.pendingText="Waiting for item information"
  ItemRefTooltip:SetHyperlink("item:138019")
  ItemRefTooltipTextLeft6:SetText(description)
  for i=1,11 do ItemRefTooltip:Fire("OnUpdate",1/120) end
  assert(ItemRefTooltipTextLeft6.text==description)
  ItemRefTooltip:Fire("OnUpdate",1/120)
  assert(ItemRefTooltipTextLeft6.text==translatedDescription)
  ItemRefTooltip.pendingText=description;ItemRefTooltip:SetHyperlink("item:138019")
  assert(ItemRefTooltipTextLeft6.text==translatedDescription,"native item events must not wait for polling")
  A.RefreshItemTooltips();assert(ItemRefTooltipTextLeft6.text==translatedDescription)
  ItemRefTooltip:SetHyperlink("item:1");assert(ItemRefTooltipTextLeft6.text==description)
  ItemRefTooltip:Hide();ItemRefTooltip:SetHyperlink("item:138019")
  assert(ItemRefTooltipTextLeft6.text==translatedDescription,"hide and reuse must not delay a known item")
`));

test('client item descriptions translate flavor text with Traditional fallback and preserve live stats across refreshes',()=>run(`
  local original='Fletched by Andy "The Macho Gnome" Savage.'
  ItemRefTooltip.pendingText=original;ItemRefTooltip:SetHyperlink("item:32760:0:0:0:0:0")
  assert(ItemRefTooltipTextLeft6.text=='由「硬漢地精」野蠻安迪裝填尾羽。')
  ItemRefTooltipTextLeft2:SetText("物品等级 900")
  ItemRefTooltipTextLeft4:SetText("+1,234 力量")
  ItemRefTooltipTextLeft5:SetText("使用：恢复 12,345 点生命值。")
  ItemRefTooltip:Fire("OnUpdate",0.016)
  assert(ItemRefTooltipTextLeft2.text=="物品等级 900" and ItemRefTooltipTextLeft4.text=="+1,234 力量")
  assert(ItemRefTooltipTextLeft5.text=="使用：恢复 12,345 点生命值。")
  A.RefreshItemTooltips();assert(ItemRefTooltipTextLeft6.text=='由「硬漢地精」野蠻安迪裝填尾羽。')
  ItemRefTooltip.pendingText=original..' Changed';ItemRefTooltip:SetHyperlink("item:32760")
  assert(ItemRefTooltipTextLeft6.text==ItemRefTooltip.pendingText)
  ItemRefTooltip.pendingText=original;ItemRefTooltip:SetHyperlink("item:32761")
  assert(ItemRefTooltipTextLeft6.text==original)
`));

test('client descriptions retain multiline text and native colors with quotes inside or outside the color wrapper',()=>run(`
  local original='Doubt thou the stars are fire;\\r\\nDoubt that the sun doth move.'
  ItemRefTooltip.pendingText='"'..original..'"';ItemRefTooltip:SetHyperlink("item:151800")
  assert(ItemRefTooltipTextLeft6.text=='"汝不知星辰是否燃烧，\\n汝不知太阳是否运转。"')
  A.RefreshItemTooltips()
  assert(ItemRefTooltipTextLeft6.text=='"汝不知星辰是否燃烧，\\n汝不知太阳是否运转。"')
  for _,text in ipairs({'|cFF00AA99"For superior fighting and a healthier coat."|r',
    '"|cFF00AA99"For superior fighting and a healthier coat."|r"'}) do
    ItemRefTooltip.pendingText=text;ItemRefTooltip:SetHyperlink("item:129179")
    assert(ItemRefTooltipTextLeft6.text:find('专为激烈的战斗和健康的体魄而烹制。',1,true))
    assert(ItemRefTooltipTextLeft6.text:find('|cFF00AA99',1,true))
    local translated=ItemRefTooltipTextLeft6.text;A.RefreshItemTooltips()
    assert(ItemRefTooltipTextLeft6.text==translated)
  end
`));

test('keystone links and bags work without GetItem while cleared tips lose their former identity',()=>run(`
  LegionChineseSettings={enabled=false}
  ItemRefTooltip.noItemAPI=true;ItemRefTooltip:SetHyperlink("keystone:138019:197:12:1:2:3")
  assert(ItemRefTooltipTextLeft6.text=='"'..translatedDescription..'"')
  A.RefreshItemTooltips()
  assert(ItemRefTooltipTextLeft6.text=='"'..translatedDescription..'"')
  GameTooltip.noItemAPI=true;GameTooltip:SetBagItem(0,1)
  assert(GameTooltipTextLeft6.text=='"'..translatedDescription..'"')
  A.RefreshItemTooltips()
  assert(ItemRefTooltipTextLeft6.text=='"'..translatedDescription..'"' and GameTooltipTextLeft6.text=='"'..translatedDescription..'"')
  ItemRefTooltip:Fire("OnTooltipCleared");ItemRefTooltip.itemLink=nil
  ItemRefTooltipTextLeft6:SetText(description)
  A.RefreshItemTooltips();assert(ItemRefTooltipTextLeft6.text==description)
`));

test('native Legion map-first keystone links translate their description with or without GetItem data',()=>run(`
  for _,noItem in ipairs({false,true}) do
    ItemRefTooltip.noItemAPI=noItem
    ItemRefTooltip:SetHyperlink("|cffa335ee|Hkeystone:197:12:6:3:9|h[Keystone: Halls of Valor (12)]|h|r")
    assert(ItemRefTooltipTextLeft6.text=='"'..translatedDescription..'"')
    A.RefreshItemTooltips()
    assert(ItemRefTooltipTextLeft6.text=='"'..translatedDescription..'"')
  end
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
  A.RefreshItemTooltips();assert(ItemRefTooltipTextLeft6.text==ItemRefTooltip.pendingText)
  A.RefreshItemTooltips();ItemRefTooltip.pendingText=nil;ItemRefTooltip:SetHyperlink("item:138019")
  ItemRefTooltipTextLeft6:SetText("另一个插件的文字")
  A.RefreshItemTooltips();assert(ItemRefTooltipTextLeft6.text=="另一个插件的文字")
  A.RefreshItemTooltips();ItemRefTooltip:SetHyperlink("item:138019")
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
