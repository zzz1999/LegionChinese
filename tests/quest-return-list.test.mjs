import test from 'node:test';
import assert from 'node:assert/strict';
import {lua, lauxlib, lualib, to_luastring, to_jsstring} from 'fengari';
import {readFixtureFile, listFixtureFiles} from './addon-fixture.mjs';
import {fingerprint, normalize, luaString} from '../scripts/text.mjs';

const addon = new URL('../AddOns/LegionChinese/', import.meta.url);
const data = new URL('Data/', addon);
const files = listFixtureFiles(data);

function shippedRow(category, key) {
  const prefix = `D.${category}[${typeof key === 'number' ? key : luaString(key)}]=`;
  for (const file of files.filter(name => name.startsWith(category + '_'))) {
    const line = readFixtureFile(new URL(file, data), 'utf8').split('\n')
      .find(value => value.startsWith(prefix));
    if (line) return line;
  }
  assert.fail('Missing shipped row ' + prefix);
}

const names = [
  ['Aoren Sunglow', '奥伦·日冕'],
  ['Lidia Sunglow', '莉迪亚·日冕'],
];
const rows = names.map(([source, target]) => {
  const index = shippedRow('NPCNames', fingerprint(normalize(source)));
  const id = Number(index.match(/=(\d+)\s*$/)[1]);
  const text = shippedRow('Strings', id);
  assert.ok(text.includes(luaString(target)), 'use the actual shipped NPC translation: ' + source);
  return index + '\n' + text;
}).join('\n');

function run(body) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const execute = source => {
    const status = lauxlib.luaL_dostring(L, to_luastring(source));
    assert.equal(status, lua.LUA_OK, status === lua.LUA_OK ? '' : to_jsstring(lua.lua_tostring(L, -1)));
  };
  try {
    execute(readFixtureFile(new URL('Bootstrap.lua', addon), 'utf8'));
    execute('local D=LegionChineseDB\n' + rows);
    execute(readFixtureFile(new URL('Core.lua', addon), 'utf8'));
    execute(readFixtureFile(new URL('./ui-fixture.lua', import.meta.url), 'utf8'));
    execute(readFixtureFile(new URL('UI.lua', addon), 'utf8'));
    execute(`
      local A,D=LegionChinese,LegionChineseDB
      function GetLocale() return "zhCN" end
      function QuestLog_GetObjectiveFrame() error("must not allocate native objective frames") end
      function SelectQuestLogEntry() error("must not change quest selection") end
      local entries,buttons,objectives={},{},{}
      function GetQuestLogTitle(index)
        local entry=entries[index]
        return entry.title,1,0,false,false,true,0,entry.id
      end
      function GetQuestLogCompletionText(index) return entries[index].completion end
      local function add(id,title,completion,display)
        local index=#entries+1
        entries[index]={id=id,title=title,completion=completion}
        local button={Text=Widget(title),questLogIndex=index,height=70}
        function button:IsShown() return true end
        function button:GetHeight() return self.height end
        function button:SetHeight(height) self.height=height end
        function button.Text:GetStringHeight() return 14 end
        local objective={Text=Widget(display or completion),questID=id,height=14,shown=true}
        function objective:IsShown() return self.shown end
        function objective:SetHeight(height) self.height=height end
        function objective.Text:GetStringHeight() return A.IsChinese(self.text) and 28 or 14 end
        buttons[index]=button;objectives[index]=objective;_G["QLOF"..index]=objective
        return objective,button,entries[index]
      end
      QuestMapFrame={QuestsFrame={Contents={Titles=buttons}}}
      QuestScrollFrame={updates=0}
      function QuestScrollFrame:UpdateScrollChildRect() self.updates=self.updates+1 end
    ` + body);
  } finally {
    lua.lua_close(L);
  }
}

test('quest list translates reported simple returns using shipped NPC names and reflows once', () => run(`
  local aoren,first=add(27682,"我们需要更多的矿石","Return to Aoren Sunglow.")
  local lidia,second=add(27681,"石门背后的秘密","Return to Lidia Sunglow.")
  hooks.QuestLogQuests_Update()
  assert(aoren.Text.text=="返回奥伦·日冕处。" and lidia.Text.text=="返回莉迪亚·日冕处。")
  assert(aoren.height==28 and lidia.height==28 and first.height==84 and second.height==84)
  assert(aoren.Text.fontChanges==0 and lidia.Text.fontChanges==0,"keep native Chinese fonts")
  assert(QuestScrollFrame.updates==1 and aoren.questID==27682 and lidia.questID==27681)
  hooks.QuestLogQuests_Update()
  assert(first.height==84 and second.height==84 and QuestScrollFrame.updates==1)
  assert(aoren.Text.writes==1 and lidia.Text.writes==1,"refresh must be idempotent")
  -- The next native layout resets both the text and row size before the hook.
  first.height=70;aoren.height=14;aoren.Text:SetText("Return to Aoren Sunglow.")
  hooks.QuestLogQuests_Update()
  assert(aoren.Text.text=="返回奥伦·日冕处。" and first.height==84 and QuestScrollFrame.updates==2)
`));

test('quest list preserves unknown returns, added destinations, Chinese and stale display text', () => run(`
  local cases={
    "Return to Unrecorded Questgiver.",
    "Return to Lidia Sunglow at a different camp.",
    "Return to Aoren Sunglow. Then find Lidia Sunglow.",
    "返回奥伦·日冕处。",
  }
  for index,text in ipairs(cases) do add(27680+index,"已有中文任务名",text) end
  local mismatched=add(27682,"已有中文任务名","Return to Aoren Sunglow.","Other live objective")
  local hidden=add(27681,"已有中文任务名","Return to Lidia Sunglow.");hidden.shown=false
  hooks.QuestLogQuests_Update()
  for index,text in ipairs(cases) do
    assert(objectives[index].Text.text==text and objectives[index].Text.writes==0)
    assert(buttons[index].height==70)
  end
  assert(mismatched.Text.text=="Other live objective" and mismatched.Text.writes==0)
  assert(hidden.Text.writes==0 and QuestScrollFrame.updates==0)
`));

test('reused quest list completion rows match their current API text and quest identity', () => run(`
  local objective,button,entry=add(27682,"我们需要更多的矿石","Return to Aoren Sunglow.")
  hooks.QuestLogQuests_Update()
  assert(objective.Text.text=="返回奥伦·日冕处。")
  entry.id=27681;entry.title="石门背后的秘密";entry.completion="Return to Lidia Sunglow."
  button.Text:SetText(entry.title);button.height=70
  objective.questID=entry.id;objective.height=14;objective.Text:SetText(entry.completion)
  hooks.QuestLogQuests_Update()
  assert(objective.Text.text=="返回莉迪亚·日冕处。" and button.height==84)
  entry.completion="Return to Unrecorded Questgiver."
  button.height=70;objective.height=14;objective.Text:SetText(entry.completion)
  hooks.QuestLogQuests_Update()
  assert(objective.Text.text==entry.completion and button.height==70)
  assert(QuestScrollFrame.updates==2,"unknown reused rows must not retain the previous translation")
`));
