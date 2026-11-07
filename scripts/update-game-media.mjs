// Public game portraits, served by NetEase's CBG. No original application assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await fs.readFile(path.join(root, 'src-tauri/data/catalog.json'), 'utf8'));
const base = 'https://cbg-yys.res.netease.com/game_res';
const items = [
  ...catalog.heroes.map(h => ({ id: h.id, kind: 'hero', url: `${base}/hero/${h.id}/${h.id}.png` })),
  ...catalog.sets.map(s => ({ id: s.id, kind: 'suit', url: `${base}/suit/${s.id}.png` })),
];
const manifest = { source: base, checkedAt: new Date().toISOString(), images: [], unavailable: [] };
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < items.length) {
    const item = items[next++];
    const relative = `game-media/${item.kind}/${item.id}.png`;
    const target = path.join(root, 'public', relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      const response = await fetch(item.url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid PNG');
      await fs.writeFile(target, bytes);
      manifest.images.push({ ...item, path: relative, bytes: bytes.length });
    } catch (e) { manifest.unavailable.push({ ...item, reason: String(e) }); }
  }
}));
manifest.images.sort((a,b) => a.path.localeCompare(b.path));
await fs.writeFile(path.join(root, 'public/game-media/sources.json'), JSON.stringify(manifest, null, 2));
console.log(`Verified ${manifest.images.length} local images; ${manifest.unavailable.length} unavailable.`);
