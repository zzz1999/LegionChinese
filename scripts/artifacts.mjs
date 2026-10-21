import {writeResourceChunks} from './resource-writer.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {csvRows,nameKey} from './client-names.mjs';
import {chooseStatic,parseColumns} from './extra-client-data.mjs';
import {fingerprint,normalize,hasChinese,luaString} from './text.mjs';

export const ARTIFACT_BUILD='7.3.5.26972';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const entry=(key,text)=>'['+luaString(key)+']='+luaString(text);
const entries=map=>'{'+[...map].map(([key,text])=>entry(key,text)).join(',')+'}';

// Unlock conditions contain paragraph/class tokens, not spell effect formulas.
// Do not turn unrecognized tokens into plausible-looking requirements.
export function chooseCondition(original,cn,tw){
  const safe=text=>typeof text==='string'&&text.trim()!==''&&!/[|<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)
    &&!text.replace(/\$[Bb]|\$[Cc](?![A-Za-z])/g,'').includes('$');
  if(!safe(original)||hasChinese(original))return;
  for(const [locale,text]of [['zhCN',cn],['zhTW',tw]])if(safe(text)&&hasChinese(text))return {key:fingerprint(normalize(original)),text,locale};
}

export function reviewedChoices(snapshot){
  if(snapshot.schema!==1||snapshot.build!==ARTIFACT_BUILD)throw Error('Unsupported artifact choice review build');
  const choices=new Map(),audit={fields:0,descriptions:0,choices:0,options:0,records:[],deferred:[]};
  const sourceFiles=new Set(snapshot.sources.map(s=>s.file));
  for(const row of snapshot.reviews){
    if(!sourceFiles.has(row.source)||!Number.isSafeInteger(row.choiceID)||row.choiceID<=0
      ||!Number.isSafeInteger(row.responseID)||row.responseID<=0)throw Error('Invalid artifact choice review context');
    for(const [field,r]of Object.entries(row.fields)){
      if(!['Question','Header','Answer','Description'].includes(field))throw Error('Unknown artifact choice field');
      const record={source:row.source,choiceID:row.choiceID,responseID:row.responseID,field,reason:r.reason};
      if(r.decision!=='accept'){audit.deferred.push(record);continue;}
      if(!['zhCN','zhTW'].includes(row.locale)||!Number.isInteger(row.build)||row.build<=0||row.build>26972
        ||!r.reason||!r.original||hasChinese(r.original)||!hasChinese(r.text)
        ||/[|$<>]/.test(r.original+r.text))throw Error('Unsafe accepted artifact choice field');
      const key=fingerprint(normalize(r.original));
      let choice=choices.get(row.choiceID);
      if(!choice){choice={Question:new Map(),Options:new Map()};choices.set(row.choiceID,choice);}
      let option=choice.Options.get(row.responseID);
      if(!option){option={};choice.Options.set(row.responseID,option);}
      const map=field==='Question'?choice.Question:(option[field]??=new Map());
      const value=map.get(key);
      if(value&&value.text!==r.text&&value.locale===row.locale)throw Error('Conflicting artifact choice review');
      if(!value||value.locale==='zhTW'&&row.locale==='zhCN')map.set(key,{text:r.text,locale:row.locale});
      audit.records.push({...record,locale:row.locale,build:row.build,fingerprint:key});
    }
  }
  for(const choice of choices.values()){
    audit.fields+=choice.Question.size;
    for(const option of choice.Options.values())for(const [field,map]of Object.entries(option)){
      audit.fields+=map.size;if(field==='Description')audit.descriptions+=map.size;
    }
    audit.options+=choice.Options.size;
  }
  audit.choices=choices.size;
  return {choices,audit};
}

