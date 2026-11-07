import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useApp } from './context';
import type { AppState } from './types';

export default function RuntimeRefresh({ compact = false, disabled = false }: { compact?: boolean; disabled?: boolean }) {
  const { state, busy, run, setState, history } = useApp(); const [automatic, setAutomatic] = useState(false); const inFlight = useRef(false); const currentId = useRef(state?.activeId); currentId.current = state?.activeId;
  const capture = state?.data?.extras?.capture as { reader?: { pid?: number } } | undefined;
  const realm = state?.data?.extras?.realmStatus as { pid?: number } | undefined;
  const pid = realm?.pid ?? capture?.reader?.pid; const id = state?.activeId;
  const connected = !!pid && state?.profiles.find(p => p.id === id)?.source.startsWith('game:');
  const refresh = useCallback(async () => {
    if (history || !id || !pid || inFlight.current) return; inFlight.current = true;
    try { const next = await run<AppState>('refresh_runtime', { id, pid }); if (currentId.current !== id) return; if (next) setState(next); else setAutomatic(false); }
    finally { inFlight.current = false; }
  }, [id, pid, run, setState, history]);
  useEffect(() => { setAutomatic(false); }, [id]);
  useEffect(() => { if (history || !automatic || !connected) return; const timer = setInterval(() => { void refresh(); }, 15000); return () => clearInterval(timer); }, [automatic, connected, refresh, history]);
  return <div className="row wrap"><button className={compact ? 'primary' : ''} disabled={disabled || busy || !!history || !connected} title={!connected ? '先从数据读取页读取游戏角色' : '只更新任务、寮、结界与绘卷缓存，不新增档案'} onClick={() => void refresh()}><RefreshCw size={16} />{compact ? '刷新任务与结界卡' : '刷新游戏缓存'}</button>{!compact && <><label className="row"><input type="checkbox" checked={automatic} disabled={!!history || !connected} onChange={e => { setAutomatic(e.target.checked); if (e.target.checked) void refresh(); }} />每 15 秒刷新</label>{!connected && <span className="muted">先从数据读取页读取游戏角色</span>}</>}</div>;
}
