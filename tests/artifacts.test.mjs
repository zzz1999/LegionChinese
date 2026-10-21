import {readFixtureFile,listFixtureFiles} from './addon-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {ARTIFACT_BUILD,chooseCondition,reviewedChoices,buildArtifacts} from '../scripts/artifacts.mjs';
import {luaString,normalize,fingerprint} from '../scripts/text.mjs';
import {nameKey} from '../scripts/client-names.mjs';

const root=new URL('../',import.meta.url),addon=new URL('AddOns/LegionChinese/',root);
const snapshot=JSON.parse(readFixtureFile(new URL('data/artifact-choice-reviews.json',root)));
const manifest=JSON.parse(readFixtureFile(new URL('sources.json',root)));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

test('every collected choice has a field decision; only six complete descriptions pass review',()=>{
  assert.equal(snapshot.reviews.length,29);
  for(const row of snapshot.reviews)for(const field of ['Question','Header','Answer','Description']){
    assert.ok(['accept','defer'].includes(row.fields[field].decision));assert.ok(row.fields[field].reason);
  }
  const {choices,audit}=reviewedChoices(snapshot);
  assert.equal(audit.descriptions,6);assert.equal(audit.choices,5);assert.equal(audit.options,16);assert.equal(audit.fields,43);
  assert.equal(choices.has(266),false,'wrong-class Shaman rows must not ship');
  for(const id of [541,542,543])assert.equal(choices.get(253).Options.get(id).Description,undefined);
  assert.equal(choices.get(247).Options.get(545).Description,undefined,'lost contact does not establish a vanished staff');
  const frost=snapshot.reviews.find(r=>r.responseID===586).fields.Description;
  const index=choices.get(265).Options.get(586).Description;
  assert.equal(index.get(fingerprint(normalize(frost.original))).text,frost.text);
  assert.equal(index.has(fingerprint(normalize(frost.sourceOriginal))),false,'never match a truncated English prefix');
  assert.equal(sha(readFixtureFile(new URL(manifest.artifactChoiceReviews.file,root))),manifest.artifactChoiceReviews.sha256);
  for(const source of manifest.artifactTables)assert.equal(source.build,ARTIFACT_BUILD);
});

test('reviewed choice imports reject version drift, absent context and conflicting translations',()=>{
  const input=structuredClone(snapshot),run=()=>reviewedChoices(input);
  input.build='8.0.1.27843';assert.throws(run,/build/);input.build=ARTIFACT_BUILD;
  const row=input.reviews.find(r=>r.fields.Description.decision==='accept');
  row.build=27843;assert.throws(run,/Unsafe/);row.build=26654;
  row.responseID=0;assert.throws(run,/context/);row.responseID=584;
  row.fields.Description.original='已有中文';assert.throws(run,/Unsafe/);
  const conflicting=structuredClone(snapshot);const copy=structuredClone(conflicting.reviews.find(r=>r.responseID===584));
  copy.fields.Header.text='错误专精';conflicting.reviews.push(copy);assert.throws(()=>reviewedChoices(conflicting),/Conflicting/);
});

test('unlock conditions allow only known paragraph/class tokens and fall back to Traditional',()=>{
  assert.equal(chooseCondition('Complete the $c campaign.$BWin 10 battles.','完成$c战役。$b赢得10场战斗。','完成戰役。').locale,'zhCN');
  assert.equal(chooseCondition('Win 10 battles.','错误 $s1','贏得10場戰鬥。').locale,'zhTW');
  for(const original of ['Deals $s1 damage.','Value $AP.','Requirement $123w.','已有中文',''])assert.equal(chooseCondition(original,'中文','中文'),undefined);
});

