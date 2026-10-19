import {LEGION_BUILD,idOf} from './dialogue.mjs';
import {CHINESE_LOCALES,usableChinese} from './fallback.mjs';
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

// Old-version dialogue is never assigned by quest ID alone. Require matching
// quest context at build time, then use the existing full-text lookup at runtime.
export function importReviewedDialogue(snapshot,baseQuests,gossip){
  if(snapshot.schemaVersion!==1||snapshot.targetBuild!==LEGION_BUILD
    ||snapshot.provenance!=='reviewed-legacy-dialogue')throw Error('Invalid reviewed dialogue snapshot');
  const audit={candidates:[],rejected:0},seen=new Set();
  for(const quest of snapshot.quests){
    if(!Number.isSafeInteger(quest.id)||quest.id<=0||seen.has(quest.id))throw Error('Invalid reviewed dialogue quest ID');
    seen.add(quest.id);
    const base=baseQuests.get(String(quest.id));
    const matches=base&&Number.isFinite(Number(base.VerifiedBuild))&&Math.abs(Number(base.VerifiedBuild))<=LEGION_BUILD
      &&[['title','LogTitle'],['objectives','LogDescription'],['description','QuestDescription']].every(([key,column])=>
        typeof quest.identity?.[key]==='string'&&normalize(quest.identity[key])
        &&normalize(base[column])===normalize(quest.identity[key])
        &&normalize(quest.legacyIdentity?.[key])===normalize(quest.identity[key]));
    for(const [field,record] of Object.entries(quest.fields)){
      const column={Progress:'quest_request_items_locale.CompletionText',Completion:'quest_offer_reward_locale.RewardText'}[field];
      if(!matches||!column||record.column!==column||record.englishBuild!==LEGION_BUILD
        ||typeof record.english!=='string'||normalize(record.english).length<2
        ||hasChinese(record.english)||!supportsTokens(record.english)){audit.rejected++;continue;}
      for(const locale of CHINESE_LOCALES){
        const localized=record.locales[locale];
        if(!localized)continue;
        if(!Number.isSafeInteger(localized.build)||localized.build<=0||localized.build>LEGION_BUILD
          ||!usableChinese(localized.text)){audit.rejected++;continue;}
        gossip.add(locale,record.english,localized.text,-2);
        audit.candidates.push({id:quest.id,field,locale,build:localized.build,column,
          fingerprints:variants(record.english).map(fingerprint)});
      }
    }
  }
  return audit;
}
