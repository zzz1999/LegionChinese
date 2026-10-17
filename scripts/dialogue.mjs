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
