import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {normalize,hasChinese,supportsTokens} from './text.mjs';
import {ChineseTextIndex} from './fallback.mjs';

export function objectiveAmount(objectives,index){
  if(!Array.isArray(objectives)||!objectives.length)return;
  const rows=[...objectives].sort((a,b)=>a.order-b.order);
  let row;
  if(index===null){if(rows.length===1)row=rows[0];}
  else if(index>0&&index<=rows.length){
    if(rows.every((r,i)=>r.order===i))row=rows[index-1];
    else if(rows.every(r=>r.amount===rows[0].amount))row=rows[0];
  }
  if(row&&Number.isSafeInteger(row.amount)&&row.amount>=0)return row.amount;
}

// Resolve only values backed by this quest's required amounts and the matching
// 7.3.5 class tables. The result still needs an exact live-text fingerprint.
export function expandQuestText(text,{objectives=[],character,locale='enUS',female=false}={}){
  let missing=false;
  const names=character?.locales?.[locale];
  text=String(text??'').replace(/\$[Gg]\s*\(([^;]*);([^)]*)\)/g,(_,m,f)=>female?f:m)
    .replace(/\$[Gg]([^:;]*):([^;]*);/g,(_,m,f)=>female?f:m)
    .replace(/\$[Vv][Gg]([^:;]*):([^;]*);/g,(_,m,f)=>{if(!character){missing=true;return '';}return character.gender===1?f:m;})
    .replace(/\$([Cc][Tt]|[Vv][Nn])(?![A-Za-z])/g,(_,token)=>{
      const value=token.toLowerCase()==='ct'?names?.[female?'titleFemale':'titleMale']:names?.villain;
      if(!value)missing=true;return value??'';
    })
    .replace(/\$(\d*)[Oo][Aa](?![A-Za-z])/g,(_,n)=>{const value=objectiveAmount(objectives,n?+n:null);if(value===undefined)missing=true;return value??'';})
    .replace(/\$[Pp](?![A-Za-z])/g,'$N');
  return !missing&&supportsTokens(text)?text:null;
}

const columns={Title:'LogTitle',Objectives:'LogDescription',Description:'QuestDescription',CompletionLog:'QuestCompletionLog',
  PortraitGiverText:'PortraitGiverText',PortraitGiverName:'PortraitGiverName',PortraitTurnInText:'PortraitTurnInText',PortraitTurnInName:'PortraitTurnInName',AreaDescription:'AreaDescription'};
export function importTranslationExtras({root,manifest,baseQuests,baseObjectives,questData}){
  const spec=manifest.translationExtras,bytes=fs.readFileSync(path.join(root,spec.file));
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==spec.sha256)throw Error('Translation extras checksum mismatch');
  const snapshot=JSON.parse(bytes);
  if(snapshot.schema!==1||snapshot.build!==26972||!manifest.sql.some(s=>s.kind==='world'&&s.sha256===snapshot.baseWorldSha256))throw Error('Translation extras build mismatch');
  const scopes=[],audit={source:spec,fields:0,quests:0,byField:{},byLocale:{zhCN:0,zhTW:0},deferred:[],records:[]};
  for(const q of snapshot.quests){
    const base=baseQuests.get(String(q.id));
    for(const [field,r]of Object.entries(q.fields)){
      if(questData.get(String(q.id))?.[field])continue;
      let reason;
      const col=columns[field];
      const context=base&&normalize(base.LogTitle)===normalize(q.identity.title)
        &&['LogDescription','QuestDescription'].some((c,i)=>base[c]&&normalize(base[c])===normalize(q.identity[['objectives','description'][i]]));
      // Short titles are only used when that exact ID and full title are on screen.
      if(!base||Math.abs(Number(base.VerifiedBuild))>26972||(!context&&!(col&&base[col]&&normalize(base[col])===normalize(r.english))))reason='quest_context';
      else if(!['zhCN','zhTW'].includes(r.locale)||!Number.isFinite(r.build)||Math.abs(r.build)>26972||!hasChinese(r.text)||!r.english||hasChinese(r.english))reason='invalid_source';
      else if(col&&base[col]&&normalize(base[col])!==normalize(r.english))reason='changed_original';
      const objectives=baseObjectives.get(String(q.id))??[];
      if(!reason&&/\$\d*oa\b/i.test(r.text+' '+r.english)
        &&!q.objectives.every(o=>objectives.some(b=>b.id===o.id&&b.amount===o.amount&&b.order===o.order)))reason='objective_context';
      const index=new ChineseTextIndex();
      if(!reason)for(const character of /\$(?:ct|vn|vg)/i.test(r.text+' '+r.english)?snapshot.classes:[undefined])for(const female of [false,true]){
        const options={objectives,character,female};
        const original=expandQuestText(r.english,{...options,locale:'enUS'});
        const chinese=expandQuestText(r.text,{...options,locale:r.locale});
        if(original&&chinese)index.add(r.locale,original,chinese);
      }
      index.finish();
      if(!index.entries.size){audit.deferred.push({id:q.id,field,reason:reason??'unresolved_or_ambiguous_variables'});continue;}
      scopes.push({id:q.id,field,index});audit.fields++;audit.byField[field]=(audit.byField[field]??0)+1;audit.byLocale[r.locale]++;
      audit.records.push({id:q.id,field,locale:r.locale,source:r.source,column:r.column,build:r.build,fingerprints:[...index.entries.keys()]});
    }
  }
  audit.quests=new Set(scopes.map(s=>s.id)).size;
  return {scopes,audit};
}
