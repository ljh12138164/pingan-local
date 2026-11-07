import fs from 'node:fs/promises';
const manifest = JSON.parse(await fs.readFile(new URL('../public/game-media/sources.json', import.meta.url), 'utf8'));
await fs.writeFile(new URL('../src/gameMediaIndex.json', import.meta.url), JSON.stringify(manifest.images.map(image => `${image.kind}/${image.id}`).sort()));
