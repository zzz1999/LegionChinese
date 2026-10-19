import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {normalize,fingerprint,luaString,supportsTokens} from '../scripts/text.mjs';

const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
const data=new URL('Data/',addon);
const files=fs.readdirSync(data);
function shippedRow(category,key){
  const start=`D.${category}[${typeof key==='number'?key:luaString(key)}]=`;
  for(const file of files.filter(file=>file.startsWith(category+'_'))){
    const source=fs.readFileSync(new URL(file,data),'utf8');
    const position=source.indexOf('\n'+start);
    if(position>=0)return source.slice(position+1,source.indexOf('\n',position+1));
  }
  assert.fail(`Missing shipped ${category} row: ${key}`);
}
function shippedText(category,original){
  const row=shippedRow(category,fingerprint(normalize(original)));
  const id=Number(row.match(/=(\d+)$/)[1]);
  return row+'\n'+shippedRow('Strings',id);
}
function runLua(code,rows=''){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    execute(fs.readFileSync(new URL('Bootstrap.lua',addon),'utf8'));
    execute(`playerName="Alice";playerClass="法师";classToken="MAGE";playerRace="人类";raceToken="Human";playerSex=2
      function UnitName() return playerName end
      function UnitClass() return playerClass,classToken end
      function UnitRace() return playerRace,raceToken end
      function UnitSex() return playerSex end`);
    execute('local D=LegionChineseDB\n'+rows);
    execute(fs.readFileSync(new URL('Core.lua',addon),'utf8'));
    execute(fs.readFileSync(new URL('./ui-fixture.lua',import.meta.url),'utf8'));
    execute(fs.readFileSync(new URL('UI.lua',addon),'utf8'));
    execute('local A,D=LegionChinese,LegionChineseDB\n'+code);
  }finally{lua.lua_close(L);}
}

test('adjacent name, class, race and line-break tokens survive rendering and fingerprinting',()=>{
  const vectors=[['$r$c','~r~~c~'],['$C$N','~c~~n~'],['$n$Bnext','~n~next'],
    ['$n$$c$$r$','~n~~c~~r~'],['Hello, $N$!','hello,~n~!'],
    ['$C$N$B$R','~c~~n~~r~'],['$N$B$B$c','~n~~c~'],['$n$z','~n~$z']];
  for(const [input,expected] of vectors)assert.equal(normalize(input),expected,input);
  assert.equal(supportsTokens('你好，$N$z'),false,'an adjacent unknown token must stay unsupported');
  runLua(`
    assert(A.Render("$r$c")=="人类法师")
    assert(A.Render("$C$N")=="法师Alice")
    assert(A.Render("$n$B下一行")=="Alice\\n下一行")
    assert(A.Render("$n$$c$$r$")=="Alice法师人类")
    assert(A.Render("$n$G先生:女士;")=="Alice先生")
    playerSex=3;assert(A.Render("$n$G先生:女士;")=="Alice女士")
    assert(A.Render("你好，$N$z")==nil)
    assert(A.Render(D.Quests[187].Description):find("人类法师",1,true))
    assert(A.Render(D.Quests[683].Progress):find("法师Alice",1,true))
    ${vectors.map(([input,expected])=>`assert(A.Normalize(${luaString(input)})==${luaString(expected)})`).join('\n')}
  `,[shippedRow('Quests',187),shippedRow('Quests',683)].join('\n'));
});

test('Chinese clients match localized and English player substitutions without replacing Chinese prose',()=>{
  runLua(`
    for _,className in ipairs({"法师","Mage","mage","MAGE"}) do
      local value,changed=A.Translate("Gossip","Greetings, "..className..".  Are you here to learn of the hidden arts?")
      assert(changed and value=="你好，法师。你是来学习神秘的手艺的吗？",className)
    end
    D.Strings[999999]="欢迎，$n，你是$r$c。"
    D.Gossip[${luaString(fingerprint(normalize('Welcome, $n, a $r $c.')))}]=999999
    playerName="小明"
    for _,text in ipairs({"Welcome, 小明, a 人类 法师.","Welcome, 小明, a Human Mage."}) do
      local value,changed=A.Translate("Gossip",text)
      assert(changed and value=="欢迎，小明，你是人类法师。",text)
    end
    playerClass="法師";playerRace="人類"
    local value,changed=A.Translate("Gossip","Welcome, 小明, a 人類 法師.")
    assert(changed and value=="欢迎，小明，你是人类法师。")
    playerClass="死亡骑士";classToken="DEATHKNIGHT";playerRace="亡灵";raceToken="Scourge"
    value,changed=A.Translate("Gossip","Welcome, 小明, a Undead Death Knight.")
    assert(changed and value=="欢迎，小明，你是亡灵死亡骑士。")
    for _,text in ipairs({"小明","死亡骑士","亡灵","你好，亡灵死亡骑士。","欢迎，小明！","English introduction，后面已有中文。"}) do
      value,changed=A.Translate("Quests",text,187,"Description")
      assert(value==text and not changed,"Chinese prose must stay unchanged: "..text)
    end
    value,changed=A.Translate("Gossip","Unknown greeting, 亡灵 死亡骑士.")
    assert(value=="Unknown greeting, 亡灵 死亡骑士." and not changed)
  `,[shippedText('Gossip','Greetings, $c.  Are you here to learn of the hidden arts?'),shippedRow('Quests',187)].join('\n'));
});

