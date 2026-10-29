import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {writeResourceChunks} from '../scripts/resource-writer.mjs';
import {poolSharedStrings} from '../scripts/shared-strings.mjs';
import {resourceSemantics,compareResources} from '../scripts/resource-equivalence.mjs';
import {organizeResources,loadPlan,renderTOC,validateLoadOrder,runtimeFiles} from '../scripts/resource-layout.mjs';
import {promoteBuild,removeBuildStage,withBuildStage,buildSourceHash} from '../scripts/build-transaction.mjs';

function temporary(work){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lcn-architecture-'));
  try{return work(root)}finally{
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('lcn-architecture-'));fs.rmSync(root,{recursive:true,force:true});
  }
}
function write(file,text){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text)}

test('shared pooling reduces bytes while retaining every original assignment and leaving short literals inline',()=>temporary(root=>{
  const text='这是具有可靠来源的一段很长的中文说明，不改变任何任务要求、名称或者实际数值。';
  writeResourceChunks({root,name:'Quests',lines:[`D.Quests[1]={Title=${JSON.stringify(text)},Description=${JSON.stringify(text)}}`,`D.Quests[2]={Title=${JSON.stringify(text)}}`,`D.Quests[3]={Title="短",Description="短"}`]});
  const before=resourceSemantics(path.join(root,'AddOns/LegionChinese/Data'));
  const pooled=poolSharedStrings(root),after=resourceSemantics(path.join(root,'AddOns/LegionChinese/Data'));
  assert.equal(pooled.strings,1);assert.ok(pooled.savedBytes>0);
  assert.equal(compareResources(before,after).equivalent,true);
  const body=fs.readFileSync(path.join(root,'AddOns/LegionChinese/Data/Quests_01.lua'),'utf8');
  assert.ok(body.includes('Title="短"'));assert.ok(body.includes('S[1]'));
}));

test('one registry verifies resource directories, duplicate entries, load order and modified payloads',()=>temporary(root=>{
  const addon=path.join(root,'AddOns/LegionChinese');
  writeResourceChunks({root,name:'Strings',lines:['D.Strings[1]="原有译文"']});
  for(const file of ['Bootstrap.lua',...runtimeFiles])write(path.join(addon,file),'-- fixture\n');
  organizeResources(addon);const plan=loadPlan(addon),toc=renderTOC('1.3.1',plan);
  assert.ok(plan.order.includes('Data/Shared/Strings_01.lua'));
  assert.equal(validateLoadOrder(addon,toc,plan).schema,1);
  assert.throws(()=>validateLoadOrder(addon,toc+'Core.lua\n',plan),/Duplicate/);
  const wrong=toc.replace('Bootstrap.lua','TEMP').replace('Core.lua','Bootstrap.lua').replace('TEMP','Core.lua');
  assert.throws(()=>validateLoadOrder(addon,wrong,plan),/dependencies/);
  fs.appendFileSync(path.join(addon,'Data/Shared/Strings_01.lua'),'-- modified\n');
  assert.throws(()=>validateLoadOrder(addon,toc,plan),/modified|stale/);
}));

test('shared writer cleans only its own obsolete numbered shards',()=>temporary(root=>{
  const data=path.join(root,'AddOns/LegionChinese/Data');
  writeResourceChunks({root,name:'Strings',lines:['D.Strings[1]="甲"','D.Strings[2]="乙"'],maxBytes:25});
  write(path.join(data,'Books_99.lua'),'preserve');
  writeResourceChunks({root,name:'Strings',lines:['D.Strings[1]="甲"']});
  assert.equal(fs.existsSync(path.join(data,'Strings_02.lua')),false);
  assert.equal(fs.readFileSync(path.join(data,'Books_99.lua'),'utf8'),'preserve');
  assert.throws(()=>writeResourceChunks({root,name:'../escape',lines:[]}),/Invalid/);
  assert.throws(()=>writeResourceChunks({root,name:'Strings',lines:['D.Strings[1]="过长的单条资源"'],maxBytes:10}),/exceeds/);
  assert.equal(fs.readFileSync(path.join(data,'Strings_01.lua'),'utf8').includes('"甲"'),true);
}));

test('build fingerprint detects runtime, generator and source snapshot edits while ignoring generated outputs',()=>temporary(root=>{
  for(const file of ['package.json','package-lock.json','sources.json','CHANGELOG.md','SOURCES.md','scripts/generate.mjs','data/snapshot.json','AddOns/LegionChinese/Core.lua'])write(path.join(root,file),'original');
  const before=buildSourceHash(root);
  write(path.join(root,'AddOns/LegionChinese/Data/Shared/Strings_01.lua'),'generated');
  write(path.join(root,'docs/resource-manifest.json'),'generated');
  assert.equal(buildSourceHash(root),before);
  for(const file of ['scripts/generate.mjs','data/snapshot.json','AddOns/LegionChinese/Core.lua']){
    write(path.join(root,file),'edited');assert.notEqual(buildSourceHash(root),before);
    write(path.join(root,file),'original');assert.equal(buildSourceHash(root),before);
  }
}));

