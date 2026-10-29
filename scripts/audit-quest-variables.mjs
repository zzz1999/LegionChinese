// Recheck the reviewed snapshot against the pinned, already downloaded SQL.
// Usage: node scripts/audit-quest-variables.mjs <capture-directory> <TDB-directory>
// SQL is parsed as data and is never executed. No download or project mutation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readSQL} from './sql.mjs';
import {normalize} from './text.mjs';

const [captures,world]=process.argv.slice(2);
if(!captures||!world)throw Error('Provide capture and TDB cache directories.');
const snapshot=JSON.parse(fs.readFileSync(new URL('../data/quest-variables-735.json',import.meta.url)));
const quests=[...snapshot.quests,...snapshot.deferred],ids=new Set(quests.map(q=>q.id)),data=new Map();
for(const source of snapshot.sources){
  const file=path.join(source.provenance==='community-client-capture'?captures:world,source.file);
  const hash=crypto.createHash('sha256');
  for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  if(hash.digest('hex')!==source.sha256)throw Error('Source hash mismatch: '+source.file);
  const rows=new Map();
  await readSQL(file,new Set(['quest_template','quest_template_locale']),(table,row)=>{
    if(!ids.has(Number(row.ID)))return;
    const key=row.ID+':'+(row.locale??'enUS');
    rows.set(key,{...rows.get(key),...row});
  });
  data.set(source.id,rows);
}
const columns={Description:'QuestDescription',Objectives:'LogDescription'};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&normalize(a)===normalize(b);
let languageRows=0;
for(const quest of quests){
  const column=columns[quest.field],en=data.get(quest.originalSource)?.get(quest.id+':enUS');
  if(!same(quest.original,en?.[column])||!same(quest.originalTitle,en?.LogTitle)||Number(en?.VerifiedBuild)!==quest.originalBuild)
    throw Error('English source mismatch: '+quest.id);
  const later=data.get('TDB_world_735.26972_2025_05_11.sql');
  if(!same(quest.original,later.get(quest.id+':enUS')?.[column]))throw Error('English crosscheck mismatch: '+quest.id);
  for(const t of quest.translations){
    const row=data.get(t.source)?.get(quest.id+':'+t.locale);
    if(!same(t.text,row?.[column])||!same(t.title,row?.LogTitle)||Number(row?.VerifiedBuild)!==t.build
      ||!same(t.text,later.get(quest.id+':'+t.locale)?.[column]))throw Error('Chinese source mismatch: '+quest.id+':'+t.locale);
    languageRows++;
  }
}
console.log(JSON.stringify({sourceHashes:snapshot.sources.length,fields:quests.length,languageRows,
  enabled:snapshot.quests.length,deferred:snapshot.deferred.length,
  note:'Later TDB shares source lineage and is not independent official corroboration.'}));
