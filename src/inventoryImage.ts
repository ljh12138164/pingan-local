import type { Soul } from './types';
import { labels, number, percent } from './types';
import suitImages from './data/suit-images.json';
import mediaIndex from './gameMediaIndex.json';

export interface ImageExportInput {
  souls:Soul[]; owners:Map<string,string>; discarded:Set<string>;
  values:Map<string,{score:number|null;growth:number|null}>; setIds?:Record<string,string>;
  metadata:[string,string][]; captions:[string,string][]; dark:boolean; digits:number;
}
export const imagePageSize=60;
export function imagePages(souls:Soul[]){return Array.from({length:Math.ceil(souls.length/imagePageSize)},(_,i)=>souls.slice(i*imagePageSize,(i+1)*imagePageSize));}
export function imageManifest(input:ImageExportInput){return {schema:'pingan-inventory-images/1',createdAt:new Date().toISOString(),metadata:input.metadata,count:input.souls.length,pages:imagePages(input.souls).map((rows,i)=>({file:`御魂-${String(i+1).padStart(3,'0')}.png`,start:i*imagePageSize+1,end:i*imagePageSize+rows.length,ids:rows.map(s=>s.id)}))};}
const available=new Set(mediaIndex);
async function portrait(set:string,input:ImageExportInput){
  const id=input.setIds?.[set]||(suitImages.suits as Record<string,string>)[set];if(!id||!available.has(`suit/${id}`))return null;
  const image=new Image();image.src=`/game-media/suit/${encodeURIComponent(id)}.png`;
  try{await image.decode();return image;}catch{return null;}
}
export async function inventoryImages(input:ImageExportInput,onProgress:(done:number,total:number)=>void){
  if(!input.souls.length)throw Error('没有符合条件的御魂');
  const manifest=imageManifest(input);const pages=imagePages(input.souls);const portraits=new Map<string,HTMLImageElement|null>();
  for(const set of new Set(input.souls.map(s=>s.set)))portraits.set(set,await portrait(set,input));
  const colors=input.dark?{background:'#15171c',surface:'#1f2229',ink:'#edf0f7',muted:'#b2b9c8',line:'#3b4353',accent:'#aac0ff'}:{background:'#f5f6f9',surface:'#ffffff',ink:'#202736',muted:'#566278',line:'#e3e7ef',accent:'#355bb5'};
  const outputs:Uint8Array[]=[];await document.fonts.ready;
  const attribute=(key:string,value:number)=>`${new Intl.NumberFormat('zh-CN',{minimumFractionDigits:input.digits,maximumFractionDigits:input.digits}).format(value)}${percent.has(key)?'%':''}`;
  for(let page=0;page<pages.length;page++){
    const rows=pages[page];const canvas=document.createElement('canvas');const columns=rows.length===1?1:2;canvas.width=columns===1?800:1440;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('无法创建图片画布，请重新打开应用后重试');
    const font='"Microsoft YaHei UI","PingFang SC",sans-serif';
    const text=(value:string,x:number,y:number,size=22,color=colors.ink,weight=400)=>{ctx.font=`${weight} ${size}px ${font}`;ctx.fillStyle=color;ctx.fillText(value,x,y);};
    const wrap=(value:string,max:number)=>{ctx.font=`400 20px ${font}`;const lines:string[]=[];let line='';for(const char of value){if(ctx.measureText(line+char).width>max&&line){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);return lines;};
    const metadata=input.captions.flatMap(([k,v])=>wrap(`${k}：${v}`,canvas.width-96));
    const footer=wrap('数值按界面格式显示；精确数值可使用 Excel / JSON 导出。图片仅包含本次捕获的筛选结果。',canvas.width-96);
    const header=164+metadata.length*28;const subRows=Math.max(2,...rows.map(s=>Math.ceil(Object.keys(s.sub).length/2)));const rowHeight=322+(subRows-2)*29;canvas.height=header+Math.ceil(rows.length/columns)*rowHeight+46+footer.length*24;
    ctx.fillStyle=colors.background;ctx.fillRect(0,0,canvas.width,canvas.height);
    text('御魂筛选结果',48,64,36,colors.ink,650);text(`平安手札 · ${page+1} / ${pages.length} 张 · 第 ${manifest.pages[page].start}–${manifest.pages[page].end} 枚 / 共 ${input.souls.length} 枚`,48,104,22,colors.muted);
    metadata.forEach((line,i)=>text(line,48,144+i*28,20,colors.muted));
    for(let i=0;i<rows.length;i++){
      const soul=rows[i];const x=48+(i%columns)*684;const y=header+Math.floor(i/columns)*rowHeight;
      ctx.fillStyle=colors.surface;ctx.fillRect(x,y,columns===1?704:660,rowHeight-12);
      const icon=portraits.get(soul.set);if(icon)ctx.drawImage(icon,x+18,y+18,62,62);else{text('缺图',x+20,y+54,20,colors.muted);}
      const title=`${soul.set} · ${soul.slot}号位`;ctx.font=`650 26px ${font}`;let short=title;while(short.length>1&&ctx.measureText(short).width>540)short=short.slice(0,-1);text(short===title?title:short.slice(0,-1)+'…',x+98,y+43,26,colors.ink,650);
      text(`${soul.quality}星  +${soul.level}  ${soul.locked?'已锁定':'未锁定'}${input.discarded.has(soul.id)?'  本地弃置':''}`,x+98,y+74,20,colors.muted);
      text(`ID ${soul.id}`,x+18,y+110,18,colors.muted);
      text(`${labels[soul.main]??soul.main} ${attribute(soul.main,soul.value)}`,x+18,y+147,25,colors.accent,650);
      const innate=Object.entries(soul.innate??{}).map(([k,v])=>`${labels[k]??k} ${attribute(k,v)}`).join(' / ');
      text(`固有：${soul.innate===undefined?'未读取':innate||'无'}`,x+18,y+177,20,colors.muted);
      const subs=Object.entries(soul.sub);subs.forEach(([key,value],index)=>text(`${labels[key]??key}  ${attribute(key,value)}`,x+18+(index%2)*312,y+211+Math.floor(index/2)*29,22,key==='speed'?colors.accent:colors.ink));
      const values=input.values.get(soul.id);text(`参考评分 ${values?.score!=null?number(values.score):'未计算'}  ·  成长总分 ${values?.growth!=null?number(values.growth):'未读取'}`,x+18,y+rowHeight-46,20,colors.muted);
      const owner=input.owners.get(soul.equipped)??(soul.equipped?'已装备，名称未读取':'未装备');text(`装备：${owner}`,x+18,y+rowHeight-21,18,colors.muted);
    }
    footer.forEach((line,i)=>text(line,48,canvas.height-22-(footer.length-1-i)*24,18,colors.muted));
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('图片生成失败，请缩小筛选范围后重试')),'image/png'));
    outputs.push(new Uint8Array(await blob.arrayBuffer()));canvas.width=1;canvas.height=1;onProgress(page+1,pages.length);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(outputs.length===1)return {name:'御魂筛选长图.png',bytes:outputs[0],kind:'png' as const,count:1,manifest};
  const {default:JSZip}=await import('jszip');const zip=new JSZip();outputs.forEach((bytes,i)=>zip.file(manifest.pages[i].file,bytes));zip.file('导出说明.json',JSON.stringify(manifest,null,2));
  return {name:'御魂筛选长图.zip',bytes:await zip.generateAsync({type:'uint8array',compression:'STORE'}),kind:'zip' as const,count:outputs.length,manifest};
}
