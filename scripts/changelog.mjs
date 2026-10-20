import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {notesForVersion} from './release.mjs';
import {luaString} from './text.mjs';

export function renderChangelog(changelog, version) {
  const notes = notesForVersion(changelog, version);
  if (!notes) throw new Error(`Missing CHANGELOG.md entry for v${version}.`);
  return renderReleaseChangelog(notes,version);
}

export function renderReleaseChangelog(notes, version) {
  if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)||typeof notes!=='string'||!notes.trim())
    throw new Error('A release version and nonempty release notes are required.');
  const entries = [];
  for (const line of notes.split('\n')) {
    if (!line.trim()) continue;
    const bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) entries.push(bullet[1]);
    else if (/^\s+\S/.test(line) && entries.length) entries[entries.length - 1] += ' ' + line.trim();
    else throw new Error(`Unsupported changelog line for v${version}: ${line}`);
  }
  const plain = value => value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\\([\\`*_{}\[\]<>!#|])/g, '$1')
    .replaceAll('|', '||'); // Show literal pipes, never WoW color/link/texture markup.
  return [
    '-- SPDX-License-Identifier: GPL-2.0-or-later',
    '-- Generated from release notes; run npm run build:changelog after editing CHANGELOG.md.',
    'LegionChinese.Changelog = {',
    `    version = ${luaString(version)},`,
    '    entries = {',
    ...entries.map(entry => `        ${luaString(plain(entry))},`),
    '    },',
    '}', '',
  ].join('\n');
}

export function writeChangelog(root, version) {
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  fs.writeFileSync(path.join(root, 'AddOns/LegionChinese/Changelog.lua'), renderChangelog(changelog, version));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if(process.argv[2]==='--package'){
    const version=process.argv[3],file=process.argv[4];
    if(file){
      const metadata=JSON.parse(fs.readFileSync(file,'utf8'));
      if(metadata.version!==version)throw new Error('Packaged release notes version mismatch.');
      process.stdout.write(renderReleaseChangelog(metadata.notes,version));
    }else process.stdout.write(renderChangelog(fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8'),version));
  }else{
    const {version} = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    writeChangelog(root, version);
    console.log(`Generated in-game changelog for v${version}.`);
  }
}
