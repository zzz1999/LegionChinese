import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {csvRows,parseNameTable,selectNames,nameKey,CLIENT_BUILD} from '../scripts/client-names.mjs';

const addon=new URL('../AddOns/TauriChinese/',import.meta.url),data=new URL('Data/',addon);
const generated=fs.readdirSync(data).filter(f=>/^(NameStrings|Spells|SpellNames|Creatures|CreatureFamilies|CreatureFamilyNames)_/.test(f));
const rows=generated.flatMap(f=>fs.readFileSync(new URL(f,data),'utf8').split('\n')).filter(l=>l.startsWith('D.'));
const byPrefix=new Map(rows.map(row=>[row.slice(0,row.indexOf('=')),row]));
function shipped(category,keys){
  const selected=[];
  for(const key of keys){
    const row=byPrefix.get(`D.${category}[${typeof key==='string'?JSON.stringify(key):key}]`);
    assert.ok(row,`missing shipped ${category}/${key}`);selected.push(row);
    const id=row.match(/=\{?(\d+)/)[1];
    selected.push(byPrefix.get(`D.NameStrings[${id}]`));
    assert.ok(selected.at(-1),`dangling reference ${id}`);
  }
  return selected.join('\n');
}
const spellRows=()=>shipped('Spells',[133,746,2575,2366,3365,827])+ '\n'+shipped('SpellNames',[nameKey('Mining')]);
const petRows=()=>shipped('Creatures',[416,417,1860,1863,17252])+'\n'+
  shipped('CreatureFamilies',[1,16,23,40])+'\n'+shipped('CreatureFamilyNames',['Wolf','Ghoul','Imp','Voidwalker'].map(nameKey));
function run(code,{pets=false,imported='',before=''}={}){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{const s=lauxlib.luaL_dostring(L,to_luastring(source));assert.equal(s,lua.LUA_OK,s===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));};
  const read=url=>fs.readFileSync(url,'utf8');
  try{
    execute(read(new URL('Bootstrap.lua',addon)));execute('local D=TauriChineseDB\n'+imported);
    execute(read(new URL('Core.lua',addon)));execute(read(new URL('ClientNames.lua',addon)));
    execute(read(new URL('./ui-fixture.lua',import.meta.url)));execute(read(new URL('./castbar-fixture.lua',import.meta.url)));
    if(pets)execute(read(new URL('./pet-fixture.lua',import.meta.url)));
    execute(before);execute(read(new URL('UI.lua',addon)));
    execute('local A,D=TauriChinese,TauriChineseDB\n'+code);
  }finally{lua.lua_close(L);}
}

test('client CSV handles multiline descriptions, commas and escaped quotes without accepting malformed files',()=>{
  const source='\uFEFFID,Name_lang,Description_lang\r\n133,"火球术","a,b\r\n""quoted"""\r\n';
  assert.deepEqual([...csvRows(source)],[['ID','Name_lang','Description_lang'],['133','火球术','a,b\r\n"quoted"']]);
  assert.equal(parseNameTable(source).get(133).Name_lang,'火球术');
  for(const text of ['ID,Name_lang\n1,"broken','ID,Name_lang\n1,x"y','ID,Name_lang\n1,"x"y',
    'ID,Name_lang\n1,a,extra','ID,Name_lang\n1,a\n1,b','ID,Name_lang\n0,a','ID,ID,Name_lang\n1,1,a']){
    assert.throws(()=>parseNameTable(text));
  }
});

test('name selection uses Simplified then Traditional and excludes ambiguous spell names while retaining IDs',()=>{
  const table=items=>new Map(items.map(([id,Name_lang])=>[id,{Name_lang}]));
  const chosen=selectNames({enUS:table([[1,'One'],[2,'Two'],[3,'Shared'],[4,'Shared'],[5,'Unsafe'],[6,'Unknown'],[7,'Clash'],[8,'Clash']]),
    zhCN:table([[1,'简体'],[2,'English'],[3,'甲'],[4,'乙'],[5,'$N中文'],[7,'丙'],[8,'丁']]),
    zhTW:table([[1,'繁體'],[2,'備用'],[3,'共同'],[4,'共同'],[5,'可用'],[7,'戊'],[8,'己']])});
  assert.equal(chosen.byID.get(1).text,'简体');assert.equal(chosen.byID.get(2).text,'備用');
  assert.equal(chosen.byID.get(5).text,'可用');assert.equal(chosen.byID.has(6),false);
  assert.equal(chosen.byName.get(nameKey('Shared')),'共同');assert.equal(chosen.byName.has(nameKey('Clash')),false);
  assert.equal(chosen.byID.get(7).text,'丙');assert.equal(chosen.counts.ambiguousNames,1);
});