function fixtureBuild(){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lcn-artifacts-'));
  fs.mkdirSync(path.join(folder,'AddOns/LegionChinese/Data'),{recursive:true});fs.mkdirSync(path.join(folder,'docs'));
  const m={artifactTables:[]};
  const table=(name,header,rows,locale)=>{
    const bytes=Buffer.from([header,...rows].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n')+'\n');
    const file=name+'-'+locale+'.csv';fs.writeFileSync(path.join(folder,file),bytes);
    m.artifactTables.push({table:name,locale,build:ARTIFACT_BUILD,file,sha256:sha(bytes)});
  };
  for(const [locale,weapon,set,appearance,condition]of [['enUS','Blade','Flames','Red blade','Win 10 battles.'],['zhCN','Blade','烈焰','赤红剑刃','赢得10场战斗。'],['zhTW','神兵之刃','烈焰外觀','赤紅劍刃','贏得10場戰鬥。']]){
    table('Artifact',['ID','Name_lang','Flags'],[[1,weapon,0]],locale);
    table('ArtifactAppearanceSet',['ID','Name_lang','Description_lang','ArtifactID'],[[2,set,'',1]],locale);
    table('ArtifactAppearance',['ID','Name_lang','ArtifactAppearanceSetID','UnlockPlayerConditionID'],[[3,appearance,2,4]],locale);
    table('PlayerCondition',['ID','Failure_description_lang'],[[4,condition]],locale);
  }
  table('ArtifactPower',['ID','ArtifactID'],[[5,1]],'enUS');
  table('ArtifactPowerRank',['ID','ArtifactPowerID','SpellID'],[[6,5,7],[8,5,9],[10,99,12]],'enUS');
  const bytes=Buffer.from(JSON.stringify({schema:1,build:ARTIFACT_BUILD,sources:[],reviews:[]}));
  fs.writeFileSync(path.join(folder,'review.json'),bytes);m.artifactChoiceReviews={file:'review.json',sha256:sha(bytes)};
  return {folder,m,run:()=>buildArtifacts({root:folder,input:folder,manifest:m,version:'test'}),cleanup:()=>{
    assert.equal(path.dirname(path.resolve(folder)),path.resolve(os.tmpdir()));assert.ok(path.basename(folder).startsWith('lcn-artifacts-'));
    fs.rmSync(folder,{recursive:true,force:true});
  }};
}

test('artifact builds join IDs and locales, verify checksums and reject later client exports',()=>{
  const f=fixtureBuild();try{
    const result=f.run();assert.deepEqual(result.audit.counts.artifacts,{ids:1,zhCN:0,zhTW:1});
    assert.equal(result.audit.counts.traitSpellIDs,2);
    const output=readFixtureFile(path.join(f.folder,'AddOns/LegionChinese/Data/Artifacts.lua'),'utf8');
    assert.ok(output.includes('神兵之刃'));assert.ok(output.includes('D.ArtifactPowerSpells[5]={[7]=true,[9]=true}'));
    assert.ok(!output.includes('D.ArtifactPowerSpells[99]'));
    f.m.artifactTables[0].build='8.0.1.27843';assert.throws(f.run,/Unsupported/);f.m.artifactTables[0].build=ARTIFACT_BUILD;
    f.m.artifactTables[0].sha256='wrong';assert.throws(f.run,/checksum/);
  }finally{f.cleanup();}
});

test('locale rows with changed artifact identity cannot supply names',()=>{
  const f=fixtureBuild();try{
    const source=f.m.artifactTables.find(s=>s.table==='ArtifactAppearance'&&s.locale==='zhCN');
    const file=path.join(f.folder,source.file),bytes=readFixtureFile(file,'utf8').replace('"2","4"','"9","4"');
    fs.writeFileSync(file,bytes);source.sha256=sha(bytes);assert.throws(f.run,/metadata mismatch/);
  }finally{f.cleanup();}
});

function run(code,before=''){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{const status=lauxlib.luaL_dostring(L,to_luastring(source));assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));};
  try{
    for(const file of ['Bootstrap.lua','Data/Artifacts.lua','Core.lua','ClientNames.lua','ExtraTooltips.lua','Artifacts.lua'])execute(readFixtureFile(new URL(file,addon),'utf8'));
    for(const file of ['ui-fixture.lua','world-tooltip-fixture.lua','artifact-fixture.lua'])execute(readFixtureFile(new URL(file,import.meta.url),'utf8'));
    execute(before);execute(readFixtureFile(new URL('UI.lua',addon),'utf8'));
    execute('local A,D=LegionChinese,LegionChineseDB\n'+code);
  }finally{lua.lua_close(L);}
}
const arcane=snapshot.reviews.find(r=>r.responseID===584);

