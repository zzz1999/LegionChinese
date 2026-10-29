// Check the single-addon package, deferred factories and resource equivalence.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import luaparse from 'luaparse';
import {preparePackage} from './package-layout.mjs';
import {resourceSemantics,compareResources} from './resource-equivalence.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const cache=path.join(root,'.cache');fs.mkdirSync(cache,{recursive:true});
const stage=fs.mkdtempSync(path.join(cache,'package-check-'));
try{
  const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
  const plan=preparePackage(root,stage,version);
  const folders=fs.readdirSync(stage).sort();let lua51Files=0,resourceBytes=0;
  assert.deepEqual(folders,['LegionChinese']);
  for(const folder of folders){
    const toc=fs.readFileSync(path.join(stage,folder,folder+'.toc'),'utf8');
    assert.ok(toc.split(/\r?\n/).includes('## Version: '+version));
    assert.doesNotMatch(toc,/^## (?:LoadOnDemand|Dependencies):/m);
    assert.match(toc,/Bootstrap.lua\r?\nDataAccess.lua\r?\nDataManifest.lua/);
    const files=toc.split(/\r?\n/).filter(line=>line&&!line.startsWith('#'));
    assert.equal(files.length,new Set(files).size);
    for(const file of files){
      const relative=file.replaceAll('\\','/');
      assert.ok(!relative.split('/').includes('..'));
      const content=fs.readFileSync(path.join(stage,folder,relative),'utf8');
      luaparse.parse(content,{luaVersion:'5.1'});lua51Files++;
      if(folder==='LegionChinese'&&relative.startsWith('Data/'))resourceBytes+=Buffer.byteLength(content);
      if(relative.startsWith('Data/')){
        assert.match(content,/^LegionChinese\.Data\.Register(?:Pool)?\(/);
        assert.doesNotMatch(content,/\bS\[\d+\]/,'deferred data cannot depend on the released shared pool');
      }
    }
  }
  const before=resourceSemantics(path.join(root,'AddOns/LegionChinese/Data'));
  const after=resourceSemantics(folders.map(folder=>path.join(stage,folder,'Data')));
  const equality=compareResources(before,after);assert.equal(equality.equivalent,true,JSON.stringify(equality));
  console.log(JSON.stringify({addons:folders.length,categories:plan.categories,stringShards:plan.stringShards,lua51Files,resourceBytes,...equality},null,2));
}finally{
  assert.equal(path.dirname(path.resolve(stage)),path.resolve(cache));
  assert.ok(path.basename(stage).startsWith('package-check-'));
  fs.rmSync(stage,{recursive:true,force:true});
}
