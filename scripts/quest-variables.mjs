import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {normalize,fingerprint,hasChinese,luaString} from './text.mjs';
import {writeResourceChunks} from './resource-writer.mjs';

// This deliberately does not widen supportsTokens() for ordinary data. Only
// reviewed quest fields may bind these variables against their complete source.
// Wire token IDs: 1..32 = raw objective Amount index, -1 = player, -2 = race.
export function questTemplateParts(text){
  if(typeof text!=='string'||!text||Buffer.byteLength(text)>8192||/~\d+~/.test(text))throw Error('Invalid quest template');
  const parts=[];let literal='';
  const flush=()=>{if(literal)parts.push(literal);literal='';};
  for(let i=0;i<text.length;){
    if(text[i]!=='$'){literal+=text[i++];continue;}
    const rest=text.slice(i);
    if(/^\$[bB]/.test(rest)){literal+='\n';i+=2;continue;}
    const match=/^\$(p|r|[1-9]\d*oa)(?![a-zA-Z0-9])/.exec(rest);
    if(!match)throw Error('Unsupported quest template token: '+rest.slice(0,16));
    const token=match[1]==='p'?-1:match[1]==='r'?-2:Number(match[1].slice(0,-2));
    if(token>32)throw Error('Objective index out of range');
    flush();parts.push(token);i+=match[0].length;
  }
  flush();return parts;
}
const tokenCounts=parts=>{
  const counts={};for(const p of parts)if(typeof p==='number')counts[p]=(counts[p]??0)+1;
  return JSON.stringify(Object.entries(counts).sort(([a],[b])=>Number(a)-Number(b)));
};
export function compileQuestTemplate(original,chinese){
  if(hasChinese(original)||!hasChinese(chinese))throw Error('Quest template language mismatch');
  const source=questTemplateParts(original),target=questTemplateParts(chinese),values=[...new Set(source.filter(p=>typeof p==='number'))];
  if(!values.length||values.length>16||source.length>65||tokenCounts(source)!==tokenCounts(target))throw Error('Quest template variable mismatch');
  const parts=source.map(p=>typeof p==='number'?values.indexOf(p)+1:normalize(p)).filter(p=>p!=='');
  for(let i=0;i<parts.length;i++)if(typeof parts[i]==='number'){
    if(typeof parts[i+1]==='number')throw Error('Adjacent quest variables are ambiguous');
    if(values[parts[i]-1]>0&&typeof parts[i+1]==='string'&&/^\d/.test(parts[i+1]))throw Error('Digit after quantity is ambiguous');
  }
  const literals=parts.filter(p=>typeof p==='string');
  if(literals.join('').length<12)throw Error('Quest source too short to bind safely');
  return {source:parts.map(p=>typeof p==='number'?p:[Buffer.byteLength(p),fingerprint(p)]),values,
    text:target.map(p=>typeof p==='number'?'~'+(values.indexOf(p)+1)+'~':p).join('')};
}
export function questTemplateLua(row){
  return '{source={'+row.source.map(p=>typeof p==='number'?p:'{'+p[0]+','+luaString(p[1])+'}').join(',')+
    '},values={'+row.values.join(',')+'},text='+luaString(row.text)+'}';
}
export function buildQuestVariables({root,manifest,version}){
  const spec=manifest.questVariables;
  if(!spec)throw Error('Missing reviewed quest-variable snapshot');
  const raw=fs.readFileSync(path.join(root,spec.file));
  if(crypto.createHash('sha256').update(raw).digest('hex')!==spec.sha256)throw Error('Quest-variable snapshot hash mismatch');
  const snapshot=JSON.parse(raw),sources=new Map(snapshot.sources.map(s=>[s.id,s]));
  if(snapshot.schema!==1||snapshot.targetPatch!=='7.3.5')throw Error('Quest-variable snapshot version mismatch');
  const rows=new Map(),records=[];
  for(const quest of snapshot.quests){
    if(!Number.isSafeInteger(quest.id)||quest.id<=0||!['Description','Objectives'].includes(quest.field)
      ||!sources.has(quest.originalSource)||!(quest.originalBuild>0&&quest.originalBuild<=26972))throw Error('Invalid quest-variable identity');
    if(!quest.translations.length||new Set(quest.translations.map(t=>t.locale)).size!==quest.translations.length)throw Error('Duplicate or empty quest-variable locales');
    const compiled=new Map();
    for(const translation of quest.translations){
      const source=sources.get(translation.source);
      if(!['zhCN','zhTW'].includes(translation.locale)||translation.build!==26365||source?.build!==26365
        ||source.provenance!=='community-client-capture'||source.officialChineseVerified!==false)throw Error('Invalid quest-variable provenance');
      compiled.set(translation.locale,compileQuestTemplate(quest.original,translation.text));
    }
    const locale=compiled.has('zhCN')?'zhCN':'zhTW',row=compiled.get(locale);
    const fields=rows.get(quest.id)??new Map();
    if(fields.has(quest.field))throw Error('Duplicate quest-variable field');
    fields.set(quest.field,row);rows.set(quest.id,fields);
    records.push({id:quest.id,field:quest.field,locale,variables:row.values,originalSource:quest.originalSource,
      originalBuild:quest.originalBuild,source:quest.translations.find(t=>t.locale===locale).source,build:26365});
  }
  const generated=writeResourceChunks({root,name:'QuestTemplates',lines:[...rows].sort(([a],[b])=>a-b).map(([id,fields])=>
    'D.QuestTemplates['+id+']={'+[...fields].map(([field,row])=>field+'='+questTemplateLua(row)).join(',')+'}')});
  const counts={quests:rows.size,fields:records.length,byLocale:{zhCN:records.filter(r=>r.locale==='zhCN').length,zhTW:records.filter(r=>r.locale==='zhTW').length},
    objectiveAmount:records.filter(r=>r.variables.some(v=>v>0)).length,playerName:records.filter(r=>r.variables.includes(-1)).length,deferred:snapshot.deferred.length};
  const audit={version,counts,records,deferred:snapshot.deferred.map(({id,field,reason})=>({id,field,reason})),generatedFiles:generated};
  fs.writeFileSync(path.join(root,'docs/quest-variable-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return {generated,audit};
}
