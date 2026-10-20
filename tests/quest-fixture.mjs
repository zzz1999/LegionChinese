import fs from 'node:fs';
const data=new URL('../AddOns/LegionChinese/Data/',import.meta.url);
let sources;
// Partial-data runtime tests must load the real source guards with each quest.
export function withQuestSources(row){
  const id=/^D\.Quests\[(\d+)\]=/.exec(row)?.[1];
  if(!id)return row;
  if(!sources){
    sources=new Map();
    for(const file of fs.readdirSync(data).filter(file=>file.startsWith('QuestSources_'))){
      for(const line of fs.readFileSync(new URL(file,data),'utf8').split('\n')){
        const key=/^D\.QuestSources\[(\d+)\]=/.exec(line)?.[1];
        if(key)sources.set(key,line);
      }
    }
  }
  return row+'\n'+(sources.get(id)??'');
}
