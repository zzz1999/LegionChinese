import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {luaFiles} from './resource-equivalence.mjs';

// One registry controls generated directories, ordering and validation.
const definitions=[
  ['Shared','SharedStrings Strings NameStrings CatalogStrings'],
  ['Quests','Quests QuestSources Titles Objectives Completions QuestDialogue QuestExtras CatalogTitles CatalogObjectives QuestBoards'],
  ['Dialogue','Gossip NPCNames CatalogDialogue'],
  ['Books','Books BookContexts'],
  ['Items','ItemNames ItemDescriptions ItemTexts'],
  ['Spells','Spells SpellNames SpellTexts DynamicSpellTexts'],
  ['Creatures','CreatureFamilies CreatureFamilyNames Creatures NPCTitles NPCLabelNames'],
  ['Maps','WorldObjects DungeonNames WorldTexts GroupFinderTexts'],
  ['Collections','CollectionTexts'],['Professions','ProfessionTexts'],['Reputation','FactionTexts'],['Garrison','GarrisonTexts'],
  ['System','ExtraLinkNames ClientTexts SystemTexts'],['Artifacts','Artifacts'],
];
export const families=new Map(definitions.flatMap(([group,names])=>names.split(' ').map(name=>[name,{group}])));
const familyOrder=[...families.keys()];
export const runtimeFiles=[
  'Core.lua','Hooks.lua','Bindings.lua','ClientNames.lua','WorldObjects.lua','ItemTooltips.lua','ExtraTooltips.lua',
  'ClientDescriptions.lua','Modules/Maps.lua','Modules/Collections.lua','Modules/Professions.lua','Modules/Reputation.lua',
  'Modules/Garrison.lua','Modules/GroupFinder.lua','Modules/Scenario.lua','Modules/Achievements.lua',
  'QuestBoards.lua','Artifacts.lua','MapTooltips.lua','ChatLinks.lua','DialogueSurfaces.lua','Changelog.lua','Welcome.lua','UI.lua',
];
const runtimeDependencies={
  'Core.lua':['Bootstrap.lua'],
  'WorldObjects.lua':['Core.lua','ClientNames.lua'],
  'ItemTooltips.lua':['Core.lua','ClientNames.lua'],
  'ExtraTooltips.lua':['Core.lua','ClientNames.lua'],
  'ClientDescriptions.lua':['Core.lua','Bindings.lua','ClientNames.lua'],
  'Artifacts.lua':['Core.lua','Bindings.lua','QuestBoards.lua'],
  'ChatLinks.lua':['Core.lua','ClientNames.lua'],
  'DialogueSurfaces.lua':['Core.lua','Bindings.lua','ClientNames.lua'],
  'Welcome.lua':['Core.lua','Changelog.lua'],
  'UI.lua':runtimeFiles.filter(file=>file!=='UI.lua'),
};
export const catalogFamilies={Title:'CatalogTitles',Objective:'CatalogObjectives',Dialogue:'CatalogDialogue',World:'WorldTexts',
  Collection:'CollectionTexts',Profession:'ProfessionTexts',Faction:'FactionTexts',Garrison:'GarrisonTexts',GroupFinder:'GroupFinderTexts',Item:'ItemTexts',System:'SystemTexts'};

export function familyOf(file){
  const family=path.basename(file).replace(/(?:_\d+)?\.lua$/,'');
  if(!families.has(family))throw Error('Unregistered resource family: '+file);
  return family;
}
export function organizeResources(addon){
  const data=path.join(addon,'Data');
  for(const file of luaFiles(data)){
    const family=familyOf(file),target=path.join(data,families.get(family).group,path.basename(file));
    fs.mkdirSync(path.dirname(target),{recursive:true});
    if(path.resolve(file)!==path.resolve(target)){
      if(fs.existsSync(target))throw Error('Duplicate resource target '+target);
      fs.renameSync(file,target);
    }
  }
}
export function loadPlan(addon){
  const resources=luaFiles(path.join(addon,'Data')).map(file=>{
    const family=familyOf(file),bytes=fs.readFileSync(file);
    const relative=path.relative(addon,file).replaceAll('\\','/');
    if(relative!==`Data/${families.get(family).group}/${path.basename(file)}`)throw Error('Resource outside registered directory: '+relative);
    return {path:relative,family,group:families.get(family).group,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  }).sort((a,b)=>familyOrder.indexOf(a.family)-familyOrder.indexOf(b.family)
    ||Number(/_(\d+)\.lua$/.exec(a.path)?.[1]??0)-Number(/_(\d+)\.lua$/.exec(b.path)?.[1]??0)||a.path.localeCompare(b.path,'en'));
  const runtime=runtimeFiles.map(file=>({path:file,after:runtimeDependencies[file]??(file.startsWith('Modules/')?['Core.lua','Bindings.lua']:['Core.lua'])}));
  const order=['Bootstrap.lua',...resources.map(r=>r.path),...runtime.map(r=>r.path)];
  if(new Set(order).size!==order.length)throw Error('Duplicate load entry');
  for(const file of order)if(!fs.existsSync(path.join(addon,file)))throw Error('Missing load entry '+file);
  for(const entry of runtime)for(const dependency of entry.after)
    if(order.indexOf(dependency)<0||order.indexOf(dependency)>=order.indexOf(entry.path))throw Error('Invalid runtime dependency '+entry.path+' after '+dependency);
  return {schema:1,resources,runtime,order};
}
export function renderTOC(version,plan){
  return ['## Interface: 70300','## Title: LegionChinese 中文','## Notes: 离线汉化：简体优先，繁体补充，缺失保留原文。',
    '## Author: zzz1999','## Version: '+version,'## X-Curse-Project-ID: 1750538','## SavedVariables: LegionChineseSettings','',
    ...plan.order.map(file=>file.replaceAll('/','\\')),''].join('\n');
}
export function validateLoadOrder(addon,toc,manifest){
  const actual=toc.split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.replaceAll('\\','/'));
  if(new Set(actual).size!==actual.length)throw Error('Duplicate TOC entry');
  const expected=loadPlan(addon);
  if(JSON.stringify(actual)!==JSON.stringify(expected.order))throw Error('TOC load dependencies/order differ from resource registry');
  if(manifest&&(manifest.schema!==expected.schema||JSON.stringify(manifest.resources)!==JSON.stringify(expected.resources)
    ||JSON.stringify(manifest.runtime)!==JSON.stringify(expected.runtime)||JSON.stringify(manifest.order)!==JSON.stringify(expected.order)))
    throw Error('Resource manifest is stale or contains modified files');
  return expected;
}
