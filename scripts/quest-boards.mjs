import {writeResourceChunks} from './resource-writer.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {csvRows} from './client-names.mjs';
import {chooseStatic,parseColumns} from './extra-client-data.mjs';
import {fingerprint,normalize,hasChinese,luaString} from './text.mjs';

export const BOARD_BUILD='7.3.5.26972';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

export function buildQuestBoards({root,input,manifest,version}){
  const spec=manifest.questBoardReviews,bytes=fs.readFileSync(path.join(root,spec.file));
  if(sha(bytes)!==spec.sha256)throw Error('Quest board review checksum mismatch');
  const review=JSON.parse(bytes);
  if(review.schema!==1||review.build!==BOARD_BUILD||!review.question||hasChinese(review.question)
    ||/[|$<>]/.test(review.question))throw Error('Unsupported quest board review');
  const tables={},audit={version,build:BOARD_BUILD,review:spec,sources:[],headers:[],deferred:review.deferred};
  for(const source of manifest.questBoardTables){
    if(source.build!==BOARD_BUILD||source.table!=='AdventureJournal'||!['enUS','zhCN','zhTW'].includes(source.locale)
      ||tables[source.locale])throw Error('Unsupported quest board source');
    const bytes=fs.readFileSync(path.join(input,source.file));
    if(sha(bytes)!==source.sha256)throw Error('Quest board source checksum mismatch');
    const text=bytes.toString('utf8'),header=csvRows(text).next().value;
    tables[source.locale]=parseColumns(text,header.filter(c=>c!=='ID'));
    audit.sources.push(source);
  }
  for(const locale of ['enUS','zhCN','zhTW'])if(!tables[locale])throw Error('Missing quest board locale');
  const headers=new Map(),ids=new Set();
  for(const row of review.headers){
    if(!Number.isSafeInteger(row.id)||row.id<=0||ids.has(row.id))throw Error('Invalid quest board row');
    ids.add(row.id);
    const en=tables.enUS.get(row.id);
    if(!en||en.Name_lang!==row.original||+en.QuestID!==row.questID||+en.WorldMapAreaID!==row.mapAreaID)
      throw Error('Quest board header identity mismatch');
    for(const locale of ['zhCN','zhTW']){
      const localized=tables[locale].get(row.id);
      if(!localized||Object.keys(en).some(key=>!key.endsWith('_lang')&&en[key]!==localized[key]))
        throw Error('Quest board locale metadata mismatch');
    }
    const selected=chooseStatic(en.Name_lang,tables.zhCN.get(row.id).Name_lang,tables.zhTW.get(row.id).Name_lang);
    if(!selected)continue;
    if(headers.has(selected.key)&&headers.get(selected.key)!==selected.text)throw Error('Conflicting quest board header');
    headers.set(selected.key,selected.text);
    audit.headers.push({...row,locale:selected.locale,text:selected.text,fingerprint:selected.key});
  }
  const questionKey=fingerprint(normalize(review.question));
  const lines=['D.QuestBoardHeaders['+luaString(questionKey)+']={'+[...headers].map(([key,text])=>'['+luaString(key)+']='+luaString(text)).join(',')+'}'];
  const generated=writeResourceChunks({root,name:'QuestBoards',lines,numbered:false,header:'仅含已核实的 7.3.5 征令板地区名称。来源见 SOURCES.md。'});
  fs.writeFileSync(path.join(root,'docs/map-ui-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return {generated,audit};
}
