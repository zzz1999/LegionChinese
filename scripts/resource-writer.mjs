import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_SHARD_BYTES=900000;
export function writeResourceChunks({root,name,lines,header='仅含中文译文与匹配指纹。来源见 SOURCES.md。',maxBytes=DEFAULT_SHARD_BYTES,numbered=true}){
  if(!/^[A-Za-z][A-Za-z0-9]*$/.test(name)||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('Invalid resource shard configuration');
  const out=path.join(root,'AddOns/LegionChinese/Data');fs.mkdirSync(out,{recursive:true});
  const generated=[];let buffer=[],bytes=0;
  const flush=()=>{
    if(!buffer.length)return;
    if(!numbered&&generated.length)throw Error('Single resource exceeds shard size: '+name);
    const file=name+(numbered?'_'+String(generated.length+1).padStart(2,'0'):'')+'.lua';
    fs.writeFileSync(path.join(out,file),'-- 自动生成：'+header+'\nlocal D=LegionChineseDB\n'+buffer.join('\n')+'\n');
    generated.push('Data\\'+file);buffer=[];bytes=0;
  };
  for(const line of lines){
    if(typeof line!=='string'||line.includes('\n'))throw Error('Resource assignments must be single lines');
    const size=Buffer.byteLength(line)+1;
    if(size>maxBytes)throw Error('Resource assignment exceeds shard size: '+name);
    if(bytes+size>maxBytes)flush();buffer.push(line);bytes+=size;
  }
  flush();
  // Files only; never recursively clean the caller's directory.
  for(const file of fs.readdirSync(out))if(new RegExp('^'+name+'_\\d+\\.lua$').test(file)&&!generated.includes('Data\\'+file))
    fs.unlinkSync(path.join(out,file));
  return generated;
}
