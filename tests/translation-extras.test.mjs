import {readFixtureFile,listFixtureFiles} from './addon-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {objectiveAmount,expandQuestText,importTranslationExtras} from '../scripts/translation-extras.mjs';
import {chooseStatic,parseColumns} from '../scripts/extra-client-data.mjs';
import {buildBookContexts} from '../scripts/book-contexts.mjs';
import {ChineseTextIndex} from '../scripts/fallback.mjs';
import {normalize,hasChinese,supportsTokens,fingerprint,luaString} from '../scripts/text.mjs';
const root=new URL('../',import.meta.url),addon=new URL('AddOns/LegionChinese/',root);

test('quest variables use required amounts, exact objective order and versioned class terms',()=>{
  const objectives=[{id:8,order:0,amount:10},{id:9,order:1,amount:3}];
  assert.equal(objectiveAmount(objectives,1),10);assert.equal(objectiveAmount(objectives,2),3);
  assert.equal(objectiveAmount(objectives,null),undefined);
  assert.equal(objectiveAmount([{order:2,amount:10},{order:7,amount:3}],1),undefined);
  assert.equal(objectiveAmount([{order:-1,amount:10}],1),10);
  assert.equal(expandQuestText('带来 $1oa 枚徽章，$p。',{objectives}),'带来 10 枚徽章，$N。');
  for(const text of ['数量 $3oa','数值 $123w','名字 $player','头衔 $ct','数值 $s1'])assert.equal(expandQuestText(text,{objectives}),null);
  assert.equal(supportsTokens('你好，$ct'),false);assert.equal(supportsTokens('你好，$c'),true);
  const character={gender:1,locales:{zhCN:{titleMale:'大法师',titleFemale:'大法师',villain:'希尔瓦娜斯'}}};
  assert.equal(expandQuestText('$ct，击败$vn。$vg他:她;来了。',{character,locale:'zhCN'}),'大法师，击败希尔瓦娜斯。她来了。');
});

test('extra quest imports require live full text and reject changed objective requirements or later builds',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lcn-extra-'));
  try{
    const q={id:7,identity:{title:'Collect',objectives:'Bring $1oa coins.',description:'Find coins.'},objectives:[{id:1,order:0,amount:10}],
      fields:{Objectives:{english:'Bring $1oa coins.',text:'带来 $1oa 枚硬币。',locale:'zhCN',build:26972}}};
    const snapshot={schema:1,build:26972,baseWorldSha256:'base',classes:[],quests:[q]};
    const manifest={sql:[{kind:'world',sha256:'base'}]};
    const options={root:folder,manifest,baseQuests:new Map([['7',{ID:7,VerifiedBuild:26972,LogTitle:'Collect',LogDescription:'Bring $1oa coins.',QuestDescription:'Find coins.'}]]),
      baseObjectives:new Map([['7',[{id:1,order:0,amount:10}]]]),questData:new Map()};
    const run=()=>{const bytes=JSON.stringify(snapshot);fs.writeFileSync(path.join(folder,'extra.json'),bytes);manifest.translationExtras={file:'extra.json',sha256:crypto.createHash('sha256').update(bytes).digest('hex')};return importTranslationExtras(options);};
    const imported=run();assert.equal(imported.audit.fields,1);
    const index=imported.scopes[0].index;
    assert.equal(index.entries.get(fingerprint(normalize('Bring 10 coins.'))),'带来 10 枚硬币。');
    assert.equal(index.entries.has(fingerprint(normalize('Bring 6 coins.'))),false);
    options.baseObjectives.get('7')[0].amount=6;assert.equal(run().audit.fields,0);
    options.baseObjectives.get('7')[0].amount=10;q.fields.Objectives.build=30000;assert.equal(run().audit.fields,0);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});

