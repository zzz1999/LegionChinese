import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {hasChinese,fingerprint,luaString} from './text.mjs';

export const CLIENT_BUILD='7.3.5.26972';
export const nameKey=text=>fingerprint(String(text??'').replace(/\|c[0-9a-f]{8}/gi,'').replace(/\|r/g,'')
  .replace(/[A-Z]/g,c=>c.toLowerCase()).replace(/[ \t\r\n\v\f]/g,''));
const usable=text=>hasChinese(text)&&!/[\x00-\x1f$|]/.test(text);

// CSV exports contain quoted descriptions with commas, escaped quotes and
// line breaks. Never split the source into lines or execute its contents.
export function* csvRows(text){
  let row=[],field='',quoted=false,closed=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
      else field+=c;
    }else if(c===','||c==='\r'||c==='\n'){
      row.push(field);field='';closed=false;
      if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.length>1||row[0]!=='')yield row;row=[];}
    }else if(c==='"'){
      if(field!==''||closed)throw Error('Quote inside unquoted CSV field');quoted=true;
    }else{
      if(closed)throw Error('Characters after quoted CSV field');field+=c;
    }
  }
  if(quoted)throw Error('Truncated quoted CSV field');
  if(row.length||field!==''||closed){row.push(field);yield row;}
}

export function parseNameTable(text){
  const rows=csvRows(text),header=rows.next().value;
  if(!header||!header.includes('ID')||!header.includes('Name_lang')||new Set(header).size!==header.length)throw Error('Invalid client table header');
  const result=new Map();
  for(const cells of rows){
    if(cells.length!==header.length)throw Error('Invalid client table column count');
    const record=Object.fromEntries(header.map((key,i)=>[key,cells[i]]));
    const id=Number(record.ID);
    if(!Number.isSafeInteger(id)||id<=0||result.has(id))throw Error('Invalid or duplicate client record ID');
    result.set(id,record);
  }
  return result;
}

export function selectNames(localized){
  const ids=new Set(Object.values(localized).flatMap(rows=>[...rows.keys()]));
  const byID=new Map(),names={zhCN:new Map(),zhTW:new Map()},ambiguous={zhCN:new Set(),zhTW:new Set()};
  const forms=new Map(),collisions=new Set(),locales={zhCN:0,zhTW:0};
  for(const id of [...ids].sort((a,b)=>a-b)){
    const original=localized.enUS?.get(id)?.Name_lang;
    for(const locale of ['zhCN','zhTW']){
      const text=localized[locale]?.get(id)?.Name_lang;
      if(!usable(text))continue;
      if(!byID.has(id)){byID.set(id,{text,locale,source:original,family:Number(localized.enUS?.get(id)?.CreatureFamily)||0});locales[locale]++;}
      if(!original||hasChinese(original)||/[\x00-\x1f$|]/.test(original))continue;
      const key=nameKey(original),form=original.replace(/[A-Z]/g,c=>c.toLowerCase()).replace(/[ \t\r\n\v\f]/g,'');
      if(forms.has(key)&&forms.get(key)!==form)collisions.add(key);else forms.set(key,form);
      if(names[locale].has(key)&&names[locale].get(key)!==text)ambiguous[locale].add(key);
      names[locale].set(key,text);
    }
  }
  const byName=new Map(),nameLocales={zhCN:0,zhTW:0};
  for(const locale of ['zhCN','zhTW'])for(const [key,text]of names[locale]){
    if(!collisions.has(key)&&!ambiguous[locale].has(key)&&!byName.has(key)){byName.set(key,text);nameLocales[locale]++;}
  }
  return {byID,byName,counts:{ids:byID.size,locales,fingerprints:byName.size,nameLocales,
    ambiguousNames:new Set([...ambiguous.zhCN,...ambiguous.zhTW].filter(key=>!byName.has(key))).size,collisions:collisions.size}};
}

