import {LEGION_BUILD,idOf} from './dialogue.mjs';
import {CHINESE_LOCALES,usableChinese,ChineseTextIndex} from './fallback.mjs';
import {hasChinese,normalize,variants,fingerprint,supportsTokens} from './text.mjs';

export const capturedQuestTables=new Set(['quest_offer_reward','quest_request_items']);

// Some Chinese packet captures wrote localized text into the base tables.
// Import only reviewed quest IDs and text fields from explicitly localized
// sources; never infer the language of an arbitrary base-table dump.
export function capturedQuestDialogue(table,row,source){
  const column=table==='quest_offer_reward'?'RewardText':table==='quest_request_items'?'CompletionText':null;
  const id=Number(idOf(row)),build=Number(row.VerifiedBuild);
  if(!column||!CHINESE_LOCALES.includes(source.locale)||!Number.isSafeInteger(id)||id<=0
    ||!source.questIDs?.includes(id)||!Number.isSafeInteger(build)||build<=0||build>LEGION_BUILD
    ||build!==source.captureBuild||!usableChinese(row[column]))return null;
  return {table:table+'_locale',row:{ID:String(id),locale:source.locale,[column]:row[column],VerifiedBuild:build}};
}

export const dialogueColumns={Progress:'quest_request_items_locale.CompletionText',Completion:'quest_offer_reward_locale.RewardText'};
export const questIdentity=row=>row&&({title:row.LogTitle??row.Title,objectives:row.LogDescription??row.Objectives,description:row.QuestDescription??row.Details});
export const sameQuestContext=(a,b)=>!!a&&!!b&&['title','objectives','description'].every(key=>
  typeof a[key]==='string'&&normalize(a[key])&&normalize(a[key])===normalize(b[key]));
const validBuild=build=>Number.isSafeInteger(build)&&build>=0&&build<=LEGION_BUILD;
const usableOriginal=text=>typeof text==='string'&&normalize(text).length>=2&&!hasChinese(text)&&supportsTokens(text);

// Batch review is deliberately exact. Legacy originals can be retained even
// when a current community dump has replaced its base text with Spanish: the
// runtime will require this same quest, field AND full original to match.
export function collectReviewedDialogue({localeRows,legacyQuests,baseQuests,references,reviews=[]}){
  const quests=new Map(),verification={rows:0,byResult:{},deferred:[]};
  const reviewed=new Map(reviews.map(r=>[r.id+':'+r.field,r]));
  for(const row of localeRows){
    const {id,field,locale,build,text}=row;
    if(!CHINESE_LOCALES.includes(locale))continue;
    verification.rows++;
    const old=legacyQuests.get(String(id)),base=baseQuests.get(String(id));
    const identity=questIdentity(base),legacyIdentity=questIdentity(old);
    const review=reviewed.get(id+':'+field);
    const contextReview=review?.context&&sameQuestContext(identity,review.context.identity)
      &&sameQuestContext(legacyIdentity,review.context.legacyIdentity)?review.context:null;
    const legacyEnglish=old?.[field==='Completion'?'OfferRewardText':'RequestItemsText'];
    let reason,english,englishBuild,englishSource,method,confirmation=[];
    if(!Number.isSafeInteger(id)||id<=0||!dialogueColumns[field])reason='invalid_identity';
    else if(!validBuild(build)||build===0)reason=build===0?'unverified_build':'translation_build';
    else if(!usableChinese(text))reason='unusable_chinese';
    else if(!base||!validBuild(Math.abs(Number(base.VerifiedBuild)))||(!sameQuestContext(identity,legacyIdentity)&&!contextReview))reason='quest_context';
    else{
      const options=references.flatMap(ref=>{
        const record=ref[field].get(String(id));
        const refIdentity=questIdentity(ref.quests.get(String(id)));
        return record&&validBuild(Math.abs(record.build))&&(sameQuestContext(identity,refIdentity)||contextReview&&sameQuestContext(legacyIdentity,refIdentity))
          &&usableOriginal(record.text)?[{source:ref.id,...record}]:[];
      });
      if(contextReview){
        const legacy=review.source==='pandaria-world'&&normalize(review.english)===normalize(legacyEnglish);
        const match=options.find(r=>r.source===review.source&&normalize(r.text)===normalize(review.english));
        if(legacy||match){
          english=legacy?legacyEnglish:match.text;englishBuild=legacy?Math.abs(Number(old.WDBVerified??old.VerifiedBuild??0)):Math.abs(match.build);
          englishSource=review.source;method='reviewed-context';confirmation=[{source:review.source,build:englishBuild,review:review.note}];
        }else reason='review_original';
      }else if(usableOriginal(legacyEnglish)){
        english=legacyEnglish;englishBuild=Math.abs(Number(old.WDBVerified??old.VerifiedBuild??0));englishSource='pandaria-world';
        confirmation=options.filter(r=>normalize(r.text)===normalize(english)).map(({source,build})=>({source,build}));
        method=confirmation.length?'cross-version-exact':'legacy-full-text';
        if(!validBuild(englishBuild))reason='original_build';
      }else{
        const review=reviewed.get(id+':'+field);
        const match=review&&options.find(r=>r.source===review.source&&normalize(r.text)===normalize(review.english));
        if(match){
          english=match.text;englishBuild=Math.abs(match.build);englishSource=match.source;method='reviewed-current';
          confirmation=[{source:match.source,build:match.build,review:review.note}];
        }else reason='missing_legacy_original';
      }
    }
    reason??=method;
    verification.byResult[reason]=(verification.byResult[reason]??0)+1;
    if(!english||!method||!validBuild(englishBuild)||reason!==method){
      if(build>0)verification.deferred.push({id,field,locale,build,reason});
      continue;
    }
    if(!quests.has(id))quests.set(id,{id,identity,legacyIdentity,fields:{}});
    const fields=quests.get(id).fields;
    const record=fields[field]??={english,englishBuild,englishSource,legacyEnglish:legacyEnglish??'',method,confirmation,
      column:dialogueColumns[field],...(contextReview?{contextReview}:{}),locales:{}};
    if(record.locales[locale])throw Error(`Duplicate reviewed dialogue locale: ${id}:${field}:${locale}`);
    record.locales[locale]={text,build};
  }
  return {quests:[...quests.values()].sort((a,b)=>a.id-b.id),verification};
}

