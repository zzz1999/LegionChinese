// Reproduce the four reviewed Shang Xi dialogue fields from pinned SQL files.
// Pass the locale SQL, Pandaria world SQL and Legion world SQL paths in that order.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readSQL} from './sql.mjs';
import {normalize} from './text.mjs';

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
const ids=[29406,29524],rows=new Map();
const selected=new Set(['quest_template','quest_request_items','quest_offer_reward','quest_request_items_locale','quest_offer_reward_locale']);
for(const [i,source] of sources.entries()){
  const file=process.argv[i+2]??path.join(root,'.cache','reviewed-dialogue',source.file);
  const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  assert.equal(hash.digest('hex'),source.sha256,`Source checksum: ${source.file}`);
  await readSQL(file,selected,(table,row)=>{
    const id=Number(row.ID??row.Id),locale=row.locale??row.Locale??'enUS';
    if(ids.includes(id)&&['enUS','zhCN','zhTW'].includes(locale))rows.set(`${source.id}:${table}:${id}:${locale}`,row);
  });
}
const get=(source,table,id,locale='enUS')=>rows.get(`${source}:${table}:${id}:${locale}`);
const identity=row=>({title:row.LogTitle??row.Title,objectives:row.LogDescription??row.Objectives,description:row.QuestDescription??row.Details});
const quests=ids.map(id=>{
  const old=get('pandaria-world','quest_template',id),current=get('legion-world','quest_template',id);
  const legacyIdentity=identity(old),targetIdentity=identity(current);
  for(const key of Object.keys(targetIdentity))assert.equal(normalize(legacyIdentity[key]),normalize(targetIdentity[key]));
  const fields={};
  for(const [field,table,column] of [['Progress','quest_request_items','CompletionText'],['Completion','quest_offer_reward','RewardText']]){
    const original=get('legion-world',table,id),locales={};
    assert.equal(Number(original.VerifiedBuild),26972);
    if(field==='Completion')assert.equal(normalize(old.OfferRewardText),normalize(original[column]));
    for(const locale of ['zhCN','zhTW']){
      const localized=get('pandaria-locales',table+'_locale',id,locale);
      assert.equal(Number(localized.VerifiedBuild),18414);
      locales[locale]={text:localized[column],build:Number(localized.VerifiedBuild)};
    }
    fields[field]={english:original[column],englishBuild:Number(original.VerifiedBuild),column:table+'_locale.'+column,locales};
  }
  return {id,identity:targetIdentity,legacyIdentity,fields};
});
const snapshot={schemaVersion:1,targetBuild:26972,provenance:'reviewed-legacy-dialogue',sources,quests};
const file='data/reviewed-quest-dialogue.json',bytes=JSON.stringify(snapshot,null,2)+'\n';
fs.writeFileSync(path.join(root,file),bytes);
console.log(JSON.stringify({file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),quests:quests.length,fields:4}));