export function buildClientNames({root,input,manifest,version}){
  const sources=[],tables={};
  for(const source of manifest.clientTables??[]){
    if(source.build!==CLIENT_BUILD||!['Spell','Creature','CreatureFamily'].includes(source.table)
      ||!['enUS','zhCN','zhTW'].includes(source.locale)||path.basename(source.file)!==source.file)throw Error('Unexpected client-name source');
    const data=fs.readFileSync(path.join(input,source.file));
    const sha256=crypto.createHash('sha256').update(data).digest('hex');
    if(sha256!==source.sha256)throw Error(`Source hash mismatch: ${source.file}`);
    tables[source.table]??={};
    if(tables[source.table][source.locale])throw Error('Duplicate client table locale');
    tables[source.table][source.locale]=parseNameTable(data.toString('utf8'));
    sources.push({...source,records:tables[source.table][source.locale].size});
  }
  const chosen={};
  for(const table of ['Spell','Creature','CreatureFamily']){
    for(const locale of ['enUS','zhCN','zhTW'])if(!tables[table]?.[locale])throw Error(`Missing ${table}/${locale}`);
    chosen[table]=selectNames(tables[table]);
  }
  const output=path.join(root,'AddOns/TauriChinese/Data'),generated=[],strings=[],ids=new Map();
  const stringID=text=>{if(!ids.has(text)){strings.push(text);ids.set(text,strings.length);}return ids.get(text);};
  const write=(name,rows)=>{
    let part=0,lines=[],size=0;
    const flush=()=>{
      if(!lines.length)return;
      const file=`${name}_${String(++part).padStart(2,'0')}.lua`;
      fs.writeFileSync(path.join(output,file),'-- 自动生成：7.3.5.26972 客户端名称，仅含中文与匹配指纹。来源见 SOURCES.md。\nlocal D = TauriChineseDB\n'+lines.join('\n')+'\n');
      generated.push('Data\\'+file);lines=[];size=0;
    };
    for(const line of rows){if(size+Buffer.byteLength(line)>900000)flush();lines.push(line);size+=Buffer.byteLength(line)+1;}flush();
  };
  for(const [table,category]of [['Spell','Spells'],['CreatureFamily','CreatureFamilies']]){
    write(category,[...chosen[table].byID].map(([id,r])=>`D.${category}[${id}]=${stringID(r.text)}`));
    write(category==='Spells'?'SpellNames':'CreatureFamilyNames',[...chosen[table].byName].sort((a,b)=>a[0].localeCompare(b[0],'en'))
      .map(([key,text])=>`D.${category==='Spells'?'SpellNames':'CreatureFamilyNames'}[${luaString(key)}]=${stringID(text)}`));
  }
  write('Creatures',[...chosen.Creature.byID].filter(([,r])=>r.source&&!hasChinese(r.source))
    .map(([id,r])=>`D.Creatures[${id}]={${stringID(r.text)},${luaString(nameKey(r.source))},${r.family}}`));
  write('NameStrings',strings.map((text,i)=>`D.NameStrings[${i+1}]=${luaString(text)}`));
  // These tables hold numeric references; load strings first for clarity.
  generated.sort((a,b)=>Number(b.includes('NameStrings_'))-Number(a.includes('NameStrings_'))||a.localeCompare(b,'en'));
  const prefixes=['NameStrings','Spells','SpellNames','Creatures','CreatureFamilies','CreatureFamilyNames'];
  for(const file of fs.readdirSync(output))if(prefixes.some(p=>new RegExp('^'+p+'_\\d+\\.lua$').test(file))&&!generated.includes('Data\\'+file))fs.unlinkSync(path.join(output,file));
  const audit={version,build:CLIENT_BUILD,provenance:'client-db2-via-wago',sources,
    counts:Object.fromEntries(Object.entries(chosen).map(([k,v])=>[k,v.counts])),chineseStrings:strings.length,
    exclusions:['Spell descriptions and auras are not imported.','No Chinese mapping found for randomized pet proper names.'],generatedFiles:generated};
  fs.writeFileSync(path.join(root,'docs/client-name-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return {generated,audit};
}
