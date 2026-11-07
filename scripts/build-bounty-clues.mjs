// Input is the static monster_hunter configuration from the independent game reader.
// Only monster names and clue phrases are retained; no account or runtime state is copied.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const input=process.argv[2];if(!input)throw Error('Pass an independently read monster_hunter JSON path');
const bytes=await fs.readFile(input);const config=JSON.parse(bytes);
const catalog=JSON.parse(await fs.readFile('src-tauri/data/catalog.json','utf8'));
const names=new Map(catalog.heroes.map(h=>[Number(h.id),h.name]));const clues={};
for(const row of Object.values(config))if(row.type===2){
 const name=names.get(row.monster_id_1);if(!name)throw Error(`Missing monster name ${row.monster_id_1}`);
 for(const field of ['param_1','param_2'])for(const term of String(row[field]??'').replace(/^线索\d*[:：]/,'').split(/[/／、]/).map(s=>s.trim()).filter(Boolean))clues[name]=[...new Set([...(clues[name]??[]),term])];
}
if(Object.keys(clues).length<30)throw Error('Static clue configuration is incomplete');
const publicSource='https://news.4399.com/yyssy/wenda/m/733939.html';
const response=await fetch(publicSource,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`Public clue source returned ${response.status}`);
const publicBytes=Buffer.from(await response.arrayBuffer());const html=new TextDecoder('gb18030').decode(publicBytes);
const clean=s=>s.replace(/<br\s*\/?>/gi,'/').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
let publicRows=0;
for(const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){
 const tds=[...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>x[1]);if(tds.length!==2)continue;
 const name=clean(tds[1]).replace(/^\//,'');if(![...names.values()].includes(name))continue;
 const terms=clean(tds[0]).split('【')[0].split(/[/／、]/).map(s=>s.trim()).filter(Boolean);if(!terms.length)continue;
 clues[name]=[...new Set([...(clues[name]??[]),...terms])];publicRows++;
}
if(publicRows<30)throw Error('Public clue table changed');
await fs.writeFile('src/data/bounty-clues.json',JSON.stringify({sources:['game-client:com.data.cdata.monster_hunter',publicSource],readAt:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),publicSourceSha256:crypto.createHash('sha256').update(publicBytes).digest('hex'),clues},null,2)+'\n');
console.log(`Independent clue facts: ${Object.keys(clues).length} monsters`);
