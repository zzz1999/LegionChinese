import test from 'node:test';
import assert from 'node:assert/strict';
import {lua, lauxlib, lualib, to_luastring, to_jsstring} from 'fengari';
import {readFixtureFile, listFixtureFiles} from './addon-fixture.mjs';
import {fingerprint, normalize, luaString} from '../scripts/text.mjs';
import {nameKey} from '../scripts/client-names.mjs';

const addon = new URL('../AddOns/LegionChinese/', import.meta.url);
const data = new URL('Data/', addon);
const files = listFixtureFiles(data);
const categories = new Map();
const additions = [
  [133263, 'Rhonormu', '罗诺姆'],
  [105210, 'Kanyr Skyhorn', '坎雅‧天角'],
  [105010, 'Spiritwalker Ebonhorn', '灵魂行者黑角'],
  [105213, 'Spiritwalker Ebonhorn', '灵魂行者黑角'],
  [81397, 'Bigger Warsong Wolf', '战歌恶狼'],
];
const preserved = [85519, 'Christoph VonFeasel', '克里斯托弗·冯·费瑟尔'];
const globalKey = source => fingerprint(normalize(source));

function shippedRows(category) {
  if (!categories.has(category)) {
    const rows = new Map();
    for (const file of files.filter(name => name.startsWith(category + '_'))) {
      for (const line of readFixtureFile(new URL(file, data), 'utf8').split('\n')) {
        if (line.startsWith(`D.${category}[`)) rows.set(line.slice(0, line.indexOf('=')), line);
      }
    }
    categories.set(category, rows);
  }
  return categories.get(category);
}

function shippedRow(category, key) {
  const prefix = `D.${category}[${typeof key === 'number' ? key : luaString(key)}]`;
  const row = shippedRows(category).get(prefix);
  assert.ok(row, 'Missing shipped row ' + prefix);
  return row;
}

function importedRows(cases) {
  const selected = new Set();
  for (const [id, source] of cases) {
    const name = shippedRow('NPCNames', globalKey(source));
    const reference = name.match(/=(\d+)\s*$/);
    assert.ok(reference, 'Expected generated NPC string reference: ' + source);
    selected.add(name);
    selected.add(shippedRow('Strings', Number(reference[1])));
    selected.add(shippedRow('NPCLabelNames', id));
  }
  return [...selected].join('\n');
}

function run(body, cases = additions) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const execute = source => {
    const status = lauxlib.luaL_dostring(L, to_luastring(source));
    assert.equal(status, lua.LUA_OK, status === lua.LUA_OK ? '' : to_jsstring(lua.lua_tostring(L, -1)));
  };
  try {
    execute(readFixtureFile(new URL('Bootstrap.lua', addon), 'utf8'));
    execute('local D=LegionChineseDB\n' + importedRows(cases));
    execute(readFixtureFile(new URL('Core.lua', addon), 'utf8'));
    execute(readFixtureFile(new URL('ClientNames.lua', addon), 'utf8'));
    execute(readFixtureFile(new URL('./ui-fixture.lua', import.meta.url), 'utf8'));
    execute(`
      local A,D=LegionChinese,LegionChineseDB
      local current={}
      function GetLocale() return "enUS" end
      function UnitGUID(unit)
        if unit=="player" then return "Player-1-000001" end
        if unit=="target" then return current.guid end
      end
      function UnitName(unit)
        if unit=="player" then return "Unrecorded Adventurer" end
        if unit=="target" then return current.name end
      end
      function UnitIsPlayer(unit) return unit=="player" or unit=="target" and current.player end
      function UnitPlayerControlled(unit) return unit=="player" or unit=="target" and current.controlled end
      local function show(id,name,options)
        options=options or {}
        current={name=name,guid=options.guid or "Creature-0-1-2-3-"..id.."-000001",
          player=options.player,controlled=options.controlled}
        local frame={unit="target",name=Widget(options.display or name)}
        A.UpdatePetUnitFrame(frame)
        return frame.name
      end
      ${body}
    `);
  } finally {
    lua.lua_close(L);
  }
}

