import {ChineseTextIndex,CHINESE_LOCALES} from './fallback.mjs';
import {chooseStatic} from './extra-client-data.mjs';
import {nameKey} from './client-names.mjs';
import {fingerprint,normalize,hasChinese} from './text.mjs';

const safeName=text=>typeof text==='string'&&text.trim()!==''&&!/[\p{Cc}\p{Cf}$|%]/u.test(text);
const nameForm=text=>text.replace(/[A-Z]/g,c=>c.toLowerCase()).replace(/[ \t\r\n\v\f]/g,'');
const localeCounts=()=>({zhCN:0,zhTW:0});
const sorted=values=>[...values].sort((a,b)=>a.id-b.id||a.key.localeCompare(b.key,'en'));
const origin=r=>({id:r.id,field:r.field,source:r.source,text:r.text,locale:r.locale,priority:r.priority,
  ...(r.sourceFile?{sourceFile:r.sourceFile}:{}),...(r.provenance?{provenance:r.provenance}:{})});
const nameStats=index=>({fingerprints:index.entries.size,ambiguousSkipped:index.ambiguous.size,locales:{...index.localeCounts}});
function labelStats(labels){
  const locales=localeCounts();let keys=0;
  for(const entries of labels.values())for(const row of entries.values()){keys++;locales[row.locale]++;}
  return {ids:labels.size,keys,locales};
}

