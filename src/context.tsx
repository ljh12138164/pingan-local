import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { execute } from './api';
import type { AppState, Document, Snapshot } from './types';
import { setSnapshotScope } from './snapshotScope';
import { addNotice, loadActivity, setActivityContext } from './activityJournal';

interface AppContext {
  state: AppState | null; busy: boolean; connectionError: string;
  history: Snapshot | null; historyLoading: boolean;
  selectSnapshot: (id: string) => Promise<void>;
  run: <T>(operation: string, input?: unknown) => Promise<T | undefined>;
  mutate: (operation: string, input?: unknown) => Promise<AppState | undefined>;
  refresh: () => Promise<void>; setState: (state: AppState) => void;
  notify: (message: string, error?: boolean, category?: 'reminder') => void;
  saveData: (data: Document) => Promise<AppState | undefined>;
}
const Context = createContext<AppContext | null>(null);
export function Provider({ children }: { children: ReactNode }) {
  const [liveState, updateState] = useState<AppState | null>(null);
  const [preview, updatePreview] = useState<{ snapshot: Snapshot; data: Document } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const request = useRef(0); const live = useRef(liveState); live.current = liveState;
  const state = useMemo(() => liveState && preview?.snapshot.profileId === liveState.activeId ? { ...liveState, data: preview.data, profiles: liveState.profiles.map(p => p.id === liveState.activeId ? { ...p, name: preview.data.name, updatedAt: preview.snapshot.createdAt, soulCount: preview.data.souls.length } : p) } : liveState, [liveState, preview]);
  useEffect(()=>{const profile=state?.profiles.find(p=>p.id===state.activeId);const stamp=(value:string)=>new Date(value).toLocaleString('zh-CN');setActivityContext({profileId:profile?.id,profileName:profile?.name,snapshotId:preview?.snapshot.id,version:preview?`历史版本 · ${preview.snapshot.name} · ${stamp(preview.snapshot.createdAt)}`:profile?.updatedAt?`当前档案 · ${stamp(profile.updatedAt)}`:'当前档案'});},[state?.activeId,state?.profiles,preview]);
  useEffect(()=>{void loadActivity();},[]);
  const clearPreview = useCallback(() => { request.current++; setSnapshotScope(null); updatePreview(null); setHistoryLoading(false); }, []);
  const setState = useCallback((next: AppState) => { if (live.current?.activeId !== next.activeId) clearPreview(); live.current = next; updateState(next); }, [clearPreview]);
  const [pending, setPending] = useState(0);
  const [connectionError, setConnectionError] = useState('');
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((message: string, error = false, category?: 'reminder') => {
    if(error||category)addNotice(message,error?'error':'reminder');
    clearTimeout(timer.current); setToast({ message, error }); timer.current = setTimeout(() => setToast(null), error ? 9000 : 4000);
  }, []);
  const selectSnapshot = useCallback(async (id: string) => {
    const ticket = ++request.current;
    if (!id) { clearPreview(); return; }
    const snapshot = live.current?.snapshots.find(s => s.id === id && s.profileId === live.current?.activeId);
    if (!snapshot) { setHistoryLoading(false); notify('未找到当前角色的历史版本', true); return; }
    setHistoryLoading(true);
    try {
      const data = await execute<Document>('get_snapshot', { id: snapshot.profileId, snapshotId: id });
      if (ticket !== request.current || live.current?.activeId !== snapshot.profileId) return;
      setSnapshotScope({ profileId: snapshot.profileId, snapshotId: id }); updatePreview({ snapshot, data });
    } catch (error) { if (ticket === request.current) notify(String(error instanceof Error ? error.message : error), true); }
    finally { if (ticket === request.current) setHistoryLoading(false); }
  }, [clearPreview, notify]);
  const run = useCallback(async <T,>(operation: string, input: unknown = {}): Promise<T | undefined> => {
    setPending(n => n + 1);
    try { return await execute<T>(operation, input); }
    catch (e) { notify(String(e instanceof Error ? e.message : e), true); return undefined; }
    finally { setPending(n => n - 1); }
  }, [notify]);
  const mutate = useCallback(async (operation: string, input: unknown = {}) => {
    const next = await run<AppState>(operation, input); if (next) { setState(next); notify('已保存到本机'); } return next;
  }, [run, notify, setState]);
  const refresh = useCallback(async () => {
    setPending(n => n + 1);
    try { const next = await execute<AppState>('bootstrap'); setState(next); setConnectionError(''); }
    catch (e) { setConnectionError(String(e instanceof Error ? e.message : e)); }
    finally { setPending(n => n - 1); }
  }, [setState]);
  useEffect(() => { void refresh(); return () => { clearTimeout(timer.current); request.current++; setSnapshotScope(null); }; }, [refresh]);
  const calendarDay = useRef(new Date().toLocaleDateString());
  useEffect(() => { const interval = setInterval(() => { const current = new Date().toLocaleDateString(); if (pending === 0 && calendarDay.current !== current) { calendarDay.current = current; void refresh(); } }, 30000); return () => clearInterval(interval); }, [pending, refresh]);
  const saveData = (data: Document) => mutate('save_document', { id: state?.activeId, data });
  return <Context.Provider value={{ state, history: preview?.snapshot ?? null, historyLoading, selectSnapshot, busy: pending > 0 || historyLoading, connectionError, run, mutate, refresh, setState, notify, saveData }}>
    {children}
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}><span>{toast.message}</span><button aria-label="关闭提示" onClick={() => setToast(null)}>×</button></div>}
  </Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value) throw new Error('Provider missing'); return value; }
