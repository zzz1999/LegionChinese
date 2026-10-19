import {variants,fingerprint} from './text.mjs';
import {ChineseTextIndex} from './fallback.mjs';

// Ambiguous short pages can be resolved after observing page one of the same
// book. Never choose between books merely because their page numbers agree.
export function buildBookContexts(pages,candidates,globalIndex){
  const incoming=new Set(),byPage=new Map(),groups=new Map();
  const next=row=>row.NextPageID??row.NextPage;
  for(const row of pages.values())if(Number(next(row)))incoming.add(String(next(row)));
  for(const candidate of candidates){
    const id=String(candidate.audit.id);if(!byPage.has(id))byPage.set(id,[]);byPage.get(id).push(candidate);
  }
  for(const [root,page]of pages){
    if(incoming.has(String(root))||!Number(next(page)))continue;
    const anchors=variants(page.Text).map(fingerprint);
    let current=String(root),number=1;const visited=new Set();
    while(pages.has(current)&&!visited.has(current)&&number<=512){
      visited.add(current);
      for(const c of byPage.get(current)??[]){
        if(variants(c.original).every(v=>globalIndex.entries.has(fingerprint(v))))continue;
        for(const anchor of anchors){
          const key=anchor+'/'+number;if(!groups.has(key))groups.set(key,{anchor,page:number,index:new ChineseTextIndex(),ids:new Set()});
          const scope=groups.get(key);scope.ids.add(+current);
          scope.index.add(c.audit.locale,c.original,c.chinese,c.group==='clientSniff'?1:c.group==='legacyCompatible'?-1:0);
        }
      }
      current=String(next(pages.get(current)));number++;
    }
  }
  const scopes=[];for(const scope of groups.values()){scope.index.finish();if(scope.index.entries.size)scopes.push(scope);}
  return {scopes,audit:{contexts:scopes.length,pages:new Set(scopes.flatMap(s=>[...s.ids])).size,fingerprints:scopes.reduce((n,s)=>n+s.index.entries.size,0)}};
}
