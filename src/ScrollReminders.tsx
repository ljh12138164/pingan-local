import { useEffect } from 'react';
import { execute } from './api';
import { useApp } from './context';
import type { ScrollSnapshot } from './scroll';

export default function ScrollReminders() {
  const { state, notify, history }=useApp(); const profile=state?.activeId;
  const snapshot=state?.data?.extras?.scrollSnapshot as ScrollSnapshot | undefined;
  useEffect(()=>{
    if(history||!profile||!snapshot?.loaded)return;
    let cancelled=false;
    const check=async()=>{try{
      const result=await execute<{alerts:{name:string;issue:number;target:number}[]}>('evaluate_scroll_monitors',{id:profile});
      if(cancelled)return;
      if(result.alerts.length){notify(result.alerts.map(a=>`绘卷第${a.issue}期「${a.name}」已达到 ${a.target}%（游戏缓存）`).join('；'),false,'reminder');window.dispatchEvent(new Event('scroll-monitors-evaluated'));}
    }catch(error){if(!cancelled)notify(`绘卷提醒检查失败：${String(error)}`,true);}};
    void check();window.addEventListener('scroll-monitors-changed',check);
    return()=>{cancelled=true;window.removeEventListener('scroll-monitors-changed',check);};
  },[profile,snapshot?.capturedAt,snapshot?.loaded,notify,history]);
  return null;
}
