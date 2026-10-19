// Make a reviewable, pinned snapshot from the separately maintained quest archive.
// Usage: node scripts/collect-translation-extras.mjs <archive directory>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {hasChinese} from './text.mjs';
import {csvRows} from './client-names.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), archive=path.resolve(process.argv[2]);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'sources.json')));
const fieldMap={title:'Title',objectives:'Objectives',description:'Description',completed:'CompletionLog',progress:'Progress',completion:'Completion',
  giverWindow:'PortraitGiverText',giverTarget:'PortraitGiverName',turninWindow:'PortraitTurnInText',turninTarget:'PortraitTurnInName',end:'AreaDescription'};
const covered=new Map();
for(const file of fs.readdirSync(path.join(root,'AddOns/LegionChinese/Data')).filter(f=>/^Quests_/.test(f)))
  for(const line of fs.readFileSync(path.join(root,'AddOns/LegionChinese/Data',file),'utf8').split('\n')){
    const m=line.match(/^D\.Quests\[(\d+)\]=\{(.*)\}$/);if(m)covered.set(+m[1],new Set([...m[2].matchAll(/(\w+)="/g)].map(v=>v[1])));
  }
const inputs=[],quests=[],deferred=[];
for(const file of fs.readdirSync(path.join(archive,'data/legion')).filter(f=>f.endsWith('.jsonl')).sort()){
  const bytes=fs.readFileSync(path.join(archive,'data/legion',file));inputs.push({file:'data/legion/'+file,sha256:hash(bytes)});
  for(const line of bytes.toString('utf8').trim().split('\n')){
    const q=JSON.parse(line);if(q.tags.some(t=>['suspected-test','community-custom'].includes(t)))continue;
    const fields={};
    for(const [source,field] of Object.entries(fieldMap)){
      const text=q.text[source];if(!hasChinese(text)||(covered.get(q.id)?.has(field)&&!(/\$(?:\d*oa|p\b|ct\b|vn\b|vg)/i.test(text))))continue;
      const build=q.textBuilds[source];
      if(!Number.isFinite(build)||Math.abs(build)>26972||!q.english[source]||hasChinese(q.english[source])){
        deferred.push({id:q.id,field,reason:'missing_original_or_build'});continue;
      }
      fields[field]={text,english:q.english[source],locale:q.textLocales[source],build,
        source:q.textSources[source],column:q.textColumns[source],originalSource:q.englishSources?.[source]};
    }
    if(Object.keys(fields).length)quests.push({id:q.id,identity:{title:q.english.title,objectives:q.english.objectives,description:q.english.description},
      objectives:q.objectiveDetails.map(o=>({id:o.id,order:o.order,amount:o.amount})),fields});
  }
}
const readingManifest=JSON.parse(fs.readFileSync(path.join(archive,'sources/reading/manifest.json'))),tables={};
if(readingManifest.build!=='7.3.5.26972')throw Error('Unexpected class table build');
for(const asset of readingManifest.assets){
  const bytes=fs.readFileSync(path.join(archive,asset.path));if(hash(bytes)!==asset.sha256)throw Error('Class table checksum mismatch');
  const rows=csvRows(bytes.toString('utf8')),header=rows.next().value;
  tables[asset.table+':'+asset.locale]=new Map([...rows].map(row=>{const r=Object.fromEntries(header.map((c,i)=>[c,row[i]]));return [+r.ChrClassID||+r.ID,r];}));
}
const classes=Array.from({length:12},(_,i)=>{
  const id=i+1,locales={};for(const locale of ['enUS','zhCN','zhTW']){
    const title=tables['ChrClassTitle:'+locale].get(id),villain=tables['ChrClassVillain:'+locale].get(id);
    locales[locale]={titleMale:title?.Name_male_lang,titleFemale:title?.Name_female_lang||title?.Name_male_lang,villain:villain?.Name_lang};
  }return {id,gender:+tables['ChrClassVillain:enUS'].get(id).Gender,locales};
});
const archiveManifest=JSON.parse(fs.readFileSync(path.join(archive,'sources/manifest.json')));
const snapshot={schema:1,build:26972,baseWorldSha256:manifest.sql.find(s=>s.kind==='world').sha256,
  archive:{commit:execFileSync('git',['-c','safe.directory='+archive,'rev-parse','HEAD'],{cwd:archive,encoding:'utf8'}).trim(),inputs,
    sources:archiveManifest.versions.filter(v=>v.id==='legion'),reading:readingManifest},quests,classes,deferred};
const file='data/translation-extras.json',bytes=JSON.stringify(snapshot,null,2)+'\n';
fs.writeFileSync(path.join(root,file),bytes);manifest.translationExtras={file,sha256:hash(bytes)};
fs.writeFileSync(path.join(root,'sources.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({quests:quests.length,fields:quests.reduce((n,q)=>n+Object.keys(q.fields).length,0),deferred:deferred.length,sha256:hash(bytes)}));
