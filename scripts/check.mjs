import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import luaparse from 'luaparse';
import {hasChinese,supportsTokens} from './text.mjs';
import {fontCodepoints} from './font.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const addon=path.join(root,'AddOns','LegionChinese');
const toc=fs.readFileSync(path.join(addon,'LegionChinese.toc'),'utf8');
const files=toc.split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.replaceAll('\\','/'));
let strings=0;
const han=new Set();
function walk(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='StringLiteral'){
    // raw contains escaped Lua syntax; Han text remains literal in generated resources.
    const raw=node.raw;
    if(!hasChinese(raw)&&!/^"[0-9a-f]{16}:\d+"$/.test(raw))throw Error(`Non-Chinese payload in generated resources: ${raw.slice(0,80)}`);
    if(!supportsTokens(raw))throw Error(`Unsupported token in generated resources: ${raw.slice(0,120)}`);
    strings++;
  }
  for(const value of Object.values(node))if(value&&typeof value==='object'){
    if(Array.isArray(value))for(const item of value)walk(item);else walk(value);
  }
}
for(const file of files){
  const content=fs.readFileSync(path.join(addon,file),'utf8');
  for(const [char] of content.matchAll(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{323af}]/gu))han.add(char);
  const ast=luaparse.parse(content,{luaVersion:'5.1'});
  if(file.startsWith('Data/'))walk(ast);
}
const listed=new Set(files);
for(const file of fs.readdirSync(path.join(addon,'Data')))if(!listed.has('Data/'+file))throw Error(`Unlisted resource: ${file}`);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'sources.json'),'utf8'));
for(const [file,expected] of [['Media/'+manifest.font.file,manifest.font.sha256],['Media/OFL.txt',manifest.font.licenseSha256]]){
  const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(addon,file))).digest('hex');
  if(actual!==expected)throw Error(`Font checksum mismatch: ${file}`);
}
const glyphs=fontCodepoints(fs.readFileSync(path.join(addon,'Media',manifest.font.file)));
const missing=[...han].filter(char=>!glyphs.has(char.codePointAt(0)));
if(missing.length)throw Error(`Font is missing ${missing.length} Han characters: ${missing.join('')}`);
const core=fs.readFileSync(path.join(addon,'Core.lua'),'utf8');
if(!core.includes('Media\\\\'+manifest.font.file))throw Error('Runtime font path differs from verified font');
console.log(JSON.stringify({lua51Files:files.length,validatedChineseStringsAndFingerprints:strings,fontVerified:true,hanCharactersCovered:han.size}));
