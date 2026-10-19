import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {notesForVersion} from './release.mjs';
import {luaString} from './text.mjs';

export function renderChangelog(changelog, version) {
  const notes = notesForVersion(changelog, version);
  if (!notes) throw new Error(`Missing CHANGELOG.md entry for v${version}.`);
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
    .replaceAll('|', '||'); // Show literal pipes, never WoW color/link/texture markup.
  return [
    '-- SPDX-License-Identifier: GPL-2.0-or-later',
    '-- Generated from CHANGELOG.md; run npm run build:changelog after editing release notes.',
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
  const {version} = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  writeChangelog(root, version);
  console.log(`Generated in-game changelog for v${version}.`);
}
