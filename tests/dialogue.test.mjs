import test from 'node:test';
import assert from 'node:assert/strict';
import {broadcastText,selectBroadcast,compatibleLegacyPage,menuKey} from '../scripts/dialogue.mjs';
import {TextIndex,fingerprint,normalize,supportsTokens} from '../scripts/text.mjs';

test('historical SQL column names resolve the same dialogue and menu identity',()=>{
  assert.deepEqual(broadcastText({MaleText:'Hello',FemaleText:'Welcome'}),{male:'Hello',female:'Welcome'});
  assert.deepEqual(broadcastText({Text_lang:'你好',Text1_Lang:'欢迎'}),{male:'你好',female:'欢迎'});
  assert.equal(menuKey({MenuId:123,OptionIndex:4}),menuKey({MenuID:123,OptionID:4}));
});

test('Chinese broadcast selection uses Legion revisions and rejects later expansions',()=>{
  const records=new Map();
  const row=(build,text)=>({ID:'42',locale:'zhCN',Text_lang:text,VerifiedBuild:build});
  selectBroadcast(records,row(25549,'原有译文'),'base');
  selectBroadcast(records,row(26365,'更新译文'),'client',2);
  selectBroadcast(records,row(26365,'较低优先级译文'),'patch',0);
  selectBroadcast(records,row(27547,'后续资料片译文'),'later',3);
  selectBroadcast(records,row(0,'未验证译文'),'unknown');
  assert.equal(records.get('42').male,'更新译文');
  assert.equal(records.get('42').source,'client');
  selectBroadcast(records,row(26972,'最终版本译文'),'last');
  assert.equal(records.get('42').male,'最终版本译文');
});

test('equally ranked conflicting broadcasts stay excluded until a stronger revision exists',()=>{
  const records=new Map();
  const row=text=>({ID:'1',locale:'zhCN',Text_lang:text,VerifiedBuild:26365});
  selectBroadcast(records,row('译文一'),'a');selectBroadcast(records,row('译文二'),'b');
  selectBroadcast(records,row('译文一'),'a');
  assert.equal(records.get('1').ambiguous,true);
  selectBroadcast(records,row('客户端译文'),'client',2);
  assert.equal(records.get('1').ambiguous,undefined);
});

test('legacy books require both the Legion page ID and matching original text',()=>{
  assert.equal(compatibleLegacyPage({ID:'1',Text:'<P>Dear friend</P>'},{ID:'1',Text:'Dear friend'}),true);
  assert.equal(compatibleLegacyPage({ID:'1',Text:'Old story'},{ID:'1',Text:'Changed story'}),false);
  assert.equal(compatibleLegacyPage({ID:'2',Text:'Same story'},{ID:'1',Text:'Same story'}),false);
  assert.equal(compatibleLegacyPage(undefined,{ID:'1',Text:'Same story'}),false);
});

test('community fallback cannot override or invalidate a captured translation',()=>{
  for(const order of [[-1,1],[1,-1]]){
    const index=new TextIndex();
    for(const priority of order)index.add('A book page',priority===1?'客户端原文':'社区译文',priority);
    assert.equal(index.entries.get(fingerprint(normalize('A book page'))),'客户端原文');
    assert.equal(index.ambiguous.size,0);
  }
  const index=new TextIndex();index.add('An old page','社区版本甲',-1);index.add('An old page','社区版本乙',-1);
  assert.equal(index.entries.size,0);
  index.add('An old page','已采集原文',1);
  assert.equal(index.entries.size,1);
});

test('a fingerprint collision stays excluded even when one source has higher priority',()=>{
  const index=new TextIndex(),key=fingerprint(normalize('A book page'));
  index.add('A book page','原文译文');
  index.normalized.set(key,'anothernormalizedtext');
  index.add('A book page','高优先级译文',1);
  index.add('A book page','更高优先级译文',2);
  assert.equal(index.entries.size,0);assert.equal(index.collisions.has(key),true);
});

test('broken or unknown translation tokens cannot produce an unusable resource entry',()=>{
  assert.equal(supportsTokens('你好，$N！$B$G先生:女士;'),true);
  assert.equal(supportsTokens('因为$g他的:她的大力帮忙！'),false);
  const index=new TextIndex();
  index.add('A page with a missing gender terminator','因为$g他的:她的大力帮忙！');
  index.add('An unknown placeholder','未知的$z内容');
  assert.equal(index.entries.size,0);
});
