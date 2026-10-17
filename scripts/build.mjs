import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readSQL} from './sql.mjs';
import {hasChinese,TextIndex,luaString,variants,fingerprint} from './text.mjs';
import {LEGION_BUILD,localeOf,idOf,menuKey,broadcastText,selectBroadcast,compatibleLegacyPage} from './dialogue.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=path.resolve(process.argv[2]??path.join(root,'.cache'));
const output=path.join(root,'AddOns','TauriChinese','Data');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'sources.json'),'utf8'));
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const tables=new Map(),schemas=new Map(),questTitles=new Map(),broadcastIDs=new Set();
const legionPages=new Map(),legacyPages=new Map(),legacyLocales=new Map();
const selected=new Set(['quest_template','quest_template_locale','quest_objectives','quest_objectives_locale',
  'quest_offer_reward_locale','quest_request_items_locale','page_text','page_text_locale',
  'npc_text','gossip_menu_option','gossip_menu_option_locale','creature_text']);
function collect(table,record,update,source){
  const locale=localeOf(record);
  record={...record,_source:source.file,_provenance:source.provenance};
  if(locale)record.locale=locale;
  if(table==='gossip_menu_option')record.OptionBroadcastTextId=record.OptionBroadcastTextId??record.OptionBroadcastTextID;
  if(table==='npc_text') {for(let i=0;i<8;i++)if(+record['BroadcastTextID'+i])broadcastIDs.add(record['BroadcastTextID'+i]);return;}
  if(table==='creature_text'){if(+record.BroadcastTextId)broadcastIDs.add(record.BroadcastTextId);return;}
  if(table==='gossip_menu_option'&&+record.OptionBroadcastTextId)broadcastIDs.add(record.OptionBroadcastTextId);
  if(table==='quest_template'||table==='quest_template_locale'){
    const id=idOf(record);if(record.LogTitle&&!hasChinese(record.LogTitle)){
      if(!questTitles.has(id))questTitles.set(id,new Set());questTitles.get(id).add(record.LogTitle);
    }
    if(table==='quest_template'||locale!=='zhCN')return;
  }
  if(locale&&locale!=='zhCN'&&!['gossip_menu_option_locale','page_text_locale'].includes(table))return;
  const key=(idOf(record)??menuKey(record))+':'+(locale??'enUS');
  if(!tables.has(table))tables.set(table,new Map());
  const rows=tables.get(table);
  const previous=rows.get(key);
  if(previous && +previous.VerifiedBuild > +record.VerifiedBuild && locale==='zhCN')return;
  rows.set(key,update?{...rows.get(key),...record}:record);
}
const sourceAudit=[];
for(const source of manifest.sql){
  const file=path.join(input,source.file);
  const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  const sha256=hash.digest('hex');if(sha256!==source.sha256.toLowerCase())throw Error(`Source hash mismatch: ${source.file}`);
  const audit={file:source.file,sha256,url:source.url,kind:source.kind,provenance:source.provenance,afterLegionSkipped:0};
  sourceAudit.push(audit);
  if(['hotfixes','broadcast-patch'].includes(source.kind))continue;
  if(source.kind==='legacy-pages'){
    await readSQL(file,new Set(['page_text']),(t,r)=>legacyPages.set(idOf(r),r));continue;
  }
  if(source.kind==='legacy-page-locales'){
    await readSQL(file,new Set(['page_text_locale']),(t,r)=>{
      const id=idOf(r);if(!legacyLocales.has(id))legacyLocales.set(id,[]);
      legacyLocales.get(id).push({...r,_source:source.file});
    });continue;
  }
  const target=source.kind==='pages'?new Set(['page_text']):source.kind==='patch'?new Set([...selected].filter(t=>t.endsWith('_locale')))
    :source.kind==='gossip-patch'?new Set(['gossip_menu_option_locale'])
    :source.kind==='dialogue-world'?new Set(['page_text','page_text_locale','gossip_menu_option','gossip_menu_option_locale','npc_text']):selected;
  await readSQL(file,target,(table,r,update)=>{
    if(source.kind==='dialogue-world'&&Number(r.VerifiedBuild)>LEGION_BUILD){audit.afterLegionSkipped++;return;}
    if(table==='page_text'&&['world','dialogue-world'].includes(source.kind))legionPages.set(idOf(r),r);
    collect(table,r,update,source);
  },schemas);
}
const byBroadcast=new Map();
const broadcastSources=manifest.sql.filter(s=>['hotfixes','broadcast-patch'].includes(s.kind));
for(const source of broadcastSources){
  await readSQL(path.join(input,source.file),new Set(['broadcast_text_locale']),(table,r)=>{
    if(Number(r.VerifiedBuild)>LEGION_BUILD)sourceAudit.find(s=>s.file===source.file).afterLegionSkipped++;
    selectBroadcast(byBroadcast,r,source.file,source.priority??0);
  });
}
const questData=new Map(),gossip=new TextIndex(),books=new TextIndex(),titles=new TextIndex(),objectives=new TextIndex();
const counts={quests:0,questFields:{},npcBroadcastRecords:0,broadcastChineseRecords:0,broadcastConflictingRecords:0,
  bookPages:0,bookPageCandidates:0,bookPagesWithoutSource:0,
  bookSources:{clientSniff:0,legionCommunity:0,legacyCompatible:0},
  bookMatchedSources:{clientSniff:0,legionCommunity:0,legacyCompatible:0},
  legacyBooksSkipped:{missingLegionPage:0,changedOriginal:0,preferredTranslation:0},gossipOptions:0,gossipOptionsWithoutSource:0};