test('failed build cleans its stage, releases its lock and refuses concurrent builds',()=>temporary(root=>{
  let candidate;
  assert.throws(()=>withBuildStage(root,stage=>{
    candidate=stage;assert.ok(fs.existsSync(path.join(root,'.cache/build.lock')));
    assert.throws(()=>withBuildStage(root,()=>assert.fail('concurrent build ran')),/EEXIST/);
    throw Error('generation failed');
  }),/generation failed/);
  assert.equal(fs.existsSync(candidate),false);assert.equal(fs.existsSync(path.join(root,'.cache/build.lock')),false);
  withBuildStage(root,stage=>assert.ok(fs.existsSync(stage)));
}));

test('incomplete rollback retains recovery files and still releases the build lock',()=>temporary(root=>{
  write(path.join(root,'AddOns/LegionChinese/old.lua'),'recoverable');
  let candidate;
  assert.throws(()=>withBuildStage(root,stage=>{
    candidate=stage;write(path.join(stage,'AddOns/LegionChinese/new.lua'),'candidate');fs.mkdirSync(path.join(stage,'docs'));
    promoteBuild(root,stage,{afterStep:step=>{
      if(step==='backup-addon'){write(path.join(root,'AddOns/LegionChinese/obstruction.lua'),'blocked');throw Error('injected');}
    }});
  }),/Rollback incomplete/);
  assert.equal(fs.readFileSync(path.join(candidate,'backup/addon/old.lua'),'utf8'),'recoverable');
  assert.equal(fs.existsSync(path.join(root,'.cache/build.lock')),false);
}));

for(const failAt of ['backup-addon','replace-addon','report:a.json'])test('failed promotion restores addon and reports after '+failAt,()=>temporary(root=>{
  write(path.join(root,'AddOns/LegionChinese/old.lua'),'old-addon');write(path.join(root,'docs/a.json'),'old-report');
  const stage=path.join(root,'.cache/build-stage-test');
  write(path.join(stage,'AddOns/LegionChinese/new.lua'),'new-addon');write(path.join(stage,'docs/a.json'),'new-report');
  assert.throws(()=>promoteBuild(root,stage,{afterStep:step=>{if(step===failAt)throw Error('injected failure')}}),/injected/);
  assert.equal(fs.readFileSync(path.join(root,'AddOns/LegionChinese/old.lua'),'utf8'),'old-addon');
  assert.equal(fs.existsSync(path.join(root,'AddOns/LegionChinese/new.lua')),false);
  assert.equal(fs.readFileSync(path.join(root,'docs/a.json'),'utf8'),'old-report');
  assert.throws(()=>removeBuildStage(root,root),/Unsafe/);removeBuildStage(root,stage);
}));

function runChunks(chunks){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const exec=source=>{if(lauxlib.luaL_dostring(L,to_luastring(source))!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)))};
  try{for(const source of chunks)exec(source);}finally{lua.lua_close(L)}
}
const baseRuntime=['DataAccess.lua','Text.lua','Core.lua','WidgetText.lua','Hyperlinks.lua'];
const baseFeatures=['Modules/Quests.lua','Modules/QuestTracker.lua','Modules/CastBars.lua','Modules/Books.lua'];
function runLua(body,files=[],setup=''){
  const read=file=>fs.readFileSync(new URL('../AddOns/LegionChinese/'+file,import.meta.url),'utf8');
  runChunks([read('Bootstrap.lua'),...baseRuntime.map(read),fs.readFileSync(new URL('ui-fixture.lua',import.meta.url),'utf8'),setup,
    ...['Hooks.lua','Bindings.lua',...baseFeatures,...files].map(read),...(Array.isArray(body)?body:[body])]);
}

test('feature hooks coexist, refresh without duplicates, preserve native returns and skip forbidden widgets',()=>runLua(`
  local one,first=A or LegionChinese,0
  local h1,m1,s1=LegionChinese.Hooks.ForFeature("first")
  local h2,m2=LegionChinese.Hooks.ForFeature("second")
  local widget=Widget("");local second=0
  m1(widget,"SetText",function()first=first+1 end)
  m2(widget,"SetText",function()second=second+1 end)
  for i=1,20 do m1(widget,"SetText",function()first=first+1 end) end
  widget:SetText("Native");assert(first==1 and second==1)
  local object={Method=function()return "native",nil,3 end}
  m1(object,"Method",function()first=first+1 end)
  local a,b,c=object:Method();assert(a=="native" and b==nil and c==3)
  local forbidden={IsForbidden=function()return true end,Method=function()end}
  assert(m1(forbidden,"Method",function()error("unexpected")end)==false)
`));