// A source priority settles competing captures of one ID and complete name.
// It must never let one NPC's translation override a different NPC with the
// same English name. Both runtime indexes retain their existing key semantics.
export function mergeNpcNames({baseRows,baseNameRows,records}){
  const index=new ChineseTextIndex(),labels=new Map(),baseReferences=new Map(),baseForms=new Map(),baseLabelAmbiguous=new Set();
  const baseLabelReferences=new Map();
  for(const [reference,row]of baseNameRows){
    for(const locale of CHINESE_LOCALES)if(!/[$|\r\n%]/.test(row[locale]??''))index.add(locale,row.enUS,row[locale]);
    if(typeof row.enUS==='string'&&row.enUS!==''){
      const form=normalize(row.enUS),key=fingerprint(form);
      if(!baseReferences.has(key))baseReferences.set(key,[]);
      baseReferences.get(key).push({reference,source:row.enUS,zhCN:row.zhCN,zhTW:row.zhTW});
      if(!baseForms.has(key))baseForms.set(key,new Set());baseForms.get(key).add(form);
    }
  }
  index.finish();
  for(const [id,row]of baseRows){
    const entries=new Map(),ambiguous=new Set(),references=[];
    for(const field of ['Name','NameAlt']){
      const selected=chooseStatic(row.enUS?.[field],row.zhCN?.[field],row.zhTW?.[field]);
      if(!selected)continue;
      if(entries.has(selected.key)&&entries.get(selected.key).text!==selected.text)ambiguous.add(selected.key);
      entries.set(selected.key,{text:selected.text,locale:selected.locale});
      references.push({id,field,source:row.enUS[field],...selected});
    }
    for(const key of ambiguous){entries.delete(key);baseLabelAmbiguous.add(id+':'+key);}
    if(entries.size)labels.set(id,entries);
    for(const record of references){
      if(!entries.has(record.key))continue;
      const key=fingerprint(normalize(record.source));
      if(!baseLabelReferences.has(key))baseLabelReferences.set(key,[]);
      baseLabelReferences.get(key).push({...record,...entries.get(record.key),provenance:'existing-label'});
    }
  }
  const baselineAmbiguous=new Set(index.ambiguous),baselineLabelIDs=new Set(labels.keys());
  const audit={baseline:{names:nameStats(index),labels:labelStats(labels)},final:null,
    additions:{names:{fingerprints:0,locales:localeCounts(),records:[]},labels:{ids:0,keys:0,locales:localeCounts(),records:[]}},
    conflicts:[],ambiguous:[...baselineAmbiguous].sort().map(key=>({scope:'name',reason:'baseline-ambiguity',key,records:baseReferences.get(key)??[]})),
    rejected:[],superseded:[],missing:[]};
  const groups=new Map(),globalGroups=new Map();
  for(const record of records){
    if(!Number.isSafeInteger(record.id)||record.id<=0||!['Name','NameAlt'].includes(record.field)
      ||!CHINESE_LOCALES.includes(record.locale)||!Number.isSafeInteger(record.priority)||record.priority<0)
      throw Error('Invalid NPC name candidate identity, field, locale or priority');
    if(!safeName(record.source)||hasChinese(record.source)||!safeName(record.text)||!hasChinese(record.text)){
      audit.rejected.push({reason:'unsafe-or-untranslated-name',...origin(record)});continue;
    }
    const key=nameKey(record.source),identity=record.id+':'+key;
    if(!groups.has(identity))groups.set(identity,{id:record.id,key,source:record.source,forms:new Set(),records:[],byLocale:{}});
    const group=groups.get(identity);group.forms.add(nameForm(record.source));group.records.push(record);
  }
  for(const group of sorted(groups.values())){
    if(group.forms.size!==1){
      audit.ambiguous.push({scope:'label',reason:'hash-collision',id:group.id,key:group.key,records:group.records.map(origin)});
    }
    for(const locale of CHINESE_LOCALES){
      const candidates=group.records.filter(r=>r.locale===locale);
      if(!candidates.length)continue;
      const priority=Math.max(...candidates.map(r=>r.priority)),best=candidates.filter(r=>r.priority===priority);
      for(const row of candidates.filter(r=>r.priority<priority))audit.superseded.push({reason:'higher-priority-same-id-name',...origin(row)});
      const translations=new Set(best.map(r=>r.text)),ambiguous=group.forms.size!==1||translations.size!==1;
      group.byLocale[locale]={ambiguous,records:best,text:best[0].text,locale};
      if(ambiguous&&group.forms.size===1)audit.conflicts.push({scope:'label',reason:'same-priority-candidate-conflict',
        id:group.id,key:group.key,source:group.source,locale,records:best.map(origin)});
    }
    // A disputed Simplified translation is not a missing Simplified translation.
    // Do not silently turn that conflict into a Traditional replacement.
    const selected=group.byLocale.zhCN??group.byLocale.zhTW;
    if(baseLabelAmbiguous.has(group.id+':'+group.key)){
      group.labelConflict=true;
      audit.ambiguous.push({scope:'label',reason:'baseline-label-ambiguity-not-revived',id:group.id,key:group.key,
        source:group.source,records:group.records.map(origin)});
    }else if(selected&&!selected.ambiguous){
      const existing=labels.get(group.id)?.get(group.key);
      if(existing){
        if(existing.text!==selected.text){
          group.labelConflict=true;
          audit.conflicts.push({scope:'label',reason:'existing-translation-preserved',
            id:group.id,key:group.key,source:group.source,existing:{...existing},records:selected.records.map(origin)});
        }
      }else{
        if(!labels.has(group.id))labels.set(group.id,new Map());
        labels.get(group.id).set(group.key,{text:selected.text,locale:selected.locale});
        audit.additions.labels.keys++;audit.additions.labels.locales[selected.locale]++;
        audit.additions.labels.records.push({id:group.id,key:group.key,source:group.source,text:selected.text,locale:selected.locale,
          records:selected.records.map(origin)});
      }
    }
    const form=normalize(group.source),key=fingerprint(form);
    if(!globalGroups.has(key))globalGroups.set(key,{key,source:group.source,forms:new Set(),groups:[]});
    const global=globalGroups.get(key);global.forms.add(form);global.groups.push(group);
  }
  for(const group of [...globalGroups.values()].sort((a,b)=>a.key.localeCompare(b.key,'en'))){
    const baselineLabels=baseLabelReferences.get(group.key)??[];
    const records=[...group.groups.flatMap(g=>g.records).map(origin),...baselineLabels];
    const base=new Set([...(baseForms.get(group.key)??[]),...baselineLabels.map(row=>normalize(row.source))]);
    if(group.forms.size!==1||[...base].some(form=>!group.forms.has(form))){
      audit.ambiguous.push({scope:'name',reason:'hash-collision',key:group.key,source:group.source,records});
      if(!index.entries.has(group.key))index.ambiguous.add(group.key);
      continue;
    }
    if(baselineAmbiguous.has(group.key)){
      audit.ambiguous.push({scope:'name',reason:'baseline-ambiguity-not-revived',key:group.key,source:group.source,records});continue;
    }
    if(!index.entries.has(group.key)&&group.groups.some(g=>g.labelConflict)){
      audit.ambiguous.push({scope:'name',reason:'candidate-versus-existing-label-conflict',key:group.key,source:group.source,records});
      index.ambiguous.add(group.key);continue;
    }
    let selected;
    for(const locale of CHINESE_LOCALES){
      const candidates=group.groups.map(g=>g.byLocale[locale]).filter(Boolean);
      if(!candidates.length)continue;
      // ID-only aliases are conflict evidence, not an extra translation source.
      // They may veto a new global mapping but cannot themselves be promoted.
      const existingLabels=index.entries.has(group.key)?[]:baselineLabels.filter(row=>row.locale===locale);
      const translations=new Set([...candidates.map(r=>r.text),...existingLabels.map(r=>r.text)]);
      if(candidates.some(r=>r.ambiguous)||translations.size!==1){
        audit.ambiguous.push({scope:'name',reason:'cross-id-name-conflict',key:group.key,source:group.source,locale,
          records:[...candidates.flatMap(r=>r.records).map(origin),...existingLabels]});
        if(!index.entries.has(group.key))index.ambiguous.add(group.key);
      }else selected={text:candidates[0].text,locale,records:candidates.flatMap(r=>r.records).map(origin)};
      break;
    }
    if(!selected)continue;
    const existing=index.entries.get(group.key);
    if(existing!==undefined){
      if(existing!==selected.text)audit.conflicts.push({scope:'name',reason:'existing-translation-preserved',key:group.key,source:group.source,
        existing:{text:existing,locale:index.localeFor(group.key)},records:selected.records});
      continue;
    }
    index.entries.set(group.key,selected.text);index.localeCounts[selected.locale]++;
    if(selected.locale==='zhTW')index.traditionalKeys.add(group.key);
    audit.additions.names.fingerprints++;audit.additions.names.locales[selected.locale]++;
    audit.additions.names.records.push({key:group.key,source:group.source,...selected});
  }
  const missing=new Map();
  function noteMissing(id,field,source){
    if(!safeName(source)||hasChinese(source))return;
    const key=nameKey(source);if(labels.get(id)?.has(key))return;
    const identity=id+':'+key;
    if(!missing.has(identity))missing.set(identity,{id,key,source,fields:[],reason:groups.has(identity)?'candidate-conflict':'no-usable-chinese'});
    if(!missing.get(identity).fields.includes(field))missing.get(identity).fields.push(field);
  }
  for(const [id,row]of baseRows)for(const field of ['Name','NameAlt'])noteMissing(id,field,row.enUS?.[field]);
  for(const group of groups.values())for(const row of group.records)noteMissing(row.id,row.field,row.source);
  audit.missing=sorted(missing.values());
  audit.additions.labels.ids=[...labels.keys()].filter(id=>!baselineLabelIDs.has(id)).length;
  audit.final={names:nameStats(index),labels:labelStats(labels),missingLabelKeys:audit.missing.length,
    missingLabelIDs:new Set(audit.missing.map(row=>row.id)).size};
  return {index,labels,audit};
}
