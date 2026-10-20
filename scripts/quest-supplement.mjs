import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {normalize} from './text.mjs';
import {usableChinese} from './fallback.mjs';

const columns={Title:'LogTitle',Objectives:'LogDescription',Description:'QuestDescription',CompletionLog:'QuestCompletionLog'};
const fields=new Set([...Object.keys(columns),'Progress','Completion']);
const aliasFields=new Set(['Title','Objectives','Description']);
export function compatibleSupplement(base,quest,field,record){
  if(!base||Number(base.ID)!==quest.id||!fields.has(field)||!['zhCN','zhTW'].includes(record.locale)
    ||!usableChinese(record.text)||!Number.isFinite(record.build)||Math.abs(record.build)>26972
    ||Math.abs(Number(base.VerifiedBuild))>26972)return false;
  const identity=quest.identity;
  if(!identity||!base.LogTitle||normalize(base.LogTitle)!==normalize(identity.title))return false;
  if(![['objectives','LogDescription'],['description','QuestDescription']]
    .some(([key,col])=>base[col]&&normalize(base[col])===normalize(identity[key])))return false;
  const col=columns[field];
  return !col||!base[col]||normalize(base[col])===normalize(record.english);
}

export function compatibleFieldAlias(target,source,quest,field,record){
  // Reviewed class variants can share their journal text, but not their
  // class-specific reward/progress dialogue. Require all three English
  // journal fields to agree in the same pinned Legion base database.
  if(!target||!source)return false;
  return aliasFields.has(field)
    &&[target,source].every(row=>Number.isFinite(Number(row.VerifiedBuild)))
    &&['LogTitle','LogDescription','QuestDescription'].every(column=>
      typeof target[column]==='string'&&target[column].trim()&&typeof source[column]==='string'
      &&normalize(target[column])===normalize(source[column]))
    &&compatibleSupplement(source,quest,field,record)
    &&compatibleSupplement(target,{...quest,id:Number(target.ID)},field,record);
}

export function mergeQuestSupplement({root,manifest,baseQuests,questData,titles,gossip,completions,onField}){
  const spec=manifest.questSupplement;
  const bytes=fs.readFileSync(path.join(root,spec.file));
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==spec.sha256)throw Error('Quest supplement checksum mismatch');
  const snapshot=JSON.parse(bytes);
  if(snapshot.version!=='legion'||snapshot.schemaVersion!==1
    ||!manifest.sql.some(s=>s.kind==='world'&&s.sha256===snapshot.baseWorldSha256))throw Error('Incompatible quest supplement snapshot');
  const audit={source:spec.file,sha256:spec.sha256,archive:snapshot.archive,fields:0,quests:0,byField:{},byLocale:{},bySource:{},rejected:0,preserved:0,records:[]};
  const seen=new Set(),affected=new Set();
  function addField(id,field,record,extra={}){
    const key=String(id),row=questData.get(key)??{};
    onField?.(id,field,record);
    // Fill holes only, including preserving existing Traditional Chinese.
    if(usableChinese(row[field])){audit.preserved++;return;}
    row[field]=record.text;questData.set(key,row);affected.add(id);audit.fields++;
    audit.byField[field]=(audit.byField[field]??0)+1;
    audit.byLocale[record.locale]=(audit.byLocale[record.locale]??0)+1;
    audit.bySource[record.source]=(audit.bySource[record.source]??0)+1;
    const index=field==='Title'?titles:field==='CompletionLog'?completions:['Progress','Completion'].includes(field)?gossip:null;
    if(index)index.add(record.locale,record.english,record.text,-1);
    audit.records.push({id,field,locale:record.locale,source:record.source,column:record.column,build:record.build,...extra});
  }
  for(const quest of snapshot.quests){
    if(!Number.isSafeInteger(quest.id)||quest.id<=0||seen.has(quest.id))throw Error('Duplicate or invalid supplement quest ID');
    seen.add(quest.id);
    for(const [field,record] of Object.entries(quest.fields)){
      if(!snapshot.sources.some(s=>s.id===record.source)||!compatibleSupplement(baseQuests.get(String(quest.id)),quest,field,record)){audit.rejected++;continue;}
      addField(quest.id,field,record);
    }
  }
  const aliases=new Set();
  for(const alias of spec.fieldAliases??[]){
    if(![alias.id,alias.sourceQuestID].every(id=>Number.isSafeInteger(id)&&id>0)
      ||alias.id===alias.sourceQuestID||aliases.has(alias.id)||!Array.isArray(alias.fields)
      ||!alias.fields.length||new Set(alias.fields).size!==alias.fields.length
      ||alias.fields.some(field=>!aliasFields.has(field)))throw Error('Invalid quest field alias');
    aliases.add(alias.id);
    const quest=snapshot.quests.find(row=>row.id===alias.sourceQuestID);
    for(const field of alias.fields){
      const record=quest?.fields[field];
      if(!record||!snapshot.sources.some(source=>source.id===record.source)
        ||!compatibleFieldAlias(baseQuests.get(String(alias.id)),baseQuests.get(String(alias.sourceQuestID)),quest,field,record)){
        audit.rejected++;continue;
      }
      addField(alias.id,field,record,{sourceQuestID:alias.sourceQuestID,match:'reviewed-identical-journal-text'});
    }
  }
  audit.quests=affected.size;
  return audit;
}
