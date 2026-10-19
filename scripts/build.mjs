import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readSQL} from './sql.mjs';
import {hasChinese,luaString,variants,fingerprint} from './text.mjs';
import {LEGION_BUILD,localeOf,idOf,menuKey,broadcastText,selectBroadcast,compatibleLegacyPage,compatibleLegacyQuest} from './dialogue.mjs';
import {CHINESE_LOCALES,usableChinese,chooseChineseFields,ChineseTextIndex} from './fallback.mjs';
import {buildClientNames} from './client-names.mjs';
import {buildWorldObjectNames} from './world-objects.mjs';
import {capturedQuestTables,capturedQuestDialogue,importReviewedDialogue} from './quest-dialogue.mjs';
import {buildItemDescriptions} from './item-descriptions.mjs';
import {mergeQuestSupplement} from './quest-supplement.mjs';
import {buildDungeonNames} from './dungeon-names.mjs';
import {importTranslationExtras} from './translation-extras.mjs';
import {buildExtraClientData} from './extra-client-data.mjs';
import {buildBookContexts} from './book-contexts.mjs';
import {buildArtifacts} from './artifacts.mjs';
import {writeChangelog} from './changelog.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=path.resolve(process.argv[2]??path.join(root,'.cache'));
const output=path.join(root,'AddOns','LegionChinese','Data');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'sources.json'),'utf8'));
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const tables=new Map(),schemas=new Map(),questTitles=new Map(),broadcastIDs=new Set();
const legionPages=new Map(),legacyPages=new Map(),legacyLocales=new Map();
const legionQuests=new Map(),legacyQuests=new Map(),legacyQuestLocales=[];
const worldObjectRows=[];
const npcNameRows=new Map();
const npcRows=new Map(),baseObjectives=new Map();
const selected=new Set(['quest_template','quest_template_locale','quest_objectives','quest_objectives_locale',
  'quest_offer_reward_locale','quest_request_items_locale','page_text','page_text_locale',
  'npc_text','gossip_menu_option','gossip_menu_option_locale','creature_text','gameobject_template','gameobject_template_locale',
  'creature_template','creature_template_locale']);
