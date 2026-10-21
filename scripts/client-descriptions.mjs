import {writeResourceChunks} from './resource-writer.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseColumns} from './extra-client-data.mjs';
import {nameKey} from './client-names.mjs';
import {hasChinese,luaString} from './text.mjs';

export const descriptionSpecs=[
  ['Achievement','Achievement',{Title_lang:'Name',Description_lang:'Description',Reward_lang:'Reward'}],
  ['CurrencyTypes','Currency',{Name_lang:'Name',Description_lang:'Description'}],
  ['BattlePetSpecies','BattlePet',{Description_lang:'Description',SourceText_lang:'Source'}],
  ['BattlePetAbility','BattlePetAbility',{Name_lang:'Name',Description_lang:'Description'}],
  ['JournalEncounter','Encounter',{Name_lang:'Name',Description_lang:'Description'}],
  ['JournalEncounterSection','JournalSection',{Title_lang:'Name',BodyText_lang:'Description'}],
  ['AdventureJournal','Adventure',{Name_lang:'Name',Description_lang:'Description',ButtonText_lang:'Button',RewardDescription_lang:'Reward',ContinueDescription_lang:'Continue'}],
];

export function simpleClientText(text){
  if(typeof text!=='string')return;
  text=text.replace(/\|c[0-9a-f]{8}/gi,'').replace(/\|r/g,'').replace(/\|n/g,'\n');
  if(!text.trim()||/[$|<>\x00-\x08\x0b\x0c\x0e-\x1f]|%[sdif]/.test(text))return;
  return text;
}
export function selectClientDescription(original,cn,tw,{petAbility=false}={}){
  const source=simpleClientText(original);
  if(!source||hasChinese(source))return;
  const expressions=text=>text.match(/\[[^\[\]]+\]/g)||[];
  const enExpressions=expressions(source);
  if(/[\[\]]/.test(source)&&(!petAbility||!enExpressions.length))return;
  for(const [locale,value] of [['zhCN',cn],['zhTW',tw]]){
    const text=simpleClientText(value);
    if(!text||!hasChinese(text))continue;
    const zhExpressions=expressions(text);
    if(enExpressions.length||/[\[\]]/.test(text)){
      // The native pet ability parser supplies live stats. Only identical
      // expression multisets are allowed, never a newly written formula.
      if(!petAbility||enExpressions.slice().sort().join('\n')!==zhExpressions.slice().sort().join('\n')
        ||/[\[\]]/.test(source.replace(/\[[^\[\]]+\]/g,''))||/[\[\]]/.test(text.replace(/\[[^\[\]]+\]/g,'')))continue;
    }
    return {key:nameKey(source),text,locale,expressions:enExpressions.length};
  }
}

export function buildClientDescriptions({root,input,manifest,version}){
  const out=path.join(root,'AddOns/LegionChinese/Data'),generated=[],lines=[];
  const audit={version,build:'7.3.5.26972',sources:[],counts:{},deferred:{}};
  for(const [table,kind,fields] of descriptionSpecs){
    const rows={};
    for(const s of [...(manifest.extraLinkTables||[]),...(manifest.questBoardTables||[])].filter(s=>s.table===table)){
      if(s.build!==audit.build||!['enUS','zhCN','zhTW'].includes(s.locale)||rows[s.locale])throw Error('Invalid description source '+table);
      const bytes=fs.readFileSync(path.join(input,s.file));
      if(crypto.createHash('sha256').update(bytes).digest('hex')!==s.sha256)throw Error('Description checksum '+s.file);
      rows[s.locale]=parseColumns(bytes.toString('utf8'),Object.keys(fields));audit.sources.push(s);
    }
    for(const l of ['enUS','zhCN','zhTW'])if(!rows[l])throw Error('Missing descriptions '+table+'/'+l);
    const counts=audit.counts[kind]={},deferred=audit.deferred[kind]={},indexes={};
    for(const [id,en] of rows.enUS){
      const parts=[];
      for(const [column,field] of Object.entries(fields)){
        const cn=rows.zhCN.get(id)?.[column],tw=rows.zhTW.get(id)?.[column];
        const chosen=selectClientDescription(en[column],cn,tw,{petAbility:kind==='BattlePetAbility'&&field==='Description'});
        if(!chosen){if(hasChinese(cn)||hasChinese(tw))deferred[field]=(deferred[field]||0)+1;continue;}
        const count=counts[field]??={ids:0,zhCN:0,zhTW:0,nativeExpressions:0};
        count.ids++;count[chosen.locale]++;if(chosen.expressions)count.nativeExpressions++;
        const index=indexes[field]??=new Map(),previous=index.get(chosen.key);
        if(!previous)index.set(chosen.key,{id,text:chosen.text});
        else if(previous.text!==chosen.text)previous.ambiguous=true;
        parts.push(field+'={['+luaString(chosen.key)+']='+luaString(chosen.text)+'}');
      }
      if(parts.length)lines.push(`D.ClientTexts.${kind}[${id}]={`+parts.join(',')+'}');
    }
    for(const [field,index]of Object.entries(indexes)){
      lines.push(`D.ClientTextIndex.${kind}.${field}={}`);
      for(const [key,value]of index)if(!value.ambiguous)lines.push(`D.ClientTextIndex.${kind}.${field}[${luaString(key)}]=${value.id}`);
    }
  }
  generated.push(...writeResourceChunks({root,name:'ClientTexts',lines,header:'7.3.5.26972 已有中文与原文指纹，来源见 SOURCES.md。'}));
  fs.writeFileSync(path.join(root,'docs/client-descriptions-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return {generated,audit};
}
