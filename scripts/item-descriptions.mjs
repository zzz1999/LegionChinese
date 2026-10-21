import {writeResourceChunks} from './resource-writer.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {CHINESE_LOCALES} from './fallback.mjs';
import {hasChinese,luaString} from './text.mjs';
import {nameKey,csvRows,CLIENT_BUILD} from './client-names.mjs';
import {LEGION_BUILD} from './dialogue.mjs';

const plain=text=>typeof text==='string'&&text.trim()!==''&&!/[\x00-\x1f$|<>&"]/u.test(text);
export function selectItemDescriptions(source){
  if(source.schema!==1||!Array.isArray(source.records))throw Error('Invalid item description source');
  const seen=new Set(),records=[];
  for(const row of source.records){
    if(!Number.isSafeInteger(row.itemID)||row.itemID<=0||seen.has(row.itemID)
      ||!plain(row.original)||hasChinese(row.original)
      ||!Number.isInteger(row.originalSource?.verifiedBuild)||row.originalSource.verifiedBuild<=0
      ||row.originalSource.verifiedBuild>LEGION_BUILD||!Array.isArray(row.translations))throw Error('Invalid reviewed item description');
    seen.add(row.itemID);
    for(const locale of CHINESE_LOCALES){
      const choices=row.translations.filter(t=>t.locale===locale&&plain(t.text)&&hasChinese(t.text)
        &&(t.verifiedBuild===null||(Number.isInteger(t.verifiedBuild)&&t.verifiedBuild>=0&&t.verifiedBuild<=LEGION_BUILD)));
      if(new Set(choices.map(t=>t.text)).size!==1)continue;
      const selected=choices[0];
      records.push({itemID:row.itemID,key:nameKey(row.original),text:selected.text,locale,
        originalSource:row.originalSource,source:selected});
      break;
    }
  }
  return records;
}

// ItemSparse.Description_lang is a separate, mostly static tooltip field.
// Preserve its wording; do not evaluate spell/enchantment formula tokens or
// treat arbitrary embedded links/textures as description text.
export function cleanItemDescription(text){
  if(typeof text!=='string')return;
  text=text.trim().replace(/\r\n?/g,'\n');
  const color=text.match(/^\|c[0-9a-f]{8}([\s\S]*?)\|r$/i);
  if(color)text=color[1];
  if(!text||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f$|]/u.test(text))return;
  return text;
}

export function parseItemDescriptionTable(text){
  const rows=csvRows(text),header=rows.next().value;
  if(!header||!header.includes('ID')||!header.includes('Description_lang')
    ||new Set(header).size!==header.length)throw Error('Invalid item description table header');
  const idColumn=header.indexOf('ID'),textColumn=header.indexOf('Description_lang'),result=new Map();
  for(const cells of rows){
    if(cells.length!==header.length)throw Error('Invalid item description column count');
    const id=Number(cells[idColumn]);
    if(!/^\d+$/.test(cells[idColumn])||!Number.isSafeInteger(id)||id<=0||result.has(id))
      throw Error('Invalid or duplicate item ID');
    result.set(id,cells[textColumn]);
  }
  return result;
}

export function selectClientItemDescriptions(localized){
  for(const locale of ['enUS',...CHINESE_LOCALES])
    if(!(localized[locale] instanceof Map))throw Error('Missing ItemSparse/'+locale);
  const records=[],counts={rows:localized.enUS.size,nonemptyOriginal:0,
    skipped:{emptyOriginal:0,unsupportedOriginal:0,missingChinese:0,unsupportedChinese:0}};
  for(const [itemID,raw]of [...localized.enUS].sort((a,b)=>a[0]-b[0])){
    if(!raw.trim()){counts.skipped.emptyOriginal++;continue;}
    counts.nonemptyOriginal++;
    const original=cleanItemDescription(raw);
    if(!original||hasChinese(original)){counts.skipped.unsupportedOriginal++;continue;}
    let selected;
    for(const locale of CHINESE_LOCALES){
      const text=cleanItemDescription(localized[locale].get(itemID));
      if(!text||!hasChinese(text))continue;
      selected={itemID,key:nameKey(original),text,locale};break;
    }
    if(selected)records.push(selected);
    else if(CHINESE_LOCALES.some(locale=>hasChinese(localized[locale].get(itemID))))counts.skipped.unsupportedChinese++;
    else counts.skipped.missingChinese++;
  }
  return {records,counts};
}

