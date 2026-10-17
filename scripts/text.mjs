export const hasChinese = text => typeof text === 'string' && /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{323af}]/u.test(text);
export function normalize(text) {
  return String(text??'').replace(/\|c[0-9a-f]{8}/gi,'').replace(/\|r/g,'')
    .replace(/\|H[^|]*\|h(.*?)\|h/g,'$1').replace(/\|[TA].*?\|[ta]/g,'')
    .replace(/<\/?(?:html|body|p|br|h[1-6]|font|img)(?:\s[^>]*)?\s*\/?\s*>/gi,' ')
    .replace(/&nbsp;/gi,' ').replace(/&quot;/gi,'"').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&amp;/gi,'&')
    .replace(/\$([NnCcRr])(?:\$(?![A-Za-z]))?|\$[Bb]/g,(_,v)=>v?'~'+v.toLowerCase()+'~':' ')
    .replace(/[A-Z]/g,c=>c.toLowerCase()).replace(/[ \t\r\n\v\f]/g,'');
}
export function fingerprint(normalized) {
  const bytes=Buffer.from(normalized,'utf8');let a=5381,b=0;
  for(const byte of bytes){a=(a*33+byte)%4294967296;b=(b*65599+byte)%4294967296;}
  return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0')+':'+bytes.length;
}
export function variants(text) {
  const forms=new Set();
  for(const female of [false,true]) {
    forms.add(normalize(String(text??'').replace(/\$[Gg]\s*\(([^;]*);([^)]*)\)/g,(_,m,f)=>female?f:m)
      .replace(/\$[Gg]([^:;]*):([^;]*);/g,(_,m,f)=>female?f:m)));
  }
  return [...forms].filter(Boolean);
}
export const supportsTokens = text => variants(text).every(form=>!/\$[a-z]/i.test(form));
export class TextIndex {
  constructor(){this.entries=new Map();this.ambiguous=new Set();this.normalized=new Map();this.priorities=new Map();this.collisions=new Set();}
  add(source,chinese,priority=0){
    if(!hasChinese(chinese)||hasChinese(source)||!supportsTokens(chinese))return;
    let accepted=false;
    for(const form of variants(source)){
      if(form.length<2||/\$[a-z]/i.test(form))continue;
      const key=fingerprint(form);
      if(this.collisions.has(key))continue;
      const seen=this.normalized.has(key),previousPriority=this.priorities.get(key)??0;
      // A hash collision is unsafe regardless of source priority.
      if(seen&&this.normalized.get(key)!==form){
        this.entries.delete(key);this.ambiguous.add(key);this.collisions.add(key);continue;
      }
      if(seen&&priority<previousPriority)continue;
      if(this.ambiguous.has(key)&&priority===previousPriority)continue;
      const existing=this.entries.get(key);
      if(existing!==undefined&&priority===previousPriority&&existing!==chinese){
        this.entries.delete(key);this.ambiguous.add(key);
      }else{
        this.entries.set(key,chinese);this.normalized.set(key,form);this.ambiguous.delete(key);
        if(priority!==0)this.priorities.set(key,priority);else this.priorities.delete(key);
        accepted=true;
      }
    }
    return accepted;
  }
}
export function luaString(value){
  return '"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,c=>'\\'+c.charCodeAt(0).toString().padStart(3,'0'))+'"';
}