test('static client descriptions prefer Simplified then Traditional and never ship unresolved formulas',()=>{
  assert.equal(chooseStatic('A static effect.','静态效果。','靜態效果。').locale,'zhCN');
  assert.equal(chooseStatic('A static effect.','造成 $s1 伤害','靜態效果。').locale,'zhTW');
  for(const original of ['Deals $s1 damage.','','$@spelldesc123','已有中文'])assert.equal(chooseStatic(original,'中文','中文'),undefined);
  const table=parseColumns('ID,Description_lang\n1,"a,b\nnew line"\n',['Description_lang']);
  assert.equal(table.get(1).Description_lang,'a,b\nnew line');
  assert.throws(()=>parseColumns('ID,Description_lang\n1,a\n1,b',['Description_lang']),/ID/);
});

test('ambiguous book pages resolve only inside a known page-one context',()=>{
  const pages=new Map([['1',{Text:'Book of Fire',NextPage:2}],['2',{Text:'The end',NextPage:0}],['3',{Text:'Book of Water',NextPage:4}],['4',{Text:'The end',NextPage:0}]]);
  const candidates=[{audit:{id:2,locale:'zhCN'},original:'The end',chinese:'火焰之书完。',group:'clientSniff'},
    {audit:{id:4,locale:'zhCN'},original:'The end',chinese:'流水之书完。',group:'clientSniff'}];
  const global=new ChineseTextIndex();for(const c of candidates)global.add('zhCN',c.original,c.chinese);global.finish();
  assert.equal(global.entries.size,0);
  const result=buildBookContexts(pages,candidates,global);assert.equal(result.audit.pages,2);
  const fire=result.scopes.find(s=>s.anchor===fingerprint(normalize('Book of Fire')));
  assert.equal(fire.index.entries.get(fingerprint(normalize('The end'))),'火焰之书完。');
  pages.get('3').Text='Book of Fire';assert.equal(buildBookContexts(pages,candidates,global).scopes.length,0);
});

function run(code,before=''){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=text=>{const status=lauxlib.luaL_dostring(L,to_luastring(text));assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));};
  try{
    for(const file of ['Bootstrap.lua','Core.lua','ClientNames.lua','ItemTooltips.lua','ExtraTooltips.lua','ChatLinks.lua'])execute(readFixtureFile(new URL(file,addon),'utf8'));
    for(const file of ['ui-fixture.lua','world-tooltip-fixture.lua','item-tooltip-fixture.lua'])execute(readFixtureFile(new URL(file,import.meta.url),'utf8'));
    execute(before);execute(readFixtureFile(new URL('UI.lua',addon),'utf8'));execute('local A,D=LegionChinese,LegionChineseDB\n'+code);
  }finally{lua.lua_close(L);}
}

test('offline item names preserve suffixes, bonus names, Chinese labels and generic keystones',()=>run(`
  D.ItemNames[1]={"中文剑",A.NameFingerprint("Sword")}
  assert(A.ResolveItemName("Espada",1,"item:1")=="中文剑")
  assert(A.ResolveItemName("Espada",1,"item:1:0:0:0:0:0:123")==nil)
  assert(A.ResolveItemName("Sword",1,"item:1:0:0:0:0:0:123")=="中文剑")
  assert(A.ResolveItemName("A special sword",1,"item:1:0:0:0:0:0:0:0:110:0:0:0:1:123")==nil)
  assert(A.ResolveItemName("已有中文",1,"item:1")==nil)
  D.ItemNames[138019]=D.ItemNames[1];assert(A.ResolveItemName("Keystone",138019,"item:138019")==nil)
  local _,message=A.TranslateChatItemLinks(nil,nil,"Buy |Hitem:1|h[Espada]|h please")
  assert(message=="Buy |Hitem:1|h[中文剑]|h please")
  function GetItemInfo() return "客户端精确名称" end
  local _,native=A.TranslateChatItemLinks(nil,nil,"|Hitem:1|h[Espada]|h")
  assert(native=="|Hitem:1|h[客户端精确名称]|h")
`));

