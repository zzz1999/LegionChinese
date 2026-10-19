import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';

function run(code){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    for(const file of ['../AddOns/LegionChinese/Bootstrap.lua','../AddOns/LegionChinese/Core.lua',
      './ui-fixture.lua','./castbar-fixture.lua','../AddOns/LegionChinese/UI.lua']){
      execute(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
    }
    execute('local A=LegionChinese\n'+code);
  }finally{lua.lua_close(L);}
}

test('player XML callback translates cast, gathering and item action names using native Chinese',()=>run(`
  local bar=CastingBarFrame
  for _,case in ipairs({{"火球术","Fireball"},{"采矿","Mining"},{"打开","Opening"},{"急救","First Aid"}}) do
    StartCast(bar,{name=case[1],text=case[2]})
    assert(bar.Text:GetText()==case[1])
    assert(bar.Text.fontChanges==0,"preserve the native Chinese font")
    assert(bar.casting and bar.castID==77 and bar.value==1 and bar.maxValue==5 and not bar.fadeOut)
  end
  assert(#spellLookups==0,"already-localized cast names need no lookup")
`));

test('Legion event spell ID resolves the Chinese name without confusing the cast execution ID',()=>run(`
  local bar=CastingBarFrame
  spellNames[133]="火球术";spellNames[77]="另一个法术"
  StartCast(bar,{name="Fireball",text="Fireball",id=77,spellID=133})
  assert(bar.Text:GetText()=="火球术" and #spellLookups==1 and spellLookups[1]==133)
  A.RefreshCastBars()
  assert(bar.Text:GetText()=="火球术" and bar.casting and bar.value==1 and bar.maxValue==5)
  bar.Text:SetText("Fireball");A.RefreshCastBars()
  assert(bar.Text:GetText()=="火球术","same active cast can reuse its confirmed translation")
  StartCast(bar,{name="Fireball",text="Fireball",id=78,start=2000})
  assert(bar.Text:GetText()=="Fireball","a new cast must not inherit an old event's spell ID")
  assert(spellLookups[#spellLookups]=="Fireball")
`));

test('channels, pet/vehicle bars and direct native resume calls use current text only',()=>run(`
  local bar=CastingBarFrame
  spellNames[10]="暴风雪"
  StartCast(bar,{name="Blizzard",text="Blizzard",spellID=10,channel=true})
  assert(bar.channeling and not bar.casting and bar.Text:GetText()=="暴风雪")
  bar:Fire("OnEvent","UNIT_SPELLCAST_CHANNEL_UPDATE","player","Blizzard","",77,10)
  assert(bar.Text:GetText()=="暴风雪" and bar.Text.writes==2)
  StartCast(PetCastingBarFrame,{name="控制宠物的法术",text="Pet spell"})
  assert(PetCastingBarFrame.Text:GetText()=="控制宠物的法术" and PetCastingBarFrame.Text.writes==2,
      "forwarded global and script hooks must not translate twice")
  activeCasts.player={name="急救",text="First Aid",start=2000,finish=5000,id=90,channel=true}
  CastingBarFrame_OnEvent(bar,"PLAYER_ENTERING_WORLD")
  assert(bar.Text:GetText()=="急救" and bar.channeling)
  bar.unit="vehicle"
  StartCast(bar,{name="载具法术",text="Vehicle spell"})
  assert(bar.Text:GetText()=="载具法术")
`));

test('existing Chinese, unknown spells and other bars keep their text while legacy settings are ignored',()=>run(`
  for _,text in ipairs({"火球术","採礦"}) do
    StartCast(CastingBarFrame,{name="不同的中文名称",text=text})
    assert(CastingBarFrame.Text:GetText()==text)
  end
  StartCast(CastingBarFrame,{name="Unknown",text="Unknown custom action",spellID=999999})
  assert(CastingBarFrame.Text:GetText()=="Unknown custom action")
  spellNames[133]="Fireball"
  StartCast(CastingBarFrame,{name="Fireball",text="Fireball",spellID=133})
  assert(CastingBarFrame.Text:GetText()=="Fireball","non-Chinese API output is not a translation")
  StartCast(CastingBarFrame,{name="採礦",text="Mining"})
  assert(CastingBarFrame.Text:GetText()=="採礦","use the available official Traditional name")
  StartCast(TargetCastBar,{name="火球术",text="Fireball"})
  assert(TargetCastBar.Text:GetText()=="Fireball","shared native handler must not extend scope")
  LegionChineseSettings={enabled=false}
  StartCast(CastingBarFrame,{name="采矿",text="Mining"})
  assert(CastingBarFrame.Text:GetText()=="采矿")
`));

test('interruptions, failures, cancellation and unrelated or stale events never restore the old spell',()=>run(`
  local bar=CastingBarFrame
  for _,event in ipairs({"UNIT_SPELLCAST_FAILED","UNIT_SPELLCAST_INTERRUPTED","UNIT_SPELLCAST_STOP"}) do
    StartCast(bar,{name="火球术",text="Fireball",id=100})
    bar:Fire("OnEvent",event,"player","火球术","",100,133)
    local text=bar.Text:GetText();local writes=bar.Text.writes
    A.RefreshCastBars()
    bar:Fire("OnEvent","UNIT_SPELLCAST_DELAYED","player","火球术","",100,133)
    assert(bar.Text:GetText()==text and bar.Text.writes==writes and bar.fadeOut and not bar.casting)
  end
  StartCast(bar,{name="Unknown",text="Unknown",id=101})
  spellNames[133]="火球术"
  A.UpdateCastBar(bar,"UNIT_SPELLCAST_START","target","Unknown","",101,133)
  A.UpdateCastBar(bar,"UNIT_SPELLCAST_START","player","Unknown","",100,133)
  assert(bar.Text:GetText()=="Unknown","wrong unit or old cast must not supply the spell ID")
  activeCasts.player=nil
  A.UpdateCastBar(bar,"UNIT_SPELLCAST_START","player","Unknown","",101,133)
  assert(bar.Text:GetText()=="Unknown","vanished cast")
`));

test('resuming by name is bounded, hidden or third-party-decorated text stays untouched and hooks are unique',()=>run(`
  local bar=CastingBarFrame
  spellNames["Mining"]="采矿"
  activeCasts.player={name="Mining",text="Mining",start=1000,finish=5000,id=77}
  CastingBarFrame_OnEvent(bar,"PLAYER_ENTERING_WORLD")
  assert(bar.Text:GetText()=="采矿" and #spellLookups==1)
  bar.Text:SetText("Other addon: Mining (2/5)")
  A.RefreshCastBars()
  assert(bar.Text:GetText()=="Other addon: Mining (2/5)")
  bar.Text:SetText("Mining");bar.shown=false
  A.RefreshCastBars();assert(bar.Text:GetText()=="Mining")
  local global=CastingBarFrame_OnEvent;local count=#bar.scriptHooks.OnEvent
  frames[1]:Fire("OnEvent","ADDON_LOADED","AnotherAddon")
  assert(global==CastingBarFrame_OnEvent and #bar.scriptHooks.OnEvent==count)
  CastingBarFrame=nil;PetCastingBarFrame=nil
  A.RefreshCastBars()
`));