function collect(table,record,update,source){
  const locale=localeOf(record);
  if(table==='creature_template'||table==='creature_template_locale'){
    if(source.kind!=='world'||Math.abs(Number(record.VerifiedBuild))>LEGION_BUILD)return;
    if(!locale||CHINESE_LOCALES.includes(locale)){
      const key=source.file+':'+record.entry;
      if(!npcNameRows.has(key))npcNameRows.set(key,{});
      npcNameRows.get(key)[locale??'enUS']=record.name??record.Name;
      const id=Number(record.entry);if(!npcRows.has(id))npcRows.set(id,{});
      npcRows.get(id)[locale??'enUS']=locale?record:{Name:record.name,NameAlt:record.femaleName,Title:record.subname,TitleAlt:record.TitleAlt};
    }
    return;
  }
  if(table==='gameobject_template'||table==='gameobject_template_locale'){
    if(!locale||CHINESE_LOCALES.includes(locale))worldObjectRows.push({table,id:Number(record.entry),locale,
      name:record.name,verifiedBuild:Number(record.VerifiedBuild),source:source.file,
      ...(source.kind==='world-object-locales'?{baseFile:source.baseFile,expectedOriginal:source.objectNames?.[record.entry]}:{})});
    return;
  }
  record={...record,_source:source.file,_provenance:source.provenance};
  if(table==='quest_objectives'&&source.kind==='world'){
    const quest=String(record.QuestID);if(!baseObjectives.has(quest))baseObjectives.set(quest,[]);
    baseObjectives.get(quest).push({id:Number(record.ID),order:Number(record.StorageIndex),amount:Number(record.Amount)});
  }
  if(locale)record.locale=locale;
  if(table==='gossip_menu_option')record.OptionBroadcastTextId=record.OptionBroadcastTextId??record.OptionBroadcastTextID;
  if(table==='npc_text') {for(let i=0;i<8;i++)if(+record['BroadcastTextID'+i])broadcastIDs.add(record['BroadcastTextID'+i]);return;}
  if(table==='creature_text'){if(+record.BroadcastTextId)broadcastIDs.add(record.BroadcastTextId);return;}
  if(table==='gossip_menu_option'&&+record.OptionBroadcastTextId)broadcastIDs.add(record.OptionBroadcastTextId);
  if(table==='quest_template'||table==='quest_template_locale'){
    const id=idOf(record);if(record.LogTitle&&!hasChinese(record.LogTitle)){
      if(!questTitles.has(id))questTitles.set(id,new Set());questTitles.get(id).add(record.LogTitle);
    }
    if(table==='quest_template'||!CHINESE_LOCALES.includes(locale))return;
  }
  if(locale&&!CHINESE_LOCALES.includes(locale)&&!['gossip_menu_option_locale','page_text_locale'].includes(table))return;
  const key=(idOf(record)??menuKey(record))+':'+(locale??'enUS');
  if(!tables.has(table))tables.set(table,new Map());
  const rows=tables.get(table);
  const previous=rows.get(key);
  if(previous && +previous.VerifiedBuild > +record.VerifiedBuild && CHINESE_LOCALES.includes(locale))return;
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
  if(source.kind==='world-object-locales'){
    if(!manifest.sql.some(s=>s.file===source.baseFile&&s.kind==='world')||!source.objectNames)throw Error('Missing object patch base');
    audit.baseFile=source.baseFile;audit.objectIDs=Object.keys(source.objectNames).map(Number);
    await readSQL(file,new Set(['gameobject_template_locale']),(table,row)=>{
      if(Object.hasOwn(source.objectNames,row.entry))collect(table,row,false,source);
    });
    continue;
  }
  if(source.kind==='quest-dialogue-capture'){
    audit.locale=source.locale;audit.captureBuild=source.captureBuild;audit.imported=[];
    await readSQL(file,capturedQuestTables,(table,row)=>{
      const captured=capturedQuestDialogue(table,row,source);
      if(!captured)return;
      collect(captured.table,captured.row,true,source);
      audit.imported.push({id:Number(captured.row.ID),table:captured.table,verifiedBuild:captured.row.VerifiedBuild});
    });
    continue;
  }
  if(source.kind==='legacy-pages'){
    await readSQL(file,new Set(['page_text']),(t,r)=>legacyPages.set(idOf(r),r));continue;
  }
  if(source.kind==='legacy-page-locales'){
    await readSQL(file,new Set(['page_text_locale']),(t,r)=>{
      const id=idOf(r);if(!legacyLocales.has(id))legacyLocales.set(id,[]);
      legacyLocales.get(id).push({...r,_source:source.file});
    });continue;
  }
  if(source.kind==='legacy-quests'){
    await readSQL(file,new Set(['quest_template']),(t,r)=>legacyQuests.set(idOf(r),r));continue;
  }
  if(source.kind==='legacy-quest-locales'){
    await readSQL(file,new Set(['quest_template_locale']),(t,r)=>{
      if(Number(r.VerifiedBuild)>LEGION_BUILD){audit.afterLegionSkipped++;return;}
      if(CHINESE_LOCALES.includes(localeOf(r)))legacyQuestLocales.push({...r,_source:source.file});
    });continue;
  }
  const target=source.kind==='pages'?new Set(['page_text']):source.kind==='patch'?new Set([...selected].filter(t=>t.endsWith('_locale')))
    :source.kind==='gossip-patch'?new Set(['gossip_menu_option_locale'])
    :source.kind==='dialogue-world'?new Set(['page_text','page_text_locale','gossip_menu_option','gossip_menu_option_locale','npc_text',
      'quest_offer_reward_locale','quest_request_items_locale','gameobject_template','gameobject_template_locale']):selected;
  await readSQL(file,target,(table,r,update)=>{
    if(source.kind==='dialogue-world'&&Number(r.VerifiedBuild)>LEGION_BUILD){audit.afterLegionSkipped++;return;}
    if(table==='page_text'&&['world','dialogue-world'].includes(source.kind))legionPages.set(idOf(r),r);
    if(table==='quest_template'&&source.kind==='world'&&Number(r.VerifiedBuild)<=LEGION_BUILD)legionQuests.set(idOf(r),r);
    collect(table,r,update,source);
  },schemas);
}
const byBroadcast={zhCN:new Map(),zhTW:new Map()};
const broadcastSources=manifest.sql.filter(s=>['hotfixes','broadcast-patch'].includes(s.kind));
for(const source of broadcastSources){
  await readSQL(path.join(input,source.file),new Set(['broadcast_text_locale']),(table,r)=>{
    if(Number(r.VerifiedBuild)>LEGION_BUILD)sourceAudit.find(s=>s.file===source.file).afterLegionSkipped++;
    const locale=localeOf(r);
    if(CHINESE_LOCALES.includes(locale))selectBroadcast(byBroadcast[locale],r,source.file,source.priority??0,locale);
  });
}
const questData=new Map(),questVariants=new Map();
const gossip=new ChineseTextIndex(),books=new ChineseTextIndex(),titles=new ChineseTextIndex(),objectives=new ChineseTextIndex();
const npcNames=new ChineseTextIndex();
for(const row of npcNameRows.values())for(const locale of CHINESE_LOCALES){
  if(!/[$|\r\n%]/.test(row[locale]??''))npcNames.add(locale,row.enUS,row[locale]);
}
npcNames.finish();npcNameRows.clear();
const completions=new ChineseTextIndex(),completionAudit=[];
const counts={quests:0,questFields:{},npcBroadcastRecords:0,broadcastChineseRecords:0,broadcastConflictingRecords:0,
  bookPages:0,bookPageCandidates:0,bookPagesWithoutSource:0,
  questTraditionalFields:{},questDialogueSources:{buildMarked:0,communityUnverified:0},
  broadcastLocales:{zhCN:0,zhTW:0},bookLocaleCandidates:{zhCN:0,zhTW:0},bookPagesByLocale:{zhCN:0,zhTW:0},
  bookSources:{clientSniff:0,legionCommunity:0,legacyCompatible:0},
  bookMatchedSources:{clientSniff:0,legionCommunity:0,legacyCompatible:0},
  legacyBooksSkipped:{missingLegionPage:0,changedOriginal:0,preferredTranslation:0},gossipOptions:0,gossipOptionsWithoutSource:0};
