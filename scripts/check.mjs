import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import luaparse from 'luaparse';
import {hasChinese,supportsTokens} from './text.mjs';
import {renderChangelog} from './changelog.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const addon=path.join(root,'AddOns','LegionChinese');
const toc=fs.readFileSync(path.join(addon,'LegionChinese.toc'),'utf8');
const files=toc.split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.replaceAll('\\','/'));
let strings=0;
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
  const ast=luaparse.parse(content,{luaVersion:'5.1'});
  if(file.startsWith('Data/'))walk(ast);
}
const listed=new Set(files);
if(!files.some(file=>/^Data\/QuestSources_\d+\.lua$/.test(file)))throw Error('Missing quest source validation resources.');
if(!listed.has('Changelog.lua')||files.indexOf('Changelog.lua')>=files.indexOf('Welcome.lua'))throw Error('Changelog.lua must load before Welcome.lua.');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const expectedNotes=renderChangelog(fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8'),version);
if(fs.readFileSync(path.join(addon,'Changelog.lua'),'utf8').replaceAll('\r\n','\n')!==expectedNotes)throw Error('In-game changelog is stale; run npm run build:changelog.');
for(const file of fs.readdirSync(path.join(addon,'Data')))if(!listed.has('Data/'+file))throw Error(`Unlisted resource: ${file}`);
const icon=fs.readFileSync(path.join(addon,'Media','LegionChineseIcon.tga'));
if(icon[2]!==2||icon.readUInt16LE(12)!==256||icon.readUInt16LE(14)!==256||icon[16]!==32)throw Error('Invalid addon icon');
for(const file of fs.readdirSync(path.join(addon,'Media')))if(/\.(ttf|otf)$/i.test(file))throw Error('Unexpected bundled font: '+file);
console.log(JSON.stringify({lua51Files:files.length,validatedChineseStringsAndFingerprints:strings,iconVerified:true}));
