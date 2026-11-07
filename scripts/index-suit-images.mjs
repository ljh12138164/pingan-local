import fs from 'node:fs/promises';
const catalog=JSON.parse(await fs.readFile('src-tauri/data/catalog.json','utf8'));
const suits=Object.fromEntries(catalog.sets.map(s=>[s.name,String(s.id)]));
await fs.writeFile('src/data/suit-images.json',JSON.stringify({source:catalog.source,suits},null,2)+'\n');
console.log(`Indexed ${Object.keys(suits).length} exact public suit names; unavailable images remain explicit.`);