const questFields={LogTitle:'Title',LogDescription:'Objectives',QuestDescription:'Description',QuestCompletionLog:'CompletionLog'};
const questDialogueFields=[['quest_offer_reward_locale','RewardText','Completion'],['quest_request_items_locale','CompletionText','Progress']];
function questLocaleEntry(row){
  const id=idOf(row),locale=localeOf(row);
  if(!questVariants.has(id))questVariants.set(id,{});
  const localized=questVariants.get(id);return localized[locale]??={};
}
for(const r of tables.get('quest_template_locale')?.values()??[]){
  const entry=questLocaleEntry(r);for(const [col,field] of Object.entries(questFields))entry[field]=r[col];
}
for(const [table,col,field] of questDialogueFields){
  for(const r of tables.get(table)?.values()??[])questLocaleEntry(r)[field]=r[col];
}
for(const [id,localized] of questVariants){
  const {values,locales}=chooseChineseFields(localized.zhCN,localized.zhTW);
  if(!Object.keys(values).length)continue;
  questData.set(id,values);
  for(const field of Object.keys(values)){
    counts.questFields[field]=(counts.questFields[field]??0)+1;
    if(locales[field]==='zhTW')counts.questTraditionalFields[field]=(counts.questTraditionalFields[field]??0)+1;
  }
  for(const [table,,field] of questDialogueFields){
    if(!values[field])continue;
    const row=tables.get(table).get(id+':'+locales[field]);
    counts.questDialogueSources[Number(row.VerifiedBuild)>0?'buildMarked':'communityUnverified']++;
  }
  for(const source of questTitles.get(id)??[])for(const locale of CHINESE_LOCALES)titles.add(locale,source,localized[locale]?.Title);
}
const supplement=mergeQuestSupplement({root,manifest,baseQuests:legionQuests,questData,titles,gossip,completions});
for(const record of supplement.records){
  counts.questFields[record.field]=(counts.questFields[record.field]??0)+1;
  if(record.locale==='zhTW')counts.questTraditionalFields[record.field]=(counts.questTraditionalFields[record.field]??0)+1;
  if(['Progress','Completion'].includes(record.field))counts.questDialogueSources[record.build>0?'buildMarked':'communityUnverified']++;
}
counts.questSupplement={fields:supplement.fields,quests:supplement.quests,byField:supplement.byField,byLocale:supplement.byLocale};
counts.quests=questData.size;
const dialogueSpec=manifest.reviewedQuestDialogue;
const dialogueBytes=fs.readFileSync(path.join(root,dialogueSpec.file));
if(crypto.createHash('sha256').update(dialogueBytes).digest('hex')!==dialogueSpec.sha256)throw Error('Reviewed dialogue checksum mismatch');
const dialogueSnapshot=JSON.parse(dialogueBytes);
const reviewBytes=fs.readFileSync(path.join(root,dialogueSnapshot.reviews.file));
if(crypto.createHash('sha256').update(reviewBytes).digest('hex')!==dialogueSnapshot.reviews.sha256)throw Error('Dialogue review checksum mismatch');
const {audit:reviewedAudit,scopes:reviewedDialogue}=importReviewedDialogue(dialogueSnapshot,legionQuests,questData);
const extras=importTranslationExtras({root,manifest,baseQuests:legionQuests,baseObjectives,questData});
// Dedicated reviewed dialogue takes precedence over general archive supplements.
const extraScopes=extras.scopes.filter(s=>!reviewedDialogue.some(d=>d.id===s.id&&d.field===s.field));
const dialogueAudit={source:dialogueSpec.file,sha256:dialogueSpec.sha256,provenance:dialogueSnapshot.provenance,
  sources:dialogueSnapshot.sources,reviews:dialogueSnapshot.reviews,verification:dialogueSnapshot.verification,...reviewedAudit};
