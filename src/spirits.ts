import catalogue from './data/spirits.json';
import type { Document } from './types';
export const spiritFacts=catalogue.items.filter(row=>Number(row.id)>=100);
export const markFacts=catalogue.items.filter(row=>Number(row.id)<100);
export const spiritSource=catalogue.source;
export const onmyoji=[{id:'10',name:'晴明',group:1},{id:'11',name:'神乐',group:2},{id:'13',name:'源博雅',group:3},{id:'12',name:'八百比丘尼',group:4},{id:'15',name:'源赖光',group:5},{id:'16',name:'藤原道长',group:6}];
export function markOwner(id:string){const n=Number(id);return Number.isInteger(n)&&n>=1&&n<=48?onmyoji[Math.floor((n-1)/8)]:undefined;}
export interface SpiritRecord {uid:string;id:string;level:number|null;star:number|null;marks:string[]|null;locked:boolean|null;liked:boolean|null;shiny:boolean|null;equipped:string[];group:number|null}
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const integer=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=0?v:null;
const flag=(v:unknown)=>typeof v==='boolean'?v:null;
export function spiritInventory(doc:Document|null|undefined):{available:boolean;records:SpiritRecord[];invalid:number}{
 const capture=object(doc?.extras?.capture);const raw=object(capture?.hunling_logic);const souls=object(raw?.souls);if(!souls)return{available:false,records:[],invalid:0};
 const equipped=object(raw?.yys_hunling)??{};const records:SpiritRecord[]=[];let invalid=0;
 for(const [uid,value]of Object.entries(souls)){const row=object(value);if(!row||!uid||integer(row.id)===null){invalid++;continue;}
  records.push({uid,id:String(row.id),level:integer(row.lv),star:integer(row.star),marks:Array.isArray(row.marks)&&row.marks.every(m=>integer(m)!==null)?row.marks.map(String):null,locked:flag(row.lock),liked:flag(row.like),shiny:flag(row.shiny),group:integer(row.mark_gid),equipped:Object.entries(equipped).filter(([,v])=>v===uid).map(([id])=>onmyoji.find(o=>o.id===id)?.name??`阴阳师 #${id}`)});
 }
 return{available:true,records,invalid};
}
export function markCounts(record:SpiritRecord):[string,number][]{const counts=new Map<string,number>();for(const id of record.marks??[])counts.set(id,(counts.get(id)??0)+1);return[...counts].sort(([a],[b])=>Number(a)-Number(b));}
export function spiritName(id:string){return spiritFacts.find(s=>s.id===id)?.name??`契灵 #${id}`;}
export function markName(id:string){return markFacts.find(s=>s.id===id)?.name??`术印 #${id}`;}
