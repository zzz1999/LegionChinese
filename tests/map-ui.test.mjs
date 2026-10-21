import {readFixtureFile,listFixtureFiles} from './addon-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {BOARD_BUILD,buildQuestBoards} from '../scripts/quest-boards.mjs';
import {fingerprint,normalize,luaString} from '../scripts/text.mjs';
import {ChineseTextIndex} from '../scripts/fallback.mjs';
import {QuestSourceIndex,addValidatedQuestTitles} from '../scripts/quest-sources.mjs';

const root=new URL('../',import.meta.url),addon=new URL('AddOns/LegionChinese/',root);
const review=JSON.parse(readFixtureFile(new URL('data/quest-board-reviews.json',root)));
const manifest=JSON.parse(readFixtureFile(new URL('sources.json',root)));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const key=fingerprint(normalize('A Recent Discovery'));
let shippedTitle;
function titleFixture(){
  if(shippedTitle)return shippedTitle;
  const dir=new URL('Data/',addon),files=listFixtureFiles(dir);
  let titleLine;
  for(const file of files.filter(f=>f.startsWith('Titles_'))){
    titleLine=readFixtureFile(new URL(file,dir),'utf8').split('\n').find(line=>line.includes('"'+key+'"'));
    if(titleLine)break;
  }
  assert.ok(titleLine,'the validated English title must be in the shipped lookup index');
  const id=titleLine.match(/=(\d+)$/)?.[1];assert.ok(id);
  let valueLine;
  for(const file of files.filter(f=>f.startsWith('Strings_'))){
    valueLine=readFixtureFile(new URL(file,dir),'utf8').split('\n').find(line=>line.startsWith('D.Strings['+id+']='));
    if(valueLine)break;
  }
  assert.ok(valueLine?.includes('近期发现'));
  return shippedTitle='local D=LegionChineseDB\n'+titleLine+'\n'+valueLine;
}

function run(code,before=''){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    for(const file of ['Bootstrap.lua','Data/QuestBoards.lua','Core.lua','ClientNames.lua','QuestBoards.lua','Artifacts.lua','MapTooltips.lua'])
      execute(readFixtureFile(new URL(file,addon),'utf8'));
    execute(titleFixture());
    for(const file of ['ui-fixture.lua','world-tooltip-fixture.lua','artifact-fixture.lua','map-ui-fixture.lua'])
      execute(readFixtureFile(new URL(file,import.meta.url),'utf8'));
    execute(before);execute(readFixtureFile(new URL('UI.lua',addon),'utf8'));
    execute('local A,D=LegionChinese,LegionChineseDB\n'+code);
  }finally{lua.lua_close(L);}
}

test('new title sources require the same bilingual validation and still reject same-name ambiguity',()=>{
  const source={kind:'dialogue-world',file:'new.sql'},q={ID:'50341',LogTitle:'A Recent Discovery',VerifiedBuild:26365};
  const index=new QuestSourceIndex(),translations=new Map([['50341',{Title:'近期发现'}]]);
  index.collect('quest_template',q,source);
  assert.equal(index.finish(new Map(),translations).titleSources.size,0);
  index.collect('quest_template_locale',{...q,locale:'zhCN',LogTitle:'另一任务'},source);
  assert.equal(index.finish(new Map(),translations).titleSources.size,0);
  index.collect('quest_template_locale',{...q,locale:'zhCN',LogTitle:'近期发现'},source);
  const accepted=index.finish(new Map(),translations).titleSources;
  assert.deepEqual(accepted.get('50341'),[normalize('A Recent Discovery')]);
  const titles=new ChineseTextIndex();
  for(const form of accepted.get('50341'))titles.add('zhCN',form,'近期发现');
  titles.add('zhCN','A Recent Discovery','另外发现');
  titles.finish();assert.equal(titles.entries.has(key),false);
  assert.ok(titles.ambiguous.has(key));
});

test('forwarded titles retain supplement priority and cannot decode nested entities twice',()=>{
  const titles=new ChineseTextIndex(),supplement='Supplemented quest',encoded='Quest &amp;lt;name';
  titles.add('zhCN',supplement,'原有可靠译文',0);
  const normalized=normalize(encoded);
  addValidatedQuestTitles(titles,{titleSources:new Map([['1',[normalize(supplement)]],['2',[normalized]],['3',[normalize('New title')]]])},
    new Map([['1',{Title:'低优先级补充译文'}],['2',{Title:'嵌套实体'}],['3',{Title:'新增标题'}]]),
    new Map([['1',{locale:'zhCN',priority:-1}],['2',{locale:'zhCN',priority:0}],['3',{locale:'zhCN',priority:0}]]));
  titles.finish();
  assert.equal(titles.entries.get(fingerprint(normalize(supplement))),'原有可靠译文');
  assert.equal(titles.entries.has(fingerprint(normalize(normalized))),false);
  assert.equal(titles.entries.get(fingerprint(normalize('New title'))),'新增标题');
});

