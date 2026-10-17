// Read Unicode cmap mappings from an unmodified TrueType font. A zero glyph
// means missing; format 12 also covers supplementary CJK characters.
export function fontCodepoints(font) {
  let cmap;
  for(let i=0;i<font.readUInt16BE(4);i++){
    const p=12+i*16;
    if(font.toString('ascii',p,p+4)==='cmap')cmap=font.readUInt32BE(p+8);
  }
  if(cmap===undefined)throw Error('Font has no cmap table');
  const glyphs=new Set();
  for(let i=0;i<font.readUInt16BE(cmap+2);i++){
    const p=cmap+font.readUInt32BE(cmap+4+i*8+4),format=font.readUInt16BE(p);
    if(format===12){
      for(let j=0;j<font.readUInt32BE(p+12);j++){
        const q=p+16+j*12,first=font.readUInt32BE(q),last=font.readUInt32BE(q+4),startGlyph=font.readUInt32BE(q+8);
        for(let c=first;c<=last;c++)if(startGlyph+c-first)glyphs.add(c);
      }
    }else if(format===4){
      const n=font.readUInt16BE(p+6)/2,end=p+14,start=end+2*n+2,delta=start+2*n,offset=delta+2*n;
      for(let j=0;j<n;j++)for(let c=font.readUInt16BE(start+2*j);c<=font.readUInt16BE(end+2*j);c++){
        const d=font.readInt16BE(delta+2*j),o=font.readUInt16BE(offset+2*j);
        const raw=o?font.readUInt16BE(offset+2*j+o+2*(c-font.readUInt16BE(start+2*j))):c;
        if(o?raw&&((raw+d)&65535):((raw+d)&65535))glyphs.add(c);
      }
    }
  }
  if(!glyphs.size)throw Error('Font has no supported Unicode cmap');
  return glyphs;
}
