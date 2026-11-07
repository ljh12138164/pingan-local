import { associationPlans, defaultAssociation } from '../association';
import Improvement from './Improvement';
import HeroPicker from '../HeroPicker';
import SpeedOverview from './SpeedOverview';
import GameImage from '../GameImage';
import { useEffect, useRef, useState } from 'react';
import { Calculator, ChevronDown, ChevronUp, Download, Play, Plus, RotateCcw, X } from 'lucide-react';
import { useApp } from '../context';
import { Badge, NeedData, PageTitle, SoulDetail } from '../components';
import { csv, download } from '../api';
import { labels, attrs, attribute, number, type SearchResult, type Stats } from '../types';
import '../optimizer.css';

const defaultBase: Stats = { attack: 3000, hp: 12000, defense: 450, speed: 110, crit: 10, crit_damage: 150, hit: 0, resist: 0 };
const panelAttrs = Object.keys(defaultBase);
const metrics: Record<string, { name: string; formula: string }> = {
  crit_output: { name: '伤害输出面板', formula: '攻击 × 暴伤 / 100（假设本次暴击）' },
  healing: { name: '治疗面板', formula: '生命 × 暴伤 / 100' },
  defense_output: { name: '防御输出面板', formula: '防御 × 暴伤 / 100' },
  hit_resist: { name: '命抗双修', formula: '命中 / 100 × 抵抗 / 100' },
  damage: { name: '暴击期望输出', formula: '攻击 × [1 + min(暴击,100) / 100 × (暴伤 / 100 − 1)]' },
  ...Object.fromEntries(panelAttrs.map(k => [k, { name: labels[k], formula: `${labels[k]}${['crit', 'crit_damage', 'hit', 'resist'].includes(k) ? '（面板百分数）' : ''}` }])),
};
const slotOptions: Record<number, string[]> = { 2: ['attack_pct', 'hp_pct', 'defense_pct', 'speed'], 4: ['attack_pct', 'hp_pct', 'defense_pct', 'hit', 'resist'], 6: ['attack_pct', 'hp_pct', 'defense_pct', 'crit', 'crit_damage'] };
interface Recipe { name: string; count: number }
function optionalValue(values: Stats, key: string, raw: string) { const next = { ...values }; if (raw === '') delete next[key]; else next[key] = Number(raw); return next; }

