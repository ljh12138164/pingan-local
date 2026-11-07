import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Bell, BellOff, BookOpen, Boxes, Moon, Search, Settings2, Sun, Timer, Trophy, Users, UserRound } from 'lucide-react';
import { useApp } from '../context';
import { ExportButton, IntroEmpty } from '../components';
import RuntimeRefresh from '../RuntimeRefresh';
import RealmStatus from './RealmStatus';
import Widgets from './Widgets';
import GameImage from '../GameImage';
import { date, number } from '../types';

const panels = [{ id: 'profile', name: '游戏档案' }, { id: 'realm', name: '结界卡计时' }, { id: 'tasks', name: '本地待办' }, { id: 'guild', name: '寮情报' }, { id: 'tools', name: '工具展柜' }] as const;
interface Layout { order: string[]; hidden: string[] }
const defaults: Layout = { order: panels.map(p => p.id), hidden: [] };
function readLayout(value: unknown): Layout {
  const saved = value as Partial<Layout> | undefined; const known = new Set<string>(panels.map(p => p.id));
  const order = Array.isArray(saved?.order) ? [...new Set(saved.order.filter(id => known.has(id)))] : [];
  return { order: [...order, ...defaults.order.filter(id => !order.includes(id))], hidden: Array.isArray(saved?.hidden) ? saved.hidden.filter(id => known.has(id)) : [] };
}
const compactAmount = (value: number | undefined) => value === undefined ? '未读取' : value >= 100000000 ? `${number(value / 100000000)} 亿` : value >= 100000 ? `${number(value / 10000)} 万` : number(value, 0);