titles.finish();
for(const row of legacyQuestLocales){
  const id=idOf(row),locale=localeOf(row),legacy=legacyQuests.get(id);
  if(!compatibleLegacyQuest(legionQuests.get(id),legacy)||!usableChinese(row.CompletedText))continue;
  completions.add(locale,legacy.QuestCompletionLog,row.CompletedText);
  completionAudit.push({id:+id,locale,source:row._source,verifiedBuild:+row.VerifiedBuild||0,
    provenance:'legacy-compatible-unverified',fingerprints:variants(legacy.QuestCompletionLog).map(fingerprint)});
}
completions.finish();
for(const locale of CHINESE_LOCALES)for(const row of byBroadcast[locale].values()){
  if(row.ambiguous)counts.broadcastConflictingRecords++;else counts.broadcastLocales[locale]++;
}
counts.broadcastChineseRecords=counts.broadcastLocales.zhCN;
const matchedBroadcasts=new Set();
// Stream every source language after choosing the Chinese revision. Do not
// restrict the library to the incomplete NPC references in the old world DB.
for(const source of broadcastSources){
  await readSQL(path.join(input,source.file),new Set(['broadcast_text','broadcast_text_locale']),(table,r)=>{
    if(['zhCN','zhTW'].includes(localeOf(r))||Number(r.VerifiedBuild)>LEGION_BUILD)return;
    const original=broadcastText(r);
    for(const locale of CHINESE_LOCALES){
      const zh=byBroadcast[locale].get(idOf(r));if(!zh||zh.ambiguous)continue;
      const male=usableChinese(zh.male)?zh.male:zh.female,female=usableChinese(zh.female)?zh.female:zh.male;
      const a=gossip.add(locale,original.male,male),b=gossip.add(locale,original.female,female);
      if(a||b)matchedBroadcasts.add(idOf(r));
    }
  });
}
counts.npcBroadcastRecords=matchedBroadcasts.size;
counts.npcReferencedBroadcastRecords=[...matchedBroadcasts].filter(id=>broadcastIDs.has(id)).length;
for(const r of tables.get('gossip_menu_option')?.values()??[]){
  let matched=false;
  for(const locale of CHINESE_LOCALES){
    const zh=tables.get('gossip_menu_option_locale')?.get(menuKey(r)+':'+locale);
    const br=byBroadcast[locale].get(r.OptionBroadcastTextId);
    const translated=usableChinese(zh?.OptionText)?zh.OptionText:(!br?.ambiguous&&(usableChinese(br?.male)?br.male:br?.female));
    if(gossip.add(locale,r.OptionText,translated))matched=true;
    const box=byBroadcast[locale].get(r.BoxBroadcastTextId??r.BoxBroadcastTextID);
    const boxText=usableChinese(zh?.BoxText)?zh.BoxText:(!box?.ambiguous&&(usableChinese(box?.male)?box.male:box?.female));
    gossip.add(locale,r.BoxText,boxText);
    if(zh)for(const candidate of tables.get('gossip_menu_option_locale')?.values()??[]){
      if(menuKey(candidate)===menuKey(r)&&!CHINESE_LOCALES.includes(localeOf(candidate)))gossip.add(locale,candidate.OptionText,zh.OptionText);
    }
  }
  if(matched)counts.gossipOptions++;
}
for(const r of tables.get('gossip_menu_option_locale')?.values()??[]){
  if(CHINESE_LOCALES.includes(localeOf(r))&&!tables.get('gossip_menu_option')?.has(menuKey(r)+':enUS'))counts.gossipOptionsWithoutSource++;
}
gossip.finish();
const bookPageAudit=[],bookCandidates=[],bookIDs=new Set();
for(const r of tables.get('page_text_locale')?.values()??[]){
  const locale=localeOf(r);
  if(!CHINESE_LOCALES.includes(locale)||!hasChinese(r.Text))continue;
  const original=tables.get('page_text')?.get(idOf(r)+':enUS');
  if(!original?.Text||hasChinese(original.Text)){counts.bookPagesWithoutSource++;continue;}
  const captured=r._provenance==='client-sniff'&&Number(r.VerifiedBuild)>0;
  const priority=captured?1:0;
  books.add(locale,original.Text,r.Text,priority);bookIDs.add(idOf(r));counts.bookLocaleCandidates[locale]++;
  const group=captured?'clientSniff':'legionCommunity';counts.bookSources[group]++;
  const audit={id:Number(idOf(r)),locale,source:r._source,verifiedBuild:Number(r.VerifiedBuild)||0,quality:captured?'client-sniff':'community-unverified'};
  bookPageAudit.push(audit);bookCandidates.push({audit,original:original.Text,chinese:r.Text,group});
  for(const candidate of tables.get('page_text_locale').values()){
    if(candidate.ID===r.ID&&!CHINESE_LOCALES.includes(localeOf(candidate)))books.add(locale,candidate.Text,r.Text,priority);
  }
}
for(const [id,locales] of legacyLocales)for(const locale of CHINESE_LOCALES){
  const zh=locales.find(r=>localeOf(r)===locale&&usableChinese(r.Text));if(!zh)continue;
  if(usableChinese(tables.get('page_text_locale')?.get(id+':'+locale)?.Text)){counts.legacyBooksSkipped.preferredTranslation++;continue;}
  const original=legionPages.get(id);
  if(!original){counts.legacyBooksSkipped.missingLegionPage++;continue;}
  if(!compatibleLegacyPage(original,legacyPages.get(id))){counts.legacyBooksSkipped.changedOriginal++;continue;}
  books.add(locale,original.Text,zh.Text,-1);
  for(const candidate of locales)if(!CHINESE_LOCALES.includes(localeOf(candidate)))books.add(locale,candidate.Text,zh.Text,-1);
  bookIDs.add(id);counts.bookLocaleCandidates[locale]++;counts.bookSources.legacyCompatible++;
  const audit={id:Number(id),locale,source:zh._source,verifiedBuild:Number(zh.VerifiedBuild)||0,quality:'legacy-compatible-unverified'};
  bookPageAudit.push(audit);bookCandidates.push({audit,original:original.Text,chinese:zh.Text,group:'legacyCompatible'});
}
// Count only pages whose English key survived all ambiguity/priority decisions.
// Multiple page IDs can share the same text; fingerprint counts are not page counts.
books.finish();
const bookContexts=buildBookContexts(legionPages,bookCandidates,books);counts.bookContexts=bookContexts.audit;
const matchedPages=new Map();
for(const {audit,original,chinese,group} of bookCandidates){
  audit.englishMatched=variants(original).some(form=>{
    const key=fingerprint(form);return books.entries.get(key)===chinese&&books.localeFor(key)===audit.locale;
  });
  if(audit.englishMatched&&(!matchedPages.has(audit.id)||audit.locale==='zhCN'))matchedPages.set(audit.id,{locale:audit.locale,group});
}
counts.bookPageCandidates=bookIDs.size;counts.bookPages=matchedPages.size;
for(const {locale,group} of matchedPages.values()){counts.bookPagesByLocale[locale]++;counts.bookMatchedSources[group]++;}
for(const r of tables.get('quest_objectives_locale')?.values()??[]){
  const original=tables.get('quest_objectives')?.get(idOf(r)+':enUS');
  if(original)objectives.add(localeOf(r),original.Description,r.Description);
}
objectives.finish();
fs.mkdirSync(output,{recursive:true});
const generated=[];
function writeChunks(name,rows,make){
  let part=0,lines=[],size=0;
  const flush=()=>{if(!lines.length)return;const file=`${name}_${String(++part).padStart(2,'0')}.lua`;const content='-- 自动生成：仅含中文译文与匹配指纹。来源见 SOURCES.md。\nlocal D = LegionChineseDB\n'+lines.join('\n')+'\n';fs.writeFileSync(path.join(output,file),content,'utf8');generated.push('Data\\'+file);lines=[];size=0;};
  for(const row of rows){const line=make(row);if(size+Buffer.byteLength(line)>900000)flush();lines.push(line);size+=Buffer.byteLength(line)+1;}flush();
}
writeChunks('Quests',[...questData].sort((a,b)=>+a[0]-b[0]),([id,r])=>'D.Quests['+id+']={'+Object.entries(r).map(([k,v])=>k+'='+luaString(v)).join(',')+'}');
const strings=[],stringIDs=new Map();
for(const index of [gossip,books,titles,objectives,completions,npcNames,...reviewedDialogue.map(s=>s.index),...extraScopes.map(s=>s.index),...bookContexts.scopes.map(s=>s.index)])for(const text of index.entries.values())if(!stringIDs.has(text)){stringIDs.set(text,strings.length+1);strings.push(text);}
writeChunks('Strings',strings.map((s,i)=>[i+1,s]),([id,s])=>'D.Strings['+id+']='+luaString(s));
for(const [name,index] of Object.entries({Gossip:gossip,Books:books,Titles:titles,Objectives:objectives,Completions:completions,NPCNames:npcNames})){
  writeChunks(name,[...index.entries].sort((a,b)=>a[0].localeCompare(b[0],'en')),([key,s])=>'D.'+name+'['+luaString(key)+']='+stringIDs.get(s));
  counts[name]={fingerprints:index.entries.size,ambiguousSkipped:index.ambiguous.size,locales:index.localeCounts};
}
const dialogueRows=new Map();
counts.QuestDialogue={quests:reviewedAudit.quests,fields:reviewedAudit.fields,byField:reviewedAudit.byField,
  byLocale:reviewedAudit.byLocale,fingerprints:0,ambiguousSkipped:0,locales:{zhCN:0,zhTW:0}};