export default function Optimizer({ mode = 'optimizer' }: { mode?: 'optimizer' | 'character' | 'speed' }) {
  const { state, busy, run, notify } = useApp(); const data = state?.data;
  const [tool, setTool] = useState('combination');
  const [missingBase, setMissingBase] = useState<string[]>([]);
  const [heroId, setHeroId] = useState('manual'), [bonus, setBonus] = useState<Stats>({}), [extra, setExtra] = useState<Stats>({});
  const [base, setBase] = useState<Stats>(defaultBase), [metric, setMetric] = useState(mode === 'speed' ? 'speed' : 'crit_output');
  const [targetMode, setTargetMode] = useState(false), [target, setTarget] = useState('');
  const [minimums, setMinimums] = useState<Stats>(mode === 'speed' ? {} : { crit: 100 }), [maximums, setMaximums] = useState<Stats>({});
  const [recipe, setRecipe] = useState<Recipe[]>([]), [mainOptions, setMainOptions] = useState<Record<string, string[]>>({});
  const [onlyMax, setOnlyMax] = useState(true), [onlySix, setOnlySix] = useState(true), [excludeThree, setExcludeThree] = useState(false);
  const [excludeEquipped, setExcludeEquipped] = useState(false), [includeLocked, setIncludeLocked] = useState(true);
  const [result, setResult] = useState<SearchResult | null>(null), [open, setOpen] = useState<number | null>(0), [computing, setComputing] = useState(false);
  const revision = useRef(0); const detail = useRef<HTMLHeadingElement>(null);
  useEffect(() => { revision.current++; setResult(null); setComputing(false); setHeroId('manual'); setBase(defaultBase); setBonus({}); setMissingBase([]); return () => { revision.current++; }; }, [state?.activeId, data]);
  const heroes = data?.heroes.length ? data.heroes : state?.catalog ?? [];
  const names = [...new Set(data?.souls.map(s => s.set))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const setIds = data?.extras?.soulSetIds as Record<string, string> | undefined;
  const [ranges, setRanges] = useState<string[]>(mode === 'speed' ? [] : ['crit']);
  const pieceCount = recipe.reduce((sum, r) => sum + r.count, 0);
  const error = pieceCount > 6 ? '套装所需件数合计不能超过六件。' : recipe.some(r => !r.name || !Number.isInteger(r.count) || r.count < 1 || r.count > 6) ? '请选择套装，并填写 1–6 的整数件数。' : new Set(recipe.map(r => r.name)).size !== recipe.length ? '相同套装请合并到同一行。' : ranges.some(k => maximums[k] !== undefined && (minimums[k] ?? 0) > maximums[k]) ? '属性最低值不能大于最高值。' : targetMode && (target === '' || !Number.isFinite(Number(target)) || Number(target) < 0) ? '请填写非负的指标目标值。' : '';
  const title = mode === 'character' ? '角色分析' : mode === 'speed' ? '一速预览' : '面板计算 / 提升';
  const disabled = !data || busy || computing || missingBase.length > 0 || !!error;
  const change = () => setResult(null);
  const association = associationPlans(state?.settings ?? {}).find(p => p.id === state?.settings.activeAssociationPlan) ?? defaultAssociation;
  const submitted = useRef<unknown>(null);
  const request = { association, base, bonus: Object.fromEntries([...new Set([...Object.keys(bonus), ...Object.keys(extra)])].map(k => [k, (bonus[k] ?? 0) + (extra[k] ?? 0)])), metric, minimums, maximums, target: targetMode && target !== '' ? Number(target) : null, setPieces: Object.fromEntries(recipe.map(r => [r.name, r.count])), mainOptions, onlyMax, onlySix, excludeThree, excludeEquipped, includeLocked };
  async function calculate() {
    if (disabled) return;
    const current = ++revision.current; submitted.current = structuredClone(request); setComputing(true); setResult(null);
    const response = await run<SearchResult>('optimize', { id: state?.activeId, request });
    if (revision.current !== current) return;
    if (response) { setResult(response); setOpen(0); } setComputing(false);
  }
  function reset() { setBase(defaultBase); setMissingBase([]); setBonus({}); setExtra({}); setHeroId('manual'); setMinimums(mode === 'speed' ? {} : { crit: 100 }); setMaximums({}); setRanges(mode === 'speed' ? [] : ['crit']); setTargetMode(false); setTarget(''); setMetric(mode === 'speed' ? 'speed' : 'crit_output'); setOnlyMax(true); setOnlySix(true); setExcludeThree(false); setExcludeEquipped(false); setIncludeLocked(true); setRecipe([]); setMainOptions({}); change(); }
  function deficitName(key: string) { return key === 'target' ? '指标未达到目标，差' : key.startsWith('max:') ? `${labels[key.slice(4)]}超过上限` : key.startsWith('set:') ? `${key.slice(4)}缺件` : `${labels[key] ?? key}不足`; }
  async function exportResult(format: 'json' | 'csv') {
    if (!result) return;
    try { if (format === 'json') await download('面板计算结果.json', JSON.stringify({ request: submitted.current, result }, null, 2));
      else await download('面板计算结果.csv', csv([['方案', '指标', '指标值', '关联分', '达标', ...panelAttrs.map(k => labels[k]), '条件缺口', '六个御魂ID', '搜索精度', '请求条件JSON'], ...result.results.map((r, i) => [i + 1, metrics[metric].name, r.objective, r.associationScore, r.satisfied ? '是' : '否', ...panelAttrs.map(k => r.panel[k]), Object.entries(r.deficits).map(([k, v]) => `${deficitName(k)} ${v}`).join(' / '), r.ids.join(' / '), result.exact ? '精确' : '近似', JSON.stringify(submitted.current)])]), 'text/csv');
    } catch (e) { notify(String(e), true); }
  }
  const start = (text: string) => <button className="primary" disabled={disabled || tool !== 'combination'} onClick={() => void calculate()}><Play size={16} />{computing ? '正在本地计算…' : text}</button>;
  return <><PageTitle title={title} description="选择式神，设置面板区间与套装配方，从当前库存寻找六号位方案。" actions={<>{start('计算整套方案')}<button disabled={!result || tool !== 'combination'} onClick={() => void exportResult('json')}><Download size={16} />导出结果</button><button disabled={!result || tool !== 'combination'} onClick={() => void exportResult('csv')}>导出 CSV</button></>} />
    <NeedData>{mode === 'speed' && <SpeedOverview />}<div className="tool-tabs tabs" aria-label="分析方式"><button className={tool === 'combination' ? 'active' : ''} onClick={() => setTool('combination')}>整套面板计算</button><button className={tool === 'improvement' ? 'active' : ''} onClick={() => setTool('improvement')}>当前装备 · 单件提升</button></div>{tool === 'improvement' ? <Improvement /> : <>
      <section className="sheet optimizer-conditions" aria-label="配装计算条件"><fieldset disabled={computing}><legend className="visually-hidden">配装计算条件</legend>
        <div className="optimizer-column"><div className="section-title"><h2>目标式神</h2><button className="text" onClick={reset}><RotateCcw size={14} />重置</button></div>
          <HeroPicker label="基础面板来源" heroes={heroes} value={heroId} emptyValue="manual" emptyLabel="手动参考面板" onChange={id => { const h = heroes.find(h => h.id === id); setHeroId(id); setBase(h ? Object.fromEntries(panelAttrs.map(k => [k, h.base[k] ?? 0])) : defaultBase); setMissingBase(h ? ['attack', 'hp', 'defense', 'speed', 'crit', 'crit_damage'].filter(k => h.base[k] === undefined) : []); setBonus(h?.bonus ?? {}); change(); }} />
          <p className="fineprint">使用所选实例的等级与觉醒基础值；手动参考值可直接编辑。</p>
          <div className="optimizer-base">{panelAttrs.map(k => <label className="field" key={k}>{labels[k]}{['crit', 'crit_damage', 'hit', 'resist'].includes(k) ? ' (%)' : ''}<input aria-label={`基础${labels[k]}`} type="number" min="0" step="any" value={base[k]} onChange={e => { setBase({ ...base, [k]: Number(e.target.value) }); setMissingBase(missingBase.filter(a => a !== k)); change(); }} /></label>)}</div>
          {missingBase.length > 0 && <p className="notice">请补齐基础属性：{missingBase.map(k => labels[k]).join('、')}</p>}
          {Object.keys(bonus).length > 0 && <p className="fineprint">另计觉醒附加：{Object.entries(bonus).map(([k, v]) => `${labels[k]} +${attribute(k, v)}`).join(' / ')}</p>}
          <details><summary>额外属性</summary><p className="fineprint">在基础面板与觉醒附加之外增加，百分比属性填写百分数，例如 15。</p><div className="optimizer-base">{attrs.map(k => <label className="field" key={k}>{labels[k]}<input aria-label={`额外${labels[k]}`} type="number" min="0" step="any" value={extra[k] ?? ''} placeholder="0" onChange={e => { setExtra(optionalValue(extra, k, e.target.value)); change(); }} /></label>)}</div></details>
        </div>
        <div className="optimizer-column"><h2>目标与属性区间</h2><p className="muted">先满足条件，再按指标从高到低排列。</p>
          <div className="optimizer-mode" role="group" aria-label="计算目标模式"><button aria-pressed={!targetMode} onClick={() => { setTargetMode(false); change(); }}>最大化指标</button><button aria-pressed={targetMode} onClick={() => { setTargetMode(true); change(); }}>指标达标</button></div>
          <label className="field">优化目标<select aria-label="优化目标" value={metric} onChange={e => { setMetric(e.target.value); change(); }}>{Object.entries(metrics).map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}</select></label>
          {targetMode && <label className="field">指标目标值<input aria-label="指标目标值" type="number" min="0" step="any" value={target} placeholder="例如 30000" onChange={e => { setTarget(e.target.value); change(); }} /></label>}
          <p className="optimizer-formula">{metrics[metric].formula}{targetMode && target !== '' ? ` ≥ ${number(Number(target))}` : ' → 最大化'}</p>
          {metric === 'hit_resist' && <p className="fineprint">命中 80%、抵抗 80% 对应指标 0.64；单项区间仍填写 80。</p>}
          <p className="fineprint">关联分：{association.name} · <a href="#association">管理方案</a>。用于结果参考，排序仍按所选面板指标。</p><div className="optimizer-ranges"><h3>属性区间</h3>{ranges.map(k => <div className="optimizer-range" key={k}><label>最低值<input aria-label={`最低${labels[k]}`} type="number" min="0" step="any" value={minimums[k] ?? ''} placeholder="不限" onChange={e => { setMinimums(optionalValue(minimums, k, e.target.value)); change(); }} /></label><label>属性<select aria-label={`限制属性${labels[k]}`} value={k} onChange={e => { const next = e.target.value, mins = { ...minimums }, maxs = { ...maximums }; delete mins[k]; delete maxs[k]; if (minimums[k] !== undefined) mins[next] = minimums[k]; if (maximums[k] !== undefined) maxs[next] = maximums[k]; setMinimums(mins); setMaximums(maxs); setRanges(ranges.map(a => a === k ? next : a)); change(); }}>{panelAttrs.filter(a => a === k || !ranges.includes(a)).map(a => <option key={a} value={a}>{labels[a]}</option>)}</select></label><label>最高值<input aria-label={`最高${labels[k]}`} type="number" min="0" step="any" value={maximums[k] ?? ''} placeholder="不限" onChange={e => { setMaximums(optionalValue(maximums, k, e.target.value)); change(); }} /></label><button className="icon-button" aria-label={`移除${labels[k]}限制`} onClick={() => { const mins = { ...minimums }, maxs = { ...maximums }; delete mins[k]; delete maxs[k]; setMinimums(mins); setMaximums(maxs); setRanges(ranges.filter(a => a !== k)); change(); }}><X size={15} /></button></div>)}
            <button className="text" disabled={ranges.length === panelAttrs.length} onClick={() => { const k = panelAttrs.find(a => !ranges.includes(a)); if (k) setRanges([...ranges, k]); change(); }}><Plus size={14} />添加属性限制</button><p className="fineprint">上下限均包含边界；最高值留空表示不限。暴击等百分比填写面板百分数。</p>
          </div>
        </div>
        <div className="optimizer-column optimizer-recipe"><div className="row between wrap"><h2>套装配方</h2><span className={`optimizer-set-total ${pieceCount > 6 ? 'invalid' : ''}`}>{pieceCount} / 6 件</span></div><p className="muted">每项至少达到指定件数，剩余位置自由搭配。</p>
          {recipe.map((r, i) => <div className="optimizer-set-row" key={i}><GameImage kind="suit" id={setIds?.[r.name] ?? ''} name={r.name || '套装'} /><select aria-label={`套装方向${i + 1}`} value={r.name} onChange={e => { setRecipe(recipe.map((v, n) => n === i ? { ...v, name: e.target.value } : v)); change(); }}><option value="">选择套装</option>{names.filter(n => n === r.name || !recipe.some(v => v.name === n)).map(name => <option key={name}>{name}</option>)}</select><input aria-label={`套装件数${i + 1}`} type="number" min="1" max="6" step="1" value={r.count} onChange={e => { setRecipe(recipe.map((v, n) => n === i ? { ...v, count: Number(e.target.value) } : v)); change(); }} /><button className="icon-button" aria-label={`移除套装方向${i + 1}`} onClick={() => { setRecipe(recipe.filter((_, n) => n !== i)); change(); }}><X size={15} /></button></div>)}
          <button className="text" disabled={recipe.length >= 6 || !names.length} onClick={() => { setRecipe([...recipe, { name: '', count: Math.min(2, Math.max(1, 6 - pieceCount)) }]); change(); }}><Plus size={14} />添加套装方向</button>
          <h3>2 / 4 / 6 号位主属性</h3>{[2, 4, 6].map(slot => <fieldset className="optimizer-main" key={slot}><legend>{slot}号位 · {(mainOptions[slot] ?? []).length ? '满足任一所选项' : '不限'}</legend><div className="checks">{slotOptions[slot].map(k => <label key={k}><input aria-label={`${slot}号位${labels[k]}`} type="checkbox" checked={(mainOptions[slot] ?? []).includes(k)} onChange={e => { setMainOptions({ ...mainOptions, [slot]: e.target.checked ? [...(mainOptions[slot] ?? []), k] : (mainOptions[slot] ?? []).filter(a => a !== k) }); change(); }} />{labels[k]}</label>)}</div></fieldset>)}
          <div className="checks"><label><input type="checkbox" checked={onlySix} onChange={e => { setOnlySix(e.target.checked); change(); }} />仅六星</label><label><input type="checkbox" checked={onlyMax} onChange={e => { setOnlyMax(e.target.checked); change(); }} />仅使用 +15 御魂</label><label><input type="checkbox" checked={excludeThree} onChange={e => { setExcludeThree(e.target.checked); change(); }} />排除已知三条初始副属性</label><label><input type="checkbox" checked={includeLocked} onChange={e => { setIncludeLocked(e.target.checked); change(); }} />包含已锁定御魂</label><label><input type="checkbox" checked={excludeEquipped} onChange={e => { setExcludeEquipped(e.target.checked); change(); }} />排除已装备御魂</label></div>
          {excludeThree && <p className="fineprint">初始条数未读取的御魂继续参与计算，不推测为三条或四条。</p>}
          {!!error && <p role="alert" className="notice optimizer-error">{error}</p>}
        </div>
        <div className="optimizer-footer"><p>四件套按件数约束，尚不计算触发效果；技能、敌方防御和战斗增益未建模。图片来自独立公开资源，未收录时显示缺图标记。</p>{start('开始计算')}</div>
      </fieldset></section>
      <section className="sheet results optimizer-results" aria-label="配装计算结果">{!result ? <div className="optimizer-empty-preview"><Calculator size={24} /><div><h2>{computing ? '正在搜索库存组合' : '计算结果'}</h2><p>{computing ? '组合较多时使用有上限的近似搜索，结果会注明搜索范围。' : '设置条件后开始计算，查看候选面板、条件缺口和六个号位明细。'}</p></div></div> : <><div className="result-summary"><div className="row wrap"><h2>{result.results[0]?.satisfied ? '找到符合条件的候选' : '当前候选未满足全部条件'}</h2><Badge tone={result.exact ? 'green' : 'amber'}>{result.exact ? '精确搜索' : '近似搜索'}</Badge></div><p>{result.method}</p><small>筛选后的组合总数：{number(Number(result.combinations), 0)} · 检查完整候选：{number(result.checked, 0)}</small>{!result.exact && <p className="fineprint">未找到达标候选不代表库存中一定不存在可行解；可调整条件或缩小库存后重算。</p>}</div>
        <p className="optimizer-scroll-hint">左右滑动查看全部面板；方案名称保持可见。点击箭头查看六号位图片与属性。</p><div className="table-scroll"><table><thead><tr><th>方案</th><th className="numeric">{metrics[metric].name}</th><th className="numeric">关联分</th>{panelAttrs.map(k => <th key={k} className="numeric">{labels[k]}</th>)}<th>条件</th><th></th></tr></thead><tbody>{result.results.map((r, i) => <tr key={r.ids.join(',')} className={open === i ? 'selected' : ''}><td>方案 {i + 1}</td><td className="numeric score">{number(r.objective, 4)}</td><td className="numeric">{r.associationScore === undefined ? '—' : number(r.associationScore, 3)}</td>{panelAttrs.map(k => <td key={k} className="numeric">{attribute(k, r.panel[k])}</td>)}<td><Badge tone={r.satisfied ? 'green' : 'amber'}>{r.satisfied ? '达标' : '存在缺口'}</Badge></td><td><button className="icon-button" aria-label={`${open === i ? '收起' : '展开'}方案 ${i + 1}`} aria-expanded={open === i} onClick={() => { setOpen(open === i ? null : i); if (open !== i) requestAnimationFrame(() => { detail.current?.focus({ preventScroll: true }); detail.current?.scrollIntoView({ block: 'start' }); }); }}>{open === i ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></td></tr>)}</tbody></table></div>
        {open !== null && result.results[open] && <div className="combination-detail"><div className="row wrap"><h3 ref={detail} tabIndex={-1}>方案 {open + 1} · 六号位明细</h3>{Object.entries(result.results[open].sets).map(([k, v]) => <Badge key={k}>{k} × {v}</Badge>)}</div>{!result.results[open].satisfied && <p className="notice">{Object.entries(result.results[open].deficits).map(([k, v]) => `${deficitName(k)} ${number(v, 4)}`).join(' / ')}</p>}<div className="soul-grid">{result.results[open].ids.map(id => { const s = data?.souls.find(s => s.id === id); return s ? <SoulDetail key={id} soul={s} /> : null; })}</div></div>}
        <p className="formula">{result.formula}</p></>}
      </section><section className="sheet padded model-scope"><details><summary>计算范围与套装加成</summary><p className="muted">按所填基础值、觉醒附加、额外属性、御魂主副属性、首领独有和已配置固定套装加成计算。伤害输出与治疗是面板乘积；暴击期望额外考虑暴击率，均不等于实际战斗结果。</p><div className="row wrap"><Badge>已配置 {data?.sets.length ?? 0} 种套装</Badge><a href="#settings">编辑套装加成</a></div></details></section>
    </>}</NeedData>
  </>;
}
