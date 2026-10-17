import {hasChinese,normalize} from './text.mjs';

export const LEGION_BUILD = 26972;
export const localeOf = row => row.locale ?? row.Locale;
export const idOf = row => row.ID ?? row.id ?? row.Id;
export const menuKey = row => `${row.MenuId ?? row.MenuID}:${row.OptionIndex ?? row.OptionID}`;

// TrinityCore changed these field names; SQL identifiers are case insensitive.
export function broadcastText(row) {
  const fields=Object.fromEntries(Object.entries(row).map(([key,value])=>[key.toLowerCase(),value]));
  return {
    male: fields.maletext_lang ?? fields.text_lang ?? fields.maletext ?? fields.text ?? '',
    female: fields.femaletext_lang ?? fields.text1_lang ?? fields.femaletext ?? fields.text1 ?? '',
  };
}

export function selectBroadcast(records,row,source,priority=0,targetLocale='zhCN') {
  const build=Number(row.VerifiedBuild);
  if(localeOf(row)!==targetLocale||!Number.isInteger(build)||build<=0||build>LEGION_BUILD)return false;
  const text=broadcastText(row);
  if(!hasChinese(text.male)&&!hasChinese(text.female))return false;
  const candidate={...text,build,source,priority};
  const id=idOf(row),previous=records.get(id);
  if(previous&&(previous.build>build||(previous.build===build&&previous.priority>priority)))return false;
  if(previous&&previous.build===build&&previous.priority===priority){
    if(previous.male!==text.male||previous.female!==text.female)previous.ambiguous=true;
    return false;
  }
  records.set(id,candidate);
  return true;
}

export function compatibleLegacyPage(legion,legacy) {
  return !!(legion?.Text&&legacy?.Text&&idOf(legion)===idOf(legacy)
    &&!hasChinese(legion.Text)&&!hasChinese(legacy.Text)
    &&normalize(legion.Text)===normalize(legacy.Text));
}

// Old return instructions are eligible only for an unchanged quest. The runtime
// also requires the full completion text to match, never just the quest ID.
export function compatibleLegacyQuest(legion,legacy) {
  if(!legion||!legacy||idOf(legion)!==idOf(legacy)||!legacy.QuestCompletionLog||hasChinese(legacy.QuestCompletionLog))return false;
  if(Number(legion.VerifiedBuild)>LEGION_BUILD||Number(legacy.VerifiedBuild)>LEGION_BUILD)return false;
  for(const field of ['LogTitle','LogDescription','QuestDescription']){
    if(!legion[field]||!legacy[field]||hasChinese(legion[field])||hasChinese(legacy[field])
      ||normalize(legion[field])!==normalize(legacy[field]))return false;
  }
  return !legion.QuestCompletionLog||normalize(legion.QuestCompletionLog)===normalize(legacy.QuestCompletionLog);
}
