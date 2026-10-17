import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {selectWorldObjectNames,pairSQLWorldObjectNames} from '../scripts/world-objects.mjs';
import {nameKey} from '../scripts/client-names.mjs';
const addon=new URL('../AddOns/LegionChinese/',import.meta.url);

test('world names prefer client Chinese, fall back per locale, and reject ambiguous or later names',()=>{
  const row=(original,text,locale='zhCN',kind='sql',verifiedBuild=0)=>({id:1,original,text,locale,kind,verifiedBuild,source:'fixture'});
  const {index}=selectWorldObjectNames([
    row('Gate','社区门'),row('Gate','采集门','zhCN','sql',18019),row('Gate','客户端门','zhCN','client-db2',26972),
    row('Fallback','English'),row('Fallback','備用門','zhTW'),
    row('Conflict','甲'),row('Conflict','乙'),row('Conflict','共同','zhTW'),
    row('Clash','甲'),row('Clash','乙'),row('Clash','丙','zhTW'),row('Clash','丁','zhTW'),
    row('Future','后续物件','zhCN','sql',30000),row('Dynamic $N','名字'),row('Unsafe','坏的$N'),row('中文原名','别的中文')]);
  assert.equal(index.entries.get(nameKey('Gate')),'客户端门');
  assert.equal(index.entries.get(nameKey('Fallback')),'備用門');
  assert.equal(index.entries.get(nameKey('Conflict')),'共同');
  for(const name of ['Clash','Future','Dynamic $N','Unsafe','中文原名'])assert.equal(index.entries.has(nameKey(name)),false);
});

function run(code){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{const status=lauxlib.luaL_dostring(L,to_luastring(source));assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));};
  try{
    for(const file of ['Bootstrap.lua','Data/WorldObjects_01.lua','Core.lua','ClientNames.lua','WorldObjects.lua'])execute(fs.readFileSync(new URL(file,addon),'utf8'));
    for(const file of ['ui-fixture.lua','world-tooltip-fixture.lua'])execute(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
    execute(fs.readFileSync(new URL('UI.lua',addon),'utf8'));
    execute('local A,D=LegionChinese,LegionChineseDB\n'+code);
  }finally{lua.lua_close(L);}
}

test('shipped world-name data includes the reported gate and agrees with its pinned sources',()=>{
  const audit=JSON.parse(fs.readFileSync(new URL('../docs/world-object-audit.json',import.meta.url)));
  const manifest=JSON.parse(fs.readFileSync(new URL('../sources.json',import.meta.url)));
  const gate=audit.records.find(r=>r.key===nameKey('Death Gate'));
  assert.equal(gate.text,'死亡之门');assert.equal(gate.id,190942);assert.equal(gate.verifiedBuild,18019);
  assert.equal(gate.quality,'build-marked');
  const ashran=audit.records.find(r=>r.key===nameKey('Portal to Ashran'));
  assert.equal(ashran.text,'到阿什兰的传送门');assert.equal(ashran.id,233610);
  assert.equal(ashran.source,'2018_01_11_gameobject_template_locale.sql');
  assert.equal(ashran.originalSource,'TDB_world_735.00_2018_02_19.sql');
  assert.equal(audit.records.some(r=>r.key===nameKey('HERETICS WILL BURN')),false);
  assert.equal(audit.sources.length,3);
  for(const source of audit.sources)assert.equal(source.sha256,manifest.worldObjectTables.find(s=>s.file===source.file).sha256);
  for(const source of audit.sqlSources)assert.equal(source.sha256,manifest.sql.find(s=>s.file===source.file).sha256);
  const data=fs.readFileSync(new URL('Data/WorldObjects_01.lua',addon),'utf8');
  assert.equal(data.split('\n').filter(l=>l.startsWith('D.')).length,audit.counts.fingerprints);
});

test('a locale-only object patch requires an explicit snapshot and an exact reviewed original',()=>{
  const base={table:'gameobject_template',id:233610,name:'Portal to Ashran',verifiedBuild:22522,source:'base.sql'};
  const patch={table:'gameobject_template_locale',id:233610,name:'到阿什兰的传送门',locale:'zhCN',verifiedBuild:18019,
    source:'patch.sql',baseFile:'base.sql',expectedOriginal:'Portal to Ashran'};
  assert.equal(pairSQLWorldObjectNames([base,patch])[0].source,'patch.sql');
  for(const changes of [{baseFile:undefined},{baseFile:'other.sql'},{expectedOriginal:undefined},{expectedOriginal:'Different object'},{id:1}])
    assert.deepEqual(pairSQLWorldObjectNames([base,{...patch,...changes}]),[]);
  assert.deepEqual(pairSQLWorldObjectNames([{...base,name:'Different object'},patch]),[]);
});

