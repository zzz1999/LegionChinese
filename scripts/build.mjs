import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readSQL} from './sql.mjs';
import {hasChinese,TextIndex,luaString} from './text.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=path.resolve(process.argv[2]??path.join(root,'.cache'));
const output=path.join(root,'AddOns','TauriChinese','Data');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'sources.json'),'utf8'));
const tables=new Map(),schemas=new Map(),questTitles=new Map(),broadcastIDs=new Set();
const selected=new Set(['quest_template','quest_template_locale','quest_objectives','quest_objectives_locale',
  'quest_offer_reward_locale','quest_request_items_locale','page_text','page_text_locale',
  'npc_text','gossip_menu_option','gossip_menu_option_locale','creature_text']);
const idOf=r=>r.ID??r.id??r.Id;
function collect(table,record,update){
  const locale=record.locale??record.Locale;
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
  const key=(idOf(record)??record.MenuId+':'+record.OptionIndex)+':'+(locale??'enUS');
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
  sourceAudit.push({file:source.file,sha256,url:source.url});
  if(source.kind==='hotfixes')continue;
  const target=source.kind==='pages'?new Set(['page_text']):source.kind==='patch'?new Set([...selected].filter(t=>t.endsWith('_locale'))):selected;
  await readSQL(file,target,collect,schemas);
}
const broadcast=new Map(),broadcastLocales=[];
for(const source of manifest.sql.filter(s=>s.kind==='hotfixes')){
  await readSQL(path.join(input,source.file),new Set(['broadcast_text','broadcast_text_locale']),(table,r)=>{
    if(!broadcastIDs.has(idOf(r)))return;
    if(table==='broadcast_text')broadcast.set(idOf(r),r);
    else broadcastLocales.push(r);
  });
}
const questData=new Map(),gossip=new TextIndex(),books=new TextIndex(),titles=new TextIndex(),objectives=new TextIndex();
const counts={quests:0,questFields:{},npcBroadcastRecords:0,bookPages:0,bookPagesWithoutSource:0};
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
const byBroadcast=new Map();
for(const r of broadcastLocales)if(r.locale==='zhCN')byBroadcast.set(idOf(r),r);
for(const [id,zh] of byBroadcast){
  if(hasChinese(zh.MaleText_lang)||hasChinese(zh.FemaleText_lang))counts.npcBroadcastRecords++;
  const base=broadcast.get(id);if(!base)continue;
  gossip.add(base.MaleText,zh.MaleText_lang||zh.FemaleText_lang);
  gossip.add(base.FemaleText,zh.FemaleText_lang||zh.MaleText_lang);
}
for(const r of broadcastLocales){
  if(r.locale==='zhCN'||r.locale==='zhTW')continue;
  const zh=byBroadcast.get(idOf(r));if(!zh)continue;
  gossip.add(r.MaleText_lang,zh.MaleText_lang||zh.FemaleText_lang);
  gossip.add(r.FemaleText_lang,zh.FemaleText_lang||zh.MaleText_lang);
}
for(const r of tables.get('gossip_menu_option')?.values()??[]){
  const key=r.MenuId+':'+r.OptionIndex+':zhCN';
  const zh=tables.get('gossip_menu_option_locale')?.get(key);
  const br=byBroadcast.get(r.OptionBroadcastTextId);
  gossip.add(r.OptionText,zh?.OptionText||br?.MaleText_lang||br?.FemaleText_lang);
}
for(const r of tables.get('page_text_locale')?.values()??[]){
  if(r.locale!=='zhCN'||!hasChinese(r.Text))continue;
  const original=tables.get('page_text')?.get(idOf(r)+':enUS');
  if(!original?.Text||hasChinese(original.Text)){counts.bookPagesWithoutSource++;continue;}
  books.add(original.Text,r.Text);counts.bookPages++;
  for(const candidate of tables.get('page_text_locale').values()){
    if(candidate.ID===r.ID&&candidate.locale!=='zhCN'&&candidate.locale!=='zhTW')books.add(candidate.Text,r.Text);
  }
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
const toc=['## Interface: 70300','## Title: TauriChinese 简体中文','## Notes: 离线任务、NPC 对话与书籍汉化；已有中文保持不变。','## Author: zzz1999','## Version: 0.1.0','## SavedVariables: TauriChineseSettings','', 'Bootstrap.lua',...generated,'Core.lua','UI.lua',''];
fs.writeFileSync(path.join(output,'..','TauriChinese.toc'),toc.join('\n'));
// Remove stale generated shards only, within the generated data directory.
for(const file of fs.readdirSync(output))if(/^(Quests|Strings|Gossip|Books|Titles|Objectives)_\d+\.lua$/.test(file)&&!generated.includes('Data\\'+file))fs.unlinkSync(path.join(output,file));
const audit={version:'0.1.0',counts,sources:sourceAudit,generatedFiles:generated};
fs.mkdirSync(path.join(root,'docs'),{recursive:true});
fs.writeFileSync(path.join(root,'docs','data-audit.json'),JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify(counts,null,2));
