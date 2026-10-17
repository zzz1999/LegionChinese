import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {normalize,fingerprint,luaString,supportsTokens,TextIndex} from '../scripts/text.mjs';
import {chooseChinese,chooseChineseFields} from '../scripts/fallback.mjs';

const addon=new URL('../AddOns/LegionChinese/',import.meta.url),data=new URL('Data/',addon);
const files=fs.readdirSync(data);
function shippedRow(category,key){
  const prefix=`D.${category}[${typeof key==='number'?key:luaString(key)}]=`;
  for(const file of files.filter(f=>f.startsWith(category+'_'))){
    const source=fs.readFileSync(new URL(file,data),'utf8'),offset=source.indexOf('\n'+prefix);
    if(offset>=0)return source.slice(offset+1,source.indexOf('\n',offset+1));
  }
  assert.fail(`Missing shipped row ${prefix}`);
}
function shippedText(category,original){
  const index=shippedRow(category,fingerprint(normalize(original)));
  return index+'\n'+shippedRow('Strings',Number(index.match(/=(\d+)$/)[1]));
}
function runLua(code,rows=''){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    execute(fs.readFileSync(new URL('Bootstrap.lua',addon),'utf8'));
    execute(`playerName="Alice";playerClass="法师";classToken="MAGE";playerRace="人类";raceToken="Human"
      function UnitName() return playerName end
      function UnitClass() return playerClass,classToken end
      function UnitRace() return playerRace,raceToken end`);
    execute('local D=LegionChineseDB\n'+rows);
    execute(fs.readFileSync(new URL('Core.lua',addon),'utf8'));
    execute(fs.readFileSync(new URL('./ui-fixture.lua',import.meta.url),'utf8'));
    execute(fs.readFileSync(new URL('UI.lua',addon),'utf8'));
    execute('local A,D=LegionChinese,LegionChineseDB\n'+code);
  }finally{lua.lua_close(L);}
}

test('numeric client tokens are rejected at import and rendering, including after another token',()=>{
  const bad=['摧毁$1oa个军团灭绝者。','你好，$n$1oa。','交出$1i和$2i。','等待$4581d。','状态$2113w。','你好，$n$$1oa。'];
  for(const value of bad){
    assert.equal(supportsTokens(value),false,value);
    assert.deepEqual(chooseChinese(value,'安全的繁體譯文。'),{text:'安全的繁體譯文。',locale:'zhTW'});
    assert.equal(chooseChinese(value,value),undefined);
    const index=new TextIndex();index.add('An objective',value);assert.equal(index.entries.size,0);
  }
  const index=new TextIndex();index.add('Kill $1oa enemies.','击败敌人。');assert.equal(index.entries.size,0,'unknown source tokens cannot form usable keys');
  assert.deepEqual(chooseChineseFields({Title:'任务',Objectives:bad[0]},{Objectives:bad[1]}).values,{Title:'任务'});
  runLua(`
    ${bad.map(value=>`assert(A.Render(${luaString(value)})==nil)`).join('\n')}
    D.Quests[999999]={Objectives="摧毁$1oa个军团灭绝者。"}
    local original="Destroy 3 Legion Annihilators."
    local value,changed=A.Translate("Quests",original,999999,"Objectives")
    assert(value==original and not changed,"never expose an unresolved variable")
    value,changed=A.Translate("Quests",original,47589,"Objectives")
    assert(value==original and not changed,"shipped unsupported objective falls back")
    assert(D.Quests[47589].Title=="正义之怒","other quest fields are retained")
    assert(A.Normalize("$n$1oa")==${luaString(normalize('$n$1oa'))})
  `,shippedRow('Quests',47589));
});

test('Chinese name, class and race labels with punctuation stay Chinese, including shipped short dialogue',()=>{
  runLua(`
    playerName="小明"
    for _,text in ipairs({"人类。","法师！","小明……","（小明）","人类123。","你好，小明！"}) do
      assert(A.IsChinese(text),text)
      local value,changed=A.Translate("Quests",text,47589,"Title")
      assert(value==text and not changed,text)
    end
    for _,text in ipairs({"Hello, 小明!","Привет, 小明!","안녕 小明！"}) do assert(not A.IsChinese(text),text) end
    local value,changed=A.Translate("Gossip","Humans.")
    assert(value=="人类。" and changed,"the player's race does not invalidate a shipped Chinese label")
    playerClass="法師";playerRace="人類"
    assert(A.IsChinese("法師。") and A.IsChinese("人類！"))
  `,[shippedText('Gossip','Humans.'),shippedRow('Quests',47589)].join('\n'));
});

test('dynamic matching retains ordinary class and race words in real NPC dialogue',()=>{
  const original='Well met, $c.  You want some advice?  Befriend a mage!  We have a trick or two up our sleeves, we do...';
  const race='Hello, $n. That human is my friend.';
  runLua(`
    for _,className in ipairs({"法师","Mage","mage","MAGE"}) do
      local value,changed=A.Translate("Gossip","Well met, "..className..".  You want some advice?  Befriend a mage!  We have a trick or two up our sleeves, we do...")
      assert(changed and value=="你好，法师。你想要一些建议？好吧，找个法师当朋友就对了！我们的袖口里藏着一些小把戏……",className)
    end
    D.Strings[999999]="你好，$n。那个人类是我的朋友。"
    D.Gossip[${luaString(fingerprint(normalize(race)))}]=999999
    local value,changed=A.Translate("Gossip","Hello, Alice. That human is my friend.")
    assert(changed and value=="你好，Alice。那个人类是我的朋友。")
    playerName="Mage"
    value,changed=A.Translate("Gossip","Hello, Mage. That human is my friend.")
    assert(changed and value=="你好，Mage。那个人类是我的朋友。","overlapping name and class aliases")
  `,shippedText('Gossip',original));
});