test('world tooltip translates Death Gate without altering native fonts, other lines or its handler',()=>run(`
  WorldHover("Death Gate")
  assert(GameTooltipTextLeft1.text=="死亡之门")
  assert(GameTooltipTextLeft1.fontChanges==0 and GameTooltipTextLeft2.text=="unchanged extra line")
  assert(GameTooltip.nativeUpdates==1 and GameTooltip.owner==UIParent)
  local writes=GameTooltipTextLeft1.writes
  for i=1,10 do GameTooltip:Fire("OnUpdate",0.016) end
  assert(GameTooltipTextLeft1.writes==writes and GameTooltip.nativeUpdates==11)
  -- Engine text may update while the same tooltip remains visible.
  GameTooltipTextLeft1:SetText("Death Gate");GameTooltip:Fire("OnUpdate",0.016)
  assert(GameTooltipTextLeft1.text=="死亡之门")
  WorldHover("Unknown custom portal");assert(GameTooltipTextLeft1.text=="Unknown custom portal")
  WorldHover("Portal to Ashran");assert(GameTooltipTextLeft1.text=="到阿什兰的传送门")
  WorldHover("HERETICS WILL BURN");assert(GameTooltipTextLeft1.text=="HERETICS WILL BURN")
  WorldHover("死亡之門");assert(GameTooltipTextLeft1.text=="死亡之門")
  WorldHover("|cffffffffDeath Gate|r");assert(GameTooltipTextLeft1.text=="|cffffffffDeath Gate|r")
`));

test('world tooltips exclude units, pets, item and spell tips, UI owners, hidden and forbidden frames',()=>run(`
  for _,kind in ipairs({"unit","mouseover","item","itemLink","spell","spellID","owner","focus","hidden","forbidden"}) do
    WorldHover("Unknown")
    GameTooltipTextLeft1:SetText("Death Gate")
    if kind=="unit" then GameTooltip.unitName="Death Gate";GameTooltip.unit="target"
    elseif kind=="mouseover" then mouseoverUnit="target"
    elseif kind=="item" then GameTooltip.item="Death Gate"
    elseif kind=="itemLink" then GameTooltip.itemLink="item:1"
    elseif kind=="spell" then GameTooltip.spell="Death Gate"
    elseif kind=="spellID" then GameTooltip.spellID=50977
    elseif kind=="owner" then GameTooltip.owner={}
    elseif kind=="focus" then mouseFocus={}
    elseif kind=="hidden" then GameTooltip.shown=false
    elseif kind=="forbidden" then GameTooltip.forbidden=true end
    A.UpdateWorldObjectTooltip(GameTooltip)
    assert(GameTooltipTextLeft1.text=="Death Gate",kind)
    GameTooltip.forbidden=nil
  end
`));

test('commands restore only the active object tip and reuse never leaks an older translation',()=>run(`
  WorldHover("Death Gate")
  SlashCmdList.LEGIONCHINESE("off");assert(GameTooltipTextLeft1.text=="Death Gate")
  GameTooltip:Fire("OnUpdate",0.016);assert(GameTooltipTextLeft1.text=="Death Gate")
  SlashCmdList.LEGIONCHINESE("on");assert(GameTooltipTextLeft1.text=="死亡之门")
  GameTooltip:Hide();WorldHover("死亡之门")
  SlashCmdList.LEGIONCHINESE("off");assert(GameTooltipTextLeft1.text=="死亡之门")
  SlashCmdList.LEGIONCHINESE("on");WorldHover("Death Gate")
  -- A recycled unit tooltip must not be restored to the object's English name.
  GameTooltip:Fire("OnTooltipCleared");GameTooltip.unitName="死亡之门";GameTooltip.unit="target"
  SlashCmdList.LEGIONCHINESE("off");assert(GameTooltipTextLeft1.text=="死亡之门")
  SlashCmdList.LEGIONCHINESE("on");WorldHover("Death Gate")
  GameTooltipTextLeft1:SetText("Other addon text")
  SlashCmdList.LEGIONCHINESE("off");assert(GameTooltipTextLeft1.text=="Other addon text")
  SlashCmdList.LEGIONCHINESE("on");WorldHover("Death Gate")
  GameTooltipTextLeft1=Widget("死亡之门")
  SlashCmdList.LEGIONCHINESE("off");assert(GameTooltipTextLeft1.text=="死亡之门","replaced native label")
`));

test('world tooltip hooks install on late load only once and the English client uses the native Chinese font',()=>run(`
  function GetLocale() return "enUS" end
  function GameTooltipTextLeft1:SetFont(font) self.font=font;self.fontChanges=self.fontChanges+1;return true end
  frames[1]:Fire("OnEvent","ADDON_LOADED","OtherAddon")
  assert(#GameTooltip.scriptHooks.OnUpdate==1 and #GameTooltip.scriptHooks.OnShow==1)
  WorldHover("Death Gate")
  assert(GameTooltipTextLeft1.font=="Fonts\\\\ARKai_T.ttf")
  local old=GameTooltip
  GameTooltip=ScriptFrame();GameTooltipTextLeft1=Widget("Death Gate")
  for _,method in ipairs({"GetOwner","GetUnit","GetItem","GetSpell","IsShown","Show","IsForbidden"}) do GameTooltip[method]=old[method] end
  GameTooltip.owner=UIParent;GameTooltip.shown=true
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateTooltip")
  GameTooltip:Fire("OnUpdate",0.016)
  assert(GameTooltipTextLeft1.text=="死亡之门" and #GameTooltip.scriptHooks.OnUpdate==1)
`));