test('all shipped client-name references resolve and source versions and counts agree',()=>{
  for(const row of rows){
    if(row.startsWith('D.NameStrings['))continue;
    assert.ok(byPrefix.has(`D.NameStrings[${row.match(/=\{?(\d+)/)[1]}]`),row);
  }
  const audit=JSON.parse(fs.readFileSync(new URL('../docs/client-name-audit.json',import.meta.url)));
  const manifest=JSON.parse(fs.readFileSync(new URL('../sources.json',import.meta.url)));
  assert.equal(audit.build,CLIENT_BUILD);assert.equal(audit.sources.length,9);
  assert.ok(audit.sources.every(r=>r.build===CLIENT_BUILD&&r.sha256===manifest.clientTables.find(s=>s.file===r.file)?.sha256));
  assert.equal(rows.filter(r=>r.startsWith('D.Spells[')).length,audit.counts.Spell.ids);
  assert.equal(rows.filter(r=>r.startsWith('D.SpellNames[')).length,audit.counts.Spell.fingerprints);
  assert.equal(rows.filter(r=>r.startsWith('D.CreatureFamilies[')).length,audit.counts.CreatureFamily.ids);
});

test('static name keys match JavaScript and do not substitute a player named Fireball',()=>run(`
  function UnitName() return "Fireball" end
  assert(A.NameFingerprint(" |cffff0000FIRE ball|r ")=="${nameKey('Fireball')}")
  assert(A.NameFingerprint("食尸鬼")=="${nameKey('食尸鬼')}")
  assert(A.NameFingerprint("Caster's Spell")=="${nameKey("Caster's Spell")}")
  assert(A.NameFingerprint(nil)==nil)
`));

test('English client uses real 7.3.5 spell IDs for casting, gathering and item use with native Chinese font',()=>run(`
  function GetLocale() return "enUS" end
  local bar=CastingBarFrame
  function bar.Text:SetFont(file,size,flags) self.appliedFont=file;self.fontChanges=self.fontChanges+1;return true end
  for _,case in ipairs({{133,"Fireball","火球术"},{746,"First Aid","急救"},{2575,"Mining","采矿"},
      {2366,"Herb Gathering","采集草药"},{3365,"Opening","开启"},{827,"Nightmare Riding","騎術:夢魘"}}) do
    StartCast(bar,{name=case[2],text=case[2],apiSpellID=case[1],id=77})
    assert(bar.Text:GetText()==case[3],case[2])
    assert(bar.Text.appliedFont=="Fonts\\\\ARKai_T.ttf" and bar.value==1 and bar.maxValue==5)
    SlashCmdList.TAURICHINESE("off");assert(bar.Text:GetText()==case[2])
    SlashCmdList.TAURICHINESE("on");assert(bar.Text:GetText()==case[3])
  end
  assert(#spellLookups==0,"offline data requires no client localized response")
`,{imported:spellRows()}));

test('API spell ID wins over event ID; event fallback and unambiguous name fallback work without it',()=>run(`
  local bar=CastingBarFrame
  StartCast(bar,{name="Alias",text="Alias",apiSpellID=133,spellID=2575})
  assert(bar.Text:GetText()=="火球术")
  StartCast(bar,{name="Alias",text="Alias",spellID=133,id=78})
  assert(bar.Text:GetText()=="火球术")
  StartCast(bar,{name="Alias",text="Alias",apiSpellID=746,channel=true})
  assert(bar.Text:GetText()=="急救" and bar.channeling)
  StartCast(bar,{name="Alias",text="Alias",spellID=746,channel=true,start=3000})
  assert(bar.Text:GetText()=="急救")
  StartCast(bar,{name="Mining",text="Mining",id=133})
  assert(bar.Text:GetText()=="采矿","cast execution counter is never a spell ID")
  StartCast(bar,{name="Unknown",text="Unknown",id=133,start=4000})
  assert(bar.Text:GetText()=="Unknown")
  A.UpdateCastBar(bar,"UNIT_SPELLCAST_START","target","Unknown","",133,133)
  A.UpdateCastBar(bar,"UNIT_SPELLCAST_START","player","Unknown","",132,133)
  assert(bar.Text:GetText()=="Unknown")
`,{imported:spellRows()}));

