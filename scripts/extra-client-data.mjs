import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {csvRows,nameKey} from './client-names.mjs';
import {hasChinese,luaString} from './text.mjs';

export function parseColumns(text,columns){
  const rows=csvRows(text),header=rows.next().value;
  if(!header||!header.includes('ID')||columns.some(c=>!header.includes(c)))throw Error('Missing extra client columns');
  const wanted=['ID',...columns].map(c=>header.indexOf(c)),result=new Map();
  for(const row of rows){
    if(row.length!==header.length)throw Error('Invalid extra client row');
    const id=+row[wanted[0]];if(!Number.isSafeInteger(id)||id<=0||result.has(id))throw Error('Invalid extra client ID');
    result.set(id,Object.fromEntries(columns.map((c,i)=>[c,row[wanted[i+1]]])));
  }return result;
}
export const staticText=text=>typeof text==='string'&&text.trim()!==''&&!/[$|\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text);
export function chooseStatic(original,cn,tw){
  if(!staticText(original)||hasChinese(original))return;
  for(const [locale,text] of [['zhCN',cn],['zhTW',tw]])if(hasChinese(text)&&staticText(text))return {key:nameKey(original),text,locale};
}

export function buildExtraClientData({root,input,manifest,npcRows,version}){
  const generated=[],audit={version,sources:[],counts:{},deferred:{}};
  const out=path.join(root,'AddOns/LegionChinese/Data');
  function write(name,lines){
    let part=0,buffer=[],bytes=0;
    const flush=()=>{if(!buffer.length)return;const file=name+'_'+String(++part).padStart(2,'0')+'.lua';
      fs.writeFileSync(path.join(out,file),'-- 自动生成：仅含中文译文与匹配指纹。来源见 SOURCES.md。\nlocal D=LegionChineseDB\n'+buffer.join('\n')+'\n');
      generated.push('Data\\'+file);buffer=[];bytes=0;};
    for(const line of lines){if(bytes+Buffer.byteLength(line)>900000)flush();buffer.push(line);bytes+=Buffer.byteLength(line)+1;}flush();
  }
  function read(table,columns,sources){
    const result={};for(const s of sources.filter(s=>s.table===table)){
      if(s.build!=='7.3.5.26972'||!['enUS','zhCN','zhTW'].includes(s.locale))throw Error('Unsupported extra client build/locale');
      const bytes=fs.readFileSync(path.join(input,s.file));if(crypto.createHash('sha256').update(bytes).digest('hex')!==s.sha256)throw Error('Extra client checksum: '+s.file);
      result[s.locale]=parseColumns(bytes.toString('utf8'),columns);audit.sources.push(s);
    }for(const l of ['enUS','zhCN','zhTW'])if(!result[l])throw Error('Missing '+table+'/'+l);return result;
  }
  {
    const rows=read('ItemSparse',['Display_lang'],manifest.itemDescriptionTables),lines=[],counts={ids:0,zhCN:0,zhTW:0};
    for(const [id,en] of rows.enUS){
      const selected=chooseStatic(en.Display_lang,rows.zhCN.get(id)?.Display_lang,rows.zhTW.get(id)?.Display_lang);
      if(!selected)continue;counts.ids++;counts[selected.locale]++;
      lines.push('D.ItemNames['+id+']={'+luaString(selected.text)+','+luaString(selected.key)+'}');
    }write('ItemNames',lines);audit.counts.items=counts;
  }
  {
    const fields={Description_lang:'Description',AuraDescription_lang:'Aura',NameSubtext_lang:'Rank'};
    const rows=read('Spell',Object.keys(fields),manifest.clientTables),lines=[],counts={};
    for(const [id,en] of rows.enUS){
      const parts=[];for(const [column,field]of Object.entries(fields)){
        const count=counts[field]??={ids:0,zhCN:0,zhTW:0,deferred:0};
        const cn=rows.zhCN.get(id)?.[column],tw=rows.zhTW.get(id)?.[column];
        const selected=chooseStatic(en[column],cn,tw);
        if(!selected){if(hasChinese(cn)||hasChinese(tw))count.deferred++;continue;}
        count.ids++;count[selected.locale]++;
        parts.push(field+'={['+luaString(selected.key)+']='+luaString(selected.text)+'}');
      }if(parts.length)lines.push('D.SpellTexts['+id+']={'+parts.join(',')+'}');
    }write('SpellTexts',lines);audit.counts.spells=counts;
  }
  {
    const titles=[],names=[],counts={titles:0,names:0,zhCN:0,zhTW:0};
    for(const [id,rows] of [...npcRows].sort((a,b)=>a[0]-b[0])){
      for(const [fields,target,outLines] of [[['Title','TitleAlt'],'NPCTitles',titles],[['Name','NameAlt'],'NPCLabelNames',names]]){
        const entries=new Map(),ambiguous=new Set();
        for(const field of fields){const selected=chooseStatic(rows.enUS?.[field],rows.zhCN?.[field],rows.zhTW?.[field]);
          if(!selected)continue;if(entries.has(selected.key)&&entries.get(selected.key)!==selected.text)ambiguous.add(selected.key);
          entries.set(selected.key,selected.text);counts[selected.locale]++;
        }for(const key of ambiguous)entries.delete(key);
        if(entries.size){counts[target==='NPCTitles'?'titles':'names']++;outLines.push('D.'+target+'['+id+']={'+[...entries].map(([k,v])=>'['+luaString(k)+']='+luaString(v)).join(',')+'}');}
      }
    }write('NPCTitles',titles);write('NPCLabelNames',names);audit.counts.npcs=counts;
  }
  if(manifest.extraLinkTables){
    const lines=[],counts={};
    for(const [table,column,kind]of [['Achievement','Title_lang','Achievement'],['CurrencyTypes','Name_lang','Currency'],
      ['BattlePetAbility','Name_lang','BattlePetAbility'],['JournalEncounter','Name_lang','Encounter'],['JournalEncounterSection','Title_lang','JournalSection']]){
      const rows=read(table,[column],manifest.extraLinkTables),count={ids:0,zhCN:0,zhTW:0};
      for(const [id,en]of rows.enUS){
        const selected=chooseStatic(en[column],rows.zhCN.get(id)?.[column],rows.zhTW.get(id)?.[column]);if(!selected)continue;
        count.ids++;count[selected.locale]++;lines.push('D.LinkNames.'+kind+'['+id+']='+luaString(selected.text));
      }counts[kind]=count;
    }
    const species=read('BattlePetSpecies',['CreatureID'],manifest.extraLinkTables),creatures=read('Creature',['Name_lang'],manifest.clientTables);
    const count={ids:0,zhCN:0,zhTW:0};
    for(const [id,en]of species.enUS){
      const creature=+en.CreatureID;
      if(['zhCN','zhTW'].some(l=>species[l].get(id)?.CreatureID!==en.CreatureID))continue;
      const selected=chooseStatic(creatures.enUS.get(creature)?.Name_lang,creatures.zhCN.get(creature)?.Name_lang,creatures.zhTW.get(creature)?.Name_lang);
      if(!selected)continue;count.ids++;count[selected.locale]++;lines.push('D.LinkNames.BattlePet['+id+']='+luaString(selected.text));
    }counts.BattlePet=count;write('ExtraLinkNames',lines);audit.counts.links=counts;
  }
  for(const f of fs.readdirSync(out))if(/^(ItemNames|SpellTexts|NPCTitles|NPCLabelNames|ExtraLinkNames)_\d+\.lua$/.test(f)&&!generated.includes('Data\\'+f))fs.unlinkSync(path.join(out,f));
  fs.writeFileSync(path.join(root,'docs/extra-client-data-audit.json'),JSON.stringify(audit,null,2)+'\n');
  return {generated,audit};
}
