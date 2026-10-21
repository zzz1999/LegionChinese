import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {csvRows} from './client-names.mjs';
import {ChineseTextIndex} from './fallback.mjs';
import {hasChinese,luaString,supportsTokens,variants,fingerprint} from './text.mjs';

export const LOCAL_BUILD='7.3.5.26972';
export const localTableScopes={
  BroadcastText:'Dialogue',QuestV2CliTask:'Title',QuestLine:'Title',Scenario:'Title',
  QuestObjective:'Objective',CriteriaTree:'Objective',ScenarioStep:'Objective',
  AreaTable:'World',WMOAreaTable:'World',AreaPOI:'World',AreaPOIState:'World',AdventureMapPOI:'World',
  Vignette:'World',WorldStateUI:'World',WorldElapsedTimer:'World',WorldBossLockout:'World',TaxiNodes:'World',
  MapDifficulty:'World',MapDifficultyXCondition:'World',DungeonEncounter:'World',UnitPowerBar:'World',
  LFGDungeons:'GroupFinder',GroupFinderActivity:'GroupFinder',GroupFinderCategory:'GroupFinder',
  GroupFinderActivityGrp:'GroupFinder',LFGDungeonGroup:'GroupFinder',MapChallengeMode:'GroupFinder',KeystoneAffix:'GroupFinder',
  Mount:'Collection',Toy:'Collection',TransmogSet:'Collection',TransmogSetGroup:'Collection',
  ItemNameDescription:'Item',ItemSet:'Item',SpellItemEnchantment:'Item',ItemRandomSuffix:'Item',ItemRandomProperties:'Item',ItemLimitCategory:'Item',
  SourceInfo:'Profession',SkillLine:'Profession',TradeSkillCategory:'Profession',ResearchProject:'Profession',ResearchSite:'Profession',ResearchBranch:'Profession',SpellFocusObject:'Profession',
  GarrMission:'Garrison',GarrAbility:'Garrison',GarrEncounter:'Garrison',GarrString:'Garrison',GarrTalent:'Garrison',GarrBuilding:'Garrison',
  GarrFollower:'Garrison',GarrClassSpec:'Garrison',GarrMechanicType:'Garrison',GarrSpecialization:'Garrison',CharShipmentContainer:'Garrison',GarrMissionType:'Garrison',
  Faction:'Faction',FriendshipReputation:'Faction',FriendshipRepReaction:'Faction',
  Achievement_Category:'System',GlobalStrings:'System',QuestInfo:'System',QuestSort:'System',CharTitles:'System',
  ChrSpecialization:'System',SpellFlyout:'System',SpellShapeshiftForm:'System',
};
export function localScope(table,field){
  if(table==='ScenarioStep'&&field==='Title_lang')return 'Title';
  if(table==='QuestV2CliTask'&&field==='BulletText_lang')return 'Objective';
  return localTableScopes[table];
}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function parseLocalCSV(text){
  const rows=csvRows(text),header=rows.next().value;
  if(!header?.includes('ID')||new Set(header).size!==header.length)throw Error('Invalid local-client comparison header');
  const result=new Map();
  for(const values of rows){
    if(values.length!==header.length)throw Error('Truncated local-client comparison row');
    const row=Object.fromEntries(header.map((c,i)=>[c,values[i]])),id=Number(row.ID);
    if(!Number.isSafeInteger(id)||result.has(id))throw Error('Invalid local-client comparison ID');
    result.set(id,row);
  }return {header,rows:result};
}
// Wago prints the full float32 precision whereas JSON uses its short form.
// Integral IDs/flags must be exactly equal; do not round them into a match.
export function sameLocalIdentity(local,english){
  let checked=0;
  const equal=(value,other)=>{
    if(typeof value==='number'){
      if(other===''||other===undefined||!Number.isFinite(Number(other)))return false;
      return Number.isInteger(value)?Number.isSafeInteger(value)&&value===Number(other):Math.abs(value-Number(other))<=Math.max(1,Math.abs(value))*0.000001;
    }
    return String(value)===other;
  };
  for(const [field,value]of Object.entries(local)){
    if(field.endsWith('_lang'))continue;
    if(Array.isArray(value)){
      for(let i=0;i<value.length;i++){
        if(!Object.hasOwn(english,field+'_'+i)||!equal(value[i],english[field+'_'+i]))return false;
        checked++;
      }
    }else{
      if(!Object.hasOwn(english,field)||!equal(value,english[field]))return false;
      checked++;
    }
  }return checked>0;
}
export function usableLocalPair(source,text,scope){
  if(typeof source!=='string'||source.trim().length<2||source.length>8192||hasChinese(source)
    ||!hasChinese(text)||text.length>32768||!supportsTokens(source)||!supportsTokens(text)
    ||/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(source+text)
    ||/%[-+#0-9.$]*[a-z]/i.test(source+text))return false;
  if(scope!=='Dialogue'&&/\$[^bB]/.test(source+text))return false;
  const tokens=value=>variants(value).map(v=>(v.match(/~[ncr]~/g)||[]).sort().join(',')).sort().join('|');
  if(tokens(source)!==tokens(text))return false;
  const icons=value=>(value.match(/\|[TA].*?\|[ta]/g)||[]).sort().join('\n');
  if(icons(source)!==icons(text))return false;
  const remainder=value=>value.replace(/\|c[0-9a-f]{8}|\|[rn]/gi,'').replace(/\|[TA].*?\|[ta]/g,'');
  return !remainder(source+text).includes('|');
}

export function collectLocalClient({extraction,english,traditional,toolCommits={}}){
  const extractionAudit=JSON.parse(fs.readFileSync(path.join(extraction,'extraction-audit.json')));
  if(extractionAudit.build!==LOCAL_BUILD||extractionAudit.readOnly!==true||extractionAudit.networkFallback!==false)
    throw Error('Invalid local-client extraction provenance');
  const snapshot={schema:1,build:LOCAL_BUILD,provenance:'client-casc-local',
    buildKey:extractionAudit.buildKey,rootCKey:extractionAudit.rootCKey,tools:toolCommits,
    tables:[],pairs:[],excludedTables:extractionAudit.tables.filter(s=>s.status!=='exported').map(s=>({table:s.table,error:s.error})),
    exclusions:['Name filters, reserved names, internal test tables and player-authored text are not localization sources.',
      'ADB/WDB server caches are not promoted to official client translations.',
      'Only matching IDs, unchanged non-language fields and supported complete text are imported.']};
  for(const record of extractionAudit.tables){
    if(record.status!=='exported'||record.locale!=='zhCN'||!localTableScopes[record.table])continue;
    const cnFile=path.join(extraction,'tables/zhCN',record.table+'.json');
    const cn=JSON.parse(fs.readFileSync(cnFile));
    if(cn.build!==LOCAL_BUILD||cn.locale!=='zhCN'||cn.sha256!==record.sha256||cn.cKey!==record.cKey)throw Error('Invalid extracted table '+record.table);
    const raw=fs.readFileSync(path.join(extraction,'raw/zhCN',record.table+'.db2'));
    if(hash(raw)!==record.sha256||crypto.createHash('md5').update(raw).digest('hex')!==record.cKey)throw Error('Extracted checksum '+record.table);
    const enFile=path.join(english,record.table+'-'+LOCAL_BUILD+'-enUS.csv');
    if(!fs.existsSync(enFile))throw Error('Missing same-build English comparison '+record.table);
    const enBytes=fs.readFileSync(enFile),en=parseLocalCSV(enBytes.toString('utf8'));
    let tw,twBytes;
    if(traditional){
      twBytes=fs.readFileSync(path.join(traditional,record.table+'-'+LOCAL_BUILD+'-zhTW.csv'));
      tw=parseLocalCSV(twBytes.toString('utf8'));
    }
    const audit={table:record.table,build:LOCAL_BUILD,locale:'zhCN',cKey:record.cKey,sha256:record.sha256,
      english:{url:'https://wago.tools/db2/'+record.table+'/csv?build='+LOCAL_BUILD+'&locale=enUS',sha256:hash(enBytes)},
      ...(tw?{traditional:{url:'https://wago.tools/db2/'+record.table+'/csv?build='+LOCAL_BUILD+'&locale=zhTW',sha256:hash(twBytes)}}:{}),
      rows:cn.rows.length,identityMatched:0,identityMismatch:0,missingEnglish:0,accepted:0,traditionalAccepted:0,unsupported:0};
    for(const row of cn.rows){
      if(!Number.isSafeInteger(row.ID)||row.ID<=0)continue;
      const original=en.rows.get(row.ID);
      if(!original){audit.missingEnglish++;continue;}
      if(!sameLocalIdentity(row,original)){audit.identityMismatch++;continue;}
      audit.identityMatched++;
      for(const field of cn.columns.filter(f=>f.endsWith('_lang'))){
        const source=original[field],text=row[field],scope=localScope(record.table,field);
        if(usableLocalPair(source,text,scope)){
          snapshot.pairs.push({scope,table:record.table,id:row.ID,field,source,text,locale:'zhCN'});audit.accepted++;
        }else if(hasChinese(text))audit.unsupported++;
        const twRow=tw?.rows.get(row.ID),twText=twRow?.[field];
        if(twRow&&sameLocalIdentity(twRow,original)&&usableLocalPair(source,twText,scope)){
          snapshot.pairs.push({scope,table:record.table,id:row.ID,field,source,text:twText,locale:'zhTW'});audit.traditionalAccepted++;
        }
      }
    }
    snapshot.tables.push(audit);
  }
  // Keep Traditional records only where the complete source is missing or
  // ambiguous in the Simplified index. The full input remains hash-pinned.
  const simplified={};
  for(const p of snapshot.pairs)if(p.locale==='zhCN')(simplified[p.scope]??=new ChineseTextIndex()).add('zhCN',p.source,p.text);
  for(const index of Object.values(simplified))index.finish();
  snapshot.pairs=snapshot.pairs.filter(p=>p.locale==='zhCN'||!variants(p.source).every(form=>simplified[p.scope]?.entries.has(fingerprint(form))));
  for(const t of snapshot.tables)t.traditionalRetained=snapshot.pairs.filter(p=>p.table===t.table&&p.locale==='zhTW').length;
  snapshot.pairs.sort((a,b)=>a.table.localeCompare(b.table,'en')||a.id-b.id||a.field.localeCompare(b.field,'en')||a.locale.localeCompare(b.locale,'en'));
  return snapshot;
}

export function buildLocalClientData({root,manifest,version,baseIndexes={}}){
  const spec=manifest.localClientSnapshot;
  if(!spec)return {generated:[],audit:{version,counts:{}}};
  const bytes=fs.readFileSync(path.join(root,spec.file));
  if(hash(bytes)!==spec.sha256)throw Error('Local-client snapshot checksum mismatch');
  const snapshot=JSON.parse(bytes);
  if(snapshot.schema!==1||snapshot.build!==LOCAL_BUILD||snapshot.buildKey!==spec.buildKey||snapshot.rootCKey!==spec.rootCKey)
    throw Error('Local-client snapshot identity mismatch');
  const indexes={},seen=new Set(),sources=new Set(snapshot.tables.map(s=>s.table));
  for(const pair of snapshot.pairs){
    if(!Object.hasOwn(localTableScopes,pair.table)||!sources.has(pair.table)||!Number.isSafeInteger(pair.id)||pair.id<=0||!pair.field.endsWith('_lang')||!['zhCN','zhTW'].includes(pair.locale)
      ||localScope(pair.table,pair.field)!==pair.scope||!usableLocalPair(pair.source,pair.text,pair.scope))throw Error('Invalid local-client pair');
    const key=[pair.table,pair.id,pair.field,pair.locale].join(':');if(seen.has(key))throw Error('Duplicate local-client pair');seen.add(key);
    (indexes[pair.scope]??=new ChineseTextIndex()).add(pair.locale,pair.source,pair.text);
  }
  const strings=[],ids=new Map(),lines=[],counts={};
  for(const [scope,index]of Object.entries(indexes).sort(([a],[b])=>a.localeCompare(b,'en'))){
    index.finish();let alreadyPresent=0,baseAmbiguous=0;
    const base=baseIndexes[scope];
    if(base)for(const key of index.entries.keys()){
      if(base.entries.has(key)){index.entries.delete(key);alreadyPresent++;}
      else if(base.ambiguous.has(key)){index.entries.delete(key);baseAmbiguous++;}
    }
    const locales={zhCN:0,zhTW:0};for(const key of index.entries.keys())locales[index.localeFor(key)]++;
    counts[scope]={fingerprints:index.entries.size,ambiguous:index.ambiguous.size,alreadyPresent,baseAmbiguous,locales};
    if(!index.entries.size)continue;
    lines.push('D.LocalClientTexts.'+scope+'={}');
    for(const [key,text]of [...index.entries].sort(([a],[b])=>a.localeCompare(b,'en'))){
      if(!ids.has(text)){ids.set(text,strings.length+1);strings.push(text);}
      lines.push('D.LocalClientTexts.'+scope+'['+luaString(key)+']='+ids.get(text));
    }
  }
  const out=path.join(root,'AddOns/LegionChinese/Data'),generated=[];
  let part=0,buffer=[],size=0;
  const flush=()=>{if(!buffer.length)return;const file='LocalClient_'+String(++part).padStart(2,'0')+'.lua';
    fs.writeFileSync(path.join(out,file),'-- 自动生成：本地 7.3.5.26972 简中与同版繁中补缺。来源与核验见 SOURCES.md。\nlocal D=LegionChineseDB\n'+buffer.join('\n')+'\n');
    generated.push('Data\\'+file);buffer=[];size=0;};
  for(const line of [...strings.map((text,i)=>'D.LocalClientValues['+(i+1)+']='+luaString(text)),...lines]){
    if(size+Buffer.byteLength(line)>900000)flush();buffer.push(line);size+=Buffer.byteLength(line)+1;
  }flush();
  for(const file of fs.readdirSync(out))if(/^LocalClient_\d+\.lua$/.test(file)&&!generated.includes('Data\\'+file))fs.unlinkSync(path.join(out,file));
  const audit={version,build:snapshot.build,buildKey:snapshot.buildKey,rootCKey:snapshot.rootCKey,snapshot:spec.file,sha256:spec.sha256,
    tools:snapshot.tools,tables:snapshot.tables,counts,chineseStrings:strings.length,exclusions:snapshot.exclusions};
  fs.writeFileSync(path.join(root,'docs/local-client-data-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return {generated,audit};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [extraction,english,destination,traditional]=process.argv.slice(2);
  if(!extraction||!english||!destination)throw Error('Usage: node scripts/local-client-data.mjs extraction-directory english-directory snapshot.json [traditional-directory]');
  const snapshot=collectLocalClient({extraction,english,traditional,toolCommits:{
    cascLib:'3f8be478177802de4ae7ebae24fb25ab860ef104',dbcd:'e732093f8864240fc5884bd1bba6b02f3dfc0d56',definitions:'77582e12f6f61c7647635bc31c152b119b9dd7f9'}});
  fs.writeFileSync(destination,JSON.stringify(snapshot)+'\n');
  console.log(JSON.stringify({tables:snapshot.tables.length,pairs:snapshot.pairs.length,sha256:hash(fs.readFileSync(destination)),
    counts:snapshot.tables.map(t=>({table:t.table,accepted:t.accepted,identityMismatch:t.identityMismatch,unsupported:t.unsupported}))},null,2));
}