test('ambiguous names, existing Chinese, unrelated bars and decorated text are not replaced by the spell library',()=>run(`
  local bar=CastingBarFrame
  D.SpellNames[A.NameFingerprint("Ambiguous")]=nil
  function GetSpellInfo() return "Ambiguous",nil,nil,nil,nil,nil,133 end
  StartCast(bar,{name="Ambiguous",text="Ambiguous"})
  assert(bar.Text:GetText()=="Ambiguous","do not resolve an ambiguous name through an arbitrary client ID")
  StartCast(bar,{name="Mining",text="Unlisted server custom action"})
  assert(bar.Text:GetText()=="Unlisted server custom action","without an ID the visible action must match, not a generic API name")
  StartCast(bar,{name="Ambiguous",text="Ambiguous",apiSpellID=133})
  assert(bar.Text:GetText()=="火球术","an authoritative ID can disambiguate")
  for _,text in ipairs({"火球术","火球術"}) do
    StartCast(bar,{name="English",text=text,apiSpellID=133});assert(bar.Text:GetText()==text)
  end
  StartCast(TargetCastBar,{name="Fireball",text="Fireball",apiSpellID=133})
  assert(TargetCastBar.Text:GetText()=="Fireball")
  StartCast(bar,{name="Fireball",text="Fireball",apiSpellID=133})
  bar.Text:SetText("Other addon: Fireball");A.RefreshCastBars()
  assert(bar.Text:GetText()=="Other addon: Fireball")
`,{imported:spellRows()}));

test('own default pet names translate in frames and tooltip without changing native UnitName or font',()=>run(`
  for _,case in ipairs({{416,"Imp","Imp","小鬼"},{417,"Felhunter","Felhunter","地狱猎犬"},
    {1860,"Voidwalker","Voidwalker","虚空行者"},{1863,"Succubus","Succubus","魅魔"},{17252,"Felguard","Felguard","恶魔卫士"},
    {26125,"Ghoul","Ghoul","食尸鬼"}}) do
    local pet=SetPet(case[2],case[3],case[1]);ShowUnitTooltip("pet")
    assert(UnitFrame_Update(PetFrame)=="native-result")
    for _,frame in ipairs({PetFrame,TargetFrame,FocusFrame}) do
      assert(frame.name:GetText()==case[4]);assert(frame.name.fontChanges==0)
    end
    assert(GameTooltipTextLeft1:GetText()==case[4] and UnitName("pet")==case[2])
    SlashCmdList.TAURICHINESE("off")
    assert(PetFrame.name:GetText()==case[2] and GameTooltipTextLeft1:GetText()==case[2])
    SlashCmdList.TAURICHINESE("on");assert(PetFrame.name:GetText()==case[4])
  end
`,{pets:true,imported:petRows()}));

test('random proper names, renamed hunter pets, Chinese names and unknown pet names stay untouched',()=>run(`
  for _,case in ipairs({{"Casketmasher","Ghoul",26125},{"Buztip","Imp",416},{"Pet nickname","Voidwalker",1860},
    {"小鬼","Imp",416},{"虛無行者","Voidwalker",1860}}) do
    SetPet(case[1],case[2],case[3]);ShowUnitTooltip("pet")
    assert(PetFrame.name:GetText()==case[1] and GameTooltipTextLeft1:GetText()==case[1])
  end
  playerClass="HUNTER";petRenameable=true
  SetPet("Wolf","Wolf",1);assert(PetFrame.name:GetText()=="狼")
  SetPet("My Wolf","Wolf",1);assert(PetFrame.name:GetText()=="My Wolf")
  petRenameable=false;SetPet("Wolf","Wolf",1);assert(PetFrame.name:GetText()=="Wolf")
  SetPet("Imp","Wolf",416);assert(PetFrame.name:GetText()=="Imp","even a nickname matching another default is protected")
  petRenameable=true;SetPet("Imp","Wolf",416);assert(PetFrame.name:GetText()=="Imp")
  PetCanBeRenamed=nil;SetPet("Wolf","Wolf",1);assert(PetFrame.name:GetText()=="Wolf")
`,{pets:true,imported:petRows()}));

test('only own tracked summons translate; other pets, players, ordinary NPCs and expired records do not',()=>run(`
  local guid="Creature-0-1-1-1-416-000002"
  units.target={guid=guid,name="Imp",family="Imp"}
  UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="Imp")
  CombatEvent("SPELL_SUMMON","Player-other",guid)
  UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="Imp")
  CombatEvent("SPELL_SUMMON",UnitGUID("player"),guid)
  UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="小鬼")
  units.nameplate1=units.target;local plate=NewUnitFrame("nameplate1")
  CompactUnitFrame_UpdateName(plate);assert(plate.name:GetText()=="小鬼")
  clockTime=4000
  SlashCmdList.TAURICHINESE("off");assert(plate.name:GetText()=="Imp","off restores even an expired ownership record")
  SlashCmdList.TAURICHINESE("on");UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="Imp")
  CombatEvent("SPELL_SUMMON",UnitGUID("player"),guid);CombatEvent("UNIT_DIED",nil,guid)
  UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="Imp")
  units.target={guid="Player-1-000002",name="Imp",family="Imp"}
  CombatEvent("SPELL_SUMMON",UnitGUID("player"),units.target.guid)
  UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="Imp")
`,{pets:true,imported:petRows()}));

