import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseColumns} from './extra-client-data.mjs';
import {nameKey} from './client-names.mjs';
import {hasChinese,luaString} from './text.mjs';

const token=/\$(?:\d+)?[smM][1-3]\b/g;
const number=/\d+(?:,\d{3})*(?:\.\d+)?/g;
const numeric=s=>/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(s)?Number(s.replaceAll(',','')):null;
const slots=s=>(s.match(token)||[]).sort().join('|');
const unsupported=/[|{}~<>\x00-\x08\x0b\x0c\x0e-\x1f]|%[sdif]/;
export function numericSpellTemplate(en,cn,tw){
  if(typeof en!=='string'||hasChinese(en)||!en.match(token)||unsupported.test(en))return;
  if(en.replace(token,'').includes('$'))return; // no duration, formula, conditional, grammar or spell-name tokens
  const constants={},positions={},equals=[];
  let count=0;
  // Keep literal numbers distinct from live token values; the final key alone
  // must never turn a different fixed cooldown/target count into a match.
  const skeleton=en.replace(/\$(?:\d+)?[smM][1-3]\b|\d+(?:,\d{3})*(?:\.\d+)?/g,value=>{
    const index=++count;
    if(value.startsWith('$')){
      if(positions[value])equals.push([positions[value],index]);else positions[value]=index;
    }else constants[index]=numeric(value);
    return '~v~';
  });
  if(!count||count>20||Object.values(constants).includes(null))return;
  const fixedEn=(en.replace(token,'').match(number)||[]).map(numeric).sort((a,b)=>a-b).join('|');
  for(const [locale,source]of [['zhCN',cn],['zhTW',tw]]){
    if(typeof source!=='string'||!hasChinese(source)||unsupported.test(source)||source.replace(token,'').includes('$')
      ||slots(en)!==slots(source))continue;
    const fixed=(source.replace(token,'').match(number)||[]).map(numeric);
    if(fixed.includes(null)||fixed.sort((a,b)=>a-b).join('|')!==fixedEn)continue;
    const text=source.replace(token,value=>'{'+positions[value]+'}');
    return {key:nameKey(skeleton),text,count,constants,equals,locale};
  }
}

export function buildDynamicSpellText({root,input,manifest,version}){
  const rows={},sources=manifest.clientTables.filter(s=>s.table==='Spell');
  for(const s of sources){
    if(s.build!=='7.3.5.26972'||!['enUS','zhCN','zhTW'].includes(s.locale)||rows[s.locale])throw Error('Unsupported dynamic spell source');
    const bytes=fs.readFileSync(path.join(input,s.file));
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==s.sha256)throw Error('Dynamic spell checksum');
    rows[s.locale]=parseColumns(bytes.toString('utf8'),['Description_lang','AuraDescription_lang']);
  }
  for(const l of ['enUS','zhCN','zhTW'])if(!rows[l])throw Error('Missing spell locale '+l);
  const lines=[],audit={version,sources,counts:{},rule:'Numeric effect tokens only. Copy values from an exactly matching live tooltip; never evaluate spell damage, durations or conditions.'};
  for(const [id,en]of rows.enUS){
    const fields=[];
    for(const [column,field]of [['Description_lang','Description'],['AuraDescription_lang','Aura']]){
      const chosen=numericSpellTemplate(en[column],rows.zhCN.get(id)?.[column],rows.zhTW.get(id)?.[column]);
      if(!chosen)continue;
      const count=audit.counts[field]??={ids:0,zhCN:0,zhTW:0};count.ids++;count[chosen.locale]++;
      const constants=Object.entries(chosen.constants).map(([i,v])=>`[${i}]=${v}`).join(',');
      fields.push(`${field}={Key=${luaString(chosen.key)},Text=${luaString(chosen.text)},Count=${chosen.count},Constants={${constants}},Equals={${chosen.equals.map(v=>'{'+v.join(',')+'}').join(',')}}}`);
    }
    if(fields.length)lines.push(`D.DynamicSpellTexts[${id}]={`+fields.join(',')+'}');
  }
  const out=path.join(root,'AddOns/LegionChinese/Data'),generated=[];
  let part=0,buffer=[],bytes=0;
  const flush=()=>{
    if(!buffer.length)return;
    const file='DynamicSpellTexts_'+String(++part).padStart(2,'0')+'.lua';
    fs.writeFileSync(path.join(out,file),'-- 自动生成：同版中文数值模板及完整原文结构指纹。数值仅取客户端当前提示。\nlocal D=LegionChineseDB\n'+buffer.join('\n')+'\n');
    generated.push('Data\\'+file);buffer=[];bytes=0;
  };
  for(const line of lines){if(bytes+Buffer.byteLength(line)>900000)flush();buffer.push(line);bytes+=Buffer.byteLength(line)+1;}flush();
  for(const file of fs.readdirSync(out))if(/^DynamicSpellTexts_\d+\.lua$/.test(file)&&!generated.includes('Data\\'+file))fs.unlinkSync(path.join(out,file));
  fs.writeFileSync(path.join(root,'docs/dynamic-spell-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return {generated,audit};
}
