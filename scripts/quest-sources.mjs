import {hasChinese,normalize,variants,fingerprint,supportsTokens} from './text.mjs';
import {localeOf,idOf,LEGION_BUILD} from './dialogue.mjs';
import {questIdentity,sameQuestContext} from './quest-dialogue.mjs';

const journal={LogTitle:'Title',LogDescription:'Objectives',QuestDescription:'Description',QuestCompletionLog:'CompletionLog'};
const columns={
  quest_template:journal,quest_template_locale:journal,
  quest_offer_reward:{RewardText:'Completion'},quest_offer_reward_locale:{RewardText:'Completion'},
  quest_request_items:{CompletionText:'Progress'},quest_request_items_locale:{CompletionText:'Progress'},
};
export const questSourceTables=Object.keys(columns);

export function addValidatedQuestTitles(index,sourceIndex,questData,origins){
  for(const [id,sources] of sourceIndex.titleSources){
    const origin=origins.get(id),text=questData.get(id)?.Title;
    if(!origin||!['zhCN','zhTW'].includes(origin.locale)||!hasChinese(text))continue;
    for(const source of sources){
      // The stored forms are normalized already. Do not decode nested
      // entities a second time and authorize a different original.
      if(normalize(source)===source)index.add(origin.locale,source,text,origin.priority);
    }
  }
}

// Store source fingerprints per quest AND field. Foreign-language source text
// stays in the build cache, never in the installed addon.
export class QuestSourceIndex {
  constructor(){this.sources=new Map();this.reviewed=new Map();}
  add(target,id,field,text){
    if(typeof text!=='string'||hasChinese(text)||!supportsTokens(text))return;
    const forms=variants(text).filter(form=>form.length>=2);
    if(!forms.length)return;
    if(!target.has(id))target.set(id,{});
    const fields=target.get(id),index=fields[field]??=new Map();
    for(const form of forms){
      const key=fingerprint(form);
      if(index.has(key)&&index.get(key)!==form)index.set(key,null);
      else if(!index.has(key))index.set(key,form);
    }
  }
  collect(table,row,source){
    if(!columns[table]||!['world','dialogue-world'].includes(source.kind))return;
    const build=Math.abs(Number(row.VerifiedBuild??0)),id=String(idOf(row));
    if(!Number.isSafeInteger(Number(id))||Number(id)<=0||!Number.isFinite(build)||build>LEGION_BUILD)return;
    if(!this.sources.has(source.file))this.sources.set(source.file,{kind:source.kind,quests:new Map(),texts:new Map(),chinese:new Map()});
    const current=this.sources.get(source.file);
    if(table==='quest_template')current.quests.set(id,row);
    if(['zhCN','zhTW'].includes(localeOf(row))){
      const fields=current.chinese.get(id)??{};
      for(const [column,field] of Object.entries(columns[table])){
        if(hasChinese(row[column]))(fields[field]??=new Set()).add(normalize(row[column]));
      }
      current.chinese.set(id,fields);
      return;
    }
    for(const [column,field] of Object.entries(columns[table]))this.add(current.texts,id,field,row[column]);
  }
  addReviewed(id,field,text){this.add(this.reviewed,String(id),field,text);}
  finish(baseQuests,questData){
    const merged=new Map();
    const merge=(id,fields)=>{
      if(!questData.has(id))return;
      if(!merged.has(id))merged.set(id,{});
      const target=merged.get(id);
      for(const [field,index] of Object.entries(fields)){
        if(!questData.get(id)[field])continue;
        const destination=target[field]??=new Map();
        for(const [key,form] of index){
          if(destination.has(key)&&destination.get(key)!==form)destination.set(key,null);
          else if(!destination.has(key))destination.set(key,form);
        }
      }
    };
    for(const source of this.sources.values())for(const [id,fields] of source.texts){
      // A second database can reuse IDs for different text. Require matching
      // journal identity or an exact bilingual field match below.
      if(source.kind==='world'||sameQuestContext(questIdentity(baseQuests.get(id)),questIdentity(source.quests.get(id))))merge(id,fields);
      else{
        // Later 7.3.5 captures include quests absent from the older base.
        // Their same-ID bilingual field is also usable if its Chinese text
        // exactly agrees with the translation we are actually shipping.
        for(const [field,index] of Object.entries(fields)){
          const translated=questData.get(id)?.[field];
          if(translated&&source.chinese.get(id)?.[field]?.has(normalize(translated)))merge(id,{[field]:index});
        }
      }
    }
    for(const [id,fields] of this.reviewed)merge(id,fields);
    const rows=new Map(),titleSources=new Map(),audit={quests:0,fields:0,fingerprints:0,unmatchedFields:[]};
    for(const [id,quest] of questData){
      const row={};
      for(const field of Object.keys(quest)){
        const keys=[...(merged.get(id)?.[field]??[])].filter(([,form])=>form!==null).map(([key])=>key).sort();
        if(keys.length){row[field]=keys;audit.fields++;audit.fingerprints+=keys.length;}
        else audit.unmatchedFields.push({id:Number(id),field});
      }
      if(Object.keys(row).length)rows.set(id,row);
      if(row.Title)titleSources.set(id,[...merged.get(id).Title.values()].filter(form=>form!==null));
    }
    audit.quests=rows.size;
    return {rows,titleSources,audit};
  }
}
