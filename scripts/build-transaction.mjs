import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Generated resources/reports are outputs. Runtime code, generators and source
// snapshots are inputs and must stay unchanged throughout a staged build.
export function buildSourceHash(root){
  const files=[];
  const visit=relative=>{
    if(relative==='AddOns/LegionChinese/Data')return;
    const file=path.join(root,relative),stat=fs.lstatSync(file);
    if(stat.isSymbolicLink())throw Error('Build input cannot be a symbolic link: '+relative);
    if(stat.isDirectory())for(const name of fs.readdirSync(file).sort())visit(relative+'/'+name);
    else if(stat.isFile())files.push(relative);
  };
  for(const file of ['package.json','package-lock.json','sources.json','CHANGELOG.md','SOURCES.md','scripts','data','AddOns/LegionChinese'])visit(file);
  const hash=crypto.createHash('sha256');
  for(const file of files.sort()){
    const bytes=fs.readFileSync(path.join(root,file));
    hash.update(file+'\0'+bytes.length+'\0');hash.update(bytes);
  }
  return hash.digest('hex');
}

export function withBuildStage(root,work){
  const cache=path.join(root,'.cache');fs.mkdirSync(cache,{recursive:true});
  const lock=path.join(cache,'build.lock'),handle=fs.openSync(lock,'wx');
  let stage,preserve=false;
  try{
    fs.writeFileSync(handle,String(process.pid));stage=fs.mkdtempSync(path.join(cache,'build-stage-'));
    return work(stage);
  }catch(error){preserve=error.preserveBuildStage===true;throw error;}
  finally{
    try{if(stage&&!preserve)removeBuildStage(root,stage);}
    finally{try{fs.closeSync(handle);}finally{fs.unlinkSync(lock);}}
  }
}

export function removeBuildStage(root,stage){
  const cache=path.resolve(root,'.cache'),target=path.resolve(stage);
  if(path.dirname(target)!==cache||!path.basename(target).startsWith('build-stage-'))throw Error('Unsafe build cleanup target');
  fs.rmSync(target,{recursive:true,force:true});
}
export function promoteBuild(root,stage,{afterStep=()=>{}}={}){
  const target=path.resolve(root,'AddOns/LegionChinese'),candidate=path.resolve(stage,'AddOns/LegionChinese');
  if(path.dirname(path.resolve(stage))!==path.resolve(root,'.cache')||!path.basename(stage).startsWith('build-stage-'))throw Error('Unsafe build stage');
  if(!fs.existsSync(candidate))throw Error('Missing staged addon');
  const backup=path.join(stage,'backup');fs.mkdirSync(backup,{recursive:true});
  const reports=fs.readdirSync(path.join(stage,'docs')).filter(name=>name.endsWith('.json'));
  const done=[];let savedAddon=false,newAddon=false;
  try{
    if(fs.existsSync(target)){fs.renameSync(target,path.join(backup,'addon'));savedAddon=true;}
    afterStep('backup-addon');fs.renameSync(candidate,target);newAddon=true;afterStep('replace-addon');
    fs.mkdirSync(path.join(root,'docs'),{recursive:true});
    for(const name of reports){
      const destination=path.join(root,'docs',name),saved=path.join(backup,name),incoming=path.join(stage,'docs',name);
      const existed=fs.existsSync(destination);if(existed)fs.renameSync(destination,saved);
      done.push({destination,saved,incoming,existed});fs.renameSync(incoming,destination);afterStep('report:'+name);
    }
  }catch(error){
    const failures=[];
    const restore=action=>{try{action();}catch(failure){failures.push(failure);}};
    for(const item of done.reverse()){
      if(fs.existsSync(item.destination))restore(()=>fs.renameSync(item.destination,item.incoming));
      if(item.existed)restore(()=>fs.renameSync(item.saved,item.destination));
    }
    if(newAddon&&fs.existsSync(target))restore(()=>fs.renameSync(target,candidate));
    if(savedAddon)restore(()=>fs.renameSync(path.join(backup,'addon'),target));
    if(failures.length){
      const failure=new AggregateError([error,...failures],'Rollback incomplete; backup retained at '+stage);
      failure.preserveBuildStage=true;throw failure;
    }
    throw error;
  }
}