test('NPC titles and static spell/aura text follow tooltip identity across refreshes',()=>run(`
  local tip=GameTooltip
  function UnitGUID() return "Creature-0-1-2-3-19-0001" end
  local player=false;function UnitIsPlayer() return player end
  D.NPCTitles[19]={[A.NameFingerprint("Weaponsmith")]="武器锻造师"}
  D.NPCLabelNames[19]={[A.NameFingerprint("Smith")]="铁匠"}
  tip.lineCount=3;tip.shown=false;tip.unit="mouseover";tip.unitName="Smith"
  for i,text in ipairs({"Smith","Weaponsmith","Level 20"}) do _G["GameTooltipTextLeft"..i]=Widget(text) end
  tip:Fire("OnTooltipSetUnit");tip:Show()
  assert(GameTooltipTextLeft1.text=="铁匠" and GameTooltipTextLeft2.text=="武器锻造师")
  assert(GameTooltipTextLeft3.text=="Level 20")
  LegionChineseSettings={enabled=false};A.RefreshExtraTooltips();assert(GameTooltipTextLeft2.text=="武器锻造师")
  tip:Fire("OnTooltipCleared");player=true;GameTooltipTextLeft2:SetText("Weaponsmith");tip:Fire("OnTooltipSetUnit")
  assert(GameTooltipTextLeft2.text=="Weaponsmith")
  tip:Fire("OnTooltipCleared");tip.unit=nil;tip.unitName=nil;tip.spell="Test";tip.spellID=42
  D.SpellTexts[42]={Description={[A.NameFingerprint("A static effect.")]="静态法术说明。"},Aura={[A.NameFingerprint("A static effect.")]="静态光环说明。"}}
  GameTooltipTextLeft1:SetText("Test");GameTooltipTextLeft2:SetText("A static effect.");tip:Fire("OnTooltipSetSpell")
  assert(GameTooltipTextLeft2.text=="静态法术说明。")
  A.UpdateExtraTooltip(tip,"aura",42);assert(GameTooltipTextLeft2.text=="静态光环说明。")
  A.RefreshExtraTooltips();assert(GameTooltipTextLeft2.text=="静态光环说明。")
  tip:Fire("OnTooltipCleared");GameTooltipTextLeft2:SetText("Different server effect: 123 damage.");tip:Fire("OnTooltipSetSpell")
  assert(GameTooltipTextLeft2.text=="Different server effect: 123 damage.")
`));

test('NPC tooltip lookups initialize creature data without loading unrelated spells',()=>run(`
  local creatureLoads,spellLoads=0,0
  A.Data.Configure({
    Creatures={count=1,families={"NPCTitles","NPCLabelNames"},scopes={}},
    Spells={count=1,families={"SpellTexts","Spells","DynamicSpellTexts"},scopes={}}
  })
  A.Data.Register("Creatures",function()
    creatureLoads=creatureLoads+1
    D.NPCTitles[19]={[A.NameFingerprint("Weaponsmith")]="武器锻造师"}
    D.NPCLabelNames[19]={[A.NameFingerprint("Smith")]="铁匠"}
  end)
  A.Data.Register("Spells",function()
    spellLoads=spellLoads+1
    D.SpellTexts[42]={Description={[A.NameFingerprint("A static effect.")]="静态法术说明。"}}
  end)
  local tip=GameTooltip
  function UnitGUID() return "Creature-0-1-2-3-19-0001" end
  function UnitIsPlayer() return false end
  tip.lineCount=2;tip.shown=false;tip.unit="mouseover";tip.unitName="Smith"
  GameTooltipTextLeft1=Widget("Smith");GameTooltipTextLeft2=Widget("Weaponsmith")
  tip:Fire("OnTooltipSetUnit");tip:Show();A.RefreshExtraTooltips()
  assert(GameTooltipTextLeft1.text=="铁匠" and GameTooltipTextLeft2.text=="武器锻造师")
  assert(creatureLoads==1 and spellLoads==0 and rawget(D,"SpellTexts")==nil,
    "NPC tooltip must not initialize the spell category")
  tip:Fire("OnTooltipCleared");tip.unit=nil;tip.unitName=nil;tip.spell="Test";tip.spellID=42
  GameTooltipTextLeft1:SetText("Test");GameTooltipTextLeft2:SetText("A static effect.")
  tip:Fire("OnTooltipSetSpell");A.RefreshExtraTooltips()
  assert(GameTooltipTextLeft2.text=="静态法术说明。" and spellLoads==1)
`));

