import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeNpcNames} from '../scripts/npc-name-index.mjs';
import {nameKey} from '../scripts/client-names.mjs';
import {fingerprint,normalize} from '../scripts/text.mjs';

const key=source=>fingerprint(normalize(source));
function base(rows){
  const baseRows=new Map(),baseNameRows=new Map();
  for(const [id,en,cn,tw,alt]of rows){
    baseRows.set(id,{enUS:{Name:en,NameAlt:alt?.[0]},zhCN:{Name:cn,NameAlt:alt?.[1]},zhTW:{Name:tw,NameAlt:alt?.[2]}});
    baseNameRows.set('base.sql:'+id,{enUS:en,zhCN:cn,zhTW:tw});
  }
  return {baseRows,baseNameRows};
}
const row=(id,source,text,locale='zhCN',priority=2,field='Name')=>({id,source,text,locale,priority,field,
  sourceFile:priority===2?'Creature.csv':'capture.sql',provenance:priority===2?'client-db2-via-wago':'community-client-query-capture'});
const merge=(rows,records=[])=>mergeNpcNames({...base(rows),records});

test('NPC baseline keeps Simplified, Traditional and ID-only alternate names unchanged',()=>{
  const {index,labels,audit}=merge([[1,'One','简体一','繁體一',['Alternate','别名','別名']],
    [2,'Two','English','繁體二'],[3,'Shared','甲','甲繁'],[4,'Shared','乙','乙繁'],[5,'Missing','','']]);
  assert.equal(index.entries.get(key('One')),'简体一');assert.equal(index.entries.get(key('Two')),'繁體二');
  assert.equal(index.localeFor(key('Two')),'zhTW');assert.ok(index.ambiguous.has(key('Shared')));
  assert.equal(index.entries.has(key('Alternate')),false);assert.equal(labels.get(1).get(nameKey('Alternate')).text,'别名');
  assert.equal(labels.get(3).get(nameKey('Shared')).text,'甲');assert.equal(labels.get(4).get(nameKey('Shared')).text,'乙');
  assert.deepEqual(audit.baseline.names,audit.final.names);assert.deepEqual(audit.baseline.labels,audit.final.labels);
  assert.deepEqual(audit.missing.map(r=>[r.id,r.source,r.reason]),[[5,'Missing','no-usable-chinese']]);
});

test('new NPC names prefer Simplified and fill Traditional with itemized provenance',()=>{
  const {index,labels,audit}=merge([], [row(127983,"T'paartos",'特帕托','zhTW'),row(127983,"T'paartos",'提帕托斯'),
    row(67634,'Well Supplied Buff Bunny','充分供應增益兔子','zhTW')]);
  assert.equal(index.entries.get(key("T'paartos")),'提帕托斯');
  assert.equal(index.entries.get(key('Well Supplied Buff Bunny')),'充分供應增益兔子');
  assert.deepEqual(labels.get(127983).get(nameKey("T'paartos")),{text:'提帕托斯',locale:'zhCN'});
  assert.deepEqual(audit.additions.names.locales,{zhCN:1,zhTW:1});assert.equal(audit.additions.labels.ids,2);
  assert.ok(audit.additions.names.records.every(r=>r.source&&r.records.every(o=>o.id&&o.sourceFile&&o.provenance)));
  assert.equal(audit.final.names.fingerprints,2);assert.equal(audit.missing.length,0);
});

test('existing Simplified and Traditional translations are not overwritten by any source',()=>{
  const {index,labels,audit}=merge([[85519,'Christoph VonFeasel','旧译','舊譯'],[2,'Traditional Only','','原繁體']],
    [row(85519,'Christoph VonFeasel','新译'),row(2,'Traditional Only','新简体')]);
  assert.equal(index.entries.get(key('Christoph VonFeasel')),'旧译');assert.equal(index.entries.get(key('Traditional Only')),'原繁體');
  assert.equal(labels.get(2).get(nameKey('Traditional Only')).text,'原繁體');assert.equal(audit.conflicts.length,4);
  assert.equal(audit.additions.names.fingerprints,0);assert.equal(audit.additions.labels.keys,0);
});

