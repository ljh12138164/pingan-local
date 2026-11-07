import { useMemo, useState } from 'react';
import { useApp } from './context';
import { Empty, SoulDetail } from './components';
import { csv, download, downloadImageExport } from './api';
import { attribute, labels, type Document } from './types';
import type { SoulRolls } from './soulGrowth';
import { speedAssets, speedCategories, type SpeedCategory } from './speedAssets';
import { describeMainFilters, matchesMainFilters, type MainFilters } from './soulFilters';
import MainAttributeFilters from './MainAttributeFilters';
import './speed-assets.css';

export default function SpeedAssetPanel() {
  const { state, history, notify } = useApp();
  const [filters, setFilters] = useState<MainFilters>({});
  const [category, setCategory] = useState<SpeedCategory>('full');
  const [page, setPage] = useState(0), [sharing, setSharing] = useState(false);
  const [selection, setSelection] = useState<{ data: Document; id: string } | null>(null);
  const data = state?.data;
  const souls = useMemo(() => (data?.souls ?? []).filter(s => matchesMainFilters(s, filters)), [data?.souls, filters]);
  const stats = useMemo(() => speedAssets(souls, data?.extras?.soulGrowth as Record<string, SoulRolls> | undefined), [souls, data?.extras?.soulGrowth]);
  const rows = stats.groups[category], pages = Math.max(1, Math.ceil(rows.length / 30)), current = Math.min(page, pages - 1);
  const selected = selection?.data === data ? rows.find(s => s.id === selection?.id) : undefined;
  const profile = state?.profiles.find(p => p.id === state.activeId);
  const version = history ? `历史版本 · ${history.name} · ${history.createdAt}` : `当前档案 · ${profile?.updatedAt ?? '未记录时间'}`;
  const filterText = describeMainFilters(filters, labels);
  async function exportCsv() {
    try {
      await download('速度资产统计.csv', csv([
        ['角色', '数据版本', '主属性筛选', '统计', '数量', '说明'],
        ...speedCategories.map(c => [data?.name ?? '', version, filterText, c.label, stats.groups[c.key].length, c.note]),
        [data?.name ?? '', version, filterText, '强化次数未读取', stats.unknown, '不计入满速及其子分类'],
        [], ['当前分类', '御魂ID', '套装', '号位', '主属性', '副速度（原始精度）'],
        ...rows.map(s => [speedCategories.find(c => c.key === category)!.label, s.id, s.set, s.slot, labels[s.main] ?? s.main, s.sub.speed]),
      ]), 'text/csv');
    } catch (error) { notify(String(error), true); }
  }
  async function share() {
    setSharing(true);
    try {
      const { speedSummaryPng } = await import('./speedShare');
      const bytes = await speedSummaryPng({ name: data?.name ?? '', version, filters: filterText, unknown: stats.unknown, counts: speedCategories.map(c => ({ label: c.label, count: stats.groups[c.key].length })) });
      await downloadImageExport('速度资产统计.png', bytes, 'png');
    } catch (error) { notify(String(error), true); }
    finally { setSharing(false); }
  }
  return <section className="sheet padded speed-assets" aria-label="速度资产统计">
    <div className="section-title"><div><h2>速度资产总览</h2><p className="fineprint">六星 +15 · 点击统计查看完整明细</p></div><div className="row wrap">
      <button disabled={!data} onClick={() => void exportCsv()}>导出速度资产 CSV</button>
      <button disabled={!data || sharing} onClick={() => void share()}>{sharing ? '正在生成图片…' : '分享速度统计图'}</button>
    </div></div>
    <MainAttributeFilters value={filters} onChange={next => { setFilters(next); setPage(0); setSelection(null); }} />
    <div className="speed-asset-cards">{speedCategories.map(c => <button key={c.key} aria-pressed={category === c.key} onClick={() => { setCategory(c.key); setPage(0); setSelection(null); }}>
      <span>{c.label}</span><strong>{stats.groups[c.key].length}</strong><small>{c.note}</small>
    </button>)}</div>
    <p className="fineprint">满速要求速度含初始共获得 6 次，新增速度腿不算五次强化。真17使用副属性原始数值，主属性速度不计入。{stats.unknown > 0 && <strong role="status"> 当前有 {stats.unknown} 枚速度御魂缺少强化次数，未计入统计；已确认数量为下限。</strong>}</p>
    {rows.length ? <>
      <div className="table-scroll"><table><thead><tr><th>御魂</th><th>号位</th><th>主属性</th><th className="numeric">副速度</th></tr></thead><tbody>{rows.slice(current * 30, (current + 1) * 30).map(s => <tr key={s.id}><td><button className="text" onClick={() => data && setSelection({ data, id: s.id })}>{s.set} · {s.id}</button></td><td>{s.slot}</td><td>{labels[s.main] ?? s.main}</td><td className="numeric">{attribute('speed', s.sub.speed)}</td></tr>)}</tbody></table></div>
      <div className="row wrap speed-asset-pagination"><button disabled={!current} onClick={() => setPage(current - 1)}>上一页</button><span>{current + 1} / {pages} · 共 {rows.length} 枚</span><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>下一页</button></div>
    </> : <Empty title={stats.unknown ? '暂无可确认的此类御魂' : '当前筛选下没有此类御魂'}><p>{stats.unknown ? '缺少强化次数的记录保留未知，请重新读取游戏数据后查看。' : '可以调整上方主属性条件，或切换其他统计。'}</p></Empty>}
    {selected && <aside className="speed-asset-detail"><button className="text" onClick={() => setSelection(null)}>关闭御魂详情</button><SoulDetail soul={selected} /></aside>}
    <p className="fineprint">主属性筛选仅作用于本节统计、明细与分享图；下方套装一速排名使用完整库存。</p>
  </section>;
}
