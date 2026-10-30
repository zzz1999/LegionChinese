import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {preparePackage} from '../scripts/package-layout.mjs';
import {normalize,fingerprint} from '../scripts/text.mjs';
import {resourceSemantics,compareResources} from '../scripts/resource-equivalence.mjs';

const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
const key=text=>JSON.stringify(fingerprint(normalize(text)));
const read=file=>fs.readFileSync(new URL(file,addon),'utf8');
const core=['DataAccess.lua','Text.lua','Core.lua'];
function withLua(work){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const exec=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{work(exec)}finally{lua.lua_close(L)}
}

test('single-addon resources initialize only the requested feature and string shards, preserving translations',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lcn-demand-test-'));
  const source=path.join(root,'AddOns/LegionChinese'),out=path.join(root,'package');
  const write=(file,text)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text)};
  try{
    write(path.join(source,'Bootstrap.lua'),read('Bootstrap.lua'));
    for(const file of core)write(path.join(source,file),read(file));
    const rows={
      'Shared/SharedStrings_01.lua':'D.SharedStrings[1]="可靠的中文神器说明"\nD.SharedStrings[2]="保留的任务名称"',
      'Shared/Strings_01.lua':'D.Strings[1]="你好，冒险者。"\nD.Strings[2]="友人"',
      'Shared/CatalogStrings_01.lua':'D.CatalogStrings[1]="已有對白"\nD.CatalogStrings[2]="收藏来源"',
      'Shared/CatalogStrings_02.lua':'D.CatalogStrings[3]="专业配方"',
      'Quests/QuestSources_01.lua':`D.QuestSources[42]={Title={[${key('Quest title')}]=true}}`,
      'Professions/ProfessionTexts_01.lua':`D.CatalogTexts.Profession={}\nD.CatalogTexts.Profession[${key('Recipe source')}]=3`,
      'Quests/Quests_01.lua':'local S=D.SharedStrings\nD.Quests[42]={Title=S[2]}',
      'Dialogue/Gossip_01.lua':`D.Gossip[${key('Hello, adventurer.')}]=1`,
      'Dialogue/NPCNames_01.lua':`D.NPCNames[${key('A friend')}]=2`,
      'Dialogue/CatalogDialogue_01.lua':`D.CatalogTexts.Dialogue={}\nD.CatalogTexts.Dialogue[${key('A trusted line')}]=1`,
      'Collections/CollectionTexts_01.lua':`D.CatalogTexts.Collection={}\nD.CatalogTexts.Collection[${key('Source of a mount')}]=2`,
      'Artifacts/Artifacts.lua':`local S=D.SharedStrings\nD.ArtifactChoices[7]={Question={[${key('Choose wisely')}]=S[1]},Options={}}`,
    };
    const resources=Object.entries(rows).map(([file,text])=>{
      const body=('local D=LegionChineseDB\n'+text+'\n').replaceAll('\n','\r\n');
      const relative='Data/'+file;write(path.join(source,relative),body);
      return {path:relative,group:file.split('/')[0],family:path.basename(file).replace(/(?:_\d+)?\.lua$/,''),
        bytes:Buffer.byteLength(body),sha256:crypto.createHash('sha256').update(body).digest('hex')};
    });
    write(path.join(root,'docs/resource-manifest.json'),JSON.stringify({resources}));
    write(path.join(source,'LegionChinese.toc'),['## Interface: 70300','## Version: 1.3.5','Bootstrap.lua',...resources.map(r=>r.path),...core].join('\n'));
    const before=resourceSemantics(path.join(source,'Data'));
    const result=preparePackage(root,out,'1.3.5');assert.equal(result.categories,6);
    const folders=fs.readdirSync(out);
    const after=resourceSemantics(folders.map(f=>path.join(out,f,'Data')));
    assert.equal(compareResources(before,after).equivalent,true);
    assert.deepEqual(folders,['LegionChinese']);
    assert.ok(fs.existsSync(path.join(out,'LegionChinese/Data/Dialogue')));
    assert.ok(!fs.existsSync(path.join(out,'LegionChinese/Data/Shared/SharedStrings_01.lua')));
    const filesFor=()=>fs.readFileSync(path.join(result.main,'LegionChinese.toc'),'utf8').split(/\r?\n/)
      .filter(s=>s&&!s.startsWith('#')).map(s=>s.replaceAll('\\','/'));
    withLua(exec=>{
      exec('function LoadAddOn() error("single-addon data must never use LoadAddOn") end');
      for(const file of filesFor()){
        exec(fs.readFileSync(path.join(result.main,file),'utf8'));
        if(file==='DataManifest.lua')exec('loads={};local native=LegionChinese.Data.Register;LegionChinese.Data.Register=function(name,loader) native(name,function()loads[name]=(loads[name] or 0)+1;loader()end)end');
      }
      exec('local D=LegionChineseDB;assert(D.SharedStrings==nil);assert(rawget(D,"Quests")==nil);assert(rawget(D,"Gossip")==nil);assert(rawget(D.CatalogTexts,"Profession")==nil);assert(not next(loads));assert(not next(D.Strings));assert(not next(D.CatalogStrings))');
      exec('local A,D=LegionChinese,LegionChineseDB\n'+
        'assert(A.Translate("Quests","已有中文",42,"Title")=="已有中文" and not next(loads))\n'+
        'assert(A.Translate("Quests","Quest title",42,"Title")=="保留的任务名称")\n'+
        'assert(loads.Quests==2 and not loads.Professions and not loads.Dialogue and not loads.Artifacts)\n'+
        'assert(not next(D.CatalogStrings))\n'+
        'assert(A.FindCatalog("Profession","Recipe source")=="专业配方")\n'+
        'assert(loads.Professions==1 and not loads.Dialogue and not loads.Collections)\n'+
        'assert(rawget(D.CatalogStrings,3)=="专业配方" and rawget(D.CatalogStrings,1)==nil)\n'+
        'assert(A.Translate("Quests","Quest Complete!",42,"CompletionLog")=="Quest Complete!")\n'+
        'assert(not loads.NPCNames and not loads.Dialogue)\n'+
        'for i=1,3 do assert(A.Translate("Quests","Return to A friend.",42,"CompletionLog")=="返回友人处。") end\n'+
        'assert(loads.NPCNames==1 and not loads.Dialogue and rawget(D,"Gossip")==nil)\n'+
        'assert(A.Find("Gossip","已经中文")==nil and not loads.Dialogue)\n'+
        'assert(A.Translate("Gossip","Hello, adventurer.")=="你好，冒险者。")\n'+
        'assert(A.FindCatalog("Dialogue","A trusted line",true)=="已有對白")\n'+
        'assert(loads.Dialogue==2 and loads.NPCNames==1)\n'+
        'assert(A.FindCatalog("Collection","Source of a mount")=="收藏来源")\n'+
        'assert(loads.Collections==1 and not loads.Artifacts)\n'+
        'assert(A.Data.Get("ArtifactChoices")[7].Question['+key('Choose wisely')+'] == "可靠的中文神器说明")\n'+
        'assert(loads.Artifacts==1 and D.Quests[42].Title=="保留的任务名称")\n'+
        'for i=1,100 do assert(A.Translate("Quests","Quest title",42,"Title")=="保留的任务名称");assert(A.FindCatalog("Profession","Recipe source")=="专业配方") end\n'+
        'assert(loads.Quests==2 and loads.Professions==1)\n'+
        'assert(A.Translate("Gossip","Unknown text")=="Unknown text")');
    });
    assert.throws(()=>preparePackage(root,out,'1.3.5'),/empty/);
    fs.appendFileSync(path.join(source,resources[0].path),'-- changed');
    assert.throws(()=>preparePackage(root,path.join(root,'bad'),'1.3.5'),/Stale/);
  }finally{
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('lcn-demand-test-'));fs.rmSync(root,{recursive:true,force:true});
  }
});

