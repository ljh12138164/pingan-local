import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Search, Settings2 } from 'lucide-react';
import { useApp } from '../context';
import { csv, download } from '../api';
import { Badge, Empty } from '../components';
import RuntimeRefresh from '../RuntimeRefresh';
import { guildBaseline, guildTags, sortGuildMembers, type GameGuildMember as Member } from '../guildRoster';
import { date, number } from '../types';

interface Guild { name: string | null; level: number | null; expectedCount: number | null; funds: number | null; activeCount: number | null; pvpScore: number | null; construction: number | null; createdAt?: number | null; capturedAt: string; members: Member[] | null; creator?: string | null; declaration?: string | null; activeScore?: number | null; medals?: number | null; emblemScore?: number | null; activeRank?: number | null; pvpRank?: number | null; creviceDifficulty?: number | null; creviceCleared?: number | null; season?: number | null }
interface Preferences { daily: number; notes: Record<string, string> }
const columns: [keyof Member, string][] = [['name', '成员名称'], ['duty', '身份'], ['level', '等级'], ['joinedAt', '加入日期'], ['active', '本周寮勋'], ['weekly', '本周功勋'], ['lastWeekly', '上周功勋'], ['pvpScore', '斗技分'], ['total', '累计功勋'], ['donated', '累计勋章'], ['offlineAt', '最后在线']];
const duty = (value: number | null) => value == null ? '未知' : ({ 1: '会长', 2: '副会长', 3: '普通成员' } as Record<number, string>)[value] ?? `身份 ${value}`;
const time = (value: number | null | undefined, onlyDay = false) => value == null ? '未读取' : value === 0 ? '读取时在线' : onlyDay ? new Date(value * 1000).toLocaleDateString('zh-CN') : date(new Date(value * 1000).toISOString());
export default function GuildRoster() {
  const { state, busy, mutate, notify } = useApp();
  const guild = state?.data?.extras?.guildSnapshot as Guild | undefined;
  const [query, setQuery] = useState(''); const [tag, setTag] = useState(''); const [sort, setSort] = useState<keyof Member>('duty'); const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0); const [size, setSize] = useState(10); const [jump, setJump] = useState(''); const [rules, setRules] = useState(false); const [selected, setSelected] = useState(''); const [note, setNote] = useState('');
  const detail = useRef<HTMLElement>(null); const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selected) { detail.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); detail.current?.focus({ preventScroll: true }); } }, [selected]);
  const preferences = state?.settings.guildRosters as Record<string, Preferences> | undefined;
  const settings = preferences?.[state?.activeId ?? ''] ?? { daily: 65, notes: {} };
  const members = guild?.members ?? [];
  const baseline = guildBaseline(guild?.capturedAt ?? '', settings.daily);
  const tags = guildTags(members, baseline);
  const rows = sortGuildMembers(members.filter(m => (!query || `${m.name} ${tags[m.id]} ${settings.notes[m.id] ?? ''}`.toLowerCase().includes(query.toLowerCase())) && (!tag || tags[m.id] === tag)), sort, ascending);
  const pages = Math.max(1, Math.ceil(rows.length / size)); const current = Math.min(page, pages - 1);
  const chosen = members.find(m => m.id === selected);
  const resetPage = () => setPage(0);
  async function saveSettings(next: Preferences) { await mutate('save_settings', { ...state?.settings, guildRosters: { ...preferences, [state?.activeId ?? '']: next } }); }
  function sortBy(key: keyof Member) { if (sort === key) setAscending(!ascending); else { setSort(key); setAscending(key === 'name' || key === 'duty' || key === 'joinedAt'); } resetPage(); }
  function cell(member: Member, key: keyof Member) {
    const value = member[key];
    if (key === 'name') return <button className="text guild-member-name" onClick={() => { setSelected(member.id); setNote(settings.notes[member.id] ?? ''); }}>{member.name}<Badge tone={tags[member.id] === '顶梁柱' ? 'green' : 'neutral'}>{tags[member.id]}</Badge>{settings.notes[member.id] && <small>{settings.notes[member.id]}</small>}</button>;
    if (key === 'duty') return duty(member.duty);
    if (key === 'joinedAt' || key === 'offlineAt') return time(value as number | null, key === 'joinedAt');
    return value == null ? <span className="muted">未读取</span> : number(Number(value), 0);
  }
  async function exportMembers() {
    try { await download('寮成员名册.csv', csv([['阴阳寮', '读取时间', ...columns.map(c => c[1]), '成员标签', '本地备注'], ...rows.map(m => [guild?.name, guild?.capturedAt, ...columns.map(([key]) => key === 'duty' ? duty(m.duty) : key === 'joinedAt' || key === 'offlineAt' ? time(m[key]) : m[key]), tags[m.id], settings.notes[m.id] ?? ''])]), 'text/csv'); } catch (e) { notify(String(e), true); }
  }
  return <div className="guild-roster"><section className="sheet padded guild-overview"><div><h2>{guild?.name ?? '游戏寮成员'} <small>Lv.{guild?.level ?? '未知'}</small></h2><p>{guild?.createdAt ? `建寮于 ${time(guild.createdAt, true)}` : '建寮时间未读取'}{guild?.creator ? ` · 创建者 ${guild.creator}` : ''}</p>{guild?.declaration && <p className="guild-declaration">{guild.declaration}</p>}</div><dl>{[['成员', `${members.length} / ${guild?.expectedCount ?? '未知'}`], ['活跃成员', guild?.activeCount], ['寮资金', guild?.funds], ['建设度', guild?.construction], ['寮战积分', guild?.pvpScore]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value == null ? '未读取' : typeof value === 'number' ? number(value, 0) : value}</dd></div>)}</dl><dl className="guild-secondary">{[['寮勋', guild?.activeScore], ['累计勋章', guild?.medals], ['寮突破徽章', guild?.emblemScore], ['活跃排名', guild?.activeRank], ['寮战排名', guild?.pvpRank], ['狭间难度', guild?.creviceDifficulty], ['狭间已通关', guild?.creviceCleared], ['寮战赛季', guild?.season]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{typeof value === 'number' ? number(value, 0) : '未读取'}</dd></div>)}</dl></section>
    <section className="sheet"><div className="padded-heading"><h2>成员名册 <small>{members.length} 人</small></h2><div className="row"><RuntimeRefresh compact /><button disabled={!rows.length} onClick={() => void exportMembers()}><Download size={16} />导出名册</button></div></div>
      <div className="filters"><label className="search-input grow"><Search size={16} /><input aria-label="搜索游戏寮成员" placeholder="成员名称、标签或本地备注" value={query} onChange={e => { setQuery(e.target.value); resetPage(); }} /></label><label className="field">成员标签<select aria-label="按成员标签筛选" value={tag} onChange={e => { setTag(e.target.value); resetPage(); }}><option value="">全部标签</option>{['顶梁柱', '中坚成员', '随缘玩家', '摸鱼怪', '未读取'].map(t => <option key={t}>{t}</option>)}</select></label><button aria-expanded={rules} onClick={() => setRules(!rules)}><Settings2 size={15} />评分标准</button><span className="muted">匹配 {rows.length} 人</span></div>
      {rules && <div className="padded guild-rating"><h3>成员称号评分标准</h3><label className="field">每日寮勋基准<input aria-label="每日寮勋基准" type="number" min="1" max="10000" value={settings.daily} disabled={busy} onChange={e => { const value = Number(e.target.value); if (value > 0) void saveSettings({ ...settings, daily: value }); }} /></label><p>按快照的北京时间星期数计算：本周基准 {baseline == null ? '未知' : `${baseline} 寮勋`}。已读取寮勋的成员按本周寮勋降序、加入日期、姓名、ID 排序，前 10% 为顶梁柱；其余达到基准 80% 为中坚成员，30% 为随缘玩家，再低为摸鱼怪。</p><p className="fineprint">未读取寮勋的成员不参与排名，不按零分分类。标签只在本机计算。</p></div>}
      <p className="padded fineprint">{guild?.capturedAt ? `快照 ${date(guild.capturedAt)}。` : '尚未读取游戏寮缓存。'}在线状态代表读取时的缓存；本日／本周集体任务完成记录尚未载入时不补成零。</p>
      <div className="table-scroll" ref={list}><table className="guild-members"><thead><tr>{columns.map(([key, title]) => <th key={key} aria-sort={sort === key ? ascending ? 'ascending' : 'descending' : 'none'}><button onClick={() => sortBy(key)}>{title}{sort === key && (ascending ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th>)}</tr></thead><tbody>{rows.slice(current * size, (current + 1) * size).map(m => <tr key={m.id}>{columns.map(([key]) => <td key={key} className={['name', 'duty', 'joinedAt', 'offlineAt'].includes(key) ? '' : 'numeric'}>{cell(m, key)}</td>)}</tr>)}</tbody></table></div>
      {!rows.length && <Empty title={guild?.members ? '没有匹配的成员' : '成员缓存尚未载入'}><p>{guild?.members ? '调整名称或标签筛选后重试。' : '在游戏中打开阴阳寮成员列表，停留几秒后刷新缓存。'}</p>{(query || tag) && <button onClick={() => { setQuery(''); setTag(''); }}>清空筛选</button>}</Empty>}
      <nav className="roster-pagination" aria-label="寮成员分页"><span>{rows.length ? current * size + 1 : 0}–{Math.min(rows.length, (current + 1) * size)} / {rows.length} 条</span><label>每页<select aria-label="每页寮成员数量" value={size} onChange={e => { setSize(Number(e.target.value)); resetPage(); }}>{[10, 20, 50, 100].map(n => <option key={n}>{n}</option>)}</select></label><button disabled={!current} onClick={() => setPage(0)}>首页</button><button disabled={!current} onClick={() => setPage(current - 1)}>上一页</button><span>{current + 1} / {pages}</span><form onSubmit={e => { e.preventDefault(); if (jump) setPage(Math.max(0, Math.min(pages - 1, Number(jump) - 1))); setJump(''); }}><input aria-label="寮成员跳转页码" type="number" min="1" max={pages} value={jump} onChange={e => setJump(e.target.value)} /><button>跳转</button></form><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>下一页</button><button disabled={current + 1 >= pages} onClick={() => setPage(pages - 1)}>尾页</button></nav>
    </section>
    {chosen && <section ref={detail} tabIndex={-1} className="sheet padded guild-member-detail" aria-label="寮成员详情"><div className="section-title"><h2>{chosen.name} <Badge>{tags[chosen.id]}</Badge></h2><button onClick={() => { setSelected(''); list.current?.querySelector<HTMLButtonElement>('.guild-member-name')?.focus(); }}>关闭详情</button></div><dl>{columns.slice(1).map(([key, title]) => <div key={key}><dt>{title}</dt><dd>{cell(chosen, key)}</dd></div>)}</dl><form onSubmit={e => { e.preventDefault(); void saveSettings({ ...settings, notes: { ...settings.notes, [chosen.id]: note.trim() } }); }}><label className="field">本地备注<input aria-label="成员本地备注" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="备注会随当前角色保存在本机" /></label><button disabled={busy}>保存备注</button></form></section>}
  </div>;
}
