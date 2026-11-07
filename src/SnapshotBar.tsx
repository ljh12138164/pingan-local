import { useApp } from './context';
import { date } from './types';
import './snapshot.css';

export default function SnapshotBar() {
  const { state, busy, history, historyLoading, selectSnapshot } = useApp();
  const versions = state?.snapshots.filter(s => s.profileId === state.activeId) ?? [];
  return <section className={`versionbar ${history ? 'is-historical' : ''}`} aria-label="档案版本">
    <label htmlFor="workspace-version">数据版本</label>
    <select id="workspace-version" value={history?.id ?? ''} disabled={busy || !state?.data} onChange={e => void selectSnapshot(e.target.value)}>
      <option value="">当前档案 · 最新</option>
      {versions.map(s => <option key={s.id} value={s.id}>{date(s.createdAt)} · {s.name}</option>)}
    </select>
    {historyLoading ? <span role="status">正在读取历史版本…</span> : history ? <><p role="status">只读历史：本角色各页与计算使用此版本。其他角色、评分标准和本地偏好使用当前记录；修改、游戏读取和提醒已暂停。</p><button onClick={() => void selectSnapshot('')}>回到当前档案</button></> : <small>选择历史版本可跨页分析，保留当前档案。</small>}
  </section>;
}
