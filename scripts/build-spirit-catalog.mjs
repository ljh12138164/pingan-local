// Extract public game facts only; input is NetEase's game_auto_config.js.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
const input=process.argv[2];if(!input)throw Error('Usage: node scripts/build-spirit-catalog.mjs <game_auto_config.js>');
const bytes=await fs.readFile(input);const sandbox={};sandbox.window=sandbox;
vm.runInNewContext(bytes.toString('utf8'),sandbox,{timeout:10000});
const rows=Object.entries(sandbox.CBG_GAME_CONFIG?.qiling_list??{}).map(([id,row])=>({id,name:row.name,description:row.desc,bonus:row.remark,image:row.pic}));
if(rows.length!==56||rows.some(row=>!row.name||!row.description||!/^hunling_pic\/\d+\.png$/.test(row.image)))throw Error('Unexpected public spirit catalogue; inspect before updating');
const result={source:'https://cbg-yys.res.netease.com/js/game_auto_config.js',sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),checkedAt:new Date().toISOString(),items:rows};
await fs.writeFile('src/data/spirits.json',JSON.stringify(result));console.log(`Extracted ${rows.filter(row=>Number(row.id)>=100).length} spirits and ${rows.filter(row=>Number(row.id)<100).length} marks.`);