test('map available-quest titles use shipped Chinese before native sizing and preserve status lines',()=>run(`
  LoadMapTooltip();frames[1]:Fire("OnEvent","ADDON_LOADED","WorldMap")
  MapHover(WorldMapStoryLine1)
  assert(WorldMapTooltipTextLeft1:GetText()=="近期发现")
  assert(WorldMapTooltip.measuredTitle=="近期发现" and WorldMapTooltip.shows==1)
  assert(WorldMapTooltip.lines[1]=="可接任务" and WorldMapTooltip.lines[2]=="位于下层")
  assert(WorldMapTooltipTextLeft1.fontChanges==0)
  -- The same tooltip is refreshed without an OnShow transition.
  MapHover(WorldMapStoryLine2);assert(WorldMapTooltipTextLeft1:GetText()=="Unknown custom quest")
  MapHover(WorldMapStoryLine1);assert(WorldMapTooltipTextLeft1:GetText()=="近期发现")
  questLines[1]="原有繁體中文";MapHover(WorldMapStoryLine1)
  assert(WorldMapTooltipTextLeft1:GetText()=="原有繁體中文")
  questLines[1]="A Recent Discovery"
  D.Strings[D.Titles[A.Fingerprint(A.Normalize(questLines[1]))]]="无法解析 $s1"
  MapHover(WorldMapStoryLine1);assert(WorldMapTooltipTextLeft1:GetText()==questLines[1])
`));

test('map hooks reject non-quest owners, stale indices, mismatched live titles and forbidden widgets',()=>run(`
  LoadMapTooltip();frames[1]:Fire("OnEvent","ADDON_LOADED","WorldMap")
  local original="A Recent Discovery"
  for _,kind in ipairs({"owner","missingGlobal","index","stale","modified","tooltip","pin","widget"}) do
    local pin=WorldMapStoryLine1;pin.index=1;questLines[1]=original
    WorldMapTooltip:SetOwner(pin);local saved=WorldMapStoryLine1
    if kind=="owner" then WorldMapTooltip.owner={GetName=function() return "OtherMapPin" end}
    elseif kind=="missingGlobal" then WorldMapStoryLine1=nil
    elseif kind=="index" then pin.index=99
    elseif kind=="stale" then questLines[1]="Other quest"
    elseif kind=="modified" then questLines[1]=original.." modified"
    elseif kind=="tooltip" then WorldMapTooltip.forbidden=true
    elseif kind=="pin" then pin.forbidden=true
    elseif kind=="widget" then WorldMapTooltipTextLeft1.IsForbidden=function() return true end end
    WorldMapTooltip:SetText(original)
    assert(WorldMapTooltipTextLeft1:GetText()==original,kind)
    WorldMapStoryLine1=saved;pin.forbidden=nil;WorldMapTooltip.forbidden=nil;WorldMapTooltipTextLeft1.IsForbidden=nil
  end
`));

test('map hooks survive lazy load once and native English clients use the built-in Chinese font',()=>run(`
  assert(WorldMapTooltip==nil)
  LoadMapTooltip()
  for i=1,3 do frames[1]:Fire("OnEvent","ADDON_LOADED","OtherAddon") end
  function GetLocale() return "enUS" end
  function WorldMapTooltipTextLeft1:SetFont(font) self.font=font;self.fontChanges=self.fontChanges+1;return true end
  local calls=0;local find=A.Find
  A.Find=function(...) calls=calls+1;return find(...) end
  MapHover(WorldMapStoryLine1)
  assert(calls==1 and WorldMapTooltip.nativeSets==1 and WorldMapTooltip.shows==1)
  assert(WorldMapTooltipTextLeft1.font=="Fonts\\\\ARKai_T.ttf")
  assert(WorldMapTooltip.scriptHooks.OnUpdate==nil)
`));

const board=`choiceInfo={id=999,question=${luaString(review.question)},options={
  {id=101,header="Azshara",answer="Defend Orgrimmar",description="Uncollected description"},
  {id=102,header="Northern Barrens",answer="Defend the Barrens",description="Uncollected description"},
  {id=103,header="Silverpine Forest",answer="Defeat the Gilneans",description="Uncollected description"}
}}`;
test('board headers translate through the original choice UI while all unverified fields remain unchanged',()=>run(`
  LoadArtifactFrames();frames[1]:Fire("OnEvent","ADDON_LOADED","Blizzard_QuestChoice")
  ${board}
  QuestChoiceFrame:Update()
  assert(QuestChoiceFrame.QuestionText:GetText()==choiceInfo.question)
  for i,name in ipairs({"艾萨拉","北贫瘠之地","银松森林"}) do
    local option=QuestChoiceFrame.Options[i]
    assert(option.Header.Text:GetText()==name and option.Header.Text.fontChanges==0)
    assert(option.OptionButton:GetText()==choiceInfo.options[i].answer)
    assert(option.OptionText:GetText()=="Uncollected description")
    assert(option.optID==choiceInfo.options[i].id)
  end
  -- Repeated installation must not multiply lookups.
  for i=1,3 do frames[1]:Fire("OnEvent","ADDON_LOADED","OtherAddon") end
  local calls=0;local resolve=A.ResolveQuestBoardHeader
  A.ResolveQuestBoardHeader=function(...) calls=calls+1;return resolve(...) end
  QuestChoiceFrame:Update();assert(calls==3)
  assert(not QuestChoiceFrame.hasPendingUpdate)
`));