test('quest title translation preserves level, party count, quest ID, failure status and colors',()=>{
  runLua(`
    local raw="Grand Theft Palomino"
    function GetQuestLogTitle() return raw,55,0,false,false,false,0,12680 end
    local button={Text=Widget("|cffffff00[2] [55] 12680 - "..raw.."|r"),questLogIndex=1,height=20}
    function button:IsShown() return true end
    function button:GetHeight() return self.height end
    function button:SetHeight(height) self.height=height end
    function button.Text:GetStringHeight() return self.text:find("阿彻鲁斯",1,true) and 28 or 14 end
    QuestMapFrame={QuestsFrame={Contents={Titles={button}}}}
    hooks.QuestLogQuests_Update()
    assert(button.Text.text=="|cffffff00[2] [55] 12680 - 阿彻鲁斯战马|r")
    assert(button.height==34)
    hooks.QuestLogQuests_Update();assert(button.height==34,"no repeated height growth")
    QuestInfoFrame.questLog=true
    for _,failed in ipairs({"Failed","失败","失敗"}) do
      QuestInfoTitleHeader.text=raw.." - ("..failed..")"
      hooks.QuestInfo_Display()
      assert(QuestInfoTitleHeader.text=="阿彻鲁斯战马 - ("..failed..")",failed)
    end
    raw="Escape (Now) [2].";QuestInfoTitleHeader.text=raw.." - (Failed)"
    hooks.QuestInfo_Display();assert(QuestInfoTitleHeader.text=="阿彻鲁斯战马 - (Failed)","literal title matching")
    QuestInfoTitleHeader.text="Different quest title - (Failed)"
    hooks.QuestInfo_Display();assert(QuestInfoTitleHeader.text=="Different quest title - (Failed)","stale context")
    raw="原来的中文标题";button.Text.text="[2] [55] "..raw
    hooks.QuestLogQuests_Update();assert(button.Text.text=="[2] [55] "..raw)
    raw="Missing translation"
    function GetQuestLogTitle() return raw,55,0,false,false,false,0,999999 end
    button.Text.text="[2] [55] "..raw;hooks.QuestLogQuests_Update()
    assert(button.Text.text=="[2] [55] "..raw)
  `,shippedRow('Quests',12680));
});

test('completed objective labels translate while keeping localized completion text and counters',()=>{
  runLua(`
    local raw="Bring Mina Mudclaw home to her father"
    local zh="将米娜·泥爪带回她父亲身边"
    for _,status in ipairs({"Complete","完成","完成 (100%)."}) do
      COMPLETE=status
      for _,counter in ipairs({"",": 1/1",": 12 / 12"}) do
        local suffix=counter.." ("..status..")"
        local value,changed=A.Translate("Objectives",raw..suffix)
        assert(changed and value==zh..suffix,raw..suffix)
        local widget=Widget("|cff00ff00"..raw..suffix.."|r")
        assert(A.Apply(widget,"Objectives") and widget.text=="|cff00ff00"..zh..suffix.."|r")
        value,changed=A.Translate("Objectives",zh..suffix)
        assert(value==zh..suffix and not changed)
        value,changed=A.Translate("Objectives","Unrecorded objective"..suffix)
        assert(value=="Unrecorded objective"..suffix and not changed)
      end
    end
    COMPLETE="完成"
    local objective=Widget(raw..": 1/1 (完成)")
    QuestInfoObjectivesFrame={Objectives={objective}}
    hooks.QuestInfo_Display();assert(objective.text==zh..": 1/1 (完成)")
    local value,changed=A.Translate("Objectives",raw.." (Custom state)")
    assert(value==raw.." (Custom state)" and not changed,"unknown suffix is not removed")
    D.Strings[999999]="法师";D.Objectives[A.Fingerprint(A.Normalize("Mage defeated"))]=999999
    COMPLETE="Complete"
    value,changed=A.Translate("Objectives","Mage defeated: 1/1 (Complete)")
    assert(changed and value=="法师: 1/1 (Complete)","status is not part of the translation payload")
  `,shippedText('Objectives','Bring Mina Mudclaw home to her father'));
});

test('greeting quest rows resize after translation and refresh scrolling without moving their anchors',()=>{
  runLua(`
    D.Strings[999999]="很长的中文任务标题，需要换成多行显示。"
    D.Titles[A.Fingerprint(A.Normalize("A title"))]=999999
    local function row(text,previous)
      local button=Widget(text);button.height=16;button.previous=previous;button.heightWrites=0
      function button:GetTextHeight() return self.text:find("中文任务",1,true) and 42 or 14 end
      function button:SetHeight(height) self.height=height;self.heightWrites=self.heightWrites+1 end
      function button:GetTop() return self.previous and self.previous:GetBottom()-2 or 100 end
      function button:GetBottom() return self:GetTop()-self.height end
      return button
    end
    QuestTitleButton1=row("A title")
    QuestTitleButton2=row("A title",QuestTitleButton1)
    QuestTitleButton3=row("Unknown title",QuestTitleButton2)
    QuestGreetingScrollFrame={updates=0}
    function QuestGreetingScrollFrame:UpdateScrollChildRect() self.updates=self.updates+1 end
    QuestFrameGreetingPanel:Fire("OnShow")
    assert(QuestTitleButton1.height==44 and QuestTitleButton2.height==44)
    assert(QuestTitleButton2:GetTop()==54 and QuestTitleButton3:GetTop()==8,"following rows retain bottom anchors")
    assert(QuestTitleButton3.height==16 and QuestTitleButton3.text=="Unknown title")
    assert(QuestGreetingScrollFrame.updates>0)
    A.UpdateGreeting();assert(QuestTitleButton1.heightWrites==1 and QuestTitleButton2.heightWrites==1)
    LegionChineseSettings={enabled=false};QuestTitleButton1.text="A title";QuestTitleButton1.height=16
    QuestFrameGreetingPanel:Fire("OnShow");assert(QuestTitleButton1.text==D.Strings[999999] and QuestTitleButton1.height==44)
  `);
});
