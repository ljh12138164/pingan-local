// Extract only public-facing item facts from independently read game config.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const source=process.argv[2];
if(!source)throw Error('Usage: node scripts/build-collection-catalog.mjs <own-currency-config.json>');
const bytes=await fs.readFile(source);const data=JSON.parse(bytes);
const types=new Map([[41,'skin'],[905,'onmyoji'],[903,'frame'],[924,'frame'],[904,'yard'],[912,'space'],[45,'paper']]);
const clean=s=>String(s??'').replace(/<[^>]*>|\[(?:[a-zA-Z][^\]]*|#[a-fA-F0-9]+)\]/g,'').trim();
const items=Object.entries(data).flatMap(([id,row])=>types.has(row.type)&&row.name?[{id,name:clean(row.name),category:types.get(row.type),description:clean(row.desc),star:row.star??null}]:[]).sort((a,b)=>Number(a.id)-Number(b.id));
if(!items.length||new Set(items.map(i=>i.id)).size!==items.length)throw Error('Empty or duplicate collection catalogue');
const result={source:'独立读取的游戏 currency 配置',sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),items};
await fs.mkdir('src/data',{recursive:true});await fs.writeFile('src/data/collections.json',JSON.stringify(result));
console.log(JSON.stringify({items:items.length,categories:Object.fromEntries([...new Set(items.map(i=>i.category))].map(k=>[k,items.filter(i=>i.category===k).length])),sourceSha256:result.sourceSha256}));