export function buildArtifacts({root,input,manifest,version}){
  const audit={version,build:ARTIFACT_BUILD,sources:[],counts:{},deferred:{conditions:[],setDescriptions:[]}};
  const sources=manifest.artifactTables,lines=[],generated=[];
  function read(table,columns,localized=true,compareMetadata=false){
    const result={};
    for(const s of sources.filter(s=>s.table===table)){
      if(s.build!==ARTIFACT_BUILD||!['enUS','zhCN','zhTW'].includes(s.locale)||result[s.locale])throw Error('Unsupported artifact source');
      const bytes=fs.readFileSync(path.join(input,s.file));if(sha(bytes)!==s.sha256)throw Error('Artifact checksum: '+s.file);
      const text=bytes.toString('utf8');
      const header=csvRows(text).next().value;
      result[s.locale]=parseColumns(text,compareMetadata?header.filter(c=>c!=='ID'):columns);audit.sources.push(s);
    }
    for(const l of localized?['enUS','zhCN','zhTW']:['enUS'])if(!result[l])throw Error('Missing artifact table: '+table+'/'+l);
    if(compareMetadata)for(const [id,en]of result.enUS)for(const l of ['zhCN','zhTW']){
      const localRow=result[l].get(id);
      if(!localRow||Object.keys(en).some(c=>!c.endsWith('_lang')&&en[c]!==localRow[c]))throw Error('Artifact locale metadata mismatch: '+table+'/'+id);
    }
    return result;
  }
  const artifacts=read('Artifact',['Name_lang'],true,true);
  const sets=read('ArtifactAppearanceSet',['Name_lang','Description_lang','ArtifactID'],true,true);
  const appearances=read('ArtifactAppearance',['Name_lang','ArtifactAppearanceSetID','UnlockPlayerConditionID'],true,true);
  const conditions=read('PlayerCondition',['Failure_description_lang']);
  const powers=read('ArtifactPower',['ArtifactID'],false);
  const ranks=read('ArtifactPowerRank',['ArtifactPowerID','SpellID'],false);
  const titleNames=new Map(),conflicts=new Set();
  function count(kind,selected){const c=audit.counts[kind]??={ids:0,zhCN:0,zhTW:0};if(selected){c.ids++;c[selected.locale]++;}}
  function title(selected){
    if(!selected)return;
    if(titleNames.has(selected.key)&&titleNames.get(selected.key)!==selected.text)conflicts.add(selected.key);
    titleNames.set(selected.key,selected.text);
  }
  for(const [id,en]of artifacts.enUS){
    const selected=chooseStatic(en.Name_lang,artifacts.zhCN.get(id)?.Name_lang,artifacts.zhTW.get(id)?.Name_lang);
    count('artifacts',selected);title(selected);
    if(selected)lines.push('D.ArtifactNames['+id+']={'+entry(selected.key,selected.text)+'}');
  }
  for(const [id,en]of sets.enUS){
    const artifactID=+en.ArtifactID;if(!artifacts.enUS.has(artifactID))throw Error('Unknown appearance set artifact');
    const selected=chooseStatic(en.Name_lang,sets.zhCN.get(id)?.Name_lang,sets.zhTW.get(id)?.Name_lang);
    count('appearanceSets',selected);
    const description=chooseStatic(en.Description_lang,sets.zhCN.get(id)?.Description_lang,sets.zhTW.get(id)?.Description_lang);
    if(!description)audit.deferred.setDescriptions.push(id);
    lines.push('D.ArtifactAppearanceSets['+id+']={ArtifactID='+artifactID
      +',Name={'+(selected?entry(selected.key,selected.text):'')+'}'
      +(description?',Description={'+entry(description.key,description.text)+'}':'')+'}');
  }
  const referencedConditions=new Set();
  for(const [id,en]of appearances.enUS){
    const setID=+en.ArtifactAppearanceSetID,conditionID=+en.UnlockPlayerConditionID;
    if(!sets.enUS.has(setID))throw Error('Unknown artifact appearance set');
    const selected=chooseStatic(en.Name_lang,appearances.zhCN.get(id)?.Name_lang,appearances.zhTW.get(id)?.Name_lang);
    count('appearances',selected);title(selected);
    lines.push('D.ArtifactAppearances['+id+']={SetID='+setID+',ConditionID='+conditionID
      +',Name={'+(selected?entry(selected.key,selected.text):'')+'}}');
    if(conditionID>0)referencedConditions.add(conditionID);
  }
  for(const id of [...referencedConditions].sort((a,b)=>a-b)){
    const column='Failure_description_lang',en=conditions.enUS.get(id)?.[column];
    const selected=chooseCondition(en,conditions.zhCN.get(id)?.[column],conditions.zhTW.get(id)?.[column]);
    count('conditions',selected);
    if(selected)lines.push('D.ArtifactConditions['+id+']={'+entry(selected.key,selected.text)+'}');
    else audit.deferred.conditions.push({id,reason:en?'unsupported_or_missing_translation':'missing_original'});
  }
  for(const key of conflicts)titleNames.delete(key);
  lines.push('D.ArtifactTitleNames='+entries(titleNames));audit.counts.titleConflicts=conflicts.size;
  const powerSpells=new Map();
  for(const rank of ranks.enUS.values()){
    const powerID=+rank.ArtifactPowerID,spellID=+rank.SpellID;
    if(!powers.enUS.has(powerID)||!Number.isSafeInteger(spellID)||spellID<=0)continue;
    if(!powerSpells.has(powerID))powerSpells.set(powerID,new Set());powerSpells.get(powerID).add(spellID);
  }
  for(const [id,spells]of [...powerSpells].sort((a,b)=>a[0]-b[0]))lines.push('D.ArtifactPowerSpells['+id+']={'+[...spells].sort((a,b)=>a-b).map(id=>'['+id+']=true').join(',')+'}');
  audit.counts.powers=powerSpells.size;audit.counts.traitSpellIDs=new Set([...powerSpells.values()].flatMap(s=>[...s])).size;
  const spec=manifest.artifactChoiceReviews,bytes=fs.readFileSync(path.join(root,spec.file));
  if(sha(bytes)!==spec.sha256)throw Error('Artifact choice review checksum mismatch');
  const review=reviewedChoices(JSON.parse(bytes));audit.choices={source:spec,...review.audit};
  const textMap=map=>entries(new Map([...map].map(([k,v])=>[k,v.text])));
  for(const [id,choice]of review.choices){
    const options=[...choice.Options].map(([responseID,option])=>'['+responseID+']={'+Object.entries(option).map(([field,map])=>field+'='+textMap(map)).join(',')+'}');
    lines.push('D.ArtifactChoices['+id+']={Question='+textMap(choice.Question)+',Options={'+options.join(',')+'}}');
  }
  generated.push(...writeResourceChunks({root,name:'Artifacts',lines,numbered:false,header:'7.3.5 神器中文与原文指纹。来源和逐条核验见 SOURCES.md。'}));
  fs.writeFileSync(path.join(root,'docs/artifact-data-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return {generated,audit};
}
