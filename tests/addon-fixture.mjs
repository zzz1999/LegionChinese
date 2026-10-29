import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {luaFiles} from '../scripts/resource-equivalence.mjs';

const addon=fileURLToPath(new URL('../AddOns/LegionChinese/',import.meta.url)),data=path.join(addon,'Data');
let resources,shared;
function inventory(){return resources??=luaFiles(data)}
function pool(){
  if(shared)return shared;
  shared=new Map();
  for(const file of inventory().filter(f=>path.basename(f).startsWith('SharedStrings_')))
    for(const match of fs.readFileSync(file,'utf8').matchAll(/^D\.SharedStrings\[(\d+)\]=("(?:\\.|[^"\\])*")$/gm))shared.set(match[1],match[2]);
  return shared;
}
// Existing focused tests intentionally select a few rows, rather than loading
// the whole database. Expand pooled values for those fixtures; raw load/order
// and actual shared references have separate integration tests.
export function readFixtureFile(file,options){
  let actual=file instanceof URL?fileURLToPath(file):String(file);
  const relative=path.relative(addon,path.resolve(actual)).replaceAll('\\','/');
  if(relative.startsWith('Data/')&&!fs.existsSync(actual)){
    actual=inventory().find(f=>path.basename(f)===path.basename(actual))??actual;
  }
  let text;
  if(relative.startsWith('Data/')){
    text=fs.readFileSync(actual,'utf8').replace(/"(?:\\.|[^"\\])*"|S\[(\d+)\]/g,(raw,id)=>{
      if(!id)return raw;
      if(!pool().has(id))throw Error('Missing pooled test value '+id);
      return pool().get(id);
    });
    // The unpooled row is self-contained in a small test database.
    text=text.replace(/^local S=D\.SharedStrings\r?\n/gm,'');
  }else if(relative==='Core.lua'){
    text=['DataAccess.lua','Text.lua','Core.lua','WidgetText.lua','Hyperlinks.lua'].map(f=>fs.readFileSync(path.join(addon,f),'utf8')).join('\n');
  }else if(relative==='UI.lua'){
    const prerequisites=['Hooks.lua','Bindings.lua',...fs.readdirSync(path.join(addon,'Modules')).sort().map(f=>'Modules/'+f)];
    text=[...prerequisites,'UI.lua'].map(f=>fs.readFileSync(path.join(addon,f),'utf8')).join('\n');
  }else return fs.readFileSync(actual,options);
  return options===undefined?Buffer.from(text):text;
}
export function listFixtureFiles(directory,options){
  const actual=directory instanceof URL?fileURLToPath(directory):String(directory);
  if(path.resolve(actual)===path.resolve(data))return inventory().map(f=>path.basename(f));
  return fs.readdirSync(directory,options);
}