for(const {id,field,index} of reviewedDialogue){
  if(!dialogueRows.has(id))dialogueRows.set(id,[]);
  const entries=[...index.entries].sort((a,b)=>a[0].localeCompare(b[0],'en'));
  dialogueRows.get(id).push(field+'={'+entries.map(([key,s])=>'['+luaString(key)+']='+stringIDs.get(s)).join(',')+'}');
  counts.QuestDialogue.fingerprints+=index.entries.size;counts.QuestDialogue.ambiguousSkipped+=index.ambiguous.size;
  for(const locale of CHINESE_LOCALES)counts.QuestDialogue.locales[locale]+=index.localeCounts[locale];
}
writeChunks('QuestDialogue',[...dialogueRows].sort((a,b)=>a[0]-b[0]),([id,fields])=>'D.QuestDialogue['+id+']={'+fields.join(',')+'}');
const extraRows=new Map();
for(const {id,field,index} of extraScopes){
  if(!extraRows.has(id))extraRows.set(id,[]);
  extraRows.get(id).push(field+'={'+[...index.entries].map(([key,text])=>'['+luaString(key)+']='+stringIDs.get(text)).join(',')+'}');
}
writeChunks('QuestExtras',[...extraRows].sort((a,b)=>a[0]-b[0]),([id,fields])=>'D.QuestExtras['+id+']={'+fields.join(',')+'}');
const contextRows=new Map();
for(const {anchor,page,index} of bookContexts.scopes){
  if(!contextRows.has(anchor))contextRows.set(anchor,[]);
  contextRows.get(anchor).push('['+page+']={'+[...index.entries].map(([key,text])=>'['+luaString(key)+']='+stringIDs.get(text)).join(',')+'}');
}
writeChunks('BookContexts',[...contextRows],([anchor,pages])=>'D.BookContexts['+luaString(anchor)+']={'+pages.join(',')+'}');
counts.questExtras={quests:extraRows.size,fields:extraScopes.length,byField:extras.audit.byField,byLocale:extras.audit.byLocale,deferred:extras.audit.deferred.length};
fs.writeFileSync(path.join(root,'docs/translation-extras-audit.json'),JSON.stringify(extras.audit,null,2)+'\n');
const clientNames=buildClientNames({root,input,manifest,version});
generated.push(...clientNames.generated);
counts.clientNames=clientNames.audit.counts;
const worldObjects=buildWorldObjectNames({root,input,manifest,version,sqlRows:worldObjectRows});
generated.push(...worldObjects.generated);counts.worldObjects=worldObjects.audit.counts;
const itemDescriptions=buildItemDescriptions({root,input,manifest,version});
generated.push(...itemDescriptions.generated);counts.itemDescriptions=itemDescriptions.audit.counts;
const dungeonNames=buildDungeonNames({root,input,manifest});
generated.push(...dungeonNames.generated);counts.dungeonNames=dungeonNames.audit.counts;
const extraClient=buildExtraClientData({root,input,manifest,npcRows,version});
generated.push(...extraClient.generated);counts.extraClient=extraClient.audit.counts;
const artifacts=buildArtifacts({root,input,manifest,version});
generated.push(...artifacts.generated);counts.artifacts={...artifacts.audit.counts,choices:artifacts.audit.choices.fields};
writeChangelog(root,version);
const toc=['## Interface: 70300','## Title: LegionChinese 中文','## Notes: 离线汉化：简体优先，繁体补充，缺失保留原文。','## Author: zzz1999','## Version: '+version,'## X-Curse-Project-ID: 1750538','## SavedVariables: LegionChineseSettings','', 'Bootstrap.lua',...generated,'Core.lua','ClientNames.lua','WorldObjects.lua','ItemTooltips.lua','ExtraTooltips.lua','Artifacts.lua','ChatLinks.lua','Changelog.lua','Welcome.lua','UI.lua',''];
fs.writeFileSync(path.join(output,'..','LegionChinese.toc'),toc.join('\n'));
fs.copyFileSync(path.join(root,'SOURCES.md'),path.join(output,'..','SOURCES.md'));
// Remove stale generated shards only, within the generated data directory.
for(const file of fs.readdirSync(output))if(/^(Quests|Strings|Gossip|Books|Titles|Objectives|Completions|NPCNames|QuestDialogue|QuestExtras|BookContexts)_\d+\.lua$/.test(file)&&!generated.includes('Data\\'+file))fs.unlinkSync(path.join(output,file));
const audit={version,counts,sources:sourceAudit,generatedFiles:generated};
fs.mkdirSync(path.join(root,'docs'),{recursive:true});
fs.writeFileSync(path.join(root,'docs','quest-supplement-audit.json'),JSON.stringify(supplement,null,2)+'\n');
fs.writeFileSync(path.join(root,'docs','reviewed-quest-dialogue-audit.json'),JSON.stringify(dialogueAudit,null,2)+'\n');
fs.writeFileSync(path.join(root,'docs','data-audit.json'),JSON.stringify(audit,null,2)+'\n');
fs.writeFileSync(path.join(root,'docs','book-provenance.json'),JSON.stringify(bookPageAudit.sort((a,b)=>a.id-b.id||a.locale.localeCompare(b.locale)),null,2)+'\n');
fs.writeFileSync(path.join(root,'docs','completion-provenance.json'),JSON.stringify(completionAudit.map(row=>({...row,
  selectedLocales:row.fingerprints.map(key=>completions.localeFor(key)??null)})).sort((a,b)=>a.id-b.id||a.locale.localeCompare(b.locale)),null,2)+'\n');
console.log(JSON.stringify(counts,null,2));