const luaCases = cases => '{' + cases.map(([id, source, target]) =>
  `{${id},${luaString(source)},${luaString(target)}}`).join(',') + '}';

test('expanded shipped NPC names reach CompletionLog through the global name index', () => run(`
  for _,case in ipairs(${luaCases(additions)}) do
    local original="Return to "..case[2].."."
    local text,changed=A.Translate("Quests",original,900001,"CompletionLog")
    assert(changed and text=="返回"..case[3].."处。",case[2]..": "..text)
    local label=D.NPCLabelNames[case[1]][A.NameFingerprint(case[2])]
    assert(label==case[3],"generated ID label disagrees: "..case[1])
    assert(A.Translate("Quests",original,900001,"Description")==original,
      "return-name rule must stay confined to CompletionLog")
  end
`));

test('expanded completion names do not infer unknown recipients, player tokens or changed sentences', () => run(`
  for _,original in ipairs({
    "Return to Unrecorded Questgiver.",
    "Return to Unrecorded Adventurer.",
    "Return to $N.",
    "Return to $n.",
    "Return to Rhonormu at another camp.",
    "Return to Rhonormu. Then find Kanyr Skyhorn.",
    "Return to Casketmasher.",
    "返回罗诺姆处。"
  }) do
    local text,changed=A.Translate("Quests",original,900001,"CompletionLog")
    assert(text==original and not changed,original)
  end
`));

test('expanded generic NPC labels require the same ID and complete live name', () => run(`
  for _,case in ipairs(${luaCases(additions)}) do
    local label=show(case[1],case[2])
    assert(label:GetText()==case[3] and label.writes==1,case[2])
    local changed=case[2].." the Custom Questgiver"
    assert(show(case[1],changed):GetText()==changed,"ID alone cannot replace a changed name")
    assert(show(900099,case[2]):GetText()==case[2],"name alone cannot replace an unknown ID")
    assert(show(case[1],case[2],{display="Other addon: "..case[2]}):GetText()=="Other addon: "..case[2],
      "do not replace stale or custom visible text")
    assert(show(case[1],case[3]):GetText()==case[3],"existing Chinese stays unchanged")
  end
  assert(show(133263,"Kanyr Skyhorn"):GetText()=="Kanyr Skyhorn","do not borrow another known ID")
  assert(show(105210,"Rhonormu"):GetText()=="Rhonormu","do not borrow another known name")
`));

test('known NPC names remain untouched on players, controlled units and pet GUIDs', () => run(`
  for _,case in ipairs(${luaCases(additions)}) do
    for _,options in ipairs({
      {guid="Player-1-000002"},
      {player=true},
      {controlled=true},
      {guid="Pet-0-1-2-3-"..case[1].."-000002"}
    }) do
      local label=show(case[1],case[2],options)
      assert(label:GetText()==case[2] and label.writes==0,case[2])
    end
  end
`));

test('expansion preserves the existing Christoph conflict and does not invent Casketmasher', () => {
  assert.equal(shippedRows('NPCNames').has(`D.NPCNames[${luaString(globalKey('Casketmasher'))}]`), false);
  const unsupportedKey = `[${luaString(nameKey('Casketmasher'))}]`;
  assert.ok([...shippedRows('NPCLabelNames').values()].every(row => !row.includes(unsupportedKey)),
    'no ID label may invent a translation for an unsupported randomized name');
  run(`
    local name=${luaString(preserved[1])}
    local expected=${luaString(preserved[2])}
    assert(show(85519,name):GetText()==expected,"keep the existing SQL label despite newer conflicts")
    local text,changed=A.Translate("Quests","Return to "..name..".",900001,"CompletionLog")
    assert(changed and text=="返回"..expected.."处。","keep the existing global translation")
    assert(show(26125,"Casketmasher"):GetText()=="Casketmasher")
    assert(A.Translate("Quests","Return to Casketmasher.",900001,"CompletionLog")=="Return to Casketmasher.")
  `, [preserved]);
});
