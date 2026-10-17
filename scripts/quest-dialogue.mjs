import {LEGION_BUILD,idOf} from './dialogue.mjs';
import {CHINESE_LOCALES,usableChinese} from './fallback.mjs';

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
