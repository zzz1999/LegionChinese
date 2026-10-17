import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {CHINESE_LOCALES} from './fallback.mjs';
import {hasChinese,luaString} from './text.mjs';
import {nameKey} from './client-names.mjs';
import {LEGION_BUILD} from './dialogue.mjs';

const plain=text=>typeof text==='string'&&text.trim()!==''&&!/[\x00-\x1f$|<>&"]/u.test(text);
export function selectItemDescriptions(source){
  if(source.schema!==1||!Array.isArray(source.records))throw Error('Invalid item description source');
  const seen=new Set(),records=[];
  for(const row of source.records){
    if(!Number.isSafeInteger(row.itemID)||row.itemID<=0||seen.has(row.itemID)
      ||!plain(row.original)||hasChinese(row.original)
      ||!Number.isInteger(row.originalSource?.verifiedBuild)||row.originalSource.verifiedBuild<=0
      ||row.originalSource.verifiedBuild>LEGION_BUILD||!Array.isArray(row.translations))throw Error('Invalid reviewed item description');
    seen.add(row.itemID);
    for(const locale of CHINESE_LOCALES){
      const choices=row.translations.filter(t=>t.locale===locale&&plain(t.text)&&hasChinese(t.text)
        &&(t.verifiedBuild===null||(Number.isInteger(t.verifiedBuild)&&t.verifiedBuild>=0&&t.verifiedBuild<=LEGION_BUILD)));
      if(new Set(choices.map(t=>t.text)).size!==1)continue;
      const selected=choices[0];
      records.push({itemID:row.itemID,key:nameKey(row.original),text:selected.text,locale,
        originalSource:row.originalSource,source:selected});
      break;
    }
  }
  return records;
}

export function buildItemDescriptions({root,manifest,version}){
  const spec=manifest.itemDescriptions;
  if(spec?.file!=='data/item-descriptions.json')throw Error('Unexpected item description source');
  const data=fs.readFileSync(path.join(root,spec.file));
  if(crypto.createHash('sha256').update(data).digest('hex')!==spec.sha256)throw Error('Item description source hash mismatch');
  const records=selectItemDescriptions(JSON.parse(data));
  const lines=records.sort((a,b)=>a.itemID-b.itemID).map(r=>`D.ItemDescriptions[${r.itemID}]={[${luaString(r.key)}]=${luaString(r.text)}}`);
  const file='ItemDescriptions_01.lua';
  fs.writeFileSync(path.join(root,'AddOns/LegionChinese/Data',file),
    '-- 自动生成：物品说明中文译文与匹配指纹。来源见 SOURCES.md。\nlocal D = LegionChineseDB\n'+lines.join('\n')+'\n');
  const counts={items:records.length,locales:{zhCN:0,zhTW:0}};
  for(const row of records)counts.locales[row.locale]++;
  const audit={version,reviewedSource:spec,counts,records};
  fs.writeFileSync(path.join(root,'docs/item-description-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return {generated:['Data\\'+file],audit};
}