test('incomplete and throwing categories preserve source text, roll back partial data and retry with a bound',()=>withLua(exec=>{
  exec(read('Bootstrap.lua'));
  for(const file of core)exec(read(file));
  exec('local A,D=LegionChinese,LegionChineseDB\n'+
    'now=10;function GetTime()return now end\n'+
    'A.Data.Configure({Dialogue={count=2,families={"Gossip","NPCNames"},scopes={"Dialogue"}}})\n'+
    'calls=0;fail=true\n'+
    'A.Data.Register("Dialogue",function() calls=calls+1;D.Gossip['+key('Hello')+']=1;D.Strings[1]="你好" end)\n'+
    'assert(A.Translate("Gossip","Hello")=="Hello" and calls==0)\n'+
    'A.Data.Register("Dialogue",function() assert(A.Data.Get("Gossip")==D.Gossip);assert(calls<=3);if fail then error("failed") end end)\n'+
    'for i=1,100 do assert(A.Translate("Gossip","Hello")=="Hello") end\n'+
    'assert(calls==1 and rawget(D,"Gossip")==nil and rawget(D,"NPCNames")==nil)\n'+
    'now=15;assert(A.Translate("Gossip","Hello")=="Hello" and calls==2)\n'+
    'fail=false;A.Data.ResetFailures();assert(A.Translate("Gossip","Hello")=="你好" and calls==3)\n'+
    'for i=1,100 do assert(A.Translate("Gossip","Hello")=="你好") end\n'+
    'assert(calls==3)');
}));