const questFields={LogTitle:'Title',LogDescription:'Objectives',QuestDescription:'Description',QuestCompletionLog:'CompletionLog'};
for(const r of tables.get('quest_template_locale')?.values()??[]){
  const entry={};for(const [col,field] of Object.entries(questFields))if(hasChinese(r[col]))entry[field]=r[col];
  if(Object.keys(entry).length)questData.set(idOf(r),entry);
}
for(const [table,col,field] of [['quest_offer_reward_locale','RewardText','Completion'],['quest_request_items_locale','CompletionText','Progress']]){
  for(const r of tables.get(table)?.values()??[]){if(!hasChinese(r[col]))continue;const id=idOf(r),entry=questData.get(id)??{};entry[field]=r[col];questData.set(id,entry);}
}
for(const [id,entry] of questData){
  for(const field of Object.keys(entry))counts.questFields[field]=(counts.questFields[field]??0)+1;
  for(const source of questTitles.get(id)??[])titles.add(source,entry.Title);
}
counts.quests=questData.size;
for(const row of byBroadcast.values()){
  if(row.ambiguous)counts.broadcastConflictingRecords++;else counts.broadcastChineseRecords++;
}
const matchedBroadcasts=new Set();
// Stream every source language after choosing the Chinese revision. Do not
// restrict the library to the incomplete NPC references in the old world DB.
for(const source of broadcastSources){
  await readSQL(path.join(input,source.file),new Set(['broadcast_text','broadcast_text_locale']),(table,r)=>{
    if(['zhCN','zhTW'].includes(localeOf(r))||Number(r.VerifiedBuild)>LEGION_BUILD)return;
    const zh=byBroadcast.get(idOf(r));if(!zh||zh.ambiguous)return;
    const original=broadcastText(r);
    const male=hasChinese(zh.male)?zh.male:zh.female,female=hasChinese(zh.female)?zh.female:zh.male;
    const a=gossip.add(original.male,male),b=gossip.add(original.female,female);
    if(a||b)matchedBroadcasts.add(idOf(r));
  });
}
counts.npcBroadcastRecords=matchedBroadcasts.size;
counts.npcReferencedBroadcastRecords=[...matchedBroadcasts].filter(id=>broadcastIDs.has(id)).length;
for(const r of tables.get('gossip_menu_option')?.values()??[]){
  const key=menuKey(r)+':zhCN';
  const zh=tables.get('gossip_menu_option_locale')?.get(key);
  const br=byBroadcast.get(r.OptionBroadcastTextId);
  const translated=hasChinese(zh?.OptionText)?zh.OptionText:(!br?.ambiguous&&(br?.male||br?.female));
  if(gossip.add(r.OptionText,translated))counts.gossipOptions++;
  if(zh)for(const candidate of tables.get('gossip_menu_option_locale')?.values()??[]){
    if(menuKey(candidate)===menuKey(r)&&!['zhCN','zhTW'].includes(localeOf(candidate)))gossip.add(candidate.OptionText,zh.OptionText);
  }
}
for(const r of tables.get('gossip_menu_option_locale')?.values()??[]){
  if(localeOf(r)==='zhCN'&&!tables.get('gossip_menu_option')?.has(menuKey(r)+':enUS'))counts.gossipOptionsWithoutSource++;
}
const bookPageAudit=[],bookCandidates=[];
for(const r of tables.get('page_text_locale')?.values()??[]){
  if(localeOf(r)!=='zhCN'||!hasChinese(r.Text))continue;
  const original=tables.get('page_text')?.get(idOf(r)+':enUS');
  if(!original?.Text||hasChinese(original.Text)){counts.bookPagesWithoutSource++;continue;}
  const captured=r._provenance==='client-sniff'&&Number(r.VerifiedBuild)>0;
  const priority=captured?1:0;
  books.add(original.Text,r.Text,priority);counts.bookPageCandidates++;
  const group=captured?'clientSniff':'legionCommunity';counts.bookSources[group]++;
  const audit={id:Number(idOf(r)),source:r._source,verifiedBuild:Number(r.VerifiedBuild)||0,quality:captured?'client-sniff':'community-unverified'};
  bookPageAudit.push(audit);bookCandidates.push({audit,original:original.Text,chinese:r.Text,group});
  for(const candidate of tables.get('page_text_locale').values()){
    if(candidate.ID===r.ID&&!['zhCN','zhTW'].includes(localeOf(candidate)))books.add(candidate.Text,r.Text,priority);
  }
}
for(const [id,locales] of legacyLocales){
  const zh=locales.find(r=>localeOf(r)==='zhCN'&&hasChinese(r.Text));if(!zh)continue;
  if(hasChinese(tables.get('page_text_locale')?.get(id+':zhCN')?.Text)){counts.legacyBooksSkipped.preferredTranslation++;continue;}
  const original=legionPages.get(id);
  if(!original){counts.legacyBooksSkipped.missingLegionPage++;continue;}
  if(!compatibleLegacyPage(original,legacyPages.get(id))){counts.legacyBooksSkipped.changedOriginal++;continue;}
  books.add(original.Text,zh.Text,-1);
  for(const candidate of locales)if(!['zhCN','zhTW'].includes(localeOf(candidate)))books.add(candidate.Text,zh.Text,-1);
  counts.bookPageCandidates++;counts.bookSources.legacyCompatible++;
  const audit={id:Number(id),source:zh._source,verifiedBuild:Number(zh.VerifiedBuild)||0,quality:'legacy-compatible-unverified'};
  bookPageAudit.push(audit);bookCandidates.push({audit,original:original.Text,chinese:zh.Text,group:'legacyCompatible'});
}
// Count only pages whose English key survived all ambiguity/priority decisions.
// Multiple page IDs can share the same text; fingerprint counts are not page counts.
for(const {audit,original,chinese,group} of bookCandidates){
  audit.englishMatched=variants(original).some(form=>books.entries.get(fingerprint(form))===chinese);
  if(audit.englishMatched){counts.bookPages++;counts.bookMatchedSources[group]++;}
}
for(const r of tables.get('quest_objectives_locale')?.values()??[]){
  const original=tables.get('quest_objectives')?.get(idOf(r)+':enUS');
  if(original)objectives.add(original.Description,r.Description);
}
fs.mkdirSync(output,{recursive:true});
const generated=[];
function writeChunks(name,rows,make){
  let part=0,lines=[],size=0;
  const flush=()=>{if(!lines.length)return;const file=`${name}_${String(++part).padStart(2,'0')}.lua`;const content='-- 自动生成：仅含中文译文与匹配指纹。来源见 SOURCES.md。\nlocal D = TauriChineseDB\n'+lines.join('\n')+'\n';fs.writeFileSync(path.join(output,file),content,'utf8');generated.push('Data\\'+file);lines=[];size=0;};
  for(const row of rows){const line=make(row);if(size+Buffer.byteLength(line)>900000)flush();lines.push(line);size+=Buffer.byteLength(line)+1;}flush();
}
writeChunks('Quests',[...questData].sort((a,b)=>+a[0]-b[0]),([id,r])=>'D.Quests['+id+']={'+Object.entries(r).map(([k,v])=>k+'='+luaString(v)).join(',')+'}');
const strings=[],stringIDs=new Map();
for(const index of [gossip,books,titles,objectives])for(const text of index.entries.values())if(!stringIDs.has(text)){stringIDs.set(text,strings.length+1);strings.push(text);}
writeChunks('Strings',strings.map((s,i)=>[i+1,s]),([id,s])=>'D.Strings['+id+']='+luaString(s));
for(const [name,index] of Object.entries({Gossip:gossip,Books:books,Titles:titles,Objectives:objectives})){
  writeChunks(name,[...index.entries].sort((a,b)=>a[0].localeCompare(b[0],'en')),([key,s])=>'D.'+name+'['+luaString(key)+']='+stringIDs.get(s));
  counts[name]={fingerprints:index.entries.size,ambiguousSkipped:index.ambiguous.size};
}
const toc=['## Interface: 70300','## Title: TauriChinese 简体中文','## Notes: 离线任务、NPC 对话与书籍汉化；已有中文保持不变。','## Author: zzz1999','## Version: '+version,'## SavedVariables: TauriChineseSettings','', 'Bootstrap.lua',...generated,'Core.lua','UI.lua',''];
fs.writeFileSync(path.join(output,'..','TauriChinese.toc'),toc.join('\n'));
fs.copyFileSync(path.join(root,'SOURCES.md'),path.join(output,'..','SOURCES.md'));
// Remove stale generated shards only, within the generated data directory.
for(const file of fs.readdirSync(output))if(/^(Quests|Strings|Gossip|Books|Titles|Objectives)_\d+\.lua$/.test(file)&&!generated.includes('Data\\'+file))fs.unlinkSync(path.join(output,file));
const audit={version,counts,sources:sourceAudit,generatedFiles:generated};
fs.mkdirSync(path.join(root,'docs'),{recursive:true});
fs.writeFileSync(path.join(root,'docs','data-audit.json'),JSON.stringify(audit,null,2)+'\n');
fs.writeFileSync(path.join(root,'docs','book-provenance.json'),JSON.stringify(bookPageAudit.sort((a,b)=>a.id-b.id),null,2)+'\n');
console.log(JSON.stringify(counts,null,2));