test('real runtime modules compose in their declared production order',()=>runLua(`
  assert(LegionChinese.FindCatalog and LegionChinese.InstallCollections and LegionChinese.InstallGarrison)
  assert(SlashCmdList.LEGIONCHINESE)
`,runtimeFiles.filter(f=>![...baseRuntime,...baseFeatures,'Hooks.lua','Bindings.lua'].includes(f))));

test('unrelated addon events skip installers while new widgets and global setters remain supported',()=>runLua(`
  for i=1,20 do frames[1]:Fire("OnEvent","ADDON_LOADED","UnrelatedAddon") end
  for _,count in pairs(installs) do assert(count==1) end
  GarrisonMissionFrame={}
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateGarrison")
  assert(installs.InstallGarrison==2 and installs.InstallCollections==1 and installs.InstallItemTooltips==1)
  ItemRefTooltip=Widget("")
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateTooltip")
  assert(installs.InstallItemTooltips==2 and installs.InstallClientDescriptions==2 and installs.InstallGarrison==2)
  QuestInfo_Display=function()end
  frames[1]:Fire("OnEvent","ADDON_LOADED","LateSetter")
  assert(installs.InstallItemTooltips==3)
  frames[1]:Fire("OnEvent","ADDON_LOADED","Blizzard_Collections")
  assert(installs.InstallCollections==2)
`,['UI.lua'],`
  installs={}
  for _,name in ipairs({"InstallItemTooltips","InstallCollections","InstallGarrison","InstallClientDescriptions"}) do
    local feature=name;LegionChinese[feature]=function()installs[feature]=(installs[feature] or 0)+1 end
  end
`));

test('shared setter clears its recursion guard after font or text errors and preserves native fonts',()=>runLua(`
  local A=LegionChinese
  local widget=Widget("original");local font=A.SetFont
  A.SetFont=function()error("font failure")end
  assert(not pcall(A.WriteText,widget,"译文"));assert(not A.IsWriting(widget))
  A.SetFont=font
  local setter=widget.SetText;widget.SetText=function()error("text failure")end
  assert(not pcall(A.WriteText,widget,"译文"));assert(not A.IsWriting(widget))
  widget.SetText=setter;assert(A.WriteText(widget,"译文"));assert(widget:GetText()=="译文")
`));

test('actual pooled resources execute after all shared shards with unchanged Chinese values',()=>{
  const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
  const manifest=JSON.parse(fs.readFileSync(new URL('../docs/resource-manifest.json',import.meta.url),'utf8'));
  const shared=new Map(),chunks=[fs.readFileSync(new URL('Bootstrap.lua',addon),'utf8')],checks=[];
  for(const resource of manifest.resources.filter(row=>row.family==='SharedStrings')){
    const body=fs.readFileSync(new URL(resource.path,addon),'utf8');chunks.push(body);
    for(const row of body.matchAll(/^D\.SharedStrings\[(\d+)\]=("(?:\\.|[^"\\])*")\r?$/gm))shared.set(row[1],row[2]);
  }
  assert.ok(shared.size>0);
  chunks.push(`
    function same(a,b)
      if type(b)~="table" then assert(a==b);return end
      assert(type(a)=="table");for key,value in pairs(b) do same(a[key],value) end
      for key in pairs(a) do assert(b[key]~=nil) end
    end
  `);
  for(const family of ['Quests','Strings','CatalogStrings','ItemDescriptions']){
    let assignment;
    for(const resource of manifest.resources.filter(row=>row.family===family)){
      assignment=fs.readFileSync(new URL(resource.path,addon),'utf8').split('\n').find(line=>line.startsWith('D.')&&/S\[\d+\]/.test(line));
      if(assignment)break;
    }
    assert.ok(assignment,'missing pooled sample for '+family);
    const equals=assignment.indexOf('='),lhs=assignment.slice(0,equals);
    const expected=assignment.slice(equals+1).replace(/"(?:\\.|[^"\\])*"|S\[(\d+)\]/g,(token,id)=>id?shared.get(id):token);
    const check='same('+lhs+','+expected+')';checks.push(check);
    chunks.push('local D=LegionChineseDB;local S=D.SharedStrings\n'+assignment+'\n'+check);
  }
  for(const file of ['DataAccess.lua','Text.lua','Core.lua'])chunks.push(fs.readFileSync(new URL(file,addon),'utf8'));
  chunks.push('local D=LegionChineseDB;assert(D.SharedStrings==nil)\n'+checks.join('\n'));
  runChunks(chunks);
});