// Keep supplementary dialogue separate from base quest translations, including
// its quest and stage. A common phrase must never leak to an unrelated quest.
export function importReviewedDialogue(snapshot,baseQuests,existingQuests=new Map(),onOriginal){
  if(snapshot.schemaVersion!==2||snapshot.targetBuild!==LEGION_BUILD
    ||snapshot.provenance!=='reviewed-legacy-dialogue')throw Error('Invalid reviewed dialogue snapshot');
  const audit={candidates:[],rejected:0,alreadyCoveredFields:0,fields:0,quests:0,byField:{},byLocale:{zhCN:0,zhTW:0}},seen=new Set(),scopes=[];
  const sources=new Set(snapshot.sources?.map(s=>s.id));
  for(const quest of snapshot.quests){
    if(!Number.isSafeInteger(quest.id)||quest.id<=0||seen.has(quest.id))throw Error('Invalid reviewed dialogue quest ID');
    seen.add(quest.id);
    const base=baseQuests.get(String(quest.id));
    const matches=base&&validBuild(Math.abs(Number(base.VerifiedBuild)))
      &&sameQuestContext(quest.identity,questIdentity(base));
    for(const [field,record] of Object.entries(quest.fields)){
      const column=dialogueColumns[field];
      const legacyMatch=normalize(record.english)===normalize(record.legacyEnglish);
      const proof=record.confirmation?.some(r=>validBuild(Math.abs(r.build))&&sources.has(r.source));
      const contextMatches=sameQuestContext(quest.identity,quest.legacyIdentity)||record.method==='reviewed-context'
        &&sameQuestContext(quest.identity,record.contextReview?.identity)&&sameQuestContext(quest.legacyIdentity,record.contextReview?.legacyIdentity);
      const methodValid=record.method==='legacy-full-text'?legacyMatch:
        record.method==='cross-version-exact'?legacyMatch&&proof:
        ['reviewed-current','reviewed-context'].includes(record.method)?proof&&record.confirmation.some(r=>r.review):false;
      if(!matches||!contextMatches||!column||record.column!==column||!sources.has(record.englishSource)||!validBuild(record.englishBuild)||!methodValid
        ||!usableOriginal(record.english)){audit.rejected++;continue;}
      const index=new ChineseTextIndex(),candidates=[];
      const covered=usableChinese(existingQuests.get(String(quest.id))?.[field]);
      for(const locale of CHINESE_LOCALES){
        const localized=record.locales?.[locale];
        if(!localized)continue;
        if(!validBuild(localized.build)||localized.build===0
          ||!usableChinese(localized.text)){audit.rejected++;continue;}
        if(!covered)index.add(locale,record.english,localized.text);
        const candidate={id:quest.id,field,locale,build:localized.build,column,method:record.method,
          fingerprints:variants(record.english).map(fingerprint),alreadyCovered:!!covered,selected:false};
        candidates.push(candidate);audit.candidates.push(candidate);
      }
      index.finish();
      if(candidates.length)onOriginal?.(quest.id,field,record.english);
      for(const candidate of candidates){
        candidate.selected=!covered&&candidate.fingerprints.every(key=>index.localeFor(key)===candidate.locale
          &&index.entries.get(key)===record.locales[candidate.locale].text);
        if(candidate.selected)audit.byLocale[candidate.locale]++;
      }
      if(covered)audit.alreadyCoveredFields++;
      if(index.entries.size){
        scopes.push({id:quest.id,field,index});audit.fields++;
        audit.byField[field]=(audit.byField[field]??0)+1;
      }
    }
  }
  audit.quests=new Set(scopes.map(s=>s.id)).size;
  return {audit,scopes};
}