test('reused frames and tooltips, custom text and repeated installation cannot reuse a previous pet name',()=>run(`
  SetPet("Imp","Imp",416);ShowUnitTooltip("pet")
  units.target={guid="Creature-0-1-1-1-416-000999",name="Imp",family="Imp"}
  UnitFrame_Update(TargetFrame);ShowUnitTooltip("target")
  assert(TargetFrame.name:GetText()=="Imp" and GameTooltipTextLeft1:GetText()=="Imp")
  PetFrame.name:SetText("Other addon: Imp");A.RefreshPetNames();assert(PetFrame.name:GetText()=="Other addon: Imp")
  PetFrame.overrideName="target";UnitFrame_Update(PetFrame);assert(PetFrame.name:GetText()=="Imp")
  PetFrame.overrideName=nil
  units.pet.name="Buztip";PetFrame:Fire("OnEvent","UNIT_NAME_UPDATE","pet")
  assert(PetFrame.name:GetText()=="Buztip")
  SetPet("Imp","Imp",416);ShowUnitTooltip("pet")
  local originalGUID=UnitGUID
  UnitGUID=function(unit) assert(type(unit)=="string","WoW unit APIs require a unit token");return originalGUID(unit) end
  GameTooltip.unit=nil;GameTooltipTextLeft1:SetText("An item")
  A.RefreshPetNames();assert(GameTooltipTextLeft1:GetText()=="An item","a tooltip reused for an item has no unit")
  local unitUpdate=UnitFrame_Update;local scriptCount=#PetFrame.scriptHooks.OnEvent
  frames[1]:Fire("OnEvent","ADDON_LOADED","AnotherAddon")
  assert(unitUpdate==UnitFrame_Update and scriptCount==#PetFrame.scriptHooks.OnEvent and #frames==2)
`,{pets:true,imported:petRows()}));

test('a summon event refreshes existing accessible nameplates and skips forbidden frames',()=>run(`
  units.nameplate1={guid="Creature-0-1-1-1-416-000008",name="Imp",family="Imp"}
  local plate=NewUnitFrame("nameplate1");CompactUnitFrame_UpdateName(plate)
  assert(plate.name:GetText()=="Imp")
  local forbidden=setmetatable({IsForbidden=function() return true end},{__index=function() error("forbidden access") end})
  C_NamePlate={GetNamePlates=function() return {{UnitFrame=plate},forbidden,{UnitFrame=forbidden}} end}
  A.UpdatePetUnitFrame(forbidden);A.ApplyPetName(forbidden,"nameplate1")
  CombatEvent("SPELL_SUMMON",UnitGUID("player"),UnitGUID("nameplate1"))
  assert(plate.name:GetText()=="小鬼","the unit can appear before the combat-log event")
  CombatEvent("UNIT_DESTROYED",nil,UnitGUID("nameplate1"))
  assert(plate.name:GetText()=="Imp","retiring ownership restores only our own translation")
`,{pets:true,imported:petRows()}));

test('pet hooks install after a late native frame load and support later combat-log argument access',()=>run(`
  PetFrame=NewUnitFrame("pet");GameTooltip=savedTooltip
  frames[1]:Fire("OnEvent","ADDON_LOADED","NativeFrames")
  SetPet("Imp","Imp",416);ShowUnitTooltip("pet")
  assert(PetFrame.name:GetText()=="小鬼" and GameTooltipTextLeft1:GetText()=="小鬼")
  units.target={guid="Creature-0-1-1-1-416-000002",name="Imp",family="Imp"}
  function CombatLogGetCurrentEventInfo() return clockTime,"SPELL_SUMMON",false,UnitGUID("player"),"source",0,0,UnitGUID("target"),"dest",0,0 end
  frames[2]:Fire("OnEvent","COMBAT_LOG_EVENT_UNFILTERED")
  UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="小鬼")
  frames[2]:Fire("OnEvent","PLAYER_ENTERING_WORLD")
  UnitFrame_Update(TargetFrame);assert(TargetFrame.name:GetText()=="Imp")
`,{pets:true,imported:petRows(),before:'savedTooltip=GameTooltip;GameTooltip=nil;PetFrame=nil'}));
