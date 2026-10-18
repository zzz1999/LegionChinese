import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {csvRows,CLIENT_BUILD} from './client-names.mjs';
import {hasChinese,luaString} from './text.mjs';

const columns={JournalInstance:['ID','Name_lang','MapID'],Map:['ID','MapName_lang','InstanceType']};
const usable=text=>hasChinese(text)&&!/[\x00-\x1f$|]/.test(text);

export function parseDungeonTable(text,table){
  const required=columns[table];
  const rows=csvRows(text),header=rows.next().value;
  if(!required||!header||required.some(key=>!header.includes(key))||new Set(header).size!==header.length)throw Error('Invalid dungeon table header');
  const result=new Map();
  for(const cells of rows){
    if(cells.length!==header.length)throw Error('Invalid dungeon column count');
    const row=Object.fromEntries(header.map((key,i)=>[key,cells[i]]));
    const id=Number(row.ID);
    if(!/^\d+$/.test(row.ID)||!Number.isSafeInteger(id)||result.has(id))throw Error('Invalid or duplicate dungeon ID');
    const relation=table==='Map'?'InstanceType':'MapID';
    if(!/^\d+$/.test(row[relation]))throw Error('Invalid dungeon relation');
    result.set(id,{name:row[table==='Map'?'MapName_lang':'Name_lang'],relation:Number(row[relation])});
  }
  return result;
}

export function selectDungeonNames(table,localized){
  const names=new Map(),locales={zhCN:0,zhTW:0};
  const ids=[...new Set(Object.values(localized).flatMap(rows=>[...rows.keys()]))].sort((a,b)=>a-b);
  for(const id of ids){
    if(id===0)continue;
    const cn=localized.zhCN?.get(id),tw=localized.zhTW?.get(id);
    if(cn&&tw&&cn.relation!==tw.relation)throw Error('Mismatched dungeon locale relation');
    for(const locale of ['zhCN','zhTW']){
      const row=localized[locale]?.get(id);
      // Lockout links refer to party/raid maps, not overworld or PvP maps.
      if(!row||!usable(row.name)||(table==='Map'&&![1,2].includes(row.relation)))continue;
      names.set(id,row.name);locales[locale]++;break;
    }
  }
  return {names,counts:{ids:names.size,locales}};
}

export function buildDungeonNames({root,input,manifest}){
  const tables={},sources=[];
  for(const source of manifest.dungeonTables??[]){
    if(source.build!==CLIENT_BUILD||!Object.hasOwn(columns,source.table)||!['zhCN','zhTW'].includes(source.locale)
      ||path.basename(source.file)!==source.file)throw Error('Unexpected dungeon source');
    const data=fs.readFileSync(path.join(input,source.file));
    if(crypto.createHash('sha256').update(data).digest('hex')!==source.sha256)throw Error(`Source hash mismatch: ${source.file}`);
    tables[source.table]??={};
    if(tables[source.table][source.locale])throw Error('Duplicate dungeon locale');
    const rows=parseDungeonTable(data.toString('utf8'),source.table);
    tables[source.table][source.locale]=rows;sources.push({...source,records:rows.size});
  }
  const counts={},lines=['-- 自动生成：7.3.5.26972 客户端副本名称，仅含中文。来源见 SOURCES.md。','local D = LegionChineseDB'];
  for(const [table,category] of [['JournalInstance','JournalInstances'],['Map','InstanceMaps']]){
    for(const locale of ['zhCN','zhTW'])if(!tables[table]?.[locale])throw Error(`Missing ${table}/${locale}`);
    const chosen=selectDungeonNames(table,tables[table]);counts[table]=chosen.counts;
    for(const [id,name]of chosen.names)lines.push(`D.${category}[${id}]=${luaString(name)}`);
  }
  const generated=['Data\\DungeonNames.lua'];
  fs.writeFileSync(path.join(root,'AddOns/LegionChinese/Data/DungeonNames.lua'),lines.join('\n')+'\n');
  const audit={build:CLIENT_BUILD,provenance:'client-db2-via-wago',sources,counts,generatedFiles:generated};
  fs.writeFileSync(path.join(root,'docs/dungeon-name-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return {generated,audit};
}