test('ambiguous or excessive dynamic matches preserve the original instead of selecting a partial hit',()=>{
  runLua(`
    local function add(source,target,id)
      D.Strings[id]=target;D.Gossip[A.Fingerprint(A.Normalize(source))]=id
    end
    local original="Greetings, Mage. Here is a mage."
    add("Greetings, $c. Here is a mage.","你好，$c。这是一名法师。",999997)
    add("Greetings, Mage. Here is a $c.","你好，法师。这是一名$c。",999998)
    local value,changed=A.Translate("Gossip",original)
    assert(value==original and not changed,"different valid candidates are ambiguous")
    D.Strings[999998]=D.Strings[999997]
    value,changed=A.Translate("Gossip",original);assert(changed,"identical translations are harmless")
    for _,count in ipairs({9,33}) do
      original=string.rep("Mage ",count)
      add(string.rep("$c ",count),"多次职业称呼",999999)
      value,changed=A.Translate("Gossip",original)
      assert(value==original and not changed,"bounded search must not guess")
    end
  `);
});

test('quest log translates objective and completion rows, preserves metadata and reflows the full row',()=>{
  const objective='Bring Mina Mudclaw home to her father';
  runLua(`
    local selected=0
    function SelectQuestLogEntry() selected=selected+1 end
    function QuestLog_GetObjectiveFrame() error("must not allocate objective frames") end
    function GetQuestLogTitle(index)
      if index==1 then return "Grand Theft Palomino",55,0,false,false,false,0,12680 end
      return "A Personal Message",110,0,false,false,true,0,47202
    end
    function GetQuestLogCompletionText(index) if index==2 then return "Speak with Prophet Velen." end end
    local function row(text,index)
      local button={Text=Widget(text),questLogIndex=index,height=70,Check={offset=242}}
      function button:IsShown() return true end
      function button:GetHeight() return self.height end
      function button:SetHeight(h) self.height=h end
      function button.Text:GetStringHeight() return self.text:find("阿彻鲁斯",1,true) and 28 or 14 end
      function button.Text:GetWrappedWidth() return self.text:find("阿彻鲁斯",1,true) and 80 or 240 end
      function button.Check:IsShown() return true end
      function button.Check:SetPoint(point,relative,x,y) self.point=point;self.relative=relative;self.offset=x end
      return button
    end
    local first=row("[2] [55] 12680 - Grand Theft Palomino",1)
    local second=row("A Personal Message",2)
    QuestMapFrame={QuestsFrame={Contents={Titles={first,second}}}}
    local function objective(text,questID,height,shown)
      local frame={Text=Widget(text),questID=questID,height=14}
      function frame:IsShown() return shown~=false end
      function frame:SetHeight(h) self.height=h end
      function frame.Text:GetStringHeight() return A.IsChinese(self.text) and height or 14 end
      return frame
    end
    QLOF1=objective("Bring Mina Mudclaw home to her father: 0/1",12680,42)
    QLOF2=objective("Speak with Prophet Velen.",47202,28)
    QLOF3=objective("Unrecorded objective: 0/3",12680,28)
    QLOF4=objective("已有中文目标: 0/1",12680,14)
    QLOF5=objective("Bring Mina Mudclaw home to her father: 0/1",12680,42,false)
    QLOF6=objective("Bring Mina Mudclaw home to her father: 0/1",999999,42)
    QuestScrollFrame={updates=0};function QuestScrollFrame:UpdateScrollChildRect() self.updates=self.updates+1 end
    hooks.QuestLogQuests_Update()
    assert(first.Text.text=="[2] [55] 12680 - 阿彻鲁斯战马")
    assert(QLOF1.Text.text=="将米娜·泥爪带回她父亲身边: 0/1" and QLOF1.height==42)
    assert(QLOF2.Text.text=="与先知维伦谈一谈。" and QLOF2.height==28)
    assert(first.height==112 and second.height==84,"title plus objective deltas belong to their own rows")
    assert(first.Check.offset==82 and first.Check.relative==first.Text)
    assert(QLOF3.Text.text=="Unrecorded objective: 0/3" and QLOF4.Text.writes==0)
    assert(QLOF5.Text.writes==0 and QLOF6.Text.writes==0,"hidden and stale frames stay untouched")
    assert(QuestScrollFrame.updates==1 and selected==0)
    hooks.QuestLogQuests_Update()
    assert(first.height==112 and second.height==84 and QuestScrollFrame.updates==1,"idempotent refresh")
    LegionChineseSettings={enabled=false}
    QLOF1.Text.text="Bring Mina Mudclaw home to her father: 0/1"
    hooks.QuestLogQuests_Update();assert(QLOF1.Text.text=="Bring Mina Mudclaw home to her father: 0/1")
  `,[shippedRow('Quests',12680),shippedRow('Quests',47202),shippedText('Objectives',objective)].join('\n'));
});
