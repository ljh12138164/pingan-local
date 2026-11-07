import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Bell, Check, CheckCheck, CircleAlert, ClipboardList, Download, LoaderCircle, X } from 'lucide-react';
import { download } from './api';
import { getActivity, loadActivity, retryActivity, subscribeActivity, updateNotices, type Job } from './activityJournal';
import { useApp } from './context';
import './activity.css';

const time=(value:string)=>new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const duration=(ms:number)=>ms<1000?'不足 1 秒':ms<60000?`${Math.floor(ms/1000)} 秒`:`${Math.floor(ms/60000)} 分 ${Math.floor(ms%60000/1000)} 秒`;
export default function ActivityCenter(){
  const journal=useSyncExternalStore(subscribeActivity,getActivity);const {notify}=useApp();
  const [open,setOpen]=useState<'task'|'notice'|null>(null);const [filter,setFilter]=useState('all');const [unread,setUnread]=useState(false);
  const [undo,setUndo]=useState<string[]>([]);const [now,setNow]=useState(Date.now());
  const panel=useRef<HTMLElement>(null);const trigger=useRef<HTMLButtonElement|null>(null);const launchers=useRef<HTMLDivElement>(null);
  const running=journal.tasks.filter(j=>j.status==='running').length;
  const notices=journal.notices.filter(n=>!n.hidden);const unreadCount=notices.filter(n=>!n.read).length;
  const close=(restore=true)=>{setOpen(null);if(restore)trigger.current?.focus();};
  useEffect(()=>{if(!running)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[running]);
  useEffect(()=>{if(!open)return;panel.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close();}};const outside=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node)&&!launchers.current?.contains(e.target as Node))close(false);};window.addEventListener('keydown',key);window.addEventListener('pointerdown',outside);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',outside);};},[open]);
  const toggle=(kind:'task'|'notice',button:HTMLButtonElement)=>{trigger.current=button;setOpen(current=>current===kind?null:kind);};
  const exportResult=async(job:Job)=>{try{if(await download(`${job.title}-${job.id.slice(0,8)}.json`,JSON.stringify({schema:'pingan-analysis-report/1',...job},null,2)))notify('已导出这次任务的原始计算结果');}catch(e){notify(String(e),true);}};
  const filtered=journal.notices.filter(n=>(filter==='cleared'?n.hidden:!n.hidden&&(filter==='all'||filter===n.category))&&(!unread||!n.read));
  return <><div className="activity-launchers" ref={launchers}>
    <button aria-label={`打开任务中心${running?`，${running} 项进行中`:''}`} aria-expanded={open==='task'} aria-controls="activity-center" onClick={e=>toggle('task',e.currentTarget)}><ClipboardList size={18}/><span>任务</span>{running>0&&<b>{running}</b>}</button>
    <button aria-label={`打开通知中心${unreadCount?`，${unreadCount} 条未读`:''}`} aria-expanded={open==='notice'} aria-controls="activity-center" onClick={e=>toggle('notice',e.currentTarget)}><Bell size={18}/><span>通知</span>{unreadCount>0&&<b>{unreadCount}</b>}</button>
  </div>{open&&<section className="activity-panel" id="activity-center" ref={panel} role="region" aria-labelledby="activity-title" tabIndex={-1}>
    <header><h2 id="activity-title">{open==='task'?'任务中心':'通知中心'}</h2><button className="icon-button" aria-label="关闭任务与通知面板" onClick={()=>close()}><X size={19}/></button></header>
    <p className="activity-intro">{open==='task'?'运行中任务仅在本次会话显示，最近 50 项已结束任务保存在本机。':'保留最近 100 条错误与到期提醒。提醒依据已读取的游戏缓存，应用需保持运行。'}</p>
    {journal.syncError&&<div className="activity-sync" role="alert"><p>{journal.syncError}</p><button onClick={()=>{void(journal.loaded?retryActivity():loadActivity());}}>重新保存 / 载入</button></div>}
    {!journal.loaded&&!journal.syncError&&<p className="activity-loading" role="status">正在载入本地记录…</p>}
    {open==='task'?<div className="activity-list" aria-label="后台任务列表">{journal.tasks.length?journal.tasks.map(job=><article className={`activity-job status-${job.status}`} key={job.id}>
      <div className="activity-row"><h3>{job.status==='running'?<LoaderCircle size={17} className="spin"/>:job.status==='failed'?<CircleAlert size={17}/>:<Check size={17}/>} {job.title}</h3><span className="activity-status">{{running:'进行中',done:'已完成',failed:'失败'}[job.status]}</span></div>
      <p className="activity-meta">{job.profileName??'未选择角色'} · {time(job.createdAt)} · {duration(job.status==='running'?Math.max(0,now-Date.parse(job.createdAt)):job.elapsed??0)}</p>
      <p className="activity-version">{job.version}</p>
      {job.status==='running'?<p>正在处理，可切换页面查看其他数据。请保持应用运行。</p>:<><p>{job.summary}</p>{job.error&&<p className="activity-error">{job.error}</p>}{job.resultOmitted&&<p className="activity-meta">结果超过 2 MB，未保留副本。请在原页面导出。</p>}
      <div className="activity-actions">{job.result!==undefined&&<button onClick={()=>void exportResult(job)}><Download size={15}/>导出本次结果</button>}<a href={`#${job.route}`} onClick={()=>close(false)}>打开相关页面</a></div></>}
    </article>):<div className="activity-empty"><ClipboardList size={26}/><h3>暂无后台任务</h3><p>读取角色、执行配装或一速计算后，可在这里查看进度和结果。</p><a href="#optimizer" onClick={()=>close(false)}>前往面板计算</a></div>}</div>:<>
      <div className="activity-filters"><label>分类<select aria-label="通知分类" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部</option><option value="reminder">到期提醒</option><option value="error">错误</option><option value="cleared">已清空</option></select></label><label className="check"><input type="checkbox" checked={unread} onChange={e=>setUnread(e.target.checked)}/>仅未读</label></div>
      <div className="activity-toolbar"><button disabled={!unreadCount} onClick={()=>updateNotices(notices.filter(n=>!n.read).map(n=>n.id),{read:true})}><CheckCheck size={15}/>全部已读</button><button disabled={!notices.length} onClick={()=>{const ids=notices.map(n=>n.id);setUndo(ids);updateNotices(ids,{hidden:true});}}>清空消息</button>{undo.length>0&&<button onClick={()=>{updateNotices(undo,{hidden:false});setUndo([]);}}>撤销清空</button>}</div>
      <div className="activity-list" aria-label="通知列表">{filtered.length?filtered.map(item=><article className={`activity-notice ${item.read?'is-read':''}`} key={item.id}><div className="activity-row"><span className="activity-status">{item.category==='error'?'操作错误':'到期提醒'}{!item.read?' · 未读':''}</span><time dateTime={item.createdAt}>{time(item.createdAt)}</time></div><p>{item.title}</p><div className="activity-row"><span className="activity-meta">{item.profileName??'本机应用'}</span>{item.hidden?<button onClick={()=>updateNotices([item.id],{hidden:false})}>恢复消息</button>:!item.read&&<button onClick={()=>updateNotices([item.id],{read:true})}>标为已读</button>}</div></article>):<div className="activity-empty"><Bell size={26}/><h3>{filter==='cleared'?'没有已清空的通知':notices.length?'没有符合条件的通知':'暂无通知'}</h3><p>{notices.length?'调整分类或取消“仅未读”查看其他消息。':'结界、寄养或绘卷到期提醒，以及操作错误，会保存在这里。'}</p></div>}</div>
    </>}
    {journal.saving>0&&!journal.syncError&&<p className="activity-saving" role="status">正在保存 {journal.saving} 条记录…</p>}
  </section>}</>;
}