test('NPC say/yell filters never translate ordinary player chat',()=>run(`
  local key=A.Fingerprint(A.Normalize("Welcome, traveler."));D.Gossip[key]=1;D.Strings[1]="欢迎，旅行者。"
  for _,event in ipairs({"CHAT_MSG_MONSTER_SAY","CHAT_MSG_MONSTER_YELL","CHAT_MSG_MONSTER_WHISPER","CHAT_MSG_RAID_BOSS_WHISPER"}) do
    local filtered,text,author,last=A.TranslateMonsterMessage(nil,event,"Welcome, traveler.","Guide","tail")
    assert(not filtered and text=="欢迎，旅行者。" and author=="Guide" and last=="tail")
  end
  assert(select(2,A.TranslateMonsterMessage(nil,"CHAT_MSG_SAY","Welcome, traveler.","Player"))==nil)
  assert(select(2,A.TranslateChatItemLinks(nil,nil,"Welcome, traveler."))==nil)
  D.Gossip[A.Fingerprint(A.Normalize("%s waves."))]=2;D.Strings[2]="%s挥了挥手。"
  assert(select(2,A.TranslateMonsterMessage(nil,"CHAT_MSG_MONSTER_SAY","Guide waves.","Guide"))==nil)
  assert(select(2,A.TranslateMonsterMessage(nil,"CHAT_MSG_MONSTER_SAY","%s waves.","Guide"))==nil)
  D.Gossip[A.Fingerprint(A.Normalize("100% guaranteed."))]=3;D.Strings[3]="100%保证。"
  assert(select(2,A.TranslateMonsterMessage(nil,"CHAT_MSG_MONSTER_SAY","100% guaranteed.","Guide"))=="100%%保证。")
`));

test('offline semantic link dictionaries keep payloads and native Chinese API names',()=>run(`
  D.LinkNames.Achievement[1]="中文成就";D.LinkNames.Currency[1]="中文货币";D.LinkNames.BattlePet[1]="中文宠物"
  D.LinkNames.BattlePetAbility[1]="中文技能";D.LinkNames.Encounter[1]="中文首领";D.LinkNames.JournalSection[1]="中文章节"
  for _,pair in ipairs({{"achievement:1","中文成就"},{"currency:1","中文货币"},{"battlepet:1","中文宠物"},{"battlePetAbil:1","中文技能"},{"journal:1:1:15","中文首领"},{"journal:2:1:15","中文章节"}}) do
    local _,text=A.TranslateChatItemLinks(nil,nil,"|H"..pair[1].."|h[Unknown]|h")
    assert(text=="|H"..pair[1].."|h["..pair[2].."]|h",pair[1])
  end
`));

test('book context clears when another book opens',()=>run(`
  local root=A.Fingerprint(A.Normalize("Book one"));local ending=A.Fingerprint(A.Normalize("The end"))
  D.BookContexts[root]={[2]={[ending]=1}};D.Strings[1]="第一本书的结尾。"
  local page=1;function ItemTextGetPage() return page end
  bookText="Book one";ItemTextFrame:Fire("OnEvent","ITEM_TEXT_BEGIN");ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY")
  page=2;bookText="The end";ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY")
  assert(ItemTextPageText.text=="第一本书的结尾。")
  ItemTextFrame:Fire("OnEvent","ITEM_TEXT_CLOSED");ItemTextFrame:Fire("OnEvent","ITEM_TEXT_BEGIN")
  page=1;bookText="Different book";ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY")
  page=2;bookText="The end";ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY")
  assert(ItemTextPageText.text=="The end")
`));