test('board lookup checks the live context and never imports different descriptions or stale response identities',()=>run(`
  ${board}
  assert(A.ResolveQuestBoardHeader(999,101,"Azshara")=="艾萨拉")
  assert(A.ResolveQuestBoardHeader(998,101,"Azshara")==nil)
  assert(A.ResolveQuestBoardHeader(999,102,"Azshara")==nil)
  assert(A.ResolveQuestBoardHeader(999,nil,"Azshara")==nil)
  assert(A.ResolveQuestBoardHeader(999,101,"艾萨拉")==nil)
  assert(A.ResolveQuestBoardHeader(999,101,"|Hspell:1|hAzshara|h")==nil)
  choiceInfo.question="Which weapon should we pursue first?"
  assert(A.ResolveQuestBoardHeader(999,101,"Azshara")==nil)
  choiceInfo.question=${luaString(review.question)}
  choiceInfo.options[1].header="A custom region"
  assert(A.ResolveQuestBoardHeader(999,101,"Azshara")==nil)
  assert(A.ResolveQuestBoardHeader(999,101,"A custom region")==nil)
`));

test('board audit keeps only verified names and records all other reported fields as deferred',()=>{
  const audit=JSON.parse(readFixtureFile(new URL('docs/map-ui-audit.json',root)));
  assert.deepEqual(audit.headers.map(r=>r.text),['艾萨拉','北贫瘠之地','银松森林']);
  assert.equal(audit.deferred.length,8);
  assert.ok(audit.deferred.some(r=>r.original==='Orgrimmar Portals'));
  assert.equal(hash(readFixtureFile(new URL(manifest.questBoardReviews.file,root))),manifest.questBoardReviews.sha256);
  for(const s of audit.sources){
    assert.equal(s.build,BOARD_BUILD);
    assert.deepEqual(s,manifest.questBoardTables.find(r=>r.locale===s.locale));
  }
});

test('board imports validate identity and build, with per-field Traditional fallback and no invented text',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lcn-map-ui-'));
  try{
    fs.mkdirSync(path.join(folder,'AddOns/LegionChinese/Data'),{recursive:true});fs.mkdirSync(path.join(folder,'docs'));
    const bytes=readFixtureFile(new URL('data/quest-board-reviews.json',root));fs.writeFileSync(path.join(folder,'review.json'),bytes);
    const m={questBoardReviews:{file:'review.json',sha256:hash(bytes)},questBoardTables:[]};
    for(const locale of ['enUS','zhCN','zhTW']){
      const rows=review.headers.map(r=>[r.id,locale==='zhTW'?'繁體名稱'+r.id:r.original,r.questID,r.mapAreaID,'Not the board description'].join(','));
      const bytes=Buffer.from('ID,Name_lang,QuestID,WorldMapAreaID,Description_lang\n'+rows.join('\n')+'\n');
      const file=locale+'.csv';fs.writeFileSync(path.join(folder,file),bytes);
      m.questBoardTables.push({table:'AdventureJournal',locale,build:BOARD_BUILD,file,sha256:hash(bytes)});
    }
    const build=()=>buildQuestBoards({root:folder,input:folder,manifest:m,version:'test'});
    const result=build();assert.ok(result.audit.headers.every(h=>h.locale==='zhTW'));
    assert.ok(!readFixtureFile(path.join(folder,'AddOns/LegionChinese/Data/QuestBoards.lua'),'utf8').includes('Not the board description'));
    m.questBoardTables[0].build='8.0.1.27843';assert.throws(build,/Unsupported/);m.questBoardTables[0].build=BOARD_BUILD;
    const source=m.questBoardTables[1],file=path.join(folder,source.file);
    const changed=readFixtureFile(file,'utf8').replace('28496','99999');fs.writeFileSync(file,changed);source.sha256=hash(changed);
    assert.throws(build,/metadata mismatch/);
    source.sha256='bad';assert.throws(build,/checksum/);
  }finally{
    assert.equal(path.dirname(path.resolve(folder)),path.resolve(os.tmpdir()));assert.ok(path.basename(folder).startsWith('lcn-map-ui-'));
    fs.rmSync(folder,{recursive:true,force:true});
  }
});