test('string shards use ID ranges, load once and roll back failed or recursive reads',()=>withLua(exec=>{
  exec(read('Bootstrap.lua'));exec(read('DataAccess.lua'));
  exec('local A,D=LegionChinese,LegionChineseDB\n'+
    'now=0;function GetTime()return now end\n'+
    'calls=0;fail=true\n'+
    'A.Data.RegisterPool("Strings",1,3,function() calls=calls+1;assert(D.Strings[2]==nil);D.Strings[1]="一";if fail then error("broken") end;D.Strings[3]="三" end)\n'+
    'A.Data.RegisterPool("Strings",8,8,function()D.Strings[8]="八"end)\n'+
    'assert(D.Strings[0]==nil and D.Strings[5]==nil and D.Strings["x"]==nil and calls==0)\n'+
    'for i=1,100 do assert(D.Strings[1]==nil) end\n'+
    'assert(calls==1 and rawget(D.Strings,1)==nil)\n'+
    'assert(D.Strings[8]=="八" and calls==1)\n'+
    'fail=false;now=5;assert(D.Strings[1]=="一" and D.Strings[3]=="三" and D.Strings[2]==nil and calls==2)\n'+
    'for i=1,100 do assert(D.Strings[1]=="一" and D.Strings[2]==nil) end\n'+
    'assert(calls==2)');
}));

test('static normalization keeps return values and bounds cached text while dynamic aliases remain fresh',()=>withLua(exec=>{
  exec(read('Bootstrap.lua'));exec(read('Text.lua'));
  exec(`local A=LegionChinese
    local native=string.gsub;local count=0
    string.gsub=function(...)count=count+1;return native(...)end
    local text,n=A.Normalize("  Hello world!  ",false)
    assert(text=="helloworld!" and type(n)=="number")
    local initial=count
    for i=1,100 do local again,m=A.Normalize("  Hello world!  ",false);assert(again==text and m==n)end
    assert(count==initial)
    for i=1,128 do A.Normalize("Unique value "..i,false)end
    local before=count;assert(A.Normalize("  Hello world!  ",false)==text);assert(count>before)
    local large=string.rep("a",2049);A.Normalize(large,false);before=count
    A.Normalize(large,false);assert(count>before,"long inputs must not enter cache")
    string.gsub=native`);
}));

test('player alias caching follows identity and localized class changes without stale Chinese detection',()=>withLua(exec=>{
  exec(read('Bootstrap.lua'));exec(read('Text.lua'));
  exec(`local A=LegionChinese
    name="小明";class="Mage";token="MAGE"
    function UnitName()return name end
    function UnitClass()return class,token end
    local first=A.Text.PlayerAliases()
    for i=1,100 do assert(A.Text.PlayerAliases()==first) end
    assert(not A.IsChinese("Welcome, 小明!"))
    name="小王";assert(A.Text.PlayerAliases()~=first)
    assert(A.IsChinese("Welcome, 小明!") and not A.IsChinese("Welcome, 小王!"))
    class="法师";assert(not A.IsChinese("Welcome, 法师!"));assert(A.IsChinese("法师"))
    assert(A.Normalize("Hello 小王",true)=="hello~n~")
    name="小李";assert(A.Normalize("Hello 小王",true)=="hello小王")`);
}));
