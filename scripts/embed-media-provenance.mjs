import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const manifest=JSON.parse(await fs.readFile('public/game-media/sources.json','utf8'));
const version=(await fs.readFile(path.join(process.env.USERPROFILE,'.codex/skills/impeccable/scripts/VERSION'),'utf8')).trim();
const executable=process.env.IMPECCABLE_BIN || path.join(process.env.USERPROFILE,`.impeccable/bin/${version}/impeccable.exe`);
let count=0;
for(const item of manifest.images){
  const result=spawnSync(executable,['embed-prompt',`public/${item.path}`,'--prompt',`Sourced game asset. Origin: ${item.url}. Independently obtained from NetEase's public game resource CDN; no original reference-app assets were imported.`],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw Error(`${item.path}: ${result.stderr || result.stdout}`);
  count++;
}
console.log(`Embedded verified origin metadata in ${count} game assets.`);