export function buildItemDescriptions({root,input=path.join(root,'.cache'),manifest,version}){
  const spec=manifest.itemDescriptions;
  if(spec?.file!=='data/item-descriptions.json')throw Error('Unexpected item description source');
  const data=fs.readFileSync(path.join(root,spec.file));
  if(crypto.createHash('sha256').update(data).digest('hex')!==spec.sha256)throw Error('Item description source hash mismatch');
  const reviewed=selectItemDescriptions(JSON.parse(data)),localized={},sources=[];
  for(const source of manifest.itemDescriptionTables??[]){
    if(source.table!=='ItemSparse'||source.build!==CLIENT_BUILD||!['enUS',...CHINESE_LOCALES].includes(source.locale)
      ||source.provenance!=='client-db2-via-wago'||path.basename(source.file)!==source.file)
      throw Error('Unexpected item description source');
    if(localized[source.locale])throw Error('Duplicate item description locale');
    const body=fs.readFileSync(path.join(input,source.file));
    if(crypto.createHash('sha256').update(body).digest('hex')!==source.sha256)throw Error('ItemSparse source hash mismatch: '+source.file);
    localized[source.locale]=parseItemDescriptionTable(body.toString('utf8'));
    sources.push({...source,records:localized[source.locale].size});
  }
  const client=selectClientItemDescriptions(localized);
  const candidates=new Map();
  for(const row of [...client.records.map(row=>({...row,origin:'client'})),...reviewed.map(row=>({...row,origin:'reviewed'}))]){
    const key=row.itemID+':'+row.key;
    if(!candidates.has(key))candidates.set(key,[]);
    candidates.get(key).push(row);
  }
  const records=[];
  for(const group of candidates.values()){
    for(const locale of CHINESE_LOCALES){
      const choices=group.filter(row=>row.locale===locale);
      const preferred=choices.some(row=>row.origin==='client')?choices.filter(row=>row.origin==='client'):choices;
      if(new Set(preferred.map(row=>row.text)).size!==1)continue;
      records.push(preferred[0]);break;
    }
  }
  records.sort((a,b)=>a.itemID-b.itemID||a.key.localeCompare(b.key,'en'));
  const items=new Map(),counts={items:0,entries:records.length,locales:{zhCN:0,zhTW:0},
    client:{...client.counts,selected:0},reviewed:0};
  for(const row of records){
    if(!items.has(row.itemID))items.set(row.itemID,[]);
    items.get(row.itemID).push(row);counts.locales[row.locale]++;
    if(row.origin==='client')counts.client.selected++;else counts.reviewed++;
  }
  counts.items=items.size;
  const lines=[...items].map(([id,rows])=>`D.ItemDescriptions[${id}]={${rows.map(r=>`[${luaString(r.key)}]=${luaString(r.text)}`).join(',')}}`);
  const generated=writeResourceChunks({root,name:'ItemDescriptions',lines,header:'物品说明中文译文与匹配指纹。来源见 SOURCES.md。'});
  const audit={version,build:CLIENT_BUILD,reviewedSource:spec,sources,counts,
    records:records.filter(row=>row.origin==='reviewed').map(({origin,...row})=>row),
    clientRecords:records.filter(row=>row.origin==='client').map(({itemID,key,locale})=>({itemID,key,locale})),
    generatedFiles:generated};
  fs.writeFileSync(path.join(root,'docs/item-description-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return {generated,audit};
}