test('lazy-loaded choices translate before native measurement and do not create a resize loop',()=>run(`
  assert(QuestChoiceFrame==nil)
  LoadArtifactFrames();frames[1]:Fire("OnEvent","ADDON_LOADED","Blizzard_QuestChoice")
  choiceInfo.options={{id=584,header="Arcane",description=${luaString(arcane.fields.Description.original)}}}
  QuestChoiceFrame:Update()
  local option=QuestChoiceFrame.Options[1]
  assert(option.OptionText:GetText()==${luaString(arcane.fields.Description.text)})
  assert(option.Header.Text:GetText()=="奥术" and option.OptionButton:GetText()=="选择")
  assert(option.optID==584 and option.confirmationText=="CONFIRM_ARTIFACT_CHOICE")
  assert(QuestChoiceFrame.height==480+(136+180)-278)
  assert(QuestChoiceFrame.hasPendingUpdate)
  QuestChoiceFrame:Update();assert(not QuestChoiceFrame.hasPendingUpdate and QuestChoiceFrame.updates==2)
  local writes=option.OptionText.writes
  frames[1]:Fire("OnEvent","ADDON_LOADED","UnrelatedAddon")
  QuestChoiceFrame:Update();assert(option.OptionText.writes-writes==2,"hooks installed once")
  assert(option.OptionText.fontChanges==0,"use the native Chinese font")
  choiceInfo.options[1].id=585;QuestChoiceFrame:Update()
  assert(option.OptionText:GetText()==${luaString(arcane.fields.Description.original)},"wrong response must not translate")
  choiceInfo.id=266;choiceInfo.options[1].id=584;QuestChoiceFrame:Update()
  assert(option.OptionText:GetText()==${luaString(arcane.fields.Description.original)},"wrong choice must not translate")
  choiceInfo.id=265;choiceInfo.options[1].description="原有繁體中文";QuestChoiceFrame:Update()
  assert(option.OptionText:GetText()=="原有繁體中文")
  choiceInfo.options[1].description=${luaString(arcane.fields.Description.original+' Custom sentence.')};QuestChoiceFrame:Update()
  assert(option.OptionText:GetText()==choiceInfo.options[1].description)
`));

test('all accepted descriptions are reachable; rejected fragments and modified options keep their text',()=>run(
  snapshot.reviews.filter(r=>r.fields.Description.decision==='accept').map(r=>{
    const d=r.fields.Description;
    return `assert(A.ResolveArtifactChoice(${r.choiceID},${r.responseID},"Description",${luaString(d.original)})==${luaString(d.text)})\n`
      +`assert(A.ResolveArtifactChoice(${r.choiceID},${r.responseID},"Description",${luaString(d.original+' Extra.')})==nil)\n`
      +(d.sourceOriginal?`assert(A.ResolveArtifactChoice(${r.choiceID},${r.responseID},"Description",${luaString(d.sourceOriginal)})==nil)\n`:'');
  }).join('')
));

test('SimpleHTML choice descriptions without GetText retain their SetText translation before native layout',()=>run(`
  LoadArtifactFrames()
  local option=QuestChoiceFrame.Options[1]
  option.OptionText.GetText=nil
  choiceInfo={id=265,question="Which weapon should we pursue first?",options={{id=584,
    header="Arcane",answer="Select",description=${luaString(arcane.fields.Description.original)}}}}
  frames[1]:Fire("OnEvent","ADDON_LOADED","Blizzard_QuestChoice")
  QuestChoiceFrame:Update()
  assert(option.OptionText.text==${luaString(arcane.fields.Description.text)})
  assert(QuestChoiceFrame.height==480+(136+180)-278)
  QuestChoiceFrame:Update();assert(not QuestChoiceFrame.hasPendingUpdate)
`));

test('artifact appearances reuse pool slots without carrying old names or unlock conditions',()=>run(`
  LoadArtifactFrames();frames[1]:Fire("OnEvent","ADDON_LOADED","Blizzard_ArtifactUI")
  local tab=ArtifactFrame.AppearancesTab
  D.ArtifactAppearanceSets[1]={ArtifactID=2,Name={[A.NameFingerprint("Flames")]="烈焰"}}
  D.ArtifactAppearances[90001]={SetID=1,ConditionID=90002,Name={[A.NameFingerprint("Red blade")]="赤红剑刃"}}
  D.ArtifactConditions[90002]={[A.Fingerprint(A.Normalize("Win 10 battles."))]="赢得10场战斗。"}
  appearanceRows={{id=90001,name="Flames",condition="Win 10 battles.",unlocked=false}}
  tab:Refresh();assert(tab.sets[1].Name:GetText()=="烈焰")
  local slot=tab.slots[1];slot:Fire("OnEnter")
  assert(GameTooltipTextLeft1:GetText()=="赢得10场战斗。" and slot.appearanceUnlocked==false)
  assert(slot.unlockConditionText=="Win 10 battles.","native condition remains unchanged")
  appearanceRows[1]={id=90001,name="原有中文",condition="Win 20 battles.",unlocked=true};tab:Refresh()
  assert(tab.slots[1]==slot and slot.unlockConditionText=="Win 20 battles." and slot.appearanceUnlocked)
  assert(tab.sets[1].Name:GetText()=="原有中文")
  slot:Fire("OnEnter");assert(GameTooltipTextLeft1:GetText()=="Win 20 battles.")
  appearanceRows[1]={id=999999,name="Unknown appearance",condition="Win 10 battles."};tab:Refresh()
  assert(slot.unlockConditionText=="Win 10 battles." and tab.sets[1].Name:GetText()=="Unknown appearance")
  slot:Fire("OnEnter");assert(GameTooltipTextLeft1:GetText()=="Win 10 battles.")
  assert(#slot.scriptHooks.OnEnter==1,"pooled slots are hooked once")
  D.ArtifactConditions[90002]={[A.Fingerprint(A.Normalize("Complete the $c campaign.$BWin 10 battles."))]="完成$c战役。$b赢得10场战斗。"}
  function UnitClass() return "法师","MAGE" end
  assert(A.ResolveArtifactCondition(90001,"Complete the Mage campaign.\\nWin 10 battles.")=="完成法师战役。\\n赢得10场战斗。")
`));

