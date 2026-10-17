import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lua,lauxlib,lualib,to_luastring,to_jsstring} from 'fengari';
import {fingerprint,normalize,luaString} from '../scripts/text.mjs';

const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
const data=new URL('Data/',addon);
const files=fs.readdirSync(data);
const readLines=prefix=>files.filter(f=>f.startsWith(prefix+'_')).flatMap(f=>fs.readFileSync(new URL(f,data),'utf8').split('\n'));
const bookText='Welcome to the Scourge. Now that you have entered your true service, you may find immense relief in your liberation from various mortal inconveniences. No bothersome sleeping to take up your time anymore, nor any great need for shelter from the elements, and you are even free from the mild irritation of cutting hair and nails! How delightful!';

test('reported death knight book and quest progress translate through XML-bound handlers with shipped data',()=>{
  const key=fingerprint(normalize(bookText));
  const bookRow=readLines('Books').find(line=>line.startsWith(`D.Books["${key}"]=`));
  assert.ok(bookRow,'page 3226 must be in the shipped book index');
  const stringID=bookRow.match(/=(\d+)$/)[1];
  const stringRow=readLines('Strings').find(line=>line.startsWith(`D.Strings[${stringID}]=`));
  const questRow=readLines('Quests').find(line=>line.startsWith('D.Quests[12680]='));
  assert.ok(stringRow&&questRow);
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try {
    execute(fs.readFileSync(new URL('Bootstrap.lua',addon),'utf8'));
    execute(`local D=LegionChineseDB\n${bookRow}\n${stringRow}\n${questRow}`);
    execute(fs.readFileSync(new URL('Core.lua',addon),'utf8'));
    execute(fs.readFileSync(new URL('./ui-fixture.lua',import.meta.url),'utf8'));
    execute(fs.readFileSync(new URL('UI.lua',addon),'utf8'));
    execute(`
      bookText=${luaString(bookText)}
      ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY")
      assert(ItemTextPageText.text=="欢迎加入天谴军。既然你已经真正地服役了，你会发觉你从那些不便的各种凡人痛苦中解脱。没有扰人的睡眠偷走你的时间，不需避难所躲避各种天灾，甚至连剪指甲跟头发都省了!真愉快!","reported book page")
      questID=12680;progressTitle="阿彻鲁斯战马";progressText="You don't want to walk forever, do you?"
      QuestFrameProgressPanel:Fire("OnShow")
      assert(QuestProgressTitleText.text==progressTitle,"Chinese title stays unchanged")
      assert(QuestProgressText.text=="你不想一直徒步行走，对吧?","reported quest progress")
      LegionChineseSettings={enabled=false}
      QuestFrameProgressPanel:Fire("OnShow");ItemTextFrame:Fire("OnEvent","ITEM_TEXT_READY")
      assert(QuestProgressText.text==progressText and ItemTextPageText.text==bookText)
    `);
  } finally {lua.lua_close(L);}
});

test('Blingtron daily reward body translates after the native reward population with a Chinese title',()=>{
  const quests=readLines('Quests').filter(line=>/^D\.Quests\[(34774|40753|32851)\]=/.test(line));
  assert.equal(quests.length,3);
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const execute=source=>{
    const status=lauxlib.luaL_dostring(L,to_luastring(source));
    assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
  };
  try{
    execute(fs.readFileSync(new URL('Bootstrap.lua',addon),'utf8'));
    execute(`local D=LegionChineseDB\n${quests.join('\n')}`);
    execute(fs.readFileSync(new URL('Core.lua',addon),'utf8'));
    execute(fs.readFileSync(new URL('./ui-fixture.lua',import.meta.url),'utf8'));
    // 7.3.5 QuestInfo_ShowRewardText fills this widget through GetRewardText.
    // Populate before installing the addon, as Blizzard's template does.
    execute(`
      rewardCalls=0
      function GetLocale() return "zhCN" end
      function GetTitleText() return rewardTitle end
      function GetRewardText() rewardCalls=rewardCalls+1;return rewardBody end
      function QuestInfo_Display()
        QuestInfoFrame.questLog=false
        QuestInfoTitleHeader:SetText(GetTitleText())
        QuestInfoRewardText:SetText(GetRewardText())
      end
    `);
    execute(fs.readFileSync(new URL('UI.lua',addon),'utf8'));
    execute(`
      questID=34774;rewardTitle="布林顿5000"
      local original="You will accept this gift, and you will like it.  To do otherwise will automatically engage my organic incineration weapons.  Thank you."
      local translated="你要接受这份馈赠，并且一定会喜欢它的。不然就会自动启用我的有机焚化武器。谢谢你。"
      rewardBody=original;QuestInfo_Display()
      assert(QuestInfoTitleHeader.text==rewardTitle,"Chinese title stays unchanged")
      assert(QuestInfoRewardText.text==translated,"Blingtron 5000 daily gift reward")
      assert(rewardCalls==1 and GetRewardText()==original,"native quest API is unchanged")
      assert(QuestInfoRewardText.fontChanges==0,"native Chinese font remains in use")
      rewardTitle="Blingtron 5000";QuestInfo_Display()
      assert(QuestInfoTitleHeader.text=="布林顿5000" and QuestInfoRewardText.text==translated)
      rewardBody="服务器已有中文奖励正文。";QuestInfo_Display()
      assert(QuestInfoRewardText.text==rewardBody,"existing Chinese stays unchanged")
      rewardBody="伺服器已有繁體獎勵正文。";QuestInfo_Display()
      assert(QuestInfoRewardText.text==rewardBody,"existing Traditional stays unchanged")
      questID=32851;rewardTitle="布林顿3000";rewardBody="A different brawler reward.";QuestInfo_Display()
      assert(QuestInfoRewardText.text==rewardBody,"do not assign daily gifts to Blingtron 3000")
      local text=LegionChinese.Render(LegionChineseDB.Quests[40753].Completion)
      assert(text=="我的功能是发放礼物，根据我的观察显示，你的功能是接收礼物。\\n\\n我们可以进行一次互惠互利的交易吗？","Blingtron 6000 paragraphs")
      questID=34774;rewardBody=original;LegionChineseSettings={enabled=false};QuestInfo_Display()
      assert(QuestInfoRewardText.text==original,"disabled addon preserves native reward")
      LegionChineseSettings.enabled=true;QuestInfo_Display()
      assert(QuestInfoRewardText.text==translated,"reopening after enabling translates again")
    `);
  }finally{lua.lua_close(L);}
});