test('quest portraits use giver versus turn-in fields, quest identity and native text layout',()=>run(`
  D.Strings[1]="接取任务的角色介绍。";D.Strings[2]="交付任务的角色介绍。";D.Strings[3]="任务角色"
  local textKey=A.Fingerprint(A.Normalize("Character story"));local nameKey=A.Fingerprint(A.Normalize("Character"))
  D.QuestExtras[1]={PortraitGiverText={[textKey]=1},PortraitTurnInText={[textKey]=2},PortraitGiverName={[nameKey]=3}}
  QuestFrame={};local reward=false;QuestFrameRewardPanel={IsShown=function() return reward end}
  QuestNPCModelText=Widget("Character story");QuestNPCModelNameText=Widget("Character")
  local resized=0;function QuestFrame_UpdatePortraitText(text) resized=resized+1;QuestNPCModelText:SetText(text) end
  A.UpdateQuestPortrait(QuestFrame,5,"Character story","Character")
  assert(QuestNPCModelText.text=="接取任务的角色介绍。" and QuestNPCModelNameText.text=="任务角色" and resized==1)
  reward=true;QuestNPCModelText:SetText("Character story");A.UpdateQuestPortrait(QuestFrame,5,"Character story","Character")
  assert(QuestNPCModelText.text=="交付任务的角色介绍。")
  questID=2;QuestNPCModelText:SetText("Character story");A.UpdateQuestPortrait(QuestFrame,5,"Character story","Character")
  assert(QuestNPCModelText.text=="Character story")
`));

test('7.3.5 aura setters choose the eleventh API result and translate ranks on the right',()=>run(`
  D.SpellTexts[42]={Description={[A.NameFingerprint("Static effect") ]="法术正文"},Aura={[A.NameFingerprint("Static effect") ]="光环正文"},Rank={[A.NameFingerprint("Passive") ]="被动"}}
  GameTooltipTextLeft1=Widget("Spell");GameTooltipTextLeft2=Widget("Static effect");GameTooltipTextRight1=Widget("Passive")
  GameTooltip:SetUnitBuff("player",1)
  assert(GameTooltipTextLeft2.text=="光环正文" and GameTooltipTextRight1.text=="被动")
  A.RefreshExtraTooltips()
  assert(GameTooltipTextLeft2.text=="光环正文" and GameTooltipTextRight1.text=="被动")
`, `
  function UnitBuff() return "Spell","Rank",nil,nil,nil,nil,nil,nil,nil,true,42 end
  function GameTooltip:SetUnitBuff()
    self:Fire("OnTooltipCleared");self.lineCount=2;self.spell="Spell";self.spellID=42
    self:Fire("OnTooltipSetSpell");self:Show()
  end
`));

test('reviewed context exceptions remain bound to the precise before-and-after quest context',async()=>{
  const {importReviewedDialogue}=await import('../scripts/quest-dialogue.mjs');
  const all=JSON.parse(readFixtureFile(new URL('data/reviewed-quest-dialogue.json',root)));
  all.quests=all.quests.filter(q=>[26177,26488,29412,30027].includes(q.id));
  const base=new Map(all.quests.map(q=>[String(q.id),{ID:q.id,VerifiedBuild:26972,LogTitle:q.identity.title,LogDescription:q.identity.objectives,QuestDescription:q.identity.description}]));
  assert.equal(importReviewedDialogue(all,base).audit.fields,7);
  const q=all.quests.find(q=>q.id===26177);q.legacyIdentity.objectives='Catch 1000 crabs.';
  const result=importReviewedDialogue(all,base);
  assert.equal(result.audit.fields,5);assert.equal(result.audit.rejected,2);
});

