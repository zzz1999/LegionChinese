import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua, lauxlib, lualib, to_luastring, to_jsstring} from 'fengari';

function run(body) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const exec = source => {
    const status = lauxlib.luaL_dostring(L, to_luastring(source));
    assert.equal(status, lua.LUA_OK, status === lua.LUA_OK ? '' : to_jsstring(lua.lua_tostring(L, -1)));
  };
  try {
    for (const file of ['Bootstrap.lua', 'DataAccess.lua', 'Text.lua', 'Core.lua', 'WidgetText.lua', 'Modules/Books.lua']) {
      exec(fs.readFileSync(new URL('../AddOns/LegionChinese/' + file, import.meta.url), 'utf8'));
    }
    exec(fs.readFileSync(new URL('ui-fixture.lua', import.meta.url), 'utf8'));
    exec(`
      local A,D=LegionChinese,LegionChineseDB
      local loads=0
      local contexts={}
      local function key(text) return A.Fingerprint(A.Normalize(text)) end
      local function context(first,page,source,translation)
        local anchor=key(first)
        contexts[anchor]=contexts[anchor] or {}
        contexts[anchor][page]=contexts[anchor][page] or {}
        local id=#D.Strings+1;D.Strings[id]=translation
        contexts[anchor][page][key(source)]=id
      end
      A.Data.Configure({Books={count=1,families={"Books","BookContexts"},scopes={}}})
      A.Data.Register("Books",function() loads=loads+1;D.BookContexts=contexts end)
      local page
      function ItemTextGetPage() return page end
      local function display(number,source)
        page=number;bookText=source;ItemTextPageText:SetText(source)
        A.UpdateBook(nil,"ITEM_TEXT_READY")
        return ItemTextPageText:GetText()
      end
    ` + body);
  } finally {
    lua.lua_close(L);
  }
}

test('Chinese and empty book pages leave the lazy book category uninitialized', () => run(`
  for _,text in ipairs({"已有简体中文。","既有繁體中文。",""}) do
    A.UpdateBook(nil,"ITEM_TEXT_BEGIN")
    assert(display(1,text)==text)
    assert(display(2,text)==text)
  end
  assert(display(1,nil)==nil)
  assert(loads==0,"reading an already Chinese book must not initialize Books")
  assert(rawget(D,"Books")==nil and rawget(D,"BookContexts")==nil)
  assert(display(1,"Unknown book")=="Unknown book" and loads==1)
`));

test('a Chinese first page can anchor a later foreign page without eager initialization', () => run(`
  context("已有中文首页。",2,"The end","这本书的结尾。")
  context("已有中文首页。",4,"More","这本书的后记。")
  assert(display(1,"已有中文首页。")=="已有中文首页。" and loads==0)
  assert(display(2,"The end")=="这本书的结尾。" and loads==1)
  assert(display(3,"已有中文第三页。")=="已有中文第三页。")
  assert(display(4,"More")=="这本书的后记。" and loads==1)
`));

test('an English book with a substituted Chinese player name still resolves its dynamic anchor', () => run(`
  function UnitName() return "包括" end
  context("A book for $N",2,"The end","属于你的结尾。")
  assert(not A.IsChinese("A book for 包括"))
  assert(display(1,"A book for 包括")=="A book for 包括" and loads==1)
  assert(display(2,"The end")=="属于你的结尾。")
`));

test('a replacement first page and book lifecycle events clear pending and resolved context', () => run(`
  context("First book",2,"The end","第一本书的结尾。")
  context("中文首页。",2,"The end","中文首页对应的结尾。")
  assert(display(1,"First book")=="First book")
  assert(display(2,"The end")=="第一本书的结尾。")
  assert(display(1,"不同的中文首页。")=="不同的中文首页。")
  assert(display(2,"The end")=="The end")
  for _,event in ipairs({"ITEM_TEXT_BEGIN","ITEM_TEXT_CLOSED"}) do
    display(1,"中文首页。")
    A.UpdateBook(nil,event)
    assert(display(2,"The end")=="The end","pending context survived "..event)
    display(1,"First book")
    A.UpdateBook(nil,event)
    assert(display(2,"The end")=="The end","resolved context survived "..event)
  end
  assert(loads==1)
`));
