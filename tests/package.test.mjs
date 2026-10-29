import {readFixtureFile,listFixtureFiles} from './addon-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {renderReleaseChangelog} from '../scripts/changelog.mjs';

test('real ZIP packaging stamps actual version and notes together, verifies inputs and retains source files',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lcn-package-test-'));
  try{
    const scripts=path.join(root,'scripts'),addon=path.join(root,'AddOns/LegionChinese');
    fs.mkdirSync(scripts,{recursive:true});fs.mkdirSync(addon,{recursive:true});
    for(const file of ['package.ps1','package-layout.mjs','changelog.mjs','text.mjs','release.mjs'])
      fs.copyFileSync(new URL('../scripts/'+file,import.meta.url),path.join(scripts,file));
    const resourcePath='Data/Collections/CollectionTexts_01.lua',resource='local D=LegionChineseDB\nD.CatalogTexts.Collection={}\n';
    fs.mkdirSync(path.dirname(path.join(addon,resourcePath)),{recursive:true});fs.writeFileSync(path.join(addon,resourcePath),resource);
    const oldToc='## Interface: 70300\n## Version: 1.2.14\nBootstrap.lua\n'+resourcePath+'\nDataAccess.lua\nChangelog.lua\n',oldNotes='-- Old tracked notes\n';
    fs.mkdirSync(path.join(root,'docs'));fs.writeFileSync(path.join(root,'docs/resource-manifest.json'),JSON.stringify({resources:[{
      path:resourcePath,group:'Collections',family:'CollectionTexts',bytes:Buffer.byteLength(resource),sha256:crypto.createHash('sha256').update(resource).digest('hex')
    }]}));
    fs.writeFileSync(path.join(addon,'Bootstrap.lua'),'LegionChinese={}');
    fs.writeFileSync(path.join(addon,'DataAccess.lua'),'-- loader fixture');
    fs.writeFileSync(path.join(addon,'LegionChinese.toc'),oldToc);
    fs.writeFileSync(path.join(addon,'Changelog.lua'),oldNotes);
    fs.writeFileSync(path.join(root,'CHANGELOG.md'),'# 更新记录\n\n## v1.2.14\n\n- 上一版记录。\n');
    const metadata={version:'1.2.15',notes:'- 修复百分号 25%。\n- 同步 `/lcn about` 更新记录。'};
    const notes=path.join(root,'notes.json');
    fs.writeFileSync(notes,JSON.stringify(metadata));
    const pack=(...extra)=>spawnSync('pwsh',['-NoProfile','-File',path.join(scripts,'package.ps1'),
      '-Version',metadata.version,...extra],{encoding:'utf8',timeout:60000});
    const result=pack('-ReleaseNotesPath',notes);
    assert.equal(result.status,0,result.stderr||result.stdout);
    const archive=path.join(root,'dist/LegionChinese-1.2.15.zip');
    const inspection=path.join(root,'inspect.ps1');
    fs.writeFileSync(inspection,`
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip = [System.IO.Compression.ZipFile]::OpenRead($args[0])
try {
    $taskContents = @{}
    foreach ($taskName in @('LegionChinese/LegionChinese.toc', 'LegionChinese/Changelog.lua',
        'LegionChinese/DataManifest.lua',
        'LegionChinese/Data/Collections/CollectionTexts_01.lua')) {
        $taskReader = [System.IO.StreamReader]::new($taskZip.GetEntry($taskName).Open())
        try { $taskContents[$taskName] = $taskReader.ReadToEnd() } finally { $taskReader.Dispose() }
    }
    $taskContents['Roots'] = @($taskZip.Entries | ForEach-Object { $_.FullName.Split('/')[0] } | Sort-Object -Unique)
    $taskContents | ConvertTo-Json -Compress
} finally { $taskZip.Dispose() }
`);
    const read=spawnSync('pwsh',['-NoProfile','-File',inspection,archive],{encoding:'utf8',timeout:30000});
    assert.equal(read.status,0,read.stderr);
    const content=JSON.parse(read.stdout);
    assert.match(content['LegionChinese/LegionChinese.toc'],/## Version: 1\.2\.15/);
    assert.equal(content['LegionChinese/Changelog.lua'],renderReleaseChangelog(metadata.notes,metadata.version));
    assert.match(content['LegionChinese/LegionChinese.toc'],/CollectionTexts/);
    assert.deepEqual(content.Roots,['LegionChinese']);
    assert.match(content['LegionChinese/DataManifest.lua'],/LegionChinese\.Data\.Configure/);
    assert.equal(content['LegionChinese/Data/Collections/CollectionTexts_01.lua'],
      'LegionChinese.Data.Register("Collections",function()\n'+resource+'\nend)\n');
    assert.equal(readFixtureFile(path.join(addon,'LegionChinese.toc'),'utf8'),oldToc);
    assert.equal(readFixtureFile(path.join(addon,'Changelog.lua'),'utf8'),oldNotes);
    const digest=()=>crypto.createHash('sha256').update(readFixtureFile(archive)).digest('hex');
    const before=digest();
    assert.equal(readFixtureFile(archive+'.sha256','utf8'),`${before}  LegionChinese-1.2.15.zip\n`);
    fs.writeFileSync(notes,JSON.stringify({...metadata,version:'1.2.16'}));
    assert.notEqual(pack('-ReleaseNotesPath',notes).status,0,'mismatched notes must fail');
    assert.notEqual(pack().status,0,'missing actual-version notes must fail');
    assert.equal(digest(),before,'failed validation must not replace an existing archive');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
