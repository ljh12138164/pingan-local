export interface ActivityContext { profileId?: string; profileName?: string; version?: string; snapshotId?:string }
export interface Job extends ActivityContext {
  id: string; title: string; operation: string; route: string; createdAt: string;
  status: 'running' | 'done' | 'failed'; finishedAt?: string; elapsed?: number;
  summary?: string; error?: string; input?: unknown; result?: unknown; resultOmitted?: boolean;
}
export interface Notice extends ActivityContext { id: string; title: string; createdAt: string; category: 'error' | 'reminder'; read: boolean; hidden: boolean }
interface Journal { tasks: Job[]; notices: Notice[]; loaded: boolean; saving: number; syncError: string }
const operations: Record<string, [string, string]> = {
  read_desktop:['读取桌面版角色','import'], read_emulator:['读取模拟器角色','import'],
  optimize:['面板配装搜索','optimizer'], improvements:['单件提升计算','optimizer'],
  association_preview:['关联分库存估算','association'],
  speed_overview:['御魂一速计算','speed'], head_tail:['头尾分析','head-tail'],
  upgrade_potential:['强化潜力计算','simulation'], simulate:['御魂强化模拟','simulation'],
  simulate_batch:['库存批量强化模拟','simulation'],
  simulate_exchange:['虚拟御魂兑换','simulation'],simulate_virtual:['虚拟御魂强化','simulation'],
  preview_cbg:['藏宝阁商品预检','import'], import_cbg:['导入藏宝阁快照','import'],
  import_document:['导入角色档案','import'], refresh_lineups:['更新公开阵容','lineups'],
  compare_snapshots:['比较角色快照','archives'],
  export_inventory_image:['生成御魂长图','inventory'],
};
const results = new Set(['optimize','improvements','speed_overview','head_tail','upgrade_potential','simulate','simulate_batch','compare_snapshots']);
let journal: Journal = {tasks:[],notices:[],loaded:false,saving:0,syncError:''};
let context: ActivityContext = {}; let transport: (op:string,input:unknown)=>Promise<unknown>;
const subscribers = new Set<()=>void>();
const pending = new Map<string,{operation:string;input:unknown}>();
let flushing:Promise<void>|null=null;
function publish(next: Partial<Journal>) { journal={...journal,...next}; for(const f of subscribers) f(); }
export const subscribeActivity=(f:()=>void)=>{subscribers.add(f);return()=>{subscribers.delete(f);};};
export const getActivity=()=>journal;
export function setActivityContext(value:ActivityContext){context={...value};}
export function configureActivity(value:typeof transport){transport=value;}
function flush():Promise<void>{
  if(flushing)return flushing;if(!transport)return Promise.resolve();
  flushing=(async()=>{try{while(pending.size){const [key,entry]=pending.entries().next().value!;await transport(entry.operation,entry.input);if(pending.get(key)===entry)pending.delete(key);publish({saving:pending.size,syncError:''});}}
  catch(error){publish({syncError:`记录尚未保存：${error instanceof Error?error.message:String(error)}`});}})().finally(()=>{flushing=null;if(pending.size&&!journal.syncError)void flush();});
  return flushing;
}
function queue(key:string,operation:string,input:unknown){pending.set(key,{operation,input});publish({saving:pending.size});void flush();}
export const retryActivity=async()=>{if(flushing)await flushing;if(pending.size)await flush();};
let loading:Promise<void>|null=null;
export function loadActivity():Promise<void>{
  if(loading)return loading;
  loading=(async()=>{try{
    const saved=await transport('activity_list',{}) as {tasks:Job[];notices:Notice[]};
    const merge=<T extends {id:string;createdAt:string}>(local:T[],remote:T[])=>[...new Map([...remote,...local].map(row=>[row.id,row])).values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    publish({tasks:merge(journal.tasks,saved.tasks),notices:merge(journal.notices,saved.notices),loaded:true,syncError:''});await retryActivity();
  }catch(error){publish({syncError:`无法载入任务与通知：${error instanceof Error?error.message:String(error)}`});}finally{loading=null;}})();return loading;
}
export function beginActivity(operation:string,input:unknown):string|null{
  if(!operations[operation])return null;
  const [title,route]=operations[operation];const value=input as Record<string,unknown>;
  const scope=value?.viewSnapshot as {snapshotId?:string}|undefined;
  const job:Job={id:crypto.randomUUID(),title,operation,route,createdAt:new Date().toISOString(),status:'running',...context,
    profileId:typeof value?.id==='string'?value.id:context.profileId,snapshotId:scope?.snapshotId,version:scope?.snapshotId?(scope.snapshotId===context.snapshotId?context.version:`历史版本 ${scope.snapshotId}`):context.version??'当前档案',
    input:results.has(operation)?structuredClone(input):undefined};
  publish({tasks:[job,...journal.tasks]});return job.id;
}
export function endActivity(id:string|null,result:unknown,error?:unknown){
  if(!id)return;const previous=journal.tasks.find(j=>j.id===id);if(!previous)return;
  const data=result as {summary?:string;state?:{activeId?:string;data?:{name?:string;souls?:unknown[];heroes?:unknown[]}};activeId?:string;data?:{name?:string;souls?:unknown[];heroes?:unknown[]};checked?:number;results?:unknown[];warnings?:string[];teams?:unknown[]}|undefined;
  const savedState=data?.state??data;const doc=savedState?.data;
  const failed=error!==undefined;
  const retain=!failed&&results.has(previous.operation)&&new TextEncoder().encode(JSON.stringify(result)??'').byteLength<=2_000_000;
  const job:Job={...previous,...(doc?{profileId:savedState?.activeId,profileName:doc.name,version:'本次保存的档案'}:{}),status:failed?'failed':'done',finishedAt:new Date().toISOString(),elapsed:Date.now()-Date.parse(previous.createdAt),
    error:failed?String(error instanceof Error?error.message:error):undefined,
    summary:failed?'操作未完成':data?.summary??(doc?`已保存 ${doc.souls?.length??0} 枚御魂、${doc.heroes?.length??0} 条式神记录${data?.warnings?.length?`；${data.warnings.length} 条读取说明`:''}`:data?.checked!==undefined?`检查 ${data.checked.toLocaleString('zh-CN')} 个完整候选`:'操作已完成'),
    result:retain?structuredClone(result):undefined,resultOmitted:!failed&&results.has(previous.operation)&&!retain};
  const all=journal.tasks.map(j=>j.id===id?job:j);let ended=0;
  publish({tasks:all.filter(j=>j.status==='running'||++ended<=50)});
  queue(`task:${id}`,'activity_put',{kind:'task',record:job});
}
export function addNotice(title:string,category:Notice['category']){
  const record:Notice={id:crypto.randomUUID(),title,category,createdAt:new Date().toISOString(),read:false,hidden:false,...context};
  publish({notices:[record,...journal.notices].slice(0,100)});queue(`notice:${record.id}`,'activity_put',{kind:'notice',record});
}
export function updateNotices(ids:string[],changes:Partial<Pick<Notice,'read'|'hidden'>>){
  const selected=new Set(ids);publish({notices:journal.notices.map(n=>selected.has(n.id)?{...n,...changes}:n)});
  for(const id of ids){const record=journal.notices.find(n=>n.id===id);if(record)queue(`notice:${id}`,'activity_put',{kind:'notice',record});}
}
