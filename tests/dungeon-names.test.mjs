import {readFixtureFile,listFixtureFiles} from './addon-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseDungeonTable,selectDungeonNames} from '../scripts/dungeon-names.mjs';

test('dungeon import separates journal IDs from map IDs and picks Simplified then Traditional Chinese',()=>{
  const zhCN=parseDungeonTable('ID,Name_lang,MapID\n721,英灵殿,1477\n786,,1530\n999,Foreign,999\n','JournalInstance');
  const zhTW=parseDungeonTable('ID,Name_lang,MapID\n721,英靈殿,1477\n786,暗夜堡,1530\n999,Foreign,999\n','JournalInstance');
  const result=selectDungeonNames('JournalInstance',{zhCN,zhTW});
  assert.deepEqual([...result.names],[[721,'英灵殿'],[786,'暗夜堡']]);
  assert.deepEqual(result.counts,{ids:2,locales:{zhCN:1,zhTW:1}});
  assert.equal(result.names.has(1477),false);
  const maps=parseDungeonTable('ID,MapName_lang,InstanceType\n0,东部王国,0\n1477,英灵殿,1\n1530,暗夜要塞,2\n30,奥特兰克山谷,3\n','Map');
  assert.deepEqual([...selectDungeonNames('Map',{zhCN:maps}).names],[[1477,'英灵殿'],[1530,'暗夜要塞']]);
});

test('dungeon import refuses mismatched locale records, invalid IDs and unsafe names',()=>{
  for(const csv of ['ID,Name_lang,MapID\n721,英灵殿,1477\n721,另一个副本,1\n',
    'ID,Name_lang,MapID\nwrong,英灵殿,1477\n','ID,Name_lang,MapID\n721,英灵殿,wrong\n',
    'ID,MapName_lang,InstanceType\n1,中文,1\n'])assert.throws(()=>parseDungeonTable(csv,'JournalInstance'));
  assert.throws(()=>selectDungeonNames('JournalInstance',{
    zhCN:new Map([[721,{name:'英灵殿',relation:1477}]]),zhTW:new Map([[721,{name:'英靈殿',relation:123}]])
  }));
  const rows=new Map([[1,{name:'中文|Hitem:1',relation:1}],[2,{name:'中文\n换行',relation:2}]]);
  assert.equal(selectDungeonNames('Map',{zhCN:rows}).names.size,0);
});

test('shipped dungeon table and loader contain verified Legion IDs in separate namespaces',()=>{
  const addon=new URL('../AddOns/LegionChinese/',import.meta.url);
  const data=readFixtureFile(new URL('Data/DungeonNames.lua',addon),'utf8');
  assert.match(data,/D\.JournalInstances\[721\]="英灵殿"/);
  assert.match(data,/D\.InstanceMaps\[1477\]="英灵殿"/);
  assert.match(data,/D\.JournalInstances\[786\]="暗夜要塞"/);
  assert.match(data,/D\.InstanceMaps\[1530\]="暗夜要塞"/);
  const toc=readFixtureFile(new URL('LegionChinese.toc',addon),'utf8');
  assert(toc.indexOf('Bootstrap.lua')<toc.indexOf('Data\\Maps\\DungeonNames.lua'));
  assert(toc.indexOf('Data\\Maps\\DungeonNames.lua')<toc.indexOf('ChatLinks.lua'));
  const audit=JSON.parse(readFixtureFile(new URL('../docs/dungeon-name-audit.json',import.meta.url),'utf8'));
  assert.equal(audit.build,'7.3.5.26972');
  assert.equal(audit.sources.length,4);
  assert(audit.sources.every(s=>s.build==='7.3.5.26972'&&['zhCN','zhTW'].includes(s.locale)&&/^[a-f0-9]{64}$/.test(s.sha256)));
});
