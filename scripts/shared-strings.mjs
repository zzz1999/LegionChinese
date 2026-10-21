import fs from 'node:fs';
import {hasChinese} from './text.mjs';
import {luaFiles} from './resource-equivalence.mjs';
import {writeResourceChunks} from './resource-writer.mjs';

// Pool only repeated literals whose source-byte saving exceeds references and
// declarations. Existing IDs/semantic indexes stay intact; runtime values are
// still strings, so lookups add no extra indirection while playing.
export function poolSharedStrings(root){
  const files=luaFiles(root+'/AddOns/LegionChinese/Data'),entries=new Map();let before=0;
  for(const file of files){
    const body=fs.readFileSync(file,'utf8');before+=Buffer.byteLength(body);
    for(const line of body.split('\n'))if(line.startsWith('D.'))for(const [raw]of line.matchAll(/"(?:\\.|[^"\\])*"/g))if(hasChinese(raw)){
      const entry=entries.get(raw)??{count:0,bytes:Buffer.byteLength(raw)};entry.count++;entries.set(raw,entry);
    }
  }
  const selected=[...entries].filter(([,e])=>e.count>1&&(e.count-1)*e.bytes>e.count*9+32).map(([raw])=>raw).sort();
  const ids=new Map(selected.map((raw,i)=>[raw,i+1]));let references=0;
  for(const file of files){
    let changed=false;
    let body=fs.readFileSync(file,'utf8').split('\n').map(line=>line.startsWith('D.')?line.replace(/"(?:\\.|[^"\\])*"/g,raw=>{
      const id=ids.get(raw);if(!id)return raw;changed=true;references++;return 'S['+id+']';
    }):line).join('\n');
    if(changed){
      if(!/^local D\s*=\s*LegionChineseDB\s*$/m.test(body))throw Error('Missing resource database binding '+file);
      body=body.replace(/^(local D\s*=\s*LegionChineseDB)[ \t]*$/m,'$1\nlocal S=D.SharedStrings');
      fs.writeFileSync(file,body);
    }
  }
  const generated=writeResourceChunks({root,name:'SharedStrings',lines:selected.map((raw,i)=>`D.SharedStrings[${i+1}]=${raw}`),header:'跨功能重复中文池；保留原有索引和译文选择。来源见 SOURCES.md。'});
  const after=luaFiles(root+'/AddOns/LegionChinese/Data').reduce((n,file)=>n+fs.statSync(file).size,0);
  return {strings:selected.length,references,beforeBytes:before,afterBytes:after,savedBytes:before-after,generated};
}
