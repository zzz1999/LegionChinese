import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ChineseTextIndex,CHINESE_LOCALES} from './fallback.mjs';
import {hasChinese,luaString} from './text.mjs';
import {parseNameTable,nameKey,CLIENT_BUILD} from './client-names.mjs';
import {LEGION_BUILD} from './dialogue.mjs';

const plainName=text=>typeof text==='string'&&text.trim()!==''&&!/[\x00-\x1f$|<>&]/.test(text);

export function selectWorldObjectNames(candidates){
  const index=new ChineseTextIndex(),accepted=new Map();
  for(const row of candidates){
    if(!CHINESE_LOCALES.includes(row.locale)||!plainName(row.original)||hasChinese(row.original)
      ||!plainName(row.text)||!hasChinese(row.text))continue;
    const build=Number(row.verifiedBuild);
    if(!Number.isInteger(build)||build<0||build>LEGION_BUILD)continue;
    const priority=row.kind==='client-db2'?2:build>0?1:0;
    index.add(row.locale,row.original,row.text,priority);
    const key=nameKey(row.original);
    if(!accepted.has(key))accepted.set(key,[]);
    accepted.get(key).push({...row,priority,key});
  }
  index.finish();
  const records=[];
  for(const [key,text] of index.entries){
    const locale=index.localeFor(key);
    const row=accepted.get(key).filter(r=>r.locale===locale&&r.text===text).sort((a,b)=>b.priority-a.priority)[0];
    records.push({key,text,locale,source:row.source,...(row.originalSource?{originalSource:row.originalSource}:{}),id:row.id,verifiedBuild:Number(row.verifiedBuild),
      quality:row.kind==='client-db2'?'client-db2':row.priority===1?'build-marked':'community-unverified'});
  }
  return {index,records};
}

export function pairSQLWorldObjectNames(sqlRows){
  const originals=new Map(sqlRows.filter(r=>r.table==='gameobject_template').map(r=>[r.source+':'+r.id,r]));
  const candidates=[];
  for(const row of sqlRows){
    if(row.table!=='gameobject_template_locale')continue;
    const original=originals.get((row.baseFile??row.source)+':'+row.id);
    if(!original||Number(original.verifiedBuild)>LEGION_BUILD)continue;
    // A separate locale patch must name an explicit snapshot and the reviewed
    // original. An ID alone is insufficient evidence across SQL releases.
    if(row.baseFile&&(!row.expectedOriginal||row.expectedOriginal!==original.name||Number(original.verifiedBuild)<0))continue;
    candidates.push({...row,original:original.name,text:row.name,kind:'sql',
      ...(row.baseFile?{originalSource:row.baseFile}:{})});
  }
  return candidates;
}

export function buildWorldObjectNames({root,input,manifest,version,sqlRows}){
  const tables={},sources=[],candidates=[];
  for(const source of manifest.worldObjectTables??[]){
    if(source.table!=='GameObjects'||source.build!==CLIENT_BUILD||!['enUS','zhCN','zhTW'].includes(source.locale)
      ||path.basename(source.file)!==source.file||tables[source.locale])throw Error('Unexpected world-object source');
    const data=fs.readFileSync(path.join(input,source.file));
    if(crypto.createHash('sha256').update(data).digest('hex')!==source.sha256)throw Error(`Source hash mismatch: ${source.file}`);
    tables[source.locale]=parseNameTable(data.toString('utf8'));
    sources.push({...source,records:tables[source.locale].size});
  }
  for(const locale of ['enUS','zhCN','zhTW'])if(!tables[locale])throw Error(`Missing GameObjects/${locale}`);
  for(const [id,row] of tables.enUS)for(const locale of CHINESE_LOCALES)candidates.push({id,original:row.Name_lang,
    text:tables[locale].get(id)?.Name_lang,locale,kind:'client-db2',verifiedBuild:LEGION_BUILD,
    source:sources.find(s=>s.locale===locale).file});
  // Pair server object names by ID inside the same snapshot, never across
  // client DB2 IDs or different SQL releases with possibly changed identities.
  candidates.push(...pairSQLWorldObjectNames(sqlRows));
  const {index,records}=selectWorldObjectNames(candidates);
  const output=path.join(root,'AddOns/LegionChinese/Data'),file='WorldObjects_01.lua';
  const lines=[...index.entries].sort((a,b)=>a[0].localeCompare(b[0],'en')).map(([key,text])=>`D.WorldObjects[${luaString(key)}]=${luaString(text)}`);
  fs.writeFileSync(path.join(output,file),'-- 自动生成：场景物件中文名称与匹配指纹。来源见 SOURCES.md。\nlocal D = LegionChineseDB\n'+lines.join('\n')+'\n');
  const quality={};for(const row of records)quality[row.quality]=(quality[row.quality]??0)+1;
  const sqlFiles=new Set(sqlRows.map(r=>r.source));
  const audit={version,build:CLIENT_BUILD,sources,sqlSources:manifest.sql.filter(s=>sqlFiles.has(s.file)),counts:{fingerprints:index.entries.size,locales:index.localeCounts,
    ambiguousSkipped:index.ambiguous.size,quality},records:records.sort((a,b)=>a.key.localeCompare(b.key,'en'))};
  fs.writeFileSync(path.join(root,'docs/world-object-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return {generated:['Data\\'+file],audit};
}
