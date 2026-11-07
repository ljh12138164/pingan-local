import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { snapshotInput } from './snapshotScope';
import { beginActivity, endActivity, configureActivity } from './activityJournal';

export const desktop = '__TAURI_INTERNALS__' in window;
export async function execute<T>(operation: string, input: unknown = {}): Promise<T> {
  input = snapshotInput(operation, input);
  const job = beginActivity(operation,input);
  try { const result=await transport<T>(operation,input);endActivity(job,result);return result; }
  catch(error){endActivity(job,undefined,error);throw error;}
}
async function transport<T>(operation:string,input:unknown):Promise<T>{
  if (desktop) return invoke<T>('execute', { operation, input });
  const response = await fetch('/api/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, input }) });
  let body: { result: T; error?: string };
  try { body = await response.json(); } catch { throw new Error('本地服务尚未就绪，请稍后重试。开发环境请使用 npm run dev。'); }
  if (!response.ok || body.error) throw new Error(body.error || `本地服务错误 ${response.status}`);
  return body.result;
}
configureActivity(transport);
export async function chooseExecutable(): Promise<string | null> {
  if (!desktop) return null;
  const path = await open({ title: '选择游戏程序', multiple: false, filters: [{ name: 'Windows 应用程序', extensions: ['exe'] }] });
  return typeof path === 'string' ? path : null;
}
export async function downloadWorkbook(name:string,bytes:Uint8Array):Promise<boolean>{
  if(desktop){const path=await save({defaultPath:name,filters:[{name:'Excel 工作簿',extensions:['xlsx']}]});if(!path)return false;await execute('write_workbook',{path,bytes:Array.from(bytes)});}
  else{const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return true;
}
export async function downloadImageExport(name:string,bytes:Uint8Array,kind:'png'|'zip'):Promise<boolean>{
  if(desktop){const path=await save({defaultPath:name,filters:[{name:kind==='png'?'PNG 图片':'PNG 图片包',extensions:[kind]}]});if(!path)return false;const token=crypto.randomUUID();try{for(let offset=0;offset<bytes.length;offset+=1024*1024)await execute('write_image_export',{path,token,total:bytes.length,offset,bytes:Array.from(bytes.subarray(offset,offset+1024*1024))});}catch(error){try{await execute('write_image_export',{path,token,abort:true});}catch{/* Retain the original write error. */}throw error;}}
  else{const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:kind==='png'?'image/png':'application/zip'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return true;
}
export async function download(name: string, content: string, type = 'application/json'): Promise<boolean> {
  if (desktop) {
    const path = await save({ defaultPath: name, filters: [{ name: name.endsWith('.csv') ? 'CSV' : 'JSON', extensions: [name.endsWith('.csv') ? 'csv' : 'json'] }] });
    if (!path) return false;
    await execute('write_file', { path, content });
  } else {
    const blob = new Blob([type === 'text/csv' ? '\ufeff' : '', content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return true;
}
export function csv(rows: unknown[][]) { return rows.map(row => row.map(value => { const s = String(value ?? ''); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return `"${safe.replaceAll('"', '""')}"`; }).join(',')).join('\r\n'); }