test('a baseline ambiguous name never revives through a single unambiguous DB2 ID',()=>{
  const {index,labels,audit}=merge([[1,'Mist','迷雾','迷霧'],[2,'Mist','雾气','霧氣']], [row(3,'Mist','雾气')]);
  assert.equal(index.entries.has(key('Mist')),false);assert.ok(index.ambiguous.has(key('Mist')));
  assert.equal(labels.get(3).get(nameKey('Mist')).text,'雾气');
  assert.ok(audit.ambiguous.some(r=>r.reason==='baseline-ambiguity-not-revived'&&r.records[0].id===3));
});

test('source priority applies within one ID but cannot resolve cross-ID names',()=>{
  const {index,labels,audit}=merge([], [row(1,'Guard','抓包旧译','zhCN',1),row(1,'Guard','客户端译名'),
    row(2,'Guard','另一名守卫','zhCN',1),row(3,'Unique','繁體客戶端','zhTW',2),row(3,'Unique','简体抓包','zhCN',1)]);
  assert.equal(labels.get(1).get(nameKey('Guard')).text,'客户端译名');
  assert.equal(labels.get(2).get(nameKey('Guard')).text,'另一名守卫');assert.equal(index.entries.has(key('Guard')),false);
  assert.equal(index.entries.get(key('Unique')),'简体抓包');assert.equal(audit.superseded.length,1);
  assert.ok(audit.ambiguous.some(r=>r.reason==='cross-id-name-conflict'&&r.key===key('Guard')));
});

test('same-priority conflicts remain untranslated and do not fall back to Traditional',()=>{
  const {index,labels,audit}=merge([], [row(1,'Conflict','甲'),row(1,'Conflict','乙'),row(1,'Conflict','一致繁體','zhTW'),
    row(2,'Conflict','甲')]);
  assert.equal(labels.has(1),false);assert.equal(labels.get(2).get(nameKey('Conflict')).text,'甲');
  assert.equal(index.entries.has(key('Conflict')),false);assert.equal(audit.missing[0].reason,'candidate-conflict');
  assert.ok(audit.conflicts.some(r=>r.reason==='same-priority-candidate-conflict'));
});

test('a lower-priority conflict cannot poison an agreed higher-priority name',()=>{
  const {index,audit}=merge([], [row(1,'Unique','旧甲','zhCN',1),row(1,'Unique','旧乙','zhCN',1),
    row(1,'Unique','新译'),row(1,'Unique','新译')]);
  assert.equal(index.entries.get(key('Unique')),'新译');assert.equal(audit.superseded.length,2);assert.equal(audit.conflicts.length,0);
});

test('ID matches do not transfer a translation to a different English name or NPC',()=>{
  const {labels,index,audit}=merge([[1,'Old Name','','']], [row(1,'New Name','新名字'),row(2,'Other NPC','另一个')]);
  assert.equal(labels.get(1).has(nameKey('Old Name')),false);assert.equal(index.entries.has(key('Old Name')),false);
  assert.equal(labels.get(1).get(nameKey('New Name')).text,'新名字');assert.equal(labels.get(2).has(nameKey('New Name')),false);
  assert.deepEqual(audit.missing.map(r=>[r.id,r.source]),[[1,'Old Name']]);
});

test('a verified alternate candidate can enter the global index without upgrading old SQL alternates',()=>{
  const {index,labels,audit}=merge([[81397,'Warsong Wolf','战歌恶狼','戰歌狼',['Bigger Warsong Wolf','战歌恶狼','戰歌狼']],
    [114719,'Trader Caelen','商人塞林','商人愷倫',['Obliterum Specialist','商人塞林','商人愷倫']]],
    [row(81397,'Bigger Warsong Wolf','战歌恶狼','zhCN',2,'NameAlt')]);
  assert.equal(index.entries.get(key('Bigger Warsong Wolf')),'战歌恶狼');
  assert.equal(index.entries.has(key('Obliterum Specialist')),false);assert.equal(labels.get(114719).size,2);
  assert.equal(audit.additions.names.fingerprints,1);assert.equal(audit.additions.labels.keys,0);
});

test('an ambiguous ID key and a disputed existing alternate are not revived as global names',()=>{
  const {index,labels,audit}=merge([[1,'Shared','原甲','',['Shared','原乙','']],
    [2,'Main','主名','',['Alternate','旧别名','']]],
    [row(1,'Shared','新译'),row(2,'Alternate','新别名','zhCN',2,'NameAlt')]);
  assert.equal(labels.has(1),false);assert.equal(index.entries.get(key('Shared')),'原甲');
  assert.equal(labels.get(2).get(nameKey('Alternate')).text,'旧别名');
  assert.equal(index.entries.has(key('Alternate')),false);
  assert.ok(audit.ambiguous.some(r=>r.reason==='baseline-label-ambiguity-not-revived'));
  assert.ok(audit.ambiguous.some(r=>r.reason==='candidate-versus-existing-label-conflict'));
});

