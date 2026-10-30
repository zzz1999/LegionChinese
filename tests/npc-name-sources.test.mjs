import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {loadNpcNameCandidates} from '../scripts/npc-name-sources.mjs';
import {readSQL} from '../scripts/sql.mjs';

const locales=['enUS','zhCN','zhTW'];
const pin='49bd093968e6ed7a662d44c7c10653800bfc23e6';
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function fixture(t){
  const input=fs.mkdtempSync(path.join(os.tmpdir(),'lcn-npc-sources-'));
  t.after(()=>fs.rmSync(input,{recursive:true,force:true}));
  const manifest={clientTables:[],npcNameCaptures:[]};
  function write(source,text){fs.writeFileSync(path.join(input,source.file),text);source.sha256=sha(text);return source;}
  for(const [i,locale]of locales.entries()){
    manifest.clientTables.push(write({table:'Creature',locale,build:'7.3.5.26972',provenance:'client-db2-via-wago',
      file:`Creature-${locale}.csv`,url:`https://wago.tools/db2/Creature/csv?build=7.3.5.26972&locale=${locale}`},
    'ID,Name_lang,NameAlt_lang,Title_lang\n'+['1,Warden,Sentinel,Master\n','1,守卫,哨兵,大师\n','1,守衛,哨兵繁,大師\n'][i]));
    const file=['2018_05_26_22_world.sql','2018_05_26_31_world.sql','2018_05_26_32_world.sql'][i];
    manifest.npcNameCaptures.push(write({table:locale==='enUS'?'creature_template':'creature_template_locale',locale,file,
      captureBuild:26365,pinnedCommit:pin,provenance:'community-client-query-capture',officialChineseVerified:false,
      url:`https://raw.githubusercontent.com/TrinityCore/TrinityCore/${pin}/sql/old/7/world/19061_2019_07_15/${file}`},
    locale==='enUS'?"INSERT INTO `creature_template` (`entry`, `name`, `femaleName`, `subname`, `VerifiedBuild`) VALUES\n(2, 'New Warden', 'New Sentinel', 'Teacher', 26365);\n":
      `INSERT INTO \`creature_template_locale\` (\`entry\`, \`locale\`, \`Name\`, \`NameAlt\`, \`Title\`, \`VerifiedBuild\`) VALUES\n(2, '${locale}', '${i===1?'新守卫':'新守衛'}', '${i===1?'新哨兵':'新哨兵繁'}', '教师', 26365);\n`));
  }
  return {input,manifest,write,load:()=>loadNpcNameCandidates({input,manifest})};
}

test('NPC loader pairs each ID and field, keeps both locales, and assigns source priorities',async t=>{
  const f=fixture(t),{records,audit}=await f.load();
  assert.equal(records.length,8);assert.equal(audit.sources.length,6);assert.equal(audit.records,8);
  assert.deepEqual(records.filter(r=>r.id===1&&r.field==='Name').map(r=>[r.source,r.text,r.locale,r.priority]),
    [['Warden','守卫','zhCN',2],['Warden','守衛','zhTW',2]]);
  assert.deepEqual(records.filter(r=>r.id===2&&r.field==='NameAlt').map(r=>[r.source,r.text,r.locale,r.priority]),
    [['New Sentinel','新哨兵','zhCN',1],['New Sentinel','新哨兵繁','zhTW',1]]);
  assert.ok(records.every(r=>['Name','NameAlt'].includes(r.field)&&r.sourceFile&&r.provenance));
  assert.ok(audit.sources.filter(s=>s.priority===1).every(s=>s.officialChineseVerified===false));
  assert.deepEqual(audit.counts,{zhCN:4,zhTW:4,Name:4,NameAlt:4});
});

test('NPC candidates do not borrow another ID or the main name for a missing alternate source',async t=>{
  const f=fixture(t);
  f.manifest.npcNameCaptures=[];
  f.write(f.manifest.clientTables[0],'ID,Name_lang,NameAlt_lang\n1,Warden,\n2,Other,Other Female\n');
  f.write(f.manifest.clientTables[1],'ID,Name_lang,NameAlt_lang\n1,守卫,不应借主名\n3,没有英文,没有英文\n');
  f.write(f.manifest.clientTables[2],'ID,Name_lang,NameAlt_lang\n1,守衛,不應借主名\n');
  const {records,audit}=await f.load();
  assert.equal(records.length,2);assert.ok(records.every(r=>r.id===1&&r.field==='Name'));
  assert.equal(audit.skipped.missingEnglish,4);
});

test('NPC SQL UPDATE entry keys pair partial records without using titles as names',async t=>{
  const f=fixture(t);
  f.write(f.manifest.npcNameCaptures[0],"UPDATE `creature_template` SET `femaleName`='Female Warden', `VerifiedBuild`=26365 WHERE (`entry`=8);\n");
  f.write(f.manifest.npcNameCaptures[1],"UPDATE `creature_template_locale` SET `Name`='不能借用', `NameAlt`='女守卫', `VerifiedBuild`=26365 WHERE (`entry`=8 AND `locale`='zhCN');\n");
  f.write(f.manifest.npcNameCaptures[2],"UPDATE `creature_template_locale` SET `Title`='大師', `VerifiedBuild`=26365 WHERE (`entry`=8 AND `locale`='zhTW');\n");
  const {records}=await f.load();
  assert.deepEqual(records.filter(r=>r.priority===1).map(({id,field,source,text,locale})=>({id,field,source,text,locale})),
    [{id:8,field:'NameAlt',source:'Female Warden',text:'女守卫',locale:'zhCN'}]);
  const unrelated=path.join(f.input,'unrelated.sql');
  fs.writeFileSync(unrelated,"UPDATE `page_text` SET `Text`='Text' WHERE `entry`=8;\n");
  await assert.rejects(readSQL(unrelated,new Set(['page_text']),()=>{}),/Unsupported selected UPDATE/);
});