test('artifact titles and queued banners preserve Chinese and respect the current appearance context',()=>run(`
  LoadArtifactFrames();frames[1]:Fire("OnEvent","ADDON_LOADED","Blizzard_ArtifactUI")
  D.ArtifactNames[2]={[A.NameFingerprint("Ashbringer")]="灰烬使者"}
  D.ArtifactAppearanceSets[90001]={ArtifactID=2}
  D.ArtifactAppearances[90002]={SetID=90001,Name={[A.NameFingerprint("Flaming Ashbringer")]="烈焰使者"}}
  artifactInfo.appearanceID=90002;ArtifactFrame.PerksTab.TitleContainer:RefreshTitle()
  assert(ArtifactFrame.PerksTab.TitleContainer.ArtifactName:GetText()=="灰烬使者")
  artifactInfo.title="Flaming Ashbringer";ArtifactFrame.PerksTab.TitleContainer:RefreshTitle()
  assert(ArtifactFrame.PerksTab.TitleContainer.ArtifactName:GetText()=="烈焰使者")
  artifactInfo.title="原有中文";ArtifactFrame.PerksTab.TitleContainer:RefreshTitle()
  assert(ArtifactFrame.PerksTab.TitleContainer.ArtifactName:GetText()=="原有中文")
  D.ArtifactTitleNames[A.NameFingerprint("Blade") ]="神兵之刃"
  ArtifactLevelUpToast:PlayBanner({name="Blade"});assert(ArtifactLevelUpToast.ArtifactName:GetText()=="神兵之刃")
  assert(A.ResolveArtifactTitle("Blade",90002)==nil,"known different artifact must not use another title")
  assert(A.ResolveArtifactTitle("Unknown blade")==nil)
`));

test('artifact traits use the live rank, translate only fixed text, and clear context on tooltip reuse',()=>run(`
  D.ArtifactPowerSpells[1]={[11]=true,[12]=true}
  D.Spells[11]=1;D.Spells[12]=2;D.NameStrings[1]="初级特质";D.NameStrings[2]="高级特质"
  D.SpellTexts[11]={Description={[A.NameFingerprint("Static effect.")]="固定效果。"}}
  powerInfo[1]={spellID=11,currentRank=1};powerLines[1]={"Trait","Rank 1/3","Static effect.","Deals 123 damage."}
  GameTooltip:SetArtifactPowerByID(1)
  assert(GameTooltipTextLeft1:GetText()=="初级特质")
  assert(GameTooltipTextLeft2:GetText()=="Rank 1/3" and GameTooltipTextLeft3:GetText()=="固定效果。")
  assert(GameTooltipTextLeft4:GetText()=="Deals 123 damage.")
  powerInfo[1]={spellID=12,currentRank=2};powerLines[1]={"Trait","Rank 2/3","Deals 456 damage."}
  GameTooltip:SetArtifactPowerByID(1)
  assert(GameTooltipTextLeft1:GetText()=="高级特质" and GameTooltipTextLeft3:GetText()=="Deals 456 damage.")
  powerInfo[1]={spellID=99};powerLines[1]={"Custom trait","Static effect."}
  GameTooltip:SetArtifactPowerByID(1);GameTooltip:Hide();GameTooltip:Show()
  assert(GameTooltipTextLeft1:GetText()=="Custom trait" and GameTooltipTextLeft2:GetText()=="Static effect.")
  powerInfo[1]=nil;GameTooltip:SetArtifactPowerByID(1);assert(GameTooltipTextLeft1:GetText()=="Custom trait")
`));
