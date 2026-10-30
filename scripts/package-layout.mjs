import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const luaList=values=>'{'+[...values].map(value=>JSON.stringify(value)).join(',')+'}';
const normalized=file=>file.replaceAll('\\','/');
const stringPools=new Set(['Strings','NameStrings','CatalogStrings']);

// Keep one canonical generated database in the repository. In the single-addon
// release, register its assignments as functions instead of building all tables
// at login. This defers table creation, not Lua file reading or compilation.
export function preparePackage(root,destination,version){
  if(!/^\d+\.\d+\.\d+(?:[+.-][\w.-]+)?$/.test(version))throw Error('Invalid package version');
  const addon=path.join(root,'AddOns/LegionChinese');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/resource-manifest.json'),'utf8'));
  const sourceTOC=fs.readFileSync(path.join(addon,'LegionChinese.toc'),'utf8');
  const files=sourceTOC.split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(normalized);
  if(files[0]!=='Bootstrap.lua'||!files.includes('DataAccess.lua'))throw Error('Missing bootstrap/data access in source TOC');
  if(new Set(files).size!==files.length)throw Error('Duplicate source TOC entry');
  const resources=new Map(manifest.resources.map(resource=>[resource.path,resource]));
  if(resources.size!==manifest.resources.length||files.filter(file=>file.startsWith('Data/')).join('\n')!==[...resources.keys()].join('\n'))
    throw Error('Resource manifest and TOC differ');
  const shared=new Map(),bodies=new Map(),groups=new Map(),owners=new Map(),ranges=new Map();
  let deferredSourceBytes=0;
  for(const resource of resources.values()){
    if(!/^Data\/[A-Za-z]+\/[A-Za-z_0-9]+\.lua$/.test(resource.path)||!/^[A-Za-z]+$/.test(resource.group))throw Error('Unsafe resource path');
    const bytes=fs.readFileSync(path.join(addon,resource.path));
    if(bytes.length!==resource.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==resource.sha256)
      throw Error('Stale resource manifest: '+resource.path);
    const body=bytes.toString('utf8');bodies.set(resource.path,body);
    if(resource.family==='SharedStrings'){
      for(const match of body.matchAll(/^D\.SharedStrings\[(\d+)\]=("(?:\\.|[^"\\])*")\r?$/gm))shared.set(match[1],match[2]);
      continue;
    }
    deferredSourceBytes+=resource.bytes;
    if(stringPools.has(resource.family)){
      const ids=[...body.matchAll(/^D\.(\w+)\[(\d+)\]=/gm)].map(match=>{
        if(match[1]!==resource.family)throw Error('Unexpected pool assignment: '+resource.path);
        return Number(match[2]);
      });
      if(!ids.length)throw Error('Empty string shard: '+resource.path);
      const first=ids[0],last=ids.at(-1),previous=ranges.get(resource.family)??0;
      if(first<=previous||ids.some((id,i)=>i&&id<=ids[i-1]))throw Error('Unsorted/overlapping string shard: '+resource.path);
      ranges.set(resource.family,last);resource.range=[first,last];
      continue;
    }
    // Names are also used by quest-return hints. Keep their small index
    // independent of dialogue text, while retaining the source directory.
    resource.category=resource.family==='NPCNames'?'NPCNames':resource.group;
    const group=groups.get(resource.category)??{families:new Set(),scopes:new Set(),count:0};
    groups.set(resource.category,group);group.count++;
    let targets=0;
    for(const match of body.matchAll(/^D\.(\w+)(?:\.(\w+))?/gm)){
      const [,family,scope]=match;
      if(family==='CatalogTexts'&&!scope)throw Error('Missing catalog scope: '+resource.path);
      const ownerKey=family==='CatalogTexts'?family+'.'+scope:family;
      if(owners.has(ownerKey)&&owners.get(ownerKey)!==resource.category)throw Error('Data target has multiple categories: '+ownerKey);
      if(family==='SharedStrings'||stringPools.has(family))throw Error('Unexpected shared target: '+resource.path);
      owners.set(ownerKey,resource.category);
      (family==='CatalogTexts'?group.scopes:group.families).add(family==='CatalogTexts'?scope:family);targets++;
    }
    if(!targets)throw Error('Resource has no target: '+resource.path);
  }
  const incoming=path.resolve(destination);
  if(fs.existsSync(incoming)&&fs.readdirSync(incoming).length)throw Error('Package staging directory must be empty');
  fs.mkdirSync(incoming,{recursive:true});
  const main=path.join(incoming,'LegionChinese');
  fs.cpSync(addon,main,{recursive:true,filter:file=>path.relative(addon,file)!=='Data'});
  const dataFiles=[];
  for(const resource of resources.values()){
    if(resource.family==='SharedStrings')continue;
    // Inline only the temporary deduplication pool; runtime Strings/NameStrings/
    // CatalogStrings retain stable IDs and initialize independently by shard.
    const body=bodies.get(resource.path).replace(/"(?:\\.|[^"\\])*"|S\[(\d+)\]/g,(literal,id)=>{
      if(!id)return literal;
      if(!shared.has(id))throw Error('Missing shared literal '+id);
      return shared.get(id);
    }).replace(/^local S=D\.SharedStrings\r?\n/gm,'');
    const registration=resource.range
      ?'LegionChinese.Data.RegisterPool('+JSON.stringify(resource.family)+','+resource.range.join(',')+',function()'
      :'LegionChinese.Data.Register('+JSON.stringify(resource.category)+',function()';
    const file=path.join(main,resource.path);
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,registration+'\n'+body+'\nend)\n');
    dataFiles.push(resource.path);
  }
  const directory=['-- Generated by package-layout.mjs. Same addon, deferred table initialization.','LegionChinese.Data.Configure({'];
  for(const [name,group] of groups)directory.push('  ['+JSON.stringify(name)+']={count='+group.count+',families='+luaList(group.families)+',scopes='+luaList(group.scopes)+'},');
  directory.push('})','');fs.writeFileSync(path.join(main,'DataManifest.lua'),directory.join('\n'));
  let versionLines=0;
  const headers=sourceTOC.split(/\r?\n/).filter(line=>line.startsWith('#')).map(line=>{
    if(line.startsWith('## Version:')){versionLines++;return '## Version: '+version;}
    return line;
  });
  if(versionLines!==1)throw Error('Expected exactly one TOC version');
  const runtime=files.filter(file=>!file.startsWith('Data/')&&!['Bootstrap.lua','DataAccess.lua'].includes(file));
  const order=['Bootstrap.lua','DataAccess.lua','DataManifest.lua',...dataFiles,...runtime];
  fs.writeFileSync(path.join(main,'LegionChinese.toc'),[...headers,'',...order.map(file=>file.replaceAll('/','\\')),''].join('\n'));
  return {categories:groups.size,stringShards:manifest.resources.filter(r=>r.range).length,deferredSourceBytes,main};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(JSON.stringify(preparePackage(path.resolve(process.argv[2]),path.resolve(process.argv[3]),process.argv[4])));
}
