import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {CLIENT_BUILD,parseNameTable} from './client-names.mjs';
import {hasChinese} from './text.mjs';
import {readSQL} from './sql.mjs';

const locales=['enUS','zhCN','zhTW'];
const captureBuild=26365;
const captureProvenance='community-client-query-capture';
const safeName=text=>typeof text==='string'&&text.trim()!==''&&!/[\p{Cc}\p{Cf}$|%]/u.test(text);

function validateFile(source){
  if(typeof source.file!=='string'||!source.file||/[\\/]/.test(source.file)||source.file==='.'||source.file==='..'
    ||!/^\w[\w.-]*$/.test(source.file)||!/^[a-f0-9]{64}$/.test(source.sha256??''))throw Error('Invalid NPC source file or SHA256');
}

function validateLocales(sources,label){
  if(sources.length!==3||new Set(sources.map(s=>s.locale)).size!==3||sources.some(s=>!locales.includes(s.locale)))
    throw Error(`${label} requires exactly one source for enUS, zhCN and zhTW`);
}

function verifiedData(input,source){
  validateFile(source);
  const data=fs.readFileSync(path.join(input,source.file));
  const sha256=crypto.createHash('sha256').update(data).digest('hex');
  if(sha256!==source.sha256)throw Error(`NPC source hash mismatch: ${source.file}`);
  return data;
}

function addPairs(tables,sources,records,audit,{provenance,priority,fields}){
  for(const locale of ['zhCN','zhTW']){
    const sourceFile=sources.find(s=>s.locale===locale).file;
    for(const [id,row]of tables[locale])for(const [field,column]of fields){
      const text=row[column];
      if(text===undefined||text===null||text==='')continue;
      if(!hasChinese(text)||!safeName(text)){audit.skipped.invalidChinese++;continue;}
      const original=tables.enUS.get(id)?.[column];
      if(!original){audit.skipped.missingEnglish++;continue;}
      if(!safeName(original)||hasChinese(original)){audit.skipped.invalidEnglish++;continue;}
      records.push({id,field,source:original,text,locale,sourceFile,provenance,priority});
      audit.counts[locale]++;audit.counts[field]++;
    }
  }
}

// Return both locales unchanged. The caller owns precedence and conflict handling.
// SQL files are read as data only and are never evaluated or sent to a database.
export async function loadNpcNameCandidates({input,manifest}){
  const records=[],audit={sources:[],counts:{zhCN:0,zhTW:0,Name:0,NameAlt:0},
    skipped:{invalidChinese:0,missingEnglish:0,invalidEnglish:0}};
  const clientSources=(manifest.clientTables??[]).filter(s=>s.table==='Creature');
  validateLocales(clientSources,'Creature DB2');
  const client={};
  for(const source of clientSources){
    if(source.build!==CLIENT_BUILD||source.provenance!=='client-db2-via-wago')throw Error(`Unexpected NPC client source: ${source.file}`);
    const rows=parseNameTable(verifiedData(input,source).toString('utf8'));
    for(const row of rows.values()){
      for(const column of ['locale','Locale'])if(row[column]!==undefined&&row[column]!==source.locale)
        throw Error(`NPC client locale mismatch: ${source.file}`);
    }
    client[source.locale]=rows;
    audit.sources.push({...source,priority:2,records:rows.size});
  }
  addPairs(client,clientSources,records,audit,{provenance:'client-db2-via-wago',priority:2,
    fields:[['Name','Name_lang'],['NameAlt','NameAlt_lang']]});

  const captures=manifest.npcNameCaptures??[];
  if(captures.length){
    validateLocales(captures,'NPC capture');
    if(new Set(captures.map(s=>s.pinnedCommit)).size!==1)throw Error('NPC captures must share one pinned commit');
    const captured={};
    for(const source of captures){
      const table=source.locale==='enUS'?'creature_template':'creature_template_locale';
      if(source.table!==table||source.captureBuild!==captureBuild||source.provenance!==captureProvenance
        ||source.officialChineseVerified!==false||!/^[a-f0-9]{40}$/.test(source.pinnedCommit??'')
        ||source.url!==`https://raw.githubusercontent.com/TrinityCore/TrinityCore/${source.pinnedCommit}/sql/old/7/world/19061_2019_07_15/${source.file}`)
        throw Error(`Unexpected NPC capture source: ${source.file}`);
      const bytes=verifiedData(input,source);
      const rows=new Map();
      await readSQL(path.join(input,source.file),new Set(['creature_template','creature_template_locale']),(actual,row)=>{
        if(actual!==table||(table==='creature_template_locale'&&row.locale!==source.locale)
          ||(table==='creature_template'&&row.locale!==undefined))throw Error(`NPC capture locale/table mismatch: ${source.file}`);
        if(Number(row.VerifiedBuild)!==captureBuild)throw Error(`NPC capture row build mismatch: ${source.file}`);
        const id=Number(row.entry);
        if(!Number.isSafeInteger(id)||id<=0||rows.has(id))throw Error(`Invalid or duplicate NPC capture ID: ${source.file}/${row.entry}`);
        rows.set(id,source.locale==='enUS'?{Name:row.name,NameAlt:row.femaleName}:row);
      },new Map(),bytes);
      captured[source.locale]=rows;
      audit.sources.push({...source,priority:1,records:rows.size});
    }
    addPairs(captured,captures,records,audit,{provenance:captureProvenance,priority:1,fields:[['Name','Name'],['NameAlt','NameAlt']]});
  }
  audit.records=records.length;
  return {records,audit};
}
