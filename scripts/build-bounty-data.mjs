// Independent conversion of public factual monster/location counts. Never reads the reference application.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const source='http://yys.koncoo.com/fb.aspx';
const response=await fetch(source,{signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error(`Source returned ${response.status}`);
const html=await response.text();
const text=s=>s.replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();
const categories=new Set();const encounters=[];let category='';
const token=/<div class="list-group-item fbtype">([\s\S]*?)<\/div>|<a[^>]*class="list-group-item gkname"[^>]*>([\s\S]*?)<\/a>\s*<div class="fb">([\s\S]*?)<\/div>/g;
let unmatched=[];
for(const item of html.matchAll(token)) {
 if(item[1]){category=text(item[1]);categories.add(category);continue;}
 const location=text(item[2]);
 for(const p of item[3].matchAll(/<p>\s*<kbd>([\s\S]*?)<\/kbd>([\s\S]*?)<\/p>/g)) {
  const position=text(p[1]);const monsters=[];
  for(const segment of p[2].split(/[，,；;]/)) {
   const clean=text(segment);if(!clean)continue;
   const parsed=clean.match(/^(?:(简单|普通|困难))?(.+?)[x×](\d+)$/);
   if(!parsed){unmatched.push({location,position,segment:clean});continue;}
   monsters.push({name:parsed[2].trim(),count:Number(parsed[3]),difficulty:parsed[1]?'简单'===parsed[1]?'普通':parsed[1]:''});
  }
  const difficulties=monsters.some(m=>m.difficulty)?['普通','困难']:['未区分'];
  for(const name of new Set(monsters.map(m=>m.name))) {
   const counts=difficulties.map(difficulty=>({difficulty,count:monsters.filter(m=>m.name===name&&(!m.difficulty||m.difficulty===difficulty)).reduce((sum,m)=>sum+m.count,0)}));
   if(counts.length===2&&counts[0].count===counts[1].count)encounters.push({name,category,location,position,difficulty:'未区分',count:counts[0].count});
   else for(const {difficulty,count} of counts)if(count)encounters.push({name,category,location,position,difficulty,count});
  }
 }
}
if(unmatched.length)throw Error(`Unrecognized source cells: ${JSON.stringify(unmatched.slice(0,10))}`);
if(encounters.length<1000||categories.size<4)throw Error('Source structure changed or data is incomplete');
const monsters=[...new Set(encounters.map(e=>e.name))];
await fs.mkdir('src/data',{recursive:true});
await fs.writeFile('src/data/bounty.json',JSON.stringify({source,fetchedAt:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),categories:[...categories],encounters},null,2)+'\n');
console.log(JSON.stringify({monsters:monsters.length,encounters:encounters.length,categories:[...categories]}));