test('shipped quest extras resolve required quantities, class titles and portrait fields through Lua',()=>{
  const snapshot=JSON.parse(readFixtureFile(new URL('data/translation-extras.json',root)));
  const audit=JSON.parse(readFixtureFile(new URL('docs/translation-extras-audit.json',root)));
  const wanted=new Map();
  for(const field of Object.keys(audit.byField)){
    const r=audit.records.find(r=>r.field===field);wanted.set(r.id+':'+field,r);
  }
  for(const r of audit.records)if([31737,9065,43409].includes(r.id)||r.locale==='zhTW'&&!wanted.has('traditional')){
    wanted.set(r.locale==='zhTW'?'traditional':r.id+':'+r.field,r);
  }
  const ids=new Set([...wanted.values()].map(r=>r.id));
  const rows=readFixtureFile(new URL('Data/QuestExtras_01.lua',addon),'utf8').split('\n').filter(line=>ids.has(+line.match(/^D\.QuestExtras\[(\d+)\]=/)?.[1]));
  assert.equal(rows.length,ids.size);
  const stringIDs=new Set(rows.flatMap(row=>[...row.matchAll(/\]=([0-9]+)/g)].map(m=>+m[1])));
  const strings=[];
  for(const file of listFixtureFiles(new URL('Data/',addon)).filter(f=>/^Strings_/.test(f))){
    for(const line of readFixtureFile(new URL('Data/'+file,addon),'utf8').split('\n'))
      if(stringIDs.has(+line.match(/^D\.Strings\[(\d+)\]=/)?.[1]))strings.push(line);
  }
  assert.equal(strings.length,stringIDs.size);
  const checks=[];
  for(const record of wanted.values()){
    const q=snapshot.quests.find(q=>q.id===record.id),field=q.fields[record.field];
    const character=snapshot.classes.find(c=>c.id===8);
    const options={objectives:q.objectives,character,female:false};
    const en=expandQuestText(field.english,{...options,locale:'enUS'});
    const zh=expandQuestText(field.text,{...options,locale:field.locale});
    assert.ok(en&&hasChinese(zh),record.id+':'+record.field);
    // A real client expands line breaks and player tokens before displaying text.
    const source=en.replace(/\$[Bb]/g,'\n').replace(/\$[Nn]/g,'Alice');
    checks.push(`do local original=${luaString(source)};local expected=A.Render(${luaString(zh)})
      assert(expected and A.Render(A.FindQuestExtra(${record.id},${luaString(record.field)},original))==expected,${luaString(record.id+':'+record.field)})
      assert(A.FindQuestExtra(${record.id},${luaString(record.field)},original.." Changed by server.")==nil)
      assert(A.FindQuestExtra(999999,${luaString(record.field)},original)==nil)
      assert(A.FindQuestExtra(${record.id},${luaString(record.field)},"已有中文。") == nil)
    end`);
  }
  run(rows.join('\n')+'\n'+strings.join('\n')+'\n'+checks.join('\n'));
});

test('generated client dictionaries and quest extras retain exact input checksums and declared counts',()=>{
  const manifest=JSON.parse(readFixtureFile(new URL('sources.json',root)));
  const audit=JSON.parse(readFixtureFile(new URL('docs/extra-client-data-audit.json',root)));
  const sources=[...manifest.itemDescriptionTables,...manifest.clientTables,...manifest.extraLinkTables];
  for(const source of audit.sources){
    assert.equal(source.build,'7.3.5.26972');
    assert.deepEqual(source,sources.find(s=>s.table===source.table&&s.locale===source.locale));
  }
  const rows={items:0,titles:0,names:0,Description:0,Aura:0,Rank:0};
  for(const file of listFixtureFiles(new URL('Data/',addon)).filter(f=>/^(ItemNames|NPCTitles|NPCLabelNames|SpellTexts)_/.test(f))){
    const text=readFixtureFile(new URL('Data/'+file,addon),'utf8');
    for(const [pattern,key]of [[/^D\.ItemNames\[/gm,'items'],[/^D\.NPCTitles\[/gm,'titles'],[/^D\.NPCLabelNames\[/gm,'names'],[/Description=\{/g,'Description'],[/Aura=\{/g,'Aura'],[/Rank=\{/g,'Rank']])rows[key]+=[...text.matchAll(pattern)].length;
  }
  assert.equal(rows.items,audit.counts.items.ids);assert.equal(rows.titles,audit.counts.npcs.titles);assert.equal(rows.names,audit.counts.npcs.names);
  for(const field of ['Description','Aura','Rank'])assert.equal(rows[field],audit.counts.spells[field].ids);
  const bytes=readFixtureFile(new URL(manifest.translationExtras.file,root));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.translationExtras.sha256);
});