test('an ID-only baseline alternate can block a conflicting name from another ID',()=>{
  const {index,labels,audit}=merge([[2,'Main','主名','',['Alternate','旧别名','']]], [row(3,'Alternate','新别名')]);
  assert.equal(index.entries.has(key('Alternate')),false);assert.ok(index.ambiguous.has(key('Alternate')));
  assert.equal(labels.get(2).get(nameKey('Alternate')).text,'旧别名');
  assert.equal(labels.get(3).get(nameKey('Alternate')).text,'新别名');
  const conflict=audit.ambiguous.find(r=>r.reason==='cross-id-name-conflict'&&r.key===key('Alternate'));
  assert.deepEqual(conflict.records.map(r=>r.id).sort(),[2,3]);
  assert.equal(conflict.records.find(r=>r.id===2).provenance,'existing-label');
  assert.equal(audit.additions.names.fingerprints,0);assert.equal(audit.additions.labels.ids,1);
});

test('baseline alternate conflict evidence also follows the global normalization key',()=>{
  const {index,labels}=merge([[2,'Main','主名','',['<font>Alternate</font>','旧别名','']]], [row(3,'Alternate','新别名')]);
  assert.equal(index.entries.has(key('Alternate')),false);
  assert.equal(labels.get(2).get(nameKey('<font>Alternate</font>')).text,'旧别名');
  assert.equal(labels.get(3).get(nameKey('Alternate')).text,'新别名');
});

test('agreeing ID-only aliases allow candidates but never supply a global translation themselves',()=>{
  const agreed=merge([[2,'Main','主名','',['Alternate','共同别名','']]], [row(3,'Alternate','共同别名')]);
  assert.equal(agreed.index.entries.get(key('Alternate')),'共同别名');
  assert.ok(agreed.audit.additions.names.records[0].records.every(r=>r.id===3));
  const fallback=merge([[2,'Main','主名','',['Alternate','旧简体别名','']]], [row(3,'Alternate','繁體候選','zhTW')]);
  assert.equal(fallback.index.entries.get(key('Alternate')),'繁體候選');
  assert.equal(fallback.index.localeFor(key('Alternate')),'zhTW');
  const preserved=merge([[1,'Alternate','已有全局',''],[2,'Main','主名','',['Alternate','别名不同','']]], [row(3,'Alternate','新别名')]);
  assert.equal(preserved.index.entries.get(key('Alternate')),'已有全局');
  assert.equal(preserved.labels.get(2).get(nameKey('Alternate')).text,'别名不同');
});

test('unsafe or untranslated input is audited without changing known names',()=>{
  const {index,labels,audit}=merge([], [row(1,'Unsafe','中文\n换行'),row(2,'$N','名字'),row(3,'English','Untranslated'),
    row(4,'Bad%name','中文'),row(5,'\u202eSpoof','中文')]);
  assert.equal(index.entries.size,0);assert.equal(labels.size,0);assert.equal(audit.rejected.length,5);
  assert.throws(()=>merge([], [row(0,'Invalid','中文')]),/Invalid NPC/);
});

test('literal NPC status markers retain their complete name keys',()=>{
  const {index,labels}=merge([], [row(112445,'<Away> Johnny Awesome','<暂离>强尼·傲森')]);
  assert.equal(index.entries.get(key('<Away> Johnny Awesome')),'<暂离>强尼·傲森');
  assert.equal(labels.get(112445).has(nameKey('Johnny Awesome')),false);
});

test('candidate order does not change resolved names, labels or summary counts',()=>{
  const records=[row(1,'Shared','共同'),row(2,'Shared','共同'),row(3,'Traditional','繁體','zhTW'),
    row(4,'Disputed','甲'),row(4,'Disputed','乙'),row(5,'Known','不同')];
  const first=merge([[5,'Known','已有','']],records),last=merge([[5,'Known','已有','']],records.toReversed());
  assert.deepEqual([...first.index.entries],[...last.index.entries]);assert.deepEqual([...first.labels],[...last.labels]);
  assert.deepEqual(first.audit.final,last.audit.final);
});
