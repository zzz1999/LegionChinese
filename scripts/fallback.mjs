import {hasChinese,supportsTokens,TextIndex} from './text.mjs';

export const CHINESE_LOCALES = ['zhCN','zhTW'];
export const usableChinese = text => hasChinese(text)&&supportsTokens(text);
export function chooseChinese(simplified,traditional) {
  if(usableChinese(simplified))return {text:simplified,locale:'zhCN'};
  if(usableChinese(traditional))return {text:traditional,locale:'zhTW'};
}
export function chooseChineseFields(simplified={},traditional={}) {
  const values={},locales={};
  for(const field of new Set([...Object.keys(simplified),...Object.keys(traditional)])){
    const selected=chooseChinese(simplified[field],traditional[field]);
    if(selected){values[field]=selected.text;locales[field]=selected.locale;}
  }
  return {values,locales};
}

// Resolve ambiguity within each locale first. A conflicting or missing zhCN
// key can fall back to an unambiguous zhTW key, but a hash collision never can.
export class ChineseTextIndex {
  constructor(){this.byLocale={zhCN:new TextIndex(),zhTW:new TextIndex()};}
  add(locale,source,text,priority=0){return this.byLocale[locale].add(source,text,priority);}
  finish(){
    const {zhCN,zhTW}=this.byLocale;
    const collisions=new Set([...zhCN.collisions,...zhTW.collisions]);
    for(const [key,form] of zhCN.normalized){
      if(zhTW.normalized.has(key)&&zhTW.normalized.get(key)!==form)collisions.add(key);
    }
    this.entries=new Map();this.traditionalKeys=new Set();
    this.ambiguous=new Set([...zhCN.ambiguous,...zhTW.ambiguous,...collisions]);
    this.localeCounts={zhCN:0,zhTW:0};
    for(const locale of CHINESE_LOCALES){
      for(const [key,text] of this.byLocale[locale].entries){
        if(collisions.has(key)||this.entries.has(key))continue;
        this.entries.set(key,text);this.ambiguous.delete(key);this.localeCounts[locale]++;
        if(locale==='zhTW')this.traditionalKeys.add(key);
      }
    }
    // The source-language strings are needed only while checking collisions.
    this.byLocale=null;
    return this;
  }
  localeFor(key){return this.entries.has(key)?(this.traditionalKeys.has(key)?'zhTW':'zhCN'):undefined;}
}
