import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const suitPath = process.argv[2];
if (!suitPath) throw Error('Pass independently read equip_suit facts');
const suits = JSON.parse(await fs.readFile(suitPath, 'utf8'));
const file = 'public/game-media/sources.json';
const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
const known = new Set(manifest.images.filter(i => i.kind === 'suit').map(i => String(i.id)));
const missing = Object.entries(suits).filter(([id, s]) => s.release === 1 && !known.has(id));
const results = await Promise.all(missing.map(async ([id, suit]) => {
  const url = `https://cbg-yys.res.netease.com/game_res/suit/${id}.png`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) throw Error(`HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Invalid PNG');
    return { id, name: suit.suit_n, url, bytes };
  } catch (e) { return { id, name: suit.suit_n, url, reason: String(e) }; }
}));
const version = (await fs.readFile(path.join(process.env.USERPROFILE, '.codex/skills/impeccable/scripts/VERSION'), 'utf8')).trim();
const executable = path.join(process.env.USERPROFILE, `.impeccable/bin/${version}/impeccable.exe`);
for (const item of results) {
  if (!item.bytes) continue;
  const relative = `game-media/suit/${item.id}.png`;
  await fs.writeFile(`public/${relative}`, item.bytes);
  const embed = spawnSync(executable, ['embed-prompt', `public/${relative}`, '--prompt', `Sourced game asset. Origin: ${item.url}. Independently obtained from NetEase's public game resource CDN; no original reference-app assets were imported.`], { encoding: 'utf8', windowsHide: true });
  if (embed.status !== 0) throw Error(embed.stderr || embed.stdout);
  manifest.images.push({ id: item.id, kind: 'suit', url: item.url, path: relative, bytes: item.bytes.length });
}
const newlyAvailable = new Set(results.filter(r => r.bytes).map(r => `suit/${r.id}`));
manifest.unavailable = manifest.unavailable.filter(i => !newlyAvailable.has(`${i.kind}/${i.id}`));
for (const item of results.filter(r => !r.bytes)) {
  manifest.unavailable = manifest.unavailable.filter(i => !(i.kind === 'suit' && String(i.id) === item.id));
  manifest.unavailable.push({ id: item.id, kind: 'suit', url: item.url, reason: item.reason });
}
manifest.images.sort((a, b) => a.path.localeCompare(b.path));
manifest.checkedAt = new Date().toISOString();
await fs.writeFile(file, JSON.stringify(manifest, null, 2));
await fs.writeFile('src/gameMediaIndex.json', JSON.stringify(manifest.images.map(i => `${i.kind}/${i.id}`).sort()));
console.log(results.map(({ id, name, bytes, reason }) => ({ id, name, bytes: bytes?.length, reason })));
