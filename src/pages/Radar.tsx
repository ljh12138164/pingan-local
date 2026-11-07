import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useApp } from '../context';
import { Empty, MiniBars, NeedData, PageTitle } from '../components';
import { csv, download } from '../api';
import { number } from '../types';
import type { SoulRolls } from '../soulGrowth';
import { radarGroups, type RadarMetric, type RadarView } from '../soulRadar';
import { matchesHero } from '../heroSearch';
import GameImage from '../GameImage';
import MainAttributeFilters from '../MainAttributeFilters';
import { describeMainFilters, matchesMainFilters, type MainFilters } from '../soulFilters';
import { labels } from '../types';
import '../speed-assets.css';

const metrics = [{ key: 'speed', label: '速度', unit: 2.7 }, { key: 'crit', label: '暴击', unit: 2.7 }, { key: 'crit_damage', label: '暴伤', unit: 3.6 }, { key: 'attack_pct', label: '攻击加成', unit: 2.7 }, { key: 'hp_pct', label: '生命加成', unit: 2.7 }];
const metricNames: Record<RadarMetric, string> = { count: '库存数量', speed: '单件最高速度', average: '平均参考分' };

export default function Radar() {
  const { state, notify } = useApp();
  const [metric, setMetric] = useState<RadarMetric>('count'), [view, setView] = useState<RadarView>('set');
  const [ruleId, setRuleId] = useState(String(state?.settings.activeScoringRule ?? 'default'));
  const [scene, setScene] = useState<'all' | 'pve' | 'pvp'>('all'), [query, setQuery] = useState(''), [full, setFull] = useState(false);
  const [mains, setMains] = useState<MainFilters>({});
  const rule = state?.rules.find(r => r.id === ruleId) ?? state?.rules[0];
  const rolls = state?.data?.extras?.soulGrowth as Record<string, SoulRolls> | undefined;
  const setIds = state?.data?.extras?.soulSetIds as Record<string, string> | undefined;
  const souls = useMemo(() => (state?.data?.souls ?? []).filter(s => (!full || s.level === 15) && matchesMainFilters(s, mains) && matchesHero(s.set, query, setIds?.[s.set])), [state?.data?.souls, query, full, setIds, mains]);
  const groups = useMemo(() => radarGroups(souls, view, rule, rolls, scene), [souls, view, rule, rolls, scene]);
  const ranked = [...groups].filter(g => g[metric] !== null).sort((a, b) => b[metric]! - a[metric]!);
  const axis = view === 'slot' ? groups.map(g => ({ label: g.name, value: g[metric] })) : metrics.map(m => ({ label: m.label, value: souls.reduce((sum, s) => sum + (s.sub[m.key] ?? 0) / m.unit, 0) }));
  const max = Math.max(1, ...axis.map(a => a.value ?? 0));
  const complete = axis.every(a => a.value !== null);
  const point = (i: number, radius: number) => { const angle = i * Math.PI * 2 / axis.length - Math.PI / 2; return { x: 180 + Math.cos(angle) * radius, y: 155 + Math.sin(angle) * radius }; };
  const points = (radius: number) => axis.map((_, i) => { const p = point(i, radius); return `${p.x},${p.y}`; }).join(' ');
  async function exportGroups() {
    try { await download('御魂雷达对比.csv', csv([['分组', '评分标准', '场景', '查询', '仅满级', '主属性筛选', '数量', '已满级', '单件最高速度（含主属性）', '平均参考分', '已计算', '条件未读取'], ...groups.map(g => [g.name, rule?.name ?? '未选择', scene, query, full ? '是' : '否', describeMainFilters(mains, labels), g.count, g.full, g.speed ?? '无御魂', g.average ?? (g.count ? '未计算完整' : '无御魂'), g.scored, g.unknown])]), 'text/csv'); } catch (e) { notify(String(e), true); }
  }
  return <div className="soul-radar"><PageTitle title="御魂雷达" description="按套装或六个号位比较库存，使用与御魂分析相同的评分标准。" actions={<button disabled={!souls.length} onClick={() => void exportGroups()}><Download size={16} />导出对比</button>} /><NeedData>
    <section className="sheet padded radar-filters" aria-label="雷达筛选条件">
      <nav className="roster-views" aria-label="雷达对比视图">{([['set', '套装分布'], ['slot', '六号位对比']] as const).map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</nav>
      <div className="radar-controls"><label className="field">套装查询<div className="search-input"><Search size={16} /><input aria-label="雷达套装查询" value={query} onChange={e => setQuery(e.target.value)} placeholder="名称 / 拼音 / 首字母 / 编号" /></div></label><label className="field">评分标准<select aria-label="雷达评分标准" value={rule?.id ?? ''} onChange={e => setRuleId(e.target.value)}>{state?.rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label className="field">评分场景<select aria-label="雷达评分场景" value={scene} onChange={e => setScene(e.target.value as typeof scene)}><option value="all">全部场景</option><option value="pve">PVE</option><option value="pvp">PVP</option></select></label><label className="check"><input type="checkbox" checked={full} onChange={e => setFull(e.target.checked)} />仅满级御魂</label></div>
      <MainAttributeFilters value={mains} onChange={setMains} />
      <p className="fineprint">同一号位内多选为“或”，不同号位分别筛选，1/3/5号位不受影响。<button className="text" onClick={() => { setQuery(''); setFull(false); setMains({}); }}>重置库存筛选</button></p>
      <p className="fineprint">当前 {number(souls.length, 0)} 枚 · {rule?.name ?? '尚无评分标准'}。{groups.some(g => g.unknown) && '条件缺失的分组不计算平均分。'}<a href={`#rules${rule ? `?id=${encodeURIComponent(rule.id)}` : ''}`}>查看评分标准</a></p>
    </section>
    {!souls.length ? <section className="sheet"><Empty title="没有符合条件的御魂"><button onClick={() => { setQuery(''); setFull(false); setMains({}); }}>清空雷达筛选</button></Empty></section> : <>
    <div className="two-columns"><section className="sheet padded"><h2>{view === 'slot' ? `六号位 · ${metricNames[metric]}` : '副属性结构'}</h2>{complete ? <svg className="radar radar-chart" viewBox="0 0 360 320" role="img" aria-label={view === 'slot' ? `六个号位${metricNames[metric]}的相对分布` : '副属性参考步长总和的相对分布'}>{[0.25, 0.5, 0.75, 1].map(r => <polygon key={r} className="radar-grid" points={points(105 * r)} />)}{axis.map((a, i) => <line key={a.label} className="radar-grid" x1="180" y1="155" x2={point(i, 105).x} y2={point(i, 105).y} />)}<polygon className="radar-shape" points={axis.map((a, i) => { const p = point(i, 105 * a.value! / max); return `${p.x},${p.y}`; }).join(' ')} />{axis.map((a, i) => <text key={a.label} x={point(i, 133).x} y={point(i, 133).y} textAnchor="middle">{a.label}</text>)}</svg> : <Empty title="部分号位无法计算当前指标"><p>请查看下方数量及未读取项，或切换到库存数量。</p></Empty>}<p className="fineprint">{view === 'slot' ? '按当前指标最大值归一化，准确数值见表格；空号位和评分缺失时不绘制不完整雷达。' : '各属性副属性总值 ÷ 参考步长，再按最大维度归一化。反映库存构成，不是战力或官方评级；评分标准不改变此图。'}</p></section>
    <section className="sheet padded"><div className="section-title"><h2>{view === 'slot' ? '号位对比' : '套装对比'}</h2><select aria-label="套装对比指标" value={metric} onChange={e => setMetric(e.target.value as RadarMetric)}>{Object.entries(metricNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>{ranked.length ? <MiniBars values={ranked.slice(0, 12).map(g => ({ label: g.name, value: g[metric]! }))} /> : <Empty title="当前指标尚无完整结果" />}<p className="fineprint">{ranked.length > 12 ? '显示前 12 组，完整结果见下表。' : '按当前指标从高到低排列。'}{groups.some(g => g[metric] === null) && ' 缺失结果保留在下表，未参与排行。'}</p></section></div>
    <section className="sheet radar-results" aria-label="雷达对比结果"><div className="table-toolbar"><h2>{view === 'slot' ? '六个号位' : '全部套装'} · {groups.length} 组</h2><span className="muted">评分：{rule?.name ?? '未选择'} · {scene === 'all' ? '全部场景' : scene.toUpperCase()}</span></div><div className="table-scroll"><table><thead><tr><th>{view === 'slot' ? '号位' : '套装'}</th><th className="numeric">数量</th><th className="numeric">已满级</th><th className="numeric">单件最高速度（含主属性）</th><th className="numeric">平均参考分</th><th className="numeric">已计算 / 未读取</th></tr></thead><tbody>{groups.map(g => <tr key={g.name} data-radar-group={g.name}><th scope="row">{view === 'set' ? <span className="radar-set-name"><GameImage kind="suit" id={setIds?.[g.name] ?? ''} name={g.name} />{g.name}</span> : g.name}</th><td className="numeric">{g.count}</td><td className="numeric">{g.full}</td><td className="numeric">{g.speed !== null ? number(g.speed) : '无御魂'}</td><td className="numeric" data-average>{g.average !== null ? number(g.average) : g.count ? '未计算完整' : '无御魂'}</td><td className="numeric">{g.scored} / {g.unknown}</td></tr>)}</tbody></table></div></section></>}
  </NeedData></div>;
}
