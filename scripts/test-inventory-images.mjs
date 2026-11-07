import assert from 'node:assert/strict';
import {build} from 'esbuild';
await build({entryPoints:['src/inventoryImage.ts'],outfile:'work/inventory-images-test.mjs',bundle:true,platform:'node',format:'esm'});
const {imagePages,imageManifest,inventoryImages}=await import('../work/inventory-images-test.mjs');
for(const count of [0,1,59,60,61,120,6487]){
 const souls=Array.from({length:count},(_,i)=>({id:`000-${i}`}));const pages=imagePages(souls);assert.equal(pages.length,Math.ceil(count/60));assert.deepEqual(pages.flat().map(s=>s.id),souls.map(s=>s.id));assert.ok(pages.every(p=>p.length<=60));
 const manifest=imageManifest({souls,metadata:[['版本','历史 · A'],['筛选条件','{"focused":true}']]});assert.equal(manifest.count,count);assert.deepEqual(manifest.pages.flatMap(p=>p.ids),souls.map(s=>s.id));assert.equal(new Set(manifest.pages.map(p=>p.file)).size,pages.length);assert.equal(manifest.metadata[0][1],'历史 · A');if(count)assert.equal(manifest.pages.at(-1).end,count);
}
const drawn=[];let fail=true;
const ctx={measureText:s=>({width:s.length*12}),fillRect(){},drawImage(){},fillText(s){drawn.push(s);}};
globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>({getContext:()=>ctx,toBlob:callback=>callback(fail?null:new Blob(['png']))})};
const input={souls:[{id:'exact-id',set:'未有官方图片的自定义套装',sub:{speed:2.123456},innate:{},slot:2,quality:6,level:0,locked:false,equipped:'',main:'speed',value:12}],owners:new Map(),discarded:new Set(),values:new Map(),metadata:[],captions:[],dark:true,digits:6};
await assert.rejects(inventoryImages(input,()=>{}),/图片生成失败/);
fail=false;const progress=[];const recovered=await inventoryImages(input,(done,total)=>progress.push([done,total]));
assert.equal(recovered.kind,'png');assert.deepEqual(progress,[[1,1]]);assert.ok(drawn.includes('缺图'));assert.ok(drawn.some(s=>s.includes('2.123456')));assert.ok(drawn.some(s=>s.includes('exact-id')));
assert.ok(drawn.includes('固有：无'));drawn.length=0;await inventoryImages({...input,souls:[{...input.souls[0],innate:undefined}]},()=>{});assert.ok(drawn.includes('固有：未读取'));assert.ok(!drawn.includes('固有：无'));
await assert.rejects(inventoryImages({...input,souls:[]},()=>{}),/没有符合条件/);
console.log('PASS: boundaries, complete ordered IDs and provenance; renderer failure/retry, empty input, explicit missing image and 6-digit precision.');
