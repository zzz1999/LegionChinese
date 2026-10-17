import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {normalize,fingerprint,TextIndex,luaString} from '../scripts/text.mjs';
import {parseValues,readSQL} from '../scripts/sql.mjs';

const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
function runLua(code,ui=false){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{const status=lauxlib.luaL_dostring(L,to_luastring(source));assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));};
  execute(fs.readFileSync(new URL('Bootstrap.lua',addon),'utf8'));
  execute(`playerName="Alice"; playerSex=2
    function UnitName() return playerName end
    function UnitClass() return "Mage","MAGE" end
    function UnitRace() return "Human","Human" end
    function UnitSex() return playerSex end`);
  execute(fs.readFileSync(new URL('Core.lua',addon),'utf8'));
  if(ui){
    execute(fs.readFileSync(new URL('./ui-fixture.lua',import.meta.url),'utf8'));
    execute(fs.readFileSync(new URL('UI.lua',addon),'utf8'));
  }
  execute(code);lua.lua_close(L);
}

test('SQL parser preserves apostrophes, semicolons, comments, and literal escapes',()=>{
  const result=[];parseValues("(1,'zhCN','中文\\\'引号; -- 内容',NULL),(2,'enUS','a''b\\nline',3); -- comment (x)",r=>result.push(r));
  assert.deepEqual(result,[["1","zhCN","中文'引号; -- 内容",null],["2","enUS","a'b\nline","3"]]);
  assert.throws(()=>parseValues("(1,'unfinished",()=>{}));
});

test('SQL import handles multiline rows, UPDATE, and variable INSERT whitespace without executing SQL',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'tcn-sql-'));
  const file=path.join(folder,'fixture.sql');
  fs.writeFileSync(file,"CREATE TABLE `page_text` (\n `ID` int,\n `Text` text\n);\ninsert  into `page_text` values\n(1,'first'), -- a\n(2,'second');\nUPDATE `page_text` SET `Text`='第三页' WHERE `ID`=2;\n");
  const rows=[];await readSQL(file,new Set(['page_text']),(name,row,update)=>rows.push({row,update}));
  assert.deepEqual(rows.map(x=>x.row.Text),['first','second','第三页']);assert.equal(rows[2].update,true);
  fs.unlinkSync(file);fs.rmdirSync(folder);
});

test('ambiguous dialogue and fingerprint collisions never choose an arbitrary translation',()=>{
  const index=new TextIndex();index.add('Hello','你好');index.add('Hello','您好');index.add('Hello','你好');
  assert.equal(index.entries.size,0);assert.equal(index.ambiguous.size,1);
  index.add('Goodbye','再见');assert.equal(index.entries.size,1);
  index.add('English source','Untranslated text');assert.equal(index.entries.size,1);
});

test('Lua 5.1 normalization and UTF-8 fingerprints match the build tool',()=>{
  const vectors=['Hello, $N!$BWelcome, $c.','|cffffffffHello|r  world','<HTML><BODY><P align="center">A &amp; B</P></BODY></HTML>',
    '|Hitem:1|h[Book]|h','The mage\'s note\r\nPage 2','<The stranger nods.>','Bonjour, élève!','Привет, друг!','안녕하세요!','書頁𠀀'];
  runLua(vectors.map(value=>`assert(LegionChinese.Normalize(${luaString(value)})==${luaString(normalize(value))}); assert(LegionChinese.Fingerprint(LegionChinese.Normalize(${luaString(value)}))==${luaString(fingerprint(normalize(value)))})`).join('\n'));
});

test('Chinese text stays byte-identical in every category; Chinese player names alone do not suppress translation',()=>{
  runLua(`local A=LegionChinese
    for _,kind in ipairs({"Quests","Gossip","Books","Titles","Objectives"}) do
      local s="|cffffffff你好，Alice。|r";local value,changed=A.Translate(kind,s,1,"Title");assert(value==s and not changed)
    end
    playerName="小明";assert(not A.IsChinese("Welcome, 小明!"));assert(A.IsChinese("欢迎，小明！"))
    assert(not A.IsChinese("|Hitem:中文链接参数|hEnglish label|h"))
    assert(A.IsChinese("𠀀"));assert(not A.IsChinese("Привет"))
    function UnitClass() return "法师","MAGE" end
    assert(A.IsChinese("法师"));assert(A.IsChinese("小明"))`);
});

test('quest fields have independent fallback, numeric IDs work, and missing text stays intact',()=>{
  runLua(`local A=LegionChinese
    LegionChineseDB.Quests[42]={Title="任务标题",Description="你好，$n。你是一名$c。"}
    local t,c=A.Translate("Quests","English title","42","Title");assert(t=="任务标题" and c)
    t,c=A.Translate("Quests","Original",42,"Description");assert(t=="你好，Alice。你是一名法师。" and c)
    t,c=A.Translate("Quests","Untranslated reward",42,"Completion");assert(t=="Untranslated reward" and not c)
    t,c=A.Translate("Quests","Unknown quest",99,"Title");assert(t=="Unknown quest" and not c)
    t,c=A.Translate("Quests","",42,"Title");assert(t=="" and not c)
    assert(A.Render("$G先生:女士;，你好") == "先生，你好");playerSex=3;assert(A.Render("$G先生:女士;，你好")=="女士，你好")
    assert(A.Render("未知$z占位符")==nil)`);
});

test('NPC substitutions and objective counters are preserved',()=>{
  runLua(`local A,D=LegionChinese,LegionChineseDB
    D.Strings[1]="欢迎，$n。";D.Gossip[A.Fingerprint(A.Normalize("Welcome, $N!"))]=1
    local t,c=A.Translate("Gossip","Welcome, Alice!");assert(t=="欢迎，Alice。" and c)
    playerName="小明";t,c=A.Translate("Gossip","Welcome, 小明!");assert(t=="欢迎，小明。" and c)
    D.Strings[2]="收集书页";D.Objectives[A.Fingerprint(A.Normalize("Pages collected"))]=2
    t,c=A.Translate("Objectives","Pages collected: 2/5");assert(t=="收集书页: 2/5" and c)
    playerName="Ann";assert(A.Normalize("cannot",true)=="cannot")`);
});

test('book signatures keep their underscores while matching player-name and gender tokens',()=>{
  const key=fingerprint(normalize('The pilot accepts his risk. Signed, X:___$n'));
  runLua(`local A,D=LegionChinese,LegionChineseDB
    D.Strings[1]="试飞员承担$g他:她;的风险。签名：___$n"
    D.Books[${luaString(key)}]=1
    local text,changed=A.Translate("Books","The pilot accepts his risk. Signed, X:___Alice")
    assert(changed and text=="试飞员承担他的风险。签名：___Alice")
    playerName="Ann"; assert(A.Normalize("cannot",true)=="cannot")
    assert(A.Normalize("X:___Ann",true)=="x:___~n~")`);
});

test('UI hooks respect Chinese fields, task switching, books with multiple pages, and the disabled setting',()=>{
  runLua(fs.readFileSync(new URL('./ui-cases.lua',import.meta.url),'utf8'),true);
});
