// Batch-review the pinned locale SQL against legacy and Legion quest context.
// Optional paths: locale SQL, legacy world, Legion Proyect, TDB 2018, TDB 2025.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readSQL} from './sql.mjs';
import {collectReviewedDialogue,dialogueColumns} from './quest-dialogue.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sources=[
  {id:'pandaria-locales',file:'2026_08_06_16_world_quest_locale_import.sql',
    url:'https://raw.githubusercontent.com/alexkulya/pandaria_5.4.8/e0a20613d73e2b9324ac13a4783c724fec1d4559/sql/old/world/2026_08_06_16_world_quest_locale_import.sql',
    sha256:'723085dca6fcbc11b7130aff535af9f2534262884a42725335a1861c09e3a85f',patch:'5.4.8',license:'GPL-2.0'},
  {id:'pandaria-world',file:'world_04_03_2023.sql',
    url:'https://raw.githubusercontent.com/alexkulya/pandaria_5.4.8/e0a20613d73e2b9324ac13a4783c724fec1d4559/sql/base/world_04_03_2023.zip',
    archiveSha256:'16c9a3e63f8aeaab9259524aefda5184f089455d7cbfb7a3810516ec4f257c7f',
    sha256:'e1be72be7b5b6b3effd3426906c32b43e47b03d562b74520ab8ce7a070702542',patch:'5.4.8',license:'GPL-2.0'},
  {id:'legion-world',file:'legion_world.sql',
    url:'https://raw.githubusercontent.com/zitengzela/LegionCore-7.3.5V2/80ad17a234fd4ed462bc9a23e401b70f86f15a0d/sql/base/Legion_Proyect-DB.7z',
    archiveSha256:'6bb034ec09e736deb814d4f511b19d5910722318ed171db5789c4934784a58a9',
    sha256:'d1faf4efeca0cbd2940964e72e7e519f90e304d6778c110d0cc951c79a06f27e',patch:'7.3.5',license:'GPL-2.0'}
];
const manifest=JSON.parse(fs.readFileSync(path.join(root,'sources.json'),'utf8'));
for(const [id,kind] of [['tdb-2018','world'],['tdb-2025','dialogue-world']]){
  const source=manifest.sql.find(s=>s.kind===kind);
  sources.push({id,file:source.file,url:source.url,member:source.member,sha256:source.sha256,patch:'7.3.5',license:'GPL-2.0'});
}
const rows=new Map(),ids=new Set();
const selected=new Set(['quest_template','quest_request_items','quest_offer_reward','quest_request_items_locale','quest_offer_reward_locale']);
for(const [i,source] of sources.entries()){
  const file=process.argv[i+2]??path.join(root,'.cache',i<3?'reviewed-dialogue':'',source.file);
  const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  assert.equal(hash.digest('hex'),source.sha256,`Source checksum: ${source.file}`);
  const tables=new Map();rows.set(source.id,tables);
  await readSQL(file,selected,(table,row,update)=>{
    const id=Number(row.ID??row.Id),locale=row.locale??row.Locale??'enUS';
    if(!['enUS','zhCN','zhTW'].includes(locale)||i>0&&!ids.has(id))return;
    if(!tables.has(table))tables.set(table,new Map());
    const records=tables.get(table),key=id+':'+locale,existing=records.get(key);
    if(existing&&!update)throw Error(`Duplicate source row: ${source.id}:${table}:${key}`);
    records.set(key,update?{...existing,...row}:row);
    if(i===0&&['zhCN','zhTW'].includes(locale)&&Number(row.VerifiedBuild)>0&&Number(row.VerifiedBuild)<=26972)ids.add(id);
  });
  console.log('Verified '+source.id);
}
const tableRows=(source,table)=>[...(rows.get(source).get(table)?.values()??[])];
const questMap=source=>new Map(tableRows(source,'quest_template').map(r=>[String(r.ID??r.Id),r]));
const localeRows=Object.entries(dialogueColumns).flatMap(([field,spec])=>{
  const [table,column]=spec.split('.');
  return tableRows('pandaria-locales',table).map(r=>({id:Number(r.ID),field,locale:r.locale??r.Locale,build:Number(r.VerifiedBuild),text:r[column]}));
});
const references=['tdb-2018','tdb-2025','legion-world'].map(id=>({id,quests:questMap(id),
  ...Object.fromEntries(Object.entries(dialogueColumns).map(([field,spec])=>{
    const [table,column]=spec.split('.');
    return [field,new Map(tableRows(id,table.replace('_locale','')).map(r=>[String(r.ID),{text:r[column],build:Number(r.VerifiedBuild)}]))];
  }))}));
const reviewFile='data/quest-dialogue-reviews.json',reviewBytes=fs.readFileSync(path.join(root,reviewFile));
const {quests,verification}=collectReviewedDialogue({localeRows,legacyQuests:questMap('pandaria-world'),baseQuests:questMap('tdb-2018'),references,reviews:JSON.parse(reviewBytes)});
const snapshot={schemaVersion:2,targetBuild:26972,provenance:'reviewed-legacy-dialogue',sources,
  reviews:{file:reviewFile,sha256:crypto.createHash('sha256').update(reviewBytes).digest('hex')},verification,quests};
const file='data/reviewed-quest-dialogue.json',bytes=JSON.stringify(snapshot,null,2)+'\n';
fs.writeFileSync(path.join(root,file),bytes);
manifest.reviewedQuestDialogue={file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
fs.writeFileSync(path.join(root,'sources.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({...manifest.reviewedQuestDialogue,quests:quests.length,
  fields:quests.reduce((n,q)=>n+Object.keys(q.fields).length,0),rows:verification.rows,byResult:verification.byResult}));