test('NPC loader rejects a bad hash before parsing its data',async t=>{
  for(const group of ['clientTables','npcNameCaptures']){
    const f=fixture(t);fs.writeFileSync(path.join(f.input,f.manifest[group][0].file),'malformed');
    await assert.rejects(f.load(),/hash mismatch/);
  }
});

test('NPC SQL parsing consumes the verified bytes even if its file changes after reading',async t=>{
  const f=fixture(t),source=f.manifest.npcNameCaptures[1],target=path.join(f.input,source.file);
  const originalRead=fs.readFileSync;
  let changed=false;
  fs.readFileSync=(file,...args)=>{
    const data=originalRead(file,...args);
    if(String(file)===target&&!changed){
      changed=true;
      fs.writeFileSync(target,data.toString('utf8').replace('新守卫','未经校验的新名字'));
    }
    return data;
  };
  let result;
  try{result=await f.load();}finally{fs.readFileSync=originalRead;}
  assert.equal(changed,true);
  assert.ok(originalRead(target,'utf8').includes('未经校验的新名字'));
  assert.equal(result.records.find(r=>r.id===2&&r.locale==='zhCN'&&r.field==='Name').text,'新守卫');
  assert.equal(result.records.some(r=>r.text==='未经校验的新名字'),false);
});

test('NPC loader rejects cross-version metadata and cross-version SQL rows',async t=>{
  for(const change of [f=>f.manifest.clientTables[0].build='8.0.1.27101',f=>f.manifest.npcNameCaptures[1].captureBuild=25549,
    f=>{const s=f.manifest.npcNameCaptures[1];f.write(s,fs.readFileSync(path.join(f.input,s.file),'utf8').replace('26365','26972'));}]){
    const f=fixture(t);change(f);await assert.rejects(f.load(),/Unexpected NPC|row build mismatch/);
  }
});

test('NPC loader rejects missing, duplicate and inconsistent source locales',async t=>{
  for(const change of [f=>f.manifest.clientTables.pop(),f=>f.manifest.clientTables[1].locale='enUS',
    f=>f.manifest.npcNameCaptures[2].locale='frFR',
    f=>{const s=f.manifest.npcNameCaptures[1];f.write(s,fs.readFileSync(path.join(f.input,s.file),'utf8').replace("'zhCN'","'zhTW'"));},
    f=>f.write(f.manifest.clientTables[1],'ID,Name_lang,NameAlt_lang,locale\n1,中文,,zhTW\n')]){
    const f=fixture(t);change(f);await assert.rejects(f.load(),/exactly one source|locale.*mismatch/);
  }
});

test('NPC loader rejects duplicate IDs including repeated SQL updates',async t=>{
  const csv=fixture(t);csv.write(csv.manifest.clientTables[1],'ID,Name_lang\n1,甲\n1,乙\n');
  await assert.rejects(csv.load(),/duplicate client record ID/);
  const sql=fixture(t),source=sql.manifest.npcNameCaptures[1];
  sql.write(source,fs.readFileSync(path.join(sql.input,source.file),'utf8')+
    "UPDATE `creature_template_locale` SET `Name`='重复', `VerifiedBuild`=26365 WHERE (`entry`=2 AND `locale`='zhCN');\n");
  await assert.rejects(sql.load(),/duplicate NPC capture ID/);
});

test('NPC loader excludes non-Chinese, unsafe translations and unsafe English fields',async t=>{
  const f=fixture(t);f.manifest.npcNameCaptures=[];
  f.write(f.manifest.clientTables[0],'ID,Name_lang,NameAlt_lang\n1,Warden,\n2,Sentinel,\n3,$N source,\n4,Good,\n5,中文源,\n');
  f.write(f.manifest.clientTables[1],'ID,Name_lang,NameAlt_lang\n1,English,\n2,中文|Hitem,\n3,中文,\n4,"中文\n换行",\n5,中文译名,\n');
  f.write(f.manifest.clientTables[2],'ID,Name_lang,NameAlt_lang\n1,\u202e中文,\n2,中文%值,\n');
  const {records,audit}=await f.load();assert.equal(records.length,0);
  assert.equal(audit.skipped.invalidChinese,5);assert.equal(audit.skipped.invalidEnglish,2);
});

test('NPC captures require a pinned source and cannot claim verified official Chinese',async t=>{
  for(const change of [f=>f.manifest.npcNameCaptures[0].pinnedCommit='main',
    f=>f.manifest.npcNameCaptures[0].url='https://example.com/unpinned.sql',
    f=>f.manifest.npcNameCaptures[1].officialChineseVerified=true,
    f=>f.manifest.npcNameCaptures[1].provenance='machine-translation']){
    const f=fixture(t);change(f);await assert.rejects(f.load(),/pinned commit|Unexpected NPC capture/);
  }
});
