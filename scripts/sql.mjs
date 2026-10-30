import fs from 'node:fs';
import readline from 'node:readline';
import {Readable} from 'node:stream';

// Parse data only. SQL is never sent to a database or evaluated as code.
export function parseValues(text, emit) {
  let row = null, token = '', quoted = false, wasQuoted = false;
  const value = () => wasQuoted ? token : (token.trim() === 'NULL' ? null : token.trim());
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '\\') {
        const next = text[++i];
        token += ({n:'\n',r:'\r',t:'\t','0':'\0',Z:'\x1a'})[next] ?? next;
      } else if (c === "'") {
        if (text[i+1] === "'") { token += "'"; i++; }
        else quoted = false;
      } else token += c;
    } else if (row === null && c === '-' && text[i+1] === '-') {
      const end = text.indexOf('\n',i); i = end < 0 ? text.length : end;
    } else if (row === null && c === '/' && text[i+1] === '*') {
      const end = text.indexOf('*/',i+2); if (end < 0) throw Error('Unclosed SQL comment'); i=end+1;
    } else if (c === '(' && row === null) {
      row=[]; token=''; wasQuoted=false;
    } else if (row !== null && c === "'") {
      quoted=true; wasQuoted=true; token='';
    } else if (row !== null && (c === ',' || c === ')')) {
      row.push(value()); token=''; wasQuoted=false;
      if(c === ')') { emit(row); row=null; }
    } else if (row !== null && !(wasQuoted && /\s/.test(c))) token+=c;
  }
  if (quoted || row !== null) throw Error('Unterminated SQL value');
}

export async function readSQL(file, selected, emit, schemas = new Map(), verifiedBytes) {
  let schema=null, active=null, buffer='';
  const consume=(name,columns,values)=>parseValues(values, row=>{
    if(row.length!==columns.length) throw Error(`${file}: ${name}: ${row.length} values for ${columns.length} columns`);
    emit(name,Object.fromEntries(columns.map((col,i)=>[col,row[i]])),false);
  });
  // Small hash-checked captures can supply the exact bytes already verified.
  // Existing callers continue streaming SQL files without buffering the dump.
  const input=verifiedBytes===undefined?fs.createReadStream(file):Readable.from([verifiedBytes]);
  for await(const line of readline.createInterface({input,crlfDelay:Infinity})) {
    if(active) {
      buffer+='\n'+line;
      if(/;\s*(?:--.*)?$/.test(line)) {consume(active.name,active.columns,buffer);active=null;buffer='';}
      continue;
    }
    const create=line.match(/^CREATE TABLE(?: IF NOT EXISTS)? `([^`]+)`/i);
    if(create) {schema=selected.has(create[1])?create[1]:null;if(schema)schemas.set(schema,[]);}
    if(schema) {const col=line.match(/^\s+`([^`]+)` /);if(col)schemas.get(schema).push(col[1]);}
    const ins=line.match(/^INSERT(?:\s+IGNORE)?\s+INTO\s+`([^`]+)`\s*(?:\((.*?)\))?\s*VALUES\s*(.*)$/i);
    if(ins&&selected.has(ins[1])) {
      const columns=ins[2]?[...ins[2].matchAll(/`([^`]+)`/g)].map(m=>m[1]):schemas.get(ins[1]);
      if(!columns?.length)throw Error(`Missing schema for ${ins[1]}`);
      if(/;\s*(?:--.*)?$/.test(line))consume(ins[1],columns,ins[3]);
      else {active={name:ins[1],columns};buffer=ins[3];}
    }
    const update=line.match(/^UPDATE `([^`]+)` SET (.*?) WHERE\s+(.+);/i);
    if(update&&selected.has(update[1])) {
      const record={};
      for(const match of (update[2]+', '+update[3]).matchAll(/`([^`]+)`\s*=\s*('(?:\\.|''|[^'])*'|[+-]?\d+(?:\.\d+)?)/g)) {
        parseValues('('+match[2]+')',values=>record[match[1]]=values[0]);
      }
      const hasKey=record.ID!==undefined||(['creature_template','creature_template_locale'].includes(update[1])&&record.entry!==undefined);
      if(!hasKey || (update[1].endsWith('_locale') && !(record.locale??record.Locale)))throw Error(`Unsupported selected UPDATE in ${file}`);
      emit(update[1],record,true);
    }
  }
  if(active)throw Error(`Unterminated SQL INSERT in ${file}`);
  return schemas;
}
