import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useApp } from '../context';
import { csv, download, execute } from '../api';
import { Badge, Empty, NeedData, PageTitle, SoulDetail } from '../components';
import GameImage from '../GameImage';
import { matchesHero } from '../heroSearch';
import { attribute, labels, number, type Stats } from '../types';
import SpeedOverview from './SpeedOverview';
import AccountComparison from './AccountComparison';

interface Panel { heroId: string; panel: Stats; incomplete: boolean; ids: string[] }
const metrics = ['damage', 'attack', 'speed', 'crit', 'crit_damage', 'hp', 'defense', 'hit', 'resist'];
export default function CharacterAnalysis() {
  const { state, notify } = useApp();
  const [tab, setTab] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('tab') === 'pve' ? 'pve' : 'speed');
  const [panels, setPanels] = useState<Panel[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState(''); const [rarity, setRarity] = useState(''); const [metric, setMetric] = useState('damage'); const [fullSet, setFullSet] = useState(true); const [fullCrit, setFullCrit] = useState(false);
  const [page, setPage] = useState(0); const [selected, setSelected] = useState(''); const detail = useRef<HTMLElement>(null);
  const profile = state?.profiles.find(p => p.id === state.activeId); const data = state?.data;
  const facts = data?.extras?.heroDetails as Record<string, { templateId: number }> | undefined;
  useEffect(() => {
    if (tab !== 'pve' || !state?.activeId) return;
    let valid = true; setLoading(true); setError(''); setPanels([]); setSelected('');
    void execute<Panel[]>('character_panels', { id: state.activeId }).then(rows => { if (valid) setPanels(rows); }).catch(e => { if (valid) setError(String(e)); }).finally(() => { if (valid) setLoading(false); });
    return () => { valid = false; };
  }, [tab, state?.activeId, profile?.updatedAt, retry]);
  useEffect(() => { setPage(0); setSelected(''); }, [query, rarity, metric, fullSet, fullCrit]);
  useEffect(() => { if (selected) { detail.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); detail.current?.focus({ preventScroll: true }); } }, [selected]);
  const heroes = useMemo(() => new Map(data?.heroes.map(h => [h.id, h]) ?? []), [data?.heroes]);
  const rows = panels.filter(row => {
    const hero = heroes.get(row.heroId);
    return hero && !row.incomplete && matchesHero(hero.name, query, `${facts?.[hero.id]?.templateId ?? ''} ${hero.id}`) && (!rarity || hero.rarity === rarity) && (!fullSet || row.ids.length === 6) && (!fullCrit || row.panel.crit >= 100);
  }).sort((a, b) => b.panel[metric] - a.panel[metric] || a.heroId.localeCompare(b.heroId));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 20) - 1));
  const chosen = panels.find(p => p.heroId === selected); const chosenHero = chosen && heroes.get(chosen.heroId);
  async function exportPanels() {
    try { await download('式神当前面板.csv', csv([['式神', '实例ID', '御魂数量', ...metrics.map(m => labels[m])], ...rows.map(row => [heroes.get(row.heroId)?.name, row.heroId, row.ids.length, ...metrics.map(m => row.panel[m])])]), 'text/csv'); } catch (e) { notify(String(e), true); }
  }
  return <div className="character-analysis"><PageTitle title="角色分析" description="从实际库存分析一速、当前装备面板与角色差异。" /><NeedData>
    <nav className="roster-views" aria-label="角色分析类型">{[['speed', '御魂一速'], ['pve', 'PVE 当前面板'], ['compare', '角色对照']].map(([key, name]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{name}</button>)}</nav>
    {tab === 'speed' && <SpeedOverview />}
    {tab === 'compare' && <AccountComparison embedded />}
    {tab === 'pve' && <><section className="sheet padded"><div className="section-title"><h2>当前装备面板</h2><button disabled={!rows.length || loading || !!error} onClick={() => void exportPanels()}><Download size={16} />导出面板</button></div><div className="filters"><label className="search-input grow"><Search size={17} /><input aria-label="查询面板式神" value={query} placeholder="名称、拼音、首字母或编号" onChange={e => setQuery(e.target.value)} /></label><label className="field">稀有度<select aria-label="面板式神稀有度" value={rarity} onChange={e => setRarity(e.target.value)}><option value="">全部</option>{['UR', 'SP', 'SSR', 'SR', 'R', 'N'].map(r => <option key={r}>{r}</option>)}</select></label><label className="field">排序<select aria-label="当前面板排序" value={metric} onChange={e => setMetric(e.target.value)}>{metrics.map(m => <option value={m} key={m}>{labels[m]}由高到低</option>)}</select></label><label className="check"><input type="checkbox" checked={fullSet} onChange={e => setFullSet(e.target.checked)} />仅六件御魂</label><label className="check"><input type="checkbox" checked={fullCrit} onChange={e => setFullCrit(e.target.checked)} />仅满暴击</label></div><p className="fineprint">按当前等级、觉醒、实际装备与两件套、六件套固定属性计算。参考输出 = 攻击 × [1 + 暴击率 × (暴伤 − 1)]，暴击率最高按 100% 计算；未包含技能倍率、四件套特效、敌方防御和战斗增益。不同式神的参考输出不能直接视为实战强弱。</p></section>
      {loading ? <p role="status">正在计算当前装备面板…</p> : error ? <section className="sheet padded" role="alert"><h2>面板计算失败</h2><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>重新计算</button></section> : <section className="sheet"><div className="padded-heading"><h2>匹配 {rows.length} 条培养记录</h2><span className="muted">基础面板未校准 {panels.filter(p => p.incomplete).length} 条</span></div><div className="table-scroll"><table className="character-panels"><thead><tr><th>式神</th><th>装备</th>{['damage', 'attack', 'speed', 'crit', 'crit_damage', 'hp'].map(m => <th key={m} className="numeric">{labels[m]}</th>)}</tr></thead><tbody>{rows.slice(currentPage * 20, (currentPage + 1) * 20).map(row => { const hero = heroes.get(row.heroId)!; return <tr key={row.heroId} className={selected === row.heroId ? 'selected' : ''}><td><button className="text character-hero" onClick={() => setSelected(row.heroId)}><GameImage id={String(facts?.[row.heroId]?.templateId ?? state?.catalog.find(h => h.name === hero.name)?.id ?? '')} name={hero.name} /><span><b>{hero.name}</b><small>{hero.rarity} · {hero.star} 星 · Lv.{hero.level} · #{hero.id.slice(-6)}</small></span></button></td><td>{row.ids.length} / 6</td>{['damage', 'attack', 'speed', 'crit', 'crit_damage', 'hp'].map(m => <td key={m} className="numeric">{attribute(m, row.panel[m])}</td>)}</tr>; })}</tbody></table></div>{!rows.length && <Empty title="没有匹配的当前面板"><p>调整名称或装备条件；尚未校准基础属性的记录不参与排名。</p></Empty>}<nav className="roster-pagination" aria-label="当前面板分页"><span>共 {rows.length} 条 · 每页 20 条</span><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {Math.max(1, Math.ceil(rows.length / 20))}</span><button disabled={(currentPage + 1) * 20 >= rows.length} onClick={() => setPage(currentPage + 1)}>下一页</button></nav></section>}
      {chosen && chosenHero && <section ref={detail} tabIndex={-1} className="sheet padded character-equipment" aria-label="分析式神装备详情"><div className="section-title"><h2>{chosenHero.name} <Badge>#{chosenHero.id.slice(-6)}</Badge></h2><button onClick={() => setSelected('')}>收起装备</button></div><div className="soul-grid">{chosen.ids.map(id => { const soul = data?.souls.find(s => s.id === id); return soul ? <SoulDetail key={id} soul={soul} /> : null; })}</div>{!chosen.ids.length && <p className="muted">这条培养记录没有已读取的装备。</p>}<a className="button" href="#optimizer">计算可用配装</a></section>}</>}
  </NeedData></div>;
}
