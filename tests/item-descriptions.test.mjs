import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseItemDescriptionTable,selectClientItemDescriptions,buildItemDescriptions} from '../scripts/item-descriptions.mjs';
import {nameKey} from '../scripts/client-names.mjs';

const sha=body=>crypto.createHash('sha256').update(body).digest('hex');

test('ItemSparse parser handles quoted and multiline descriptions and rejects corrupt IDs/columns',()=>{
  const rows=parseItemDescriptionTable('\uFEFFID,Display_lang,Description_lang\r\n1,Name,"First line,\r\nsecond ""quote"""\r\n2,Name,\r\n');
  assert.equal(rows.get(1),'First line,\r\nsecond "quote"');assert.equal(rows.get(2),'');
  for(const csv of ['ID,Name_lang\n1,Name','ID,Description_lang\n1,a\n1,b','ID,Description_lang\n0,a',
    'ID,Description_lang\n1e3,a','ID,Description_lang\n1,a,extra','ID,Description_lang\n1,"unfinished'])
    assert.throws(()=>parseItemDescriptionTable(csv));
});

test('client descriptions select Chinese per item, retaining literal punctuation and excluding unresolved formulas/links',()=>{
  const enUS=new Map([[1,'Description'],[2,'Fallback'],[3,'Missing'],[4,'Formula $s1'],[5,''],
    [6,'|cffffffff"A colored saying"|r'],[7,'<First line>\r\nSecond line'],[8,'Markup'],[9,'Invalid CN']]);
  const zhCN=new Map([[1,'简体说明'],[2,'English'],[4,'公式$s1'],[6,'|cffffffff一句彩色格言|r'],
    [7,'<第一行>\r\n第二行'],[8,'|Hitem:1|h[中文链接]|h'],[9,'未展开$s1']]);
  const zhTW=new Map([[1,'繁體說明'],[2,'繁體備用'],[9,'完整繁體說明']]);
  const selected=selectClientItemDescriptions({enUS,zhCN,zhTW});
  assert.deepEqual(selected.records.map(row=>[row.itemID,row.locale]),[[1,'zhCN'],[2,'zhTW'],[6,'zhCN'],[7,'zhCN'],[9,'zhTW']]);
  assert.equal(selected.records[2].key,nameKey('"A colored saying"'));
  assert.equal(selected.records[2].text,'一句彩色格言');
  assert.equal(selected.records[3].text,'<第一行>\n第二行');
  assert.deepEqual(selected.counts.skipped,{emptyOriginal:1,unsupportedOriginal:1,missingChinese:1,unsupportedChinese:1});
  assert.throws(()=>selectClientItemDescriptions({enUS,zhCN}),/Missing ItemSparse/);
});

test('description build pins version and hashes, prefers client wording and keeps only Chinese/IDs/fingerprints in shards',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'legion-items-'));
  try{
    for(const dir of ['.cache','data','docs','AddOns/LegionChinese/Data'])fs.mkdirSync(path.join(root,dir),{recursive:true});
    const reviewed={schema:1,records:[{itemID:1,original:'Original wording',originalSource:{verifiedBuild:26654},
      translations:[{locale:'zhCN',text:'旧社区译文',verifiedBuild:null}]}]};
    const body=JSON.stringify(reviewed);
    fs.writeFileSync(path.join(root,'data/item-descriptions.json'),body);
    const manifest={itemDescriptions:{file:'data/item-descriptions.json',sha256:sha(body)},itemDescriptionTables:[]};
    for(const [locale,text]of [['enUS','Original wording'],['zhCN','客户端简体说明'],['zhTW','客戶端繁體說明']]){
      const file='ItemSparse-'+locale+'.csv',csv='ID,Description_lang\n1,'+text+'\n';
      fs.writeFileSync(path.join(root,'.cache',file),csv);
      manifest.itemDescriptionTables.push({table:'ItemSparse',build:'7.3.5.26972',locale,provenance:'client-db2-via-wago',file,sha256:sha(csv)});
    }
    const stale=path.join(root,'AddOns/LegionChinese/Data/ItemDescriptions_99.lua');fs.writeFileSync(stale,'stale');
    const other=path.join(root,'AddOns/LegionChinese/Data/Other.lua');fs.writeFileSync(other,'untouched');
    const result=buildItemDescriptions({root,manifest,version:'1.2.11'});
    assert.deepEqual(result.generated,['Data\\ItemDescriptions_01.lua']);
    assert.equal(result.audit.counts.items,1);assert.equal(result.audit.counts.client.selected,1);
    assert.equal(result.audit.counts.reviewed,0);assert.ok(!fs.existsSync(stale));assert.equal(fs.readFileSync(other,'utf8'),'untouched');
    const content=fs.readFileSync(path.join(root,'AddOns/LegionChinese/Data/ItemDescriptions_01.lua'),'utf8');
    assert.ok(content.includes('客户端简体说明'));assert.ok(content.includes(nameKey('Original wording')));
    assert.ok(!content.includes('Original wording')&&!content.includes('旧社区译文'));
    const changed=structuredClone(manifest);changed.itemDescriptionTables[0].build='8.0.1.28153';
    assert.throws(()=>buildItemDescriptions({root,manifest:changed,version:'1.2.11'}),/Unexpected/);
    changed.itemDescriptionTables[0]=manifest.itemDescriptionTables[0];changed.itemDescriptionTables[1].sha256='0'.repeat(64);
    assert.throws(()=>buildItemDescriptions({root,manifest:changed,version:'1.2.11'}),/hash mismatch/);
  }finally{
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('legion-items-'));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
