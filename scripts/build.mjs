import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {poolSharedStrings} from './shared-strings.mjs';
import {organizeResources,loadPlan,renderTOC,familyOf,families} from './resource-layout.mjs';
import {resourceSemantics,compareResources} from './resource-equivalence.mjs';
import {promoteBuild,withBuildStage,buildSourceHash} from './build-transaction.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),cache=path.join(root,'.cache');
fs.mkdirSync(cache,{recursive:true});
const args=process.argv.slice(2),verifyIndex=args.indexOf('--verify-equivalence');
if(verifyIndex>=0&&!args[verifyIndex+1])throw Error('Missing equivalence baseline');
const baselineFile=verifyIndex>=0?path.resolve(args[verifyIndex+1]):null;
if(verifyIndex>=0)args.splice(verifyIndex,2);
const input=path.resolve(args[0]??cache),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const sourceFiles=['package.json','sources.json','CHANGELOG.md','SOURCES.md'];
const run=(file,arguments_=[],env={})=>{
  const result=spawnSync(process.execPath,[path.join(root,'scripts',file),...arguments_],{cwd:root,stdio:'inherit',env:{...process.env,...env}});
  if(result.error||result.status!==0)throw result.error??Error(file+' failed ('+result.status+')');
};
withBuildStage(root,stage=>{
  const originalHash=buildSourceHash(root);
  const baseline=baselineFile?JSON.parse(fs.readFileSync(baselineFile)):null;
  fs.mkdirSync(path.join(stage,'AddOns'),{recursive:true});fs.mkdirSync(path.join(stage,'docs'));
  fs.cpSync(path.join(root,'AddOns/LegionChinese'),path.join(stage,'AddOns/LegionChinese'),{recursive:true,
    filter:file=>path.relative(path.join(root,'AddOns/LegionChinese'),file)!=='Data'});
  fs.mkdirSync(path.join(stage,'AddOns/LegionChinese/Data'));
  fs.cpSync(path.join(root,'data'),path.join(stage,'data'),{recursive:true});
  for(const file of sourceFiles)fs.copyFileSync(path.join(root,file),path.join(stage,file));
  run('build-data.mjs',[input],{LCN_BUILD_OUTPUT_ROOT:stage});
  const pooling=poolSharedStrings(stage);organizeResources(path.join(stage,'AddOns/LegionChinese'));
  const resourcePath=file=>{
    const family=familyOf(file.replaceAll('\\','/'));return 'Data\\'+families.get(family).group+'\\'+path.basename(file.replaceAll('\\','/'));
  };
  pooling.generated=pooling.generated.map(resourcePath);
  const plan=loadPlan(path.join(stage,'AddOns/LegionChinese'));
  fs.writeFileSync(path.join(stage,'AddOns/LegionChinese/LegionChinese.toc'),renderTOC(version,plan));
  fs.writeFileSync(path.join(stage,'docs/resource-manifest.json'),JSON.stringify({version,...plan,pooling},null,2)+'\n');
  const updatePaths=value=>{
    if(!value||typeof value!=='object')return;
    for(const [key,item]of Object.entries(value)){
      if(key==='generatedFiles'&&Array.isArray(item))value[key]=item.map(resourcePath);else updatePaths(item);
    }
  };
  for(const name of fs.readdirSync(path.join(stage,'docs')).filter(n=>n.endsWith('.json')&&n!=='resource-manifest.json')){
    const file=path.join(stage,'docs',name),body=JSON.parse(fs.readFileSync(file));updatePaths(body);fs.writeFileSync(file,JSON.stringify(body,null,2)+'\n');
  }
  const semantics=resourceSemantics(path.join(stage,'AddOns/LegionChinese/Data'));
  if(baselineFile){
    const comparison=compareResources(baseline,semantics);
    if(!comparison.equivalent)throw Error('Resource behavior changed: '+comparison.changed.join(', '));
    fs.writeFileSync(path.join(stage,'docs/refactor-equivalence.json'),JSON.stringify({version,baseline:path.basename(baselineFile),...comparison,pooling},null,2)+'\n');
  }
  run('check.mjs',['--root',stage]);
  if(buildSourceHash(root)!==originalHash)throw Error('Source inputs changed during generation; refusing to replace the addon.');
  promoteBuild(root,stage);
  console.log(JSON.stringify({version,resources:plan.resources.length,pooling,verifiedBeforeReplacement:true}));
});
