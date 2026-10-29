import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export function luaFiles(directory){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()
    ?luaFiles(path.join(directory,entry.name)):entry.name.endsWith('.lua')?[path.join(directory,entry.name)]:[]).sort();
}

// Compare assignments, expanding shared string references. String IDs and all
// lookup keys retain their original meaning; file names and shard boundaries
// are intentionally irrelevant. Load dependencies are checked separately.
export function resourceSemantics(directory){
  const files=(Array.isArray(directory)?directory:[directory]).flatMap(luaFiles).sort(),shared=new Map(),groups={};
  for(const file of files)for(const line of fs.readFileSync(file,'utf8').split('\n')){
    const row=/^(?:S|D\.SharedStrings)\[(\d+)\]=("(?:\\.|[^"\\])*")$/.exec(line.trim());
    if(row&&file.includes('SharedStrings_'))shared.set(row[1],row[2]);
  }
  const modulus=1n<<256n;
  for(const file of files)for(let line of fs.readFileSync(file,'utf8').split('\n')){
    if(file.includes('SharedStrings_'))continue;
    if(!line.startsWith('D.'))continue;
    line=line.trim().replace(/^D\.CatalogStrings/,'D.LocalClientValues').replace(/^D\.CatalogTexts/,'D.LocalClientTexts');
    line=line.replace(/"(?:\\.|[^"\\])*"|S\[(\d+)\]/g,(token,id)=>{
      if(!id)return token;
      if(!shared.has(id))throw Error('Missing shared string '+id);
      return shared.get(id);
    });
    const name=/^D\.(\w+)/.exec(line)[1];
    const group=groups[name]??={assignments:0,sum:0n};
    group.assignments++;
    group.sum=(group.sum+BigInt('0x'+crypto.createHash('sha256').update(line).digest('hex')))%modulus;
  }
  return Object.fromEntries(Object.entries(groups).sort(([a],[b])=>a.localeCompare(b,'en'))
    .map(([name,g])=>[name,{assignments:g.assignments,sha256Sum:g.sum.toString(16).padStart(64,'0')}]));
}

export function compareResources(before,after){
  const names=new Set([...Object.keys(before),...Object.keys(after)]);
  const changed=[...names].filter(name=>JSON.stringify(before[name])!==JSON.stringify(after[name]));
  return {equivalent:changed.length===0,groups:names.size,assignments:Object.values(after).reduce((n,g)=>n+g.assignments,0),changed};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [directory,destination]=process.argv.slice(2);
  if(!directory||!destination)throw Error('Usage: node scripts/resource-equivalence.mjs Data-directory baseline.json');
  const result=resourceSemantics(directory);fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({groups:Object.keys(result).length,assignments:Object.values(result).reduce((n,g)=>n+g.assignments,0)}));
}