export default function Dashboard() {
  const { state, busy, mutate, history, historyLoading: loadingPreview, selectSnapshot: selectVersion } = useApp();
  const [query, setQuery] = useState(''); const [editing, setEditing] = useState(false);
  const layout = readLayout(state?.settings.courtyard); const [draft, setDraft] = useState<Layout>(layout);
  const snapshotId = history?.id ?? ""; const data = state?.data; const historical = !!history;
  const profile = state?.profiles.find(p => p.id === state.activeId);
  const versions = state?.snapshots.filter(s => s.profileId === state.activeId) ?? [];
  const player = data?.extras?.capture as { player?: { _name?: string; level?: number; server_id?: number; pvp_score?: number } } | undefined;
  const guild = data?.extras?.guildSnapshot as { name?: string | null; level?: number | null; expectedCount?: number | null; members?: { id: string; name: string; weekly: number | null }[] | null; capturedAt?: string } | undefined;
  const resource = (name: string) => data?.resources.find(r => r.name === name || r.name.startsWith(`${name} · #`))?.amount;
  const materials = data?.extras?.heroMaterials as { total?: number } | undefined;
  const resourceFacts = data?.extras?.resourceDetails as Record<string, { type: number }> | undefined;
  const skins = resourceFacts ? data?.resources.filter(r => [41, 905].includes(resourceFacts[r.name.match(/ · #(\d+)$/)?.[1] ?? '']?.type)).length : undefined;
  const skinIcon = data?.resources.find(r => resourceFacts?.[r.name.match(/ · #(\d+)$/)?.[1] ?? '']?.type === 905)?.name.match(/ · #(\d+)$/)?.[1];
  const server = player?.player?.server_id;
  function move(id: string, delta: number) {
    const order = [...draft.order]; const index = order.indexOf(id); const next = index + delta;
    if (next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]]; setDraft({ ...draft, order });
  }
  function panel(id: string, content: ReactNode, action?: ReactNode) {
    return <section key={id} className={`courtyard-panel courtyard-${id}`} aria-label={panels.find(p => p.id === id)?.name}><div className="courtyard-panel-heading"><h2>{panels.find(p => p.id === id)?.name}</h2>{action}</div>{content}</section>;
  }
  const rendered: Record<string, ReactNode> = data ? {
    profile: panel('profile', <>
      <div className="courtyard-identity"><span className="courtyard-avatar" role="img" aria-label="角色头像资源尚未解析"><UserRound size={36} strokeWidth={1.1} /></span><div><h3>{player?.player?._name || data.name}</h3><p>{server ? state?.serverNames?.[String(server)] ?? `区服 #${server}` : profile?.source === 'demo' ? '演示档案' : '本地档案'}{player?.player?.level !== undefined ? ` · Lv.${player.player.level}` : ''}</p></div></div>
      <div className="courtyard-counts"><a href="#inventory"><Boxes size={27} strokeWidth={1.2} /><div><strong>{number(data.souls.length, 0)}</strong><span>御魂</span></div></a><a href="#heroes" title={`培养记录 ${data.heroes.length} 条${materials?.total !== undefined ? `，仓库素材 ${materials.total} 个` : '，仓库素材未读取'}`}><BookOpen size={27} strokeWidth={1.2} /><div><strong>{number(data.heroes.length + (materials?.total ?? 0), 0)}</strong><span>{materials?.total !== undefined ? '式神（含仓库素材）' : '式神培养记录'}</span></div></a></div>
      <dl className="courtyard-resources">{[
        { name: '斗技分', amount: player?.player?.pvp_score, id: undefined }, { name: '皮肤', amount: skins, id: skinIcon },
        { name: '勾玉', amount: resource('勾玉'), id: '900002' }, { name: '体力', amount: resource('体力'), id: '900003' },
        { name: '蓝票', amount: resource('神秘的符咒'), id: '490001' }, { name: '金币', amount: resource('金币'), id: '900001' },
      ].map(row => <div key={row.name}><dt>{row.id ? <GameImage kind="currency" id={row.id} name={row.name} /> : <Trophy size={22} />}{row.name}</dt><dd>{compactAmount(row.amount)}</dd></div>)}</dl>
      <div className="courtyard-panel-footer"><small>{historical ? `历史快照 · ${date(versions.find(v => v.id === snapshotId)?.createdAt ?? '')}` : `档案更新 ${profile ? date(profile.updatedAt) : '未知'}`}</small><a href="#archives">角色档案<ArrowRight size={14} /></a></div>
    </>),
    realm: panel('realm', <><RealmStatus compact data={data} /><div className="courtyard-realm-actions"><a className="button" href="#realm-cards">查看结界与寄养详情</a><button disabled={busy || historical} onClick={() => void mutate('save_settings', { ...state?.settings, realmReminders: state?.settings.realmReminders !== true })}>{state?.settings.realmReminders === true ? <BellOff size={16} /> : <Bell size={16} />}{state?.settings.realmReminders === true ? '关闭到期提醒' : '开启到期提醒'}</button></div><small className="courtyard-reminder-note">{state?.settings.realmReminders === true ? '应用内到期提醒已开启，程序需保持打开。' : '可提醒本次打开后到期的结界与寄养。'}</small></>, <Timer size={18} />),
    tasks: panel('tasks', <><p className="muted">本地待办 · 已完成 {data.tasks.filter(t => t.done).length} / {data.tasks.length}</p><div className="courtyard-tasks">{data.tasks.slice(0, 6).map(task => <label key={task.id}><input type="checkbox" checked={task.done} disabled={busy || historical} onChange={() => { if (!historical) void mutate('set_task_done', { id: state?.activeId, taskId: task.id, name: task.name, category: task.category, done: !task.done }); }} /><span>{task.name}</span><small>{task.category}</small></label>)}{!data.tasks.length && <p className="muted">还没有本地待办，可在任务记录中添加。</p>}</div><div className="courtyard-panel-footer"><small>游戏进度快照见任务记录</small><a href="#tasks">全部任务<ArrowRight size={14} /></a></div></>),
    guild: panel('guild', <>{guild?.name ? <><h3 className="courtyard-guild-name">{guild.name}<small>Lv.{guild.level ?? '未知'} · {guild.members?.length ?? '未读取'} / {guild.expectedCount ?? '未知'} 人</small></h3><ol className="courtyard-members">{[...(guild.members ?? [])].filter(m => m.weekly !== null).sort((a, b) => (b.weekly ?? 0) - (a.weekly ?? 0)).slice(0, 4).map(m => <li key={m.id}><span>{m.name}</span><strong>{number(m.weekly!, 0)}<small>本周功勋</small></strong></li>)}</ol></> : <p className="muted">阴阳寮缓存未读取。游戏中打开寮成员页后刷新可查看。</p>}<div className="courtyard-panel-footer"><small>{guild?.capturedAt ? `缓存 ${date(guild.capturedAt)}` : '尚无游戏寮记录'}</small><a href="#guild">寮管理<ArrowRight size={14} /></a></div></>, <Users size={18} />),
    tools: panel('tools', <><form className="courtyard-search" onSubmit={event => { event.preventDefault(); location.hash = `heroes?q=${encodeURIComponent(query)}`; }}><label className="search-input"><Search size={18} /><input aria-label="工作台查询式神" value={query} onChange={event => setQuery(event.target.value)} placeholder="式神名字、拼音或首字母" /></label><button type="submit">查询式神<ArrowRight size={15} /></button></form><div className="courtyard-shortcuts"><a href="#optimizer">面板计算与提升<ArrowRight size={15} /></a><a href="#shards">碎片查询<ArrowRight size={15} /></a><a href="#tools">概率实验与窗口工具<ArrowRight size={15} /></a><a href="#settings">功能范围与实现进度<ArrowRight size={15} /></a></div></>),
  } : {};
  return <div className="courtyard">
    <header className="courtyard-header"><div><h1>庭中有信<span className="courtyard-seal" aria-hidden="true">平<br />安</span></h1><p>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Shanghai' }).format(new Date())} · 今日事，庭中见</p></div><div className="courtyard-header-actions"><RuntimeRefresh compact disabled={historical} /><ExportButton /><button disabled={historical} aria-expanded={editing} onClick={() => { setDraft(layout); setEditing(!editing); }}><Settings2 size={16} />装修我的庭院</button></div></header>
    <div className="courtyard-toolbar"><div className="courtyard-theme" role="group" aria-label="工作台主题"><button aria-pressed={state?.settings.theme !== 'light'} onClick={() => void mutate('save_settings', { ...state?.settings, theme: 'dark' })} disabled={busy || historical}><Moon size={15} />夜庭</button><button aria-pressed={state?.settings.theme === 'light'} onClick={() => void mutate('save_settings', { ...state?.settings, theme: 'light' })} disabled={busy || historical}><Sun size={15} />晴庭</button></div><div className="courtyard-archive-controls"><label>切换角色<select aria-label="工作台当前角色" disabled={busy || !state?.profiles.length} value={state?.activeId ?? ''} onChange={e => void mutate('select_profile', { id: e.target.value })}>{!state?.profiles.length && <option value="">尚无档案</option>}{state?.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><a className="button" href="#archives">管理档案<ArrowRight size={14} /></a></div></div>
    {loadingPreview && <p role="status" className="courtyard-notice">正在读取历史快照…</p>}
    {historical && <div role="status" className="courtyard-notice">正在跨页只读预览历史快照；分析和导出使用此版本，当前档案保留。<button className="text" onClick={() => void selectVersion('')}>回到当前档案</button></div>}
    {editing && <section className="courtyard-customizer sheet padded" aria-label="庭院装修"><div className="section-title"><h2>庭院布局</h2><button className="text" onClick={() => setDraft(defaults)}>恢复默认布局</button></div><p className="muted">选择首页要展示的内容，调整顺序后保存。</p><div className="courtyard-layout-options">{draft.order.map((id, index) => <div key={id}><label><input type="checkbox" checked={!draft.hidden.includes(id)} onChange={e => setDraft({ ...draft, hidden: e.target.checked ? draft.hidden.filter(item => item !== id) : [...draft.hidden, id] })} />{panels.find(p => p.id === id)?.name}</label><button className="icon-button" aria-label={`上移${panels.find(p => p.id === id)?.name}`} disabled={index === 0} onClick={() => move(id, -1)}><ArrowUp size={16} /></button><button className="icon-button" aria-label={`下移${panels.find(p => p.id === id)?.name}`} disabled={index === draft.order.length - 1} onClick={() => move(id, 1)}><ArrowDown size={16} /></button></div>)}</div><div className="row"><button className="primary" disabled={busy} onClick={async () => { if (await mutate('save_settings', { ...state?.settings, courtyard: draft })) setEditing(false); }}>保存庭院布局</button><button onClick={() => setEditing(false)}>取消</button></div></section>}
    {!data ? <IntroEmpty /> : <><p className="courtyard-notice">本地档案已载入。刷新只更新已读取的游戏缓存；读取时间与未知数据会分别标注。</p><div className="courtyard-grid">{layout.order.filter(id => !layout.hidden.includes(id)).map(id => rendered[id])}</div>{!layout.order.some(id => !layout.hidden.includes(id)) && <p className="courtyard-notice">首页内容已全部隐藏，可从“装修我的庭院”重新显示。</p>}</>}
    <details className="courtyard-widgets"><summary>自定义组件</summary><Widgets /></details>
  </div>;
}
