import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ListChecks, Plus, Settings2, Trash2 } from 'lucide-react';
import { execute } from '../api';
import { useApp } from '../context';
import { Badge, Empty, NeedData, PageTitle } from '../components';
import GameImage from '../GameImage';
import RuntimeRefresh from '../RuntimeRefresh';
import { routines, routineAvailable, routineProgress, type Routine, type TaskSnapshot } from '../taskBoard';
import { date, type Document, type Profile } from '../types';
import RealmStatus from './RealmStatus';

interface BoardSettings { hidden: string[]; order: string[] }
interface Archive { profile: Profile; data: Document }
const defaults: BoardSettings = { hidden: [], order: routines.map(r => r.id) };
export default function TaskBoard() {
  const { state, busy: pending, mutate, saveData , history } = useApp(); const busy = pending || !!history;
  const [period, setPeriod] = useState<'日常' | '每周'>('日常'); const [multi, setMulti] = useState(false); const [configuring, setConfiguring] = useState(false);
  const [name, setName] = useState(''); const [filter, setFilter] = useState('all'); const [archives, setArchives] = useState<Archive[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [revision, setRevision] = useState(0);
  const data = state?.data; const profileId = state?.activeId ?? '';
  const settings = state?.settings.taskBoards as Record<string, BoardSettings> | undefined;
  const board = settings?.[profileId] ?? defaults;
  const profileKey = state?.profiles.map(p => `${p.id}:${p.updatedAt}`).join('|');
  useEffect(() => {
    if (!multi || !state) return;
    let valid = true; setLoading(true); setError('');
    void Promise.all(state.profiles.map(async profile => ({ profile, data: (await execute<{ data: Document }>('export_document', { id: profile.id })).data }))).then(rows => { if (valid) setArchives(rows); }).catch(e => { if (valid) setError(String(e)); }).finally(() => { if (valid) setLoading(false); });
    return () => { valid = false; };
  }, [multi, profileKey, revision]);
  const all = useMemo(() => {
    const custom: Routine[] = (data?.tasks ?? []).filter(t => !t.id.startsWith('routine:') && t.category === period).map(t => ({ id: t.id, name: t.name, category: period }));
    const entries = [...routines.filter(r => r.category === period), ...custom];
    return entries.sort((a, b) => { const ai = board.order.indexOf(a.id), bi = board.order.indexOf(b.id); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); });
  }, [data?.tasks, period, board.order]);
  const checked = (document: Document, routine: Routine) => document.tasks.find(t => t.id === (routines.some(r => r.id === routine.id) ? `routine:${routine.id}` : routine.id))?.done === true;
  const shown = all.filter(r => !board.hidden.includes(r.id) && (!data || routineAvailable(data, r.id)));
  const complete = shown.filter(r => data && checked(data, r)).length;
  const rows = shown.filter(r => filter === 'all' || !!data && checked(data, r) === (filter === 'done'));
  const tableRows: (Routine & { owner?: string })[] = [...routines.filter(r => r.category === period), ...archives.flatMap(a => a.data.tasks.filter(t => !t.id.startsWith('routine:') && t.category === period).map(t => ({ ...t, category: period, owner: a.profile.id })))].filter(r => archives.some(a => (!('owner' in r) || r.owner === a.profile.id) && !(settings?.[a.profile.id] ?? defaults).hidden.includes(r.id) && routineAvailable(a.data, r.id) && (filter === 'all' || checked(a.data, r) === (filter === 'done'))));
  async function saveBoard(next: BoardSettings) { await mutate('save_settings', { ...state?.settings, taskBoards: { ...settings, [profileId]: next } }); }
  function move(id: string, delta: number) {
    const order = all.map(r => r.id); const index = order.indexOf(id), next = index + delta;
    if (next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]]; void saveBoard({ ...board, order: [...order, ...board.order.filter(key => !order.includes(key))] });
  }
  async function toggle(document: Document, id: string, routine: Routine) {
    const taskId = routines.some(r => r.id === routine.id) ? `routine:${routine.id}` : routine.id;
    const task = document.tasks.find(t => t.id === taskId);
    if (!task && !routines.some(r => r.id === routine.id)) return;
    await mutate('set_task_done', { id, taskId, name: routine.name, category: routine.category, done: !task?.done });
  }
  async function addTask(e: React.FormEvent) {
    e.preventDefault(); if (!data || !name.trim()) return;
    if (await saveData({ ...data, tasks: [...data.tasks, { id: `task-${Date.now()}`, name: name.trim(), category: period, done: false }] })) setName('');
  }
  const facts = (data?.extras?.taskSnapshot as TaskSnapshot | undefined)?.facts ?? data?.extras?.taskFacts as TaskSnapshot['facts'];
  const expired = data ? routineProgress(data, 'prayer').expired : true;
  function status(document: Document, routine: Routine) {
    if (!routines.some(r => r.id === routine.id)) return <small>本地自定义任务</small>;
    const progress = routineProgress(document, routine.id);
    return <><small>{progress.expired ? '游戏快照已过期，请重新读取' : progress.current === null ? '游戏进度未读取' : `游戏进度 ${progress.current} / ${progress.target}`}</small>{progress.current !== null && progress.target !== null && <Badge tone={progress.current >= progress.target ? 'green' : 'amber'}>{progress.current >= progress.target ? '进度达标' : '进行中'}</Badge>}</>;
  }
  return <div className="task-board"><PageTitle title="任务记录" description="每日清单、每周待办与多角色记录；手动勾选保存在本机。" actions={<RuntimeRefresh compact />} /><NeedData>
    <div className="task-toolbar"><nav className="roster-views" aria-label="任务周期">{(['日常', '每周'] as const).map(p => <button key={p} aria-current={period === p ? 'page' : undefined} onClick={() => { setPeriod(p); setFilter('all'); }}>{p === '日常' ? '每日任务' : '每周任务'}</button>)}</nav><div className="row"><div className="roster-chips" role="group" aria-label="任务展示模式"><button aria-pressed={!multi} onClick={() => setMulti(false)}>单号模式</button><button aria-pressed={multi} onClick={() => setMulti(true)}>多号模式</button></div><button aria-expanded={configuring} onClick={() => setConfiguring(!configuring)}><Settings2 size={16} />任务配置</button></div></div>
    {configuring && <section className="sheet padded task-config" aria-label="任务监控设置"><div className="section-title"><h2>当前角色的任务配置</h2><button disabled={busy} onClick={() => void saveBoard(defaults)}>恢复默认</button></div><p className="fineprint">隐藏的任务不参与完成率统计；顺序和显示状态按角色分别保存。首领退治仅在已读取配置的开放日显示。</p><div className="row"><button disabled={busy} onClick={() => void saveBoard({ ...board, hidden: board.hidden.filter(id => !all.some(r => r.id === id)) })}>本类全开</button><button disabled={busy} onClick={() => void saveBoard({ ...board, hidden: [...new Set([...board.hidden, ...all.map(r => r.id)])] })}>本类全关</button></div><div className="task-config-list">{all.map((r, i) => <div key={r.id}><label><input type="checkbox" disabled={busy} checked={!board.hidden.includes(r.id)} onChange={e => void saveBoard({ ...board, hidden: e.target.checked ? board.hidden.filter(id => id !== r.id) : [...board.hidden, r.id] })} />{r.name}</label><button aria-label={`上移${r.name}`} disabled={busy || i === 0} onClick={() => move(r.id, -1)}><ArrowUp size={14} /></button><button aria-label={`下移${r.name}`} disabled={busy || i === all.length - 1} onClick={() => move(r.id, 1)}><ArrowDown size={14} /></button></div>)}</div></section>}
    <section className="sheet padded"><div className="section-title"><h2>{period === '日常' ? '今日清单' : '本周清单'}</h2><span>{multi ? '当前角色手动完成' : '手动完成'} {complete} / {shown.length}</span></div><div className="row"><label className="field">完成状态<select aria-label="任务完成筛选" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部任务</option><option value="todo">未勾选</option><option value="done">已勾选</option></select></label><form className="inline-form grow" onSubmit={e => void addTask(e)}><label className="field grow">新增{period === '日常' ? '每日' : '每周'}待办<input aria-label="新增任务名称" value={name} maxLength={200} required onChange={e => setName(e.target.value)} placeholder="输入任务名称" /></label><button disabled={busy} type="submit"><Plus size={15} />添加</button></form></div><p className="fineprint">勾选仅代表你的本地记录，不会在游戏中领取奖励。游戏进度与手动完成分别显示；日常在本机次日、每周在周一重置。</p></section>
    {multi ? <section className="sheet task-multi" aria-label="多角色任务清单">{loading ? <p className="padded" role="status">正在读取各角色任务…</p> : error ? <div className="padded" role="alert"><p>{error}</p><button onClick={() => setRevision(n => n + 1)}>重新读取</button></div> : <div className="table-scroll"><table><thead><tr><th>任务</th>{archives.map(a => <th key={a.profile.id}>{a.profile.name}{a.profile.source === 'demo' && '（演示）'}<small>{date(a.profile.updatedAt)}</small></th>)}</tr></thead><tbody>{tableRows.map(r => <tr key={`${r.owner ?? 'routine'}:${r.id}`}><th>{r.name}{r.owner && <small>{archives.find(a => a.profile.id === r.owner)?.profile.name}的待办</small>}</th>{archives.map(a => <td key={a.profile.id}>{r.owner && r.owner !== a.profile.id ? <span className="muted">不适用</span> : (settings?.[a.profile.id] ?? defaults).hidden.includes(r.id) ? <span className="muted">此角色已隐藏</span> : !routineAvailable(a.data, r.id) ? <span className="muted">今日未开放</span> : <><label><input type="checkbox" disabled={busy} checked={checked(a.data, r)} aria-label={`${a.profile.name}：${r.name}`} onChange={() => void toggle(a.data, a.profile.id, r)} />手动完成</label>{status(a.data, r)}</>}</td>)}</tr>)}</tbody></table></div>}</section> : <div className="task-card-grid">{data && rows.map(r => <article key={r.id} className={checked(data, r) ? 'is-complete' : ''}><label className="task-card-check"><input type="checkbox" disabled={busy} checked={checked(data, r)} aria-label={`完成${r.name}`} onChange={() => void toggle(data, profileId, r)} /><span>{checked(data, r) ? '手动已完成' : '标记完成'}</span></label><div className="task-card-body">{r.icon ? <GameImage kind="currency" id={r.icon} name={r.name} /> : <ListChecks size={32} strokeWidth={1.3} />}<div><h3>{r.name}</h3>{status(data, r)}{r.note && <p>{r.note}</p>}</div></div>{!routines.some(row => row.id === r.id) && <button className="task-remove text" aria-label={`删除${r.name}`} disabled={busy} onClick={() => void saveData({ ...data, tasks: data.tasks.filter(t => t.id !== r.id) })}><Trash2 size={14} />删除</button>}</article>)}</div>}
    {!(multi ? tableRows : rows).length && !loading && !error && <Empty title={shown.length ? '这个分类下没有匹配任务' : period === '每周' ? '还没有每周待办' : '当前任务已全部隐藏'}><p>{period === '每周' ? '添加每周要完成的事，周一会自动重置勾选状态。' : '可在任务配置中重新显示任务。'}</p></Empty>}
    <div className="task-footer"><span><Check size={16} />{new Date().toLocaleDateString('zh-CN')} · {multi ? '当前角色手动完成' : '手动完成'} {complete} / {shown.length}</span><button disabled={busy || !complete || !data} onClick={() => { if (data) void saveData({ ...data, tasks: data.tasks.map(t => shown.some(r => t.id === r.id || t.id === `routine:${r.id}`) ? { ...t, done: false } : t) }); }}>清空本类手动勾选</button></div>
    {data && <details className="sheet padded"><summary>结界与寄养计时</summary><RealmStatus data={data} /><a className="button" href="#realm-cards">查看结界与寄养详情</a></details>}
    <details className="sheet padded"><summary>游戏原始任务进度 · {facts?.length ?? 0} 项</summary><p className="fineprint">{expired ? '游戏任务快照已过期；下列数值仅为历史进度，请重新读取。' : '以下进度来自游戏快照。条件达标与领取奖励分别判断。'}</p>{facts?.length ? <div className="table-scroll"><table><thead><tr><th>任务</th><th>进度</th><th>快照状态</th></tr></thead><tbody>{facts.map(f => <tr key={f.id}><td>{f.name} <small>#{f.id}</small></td><td>{f.current ?? '未读取'} / {f.target ?? '未知'}</td><td>{expired ? '已过期' : f.completed === null ? '目标未知' : f.completed ? '条件达标' : '进行中'}</td></tr>)}</tbody></table></div> : <p className="muted">本次快照没有游戏任务进度记录。</p>}</details>
    </NeedData></div>;
}
