import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, RotateCcw, Search, Ticket, X } from 'lucide-react';
import { useApp } from '../context';
import { PageTitle, Empty } from '../components';
import GameImage from '../GameImage';
import KnowledgeTabs from '../KnowledgeTabs';
import { csv, download } from '../api';
import { bountyCategories, bountyDate, bountyLocations, bountyNames, bountySource, clueSource, clues, findBountyNames } from '../bounty';

const categoryLabels: Record<string, string> = { 妖气: '妖气封印', 挑战: '探索挑战' };
export default function Bounty() {
  const { state } = useApp();
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState('');
  const [category, setCategory] = useState(''); const [difficulty, setDifficulty] = useState('');
  const [quantity, setQuantity] = useState(''); const [page, setPage] = useState(0);
  const [mobileDetail, setMobileDetail] = useState(false); const detail = useRef<HTMLElement>(null);
  const names = useMemo(() => findBountyNames(query), [query]);
  const name = names.includes(selected) ? selected : names[0];
  const rows = useMemo(() => bountyLocations(name ?? '', category, difficulty), [name, category, difficulty]);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 12) - 1));
  const ids = useMemo(() => new Map(state?.catalog.map(h => [h.name, h.id]) ?? []), [state?.catalog]);
  const wanted = /^\d+$/.test(quantity) && Number(quantity) >= 1 && Number(quantity) <= 9999 ? Number(quantity) : null;
  useEffect(() => { setPage(0); }, [name, category, difficulty]);
  useEffect(() => { if (mobileDetail && window.matchMedia('(max-width:700px)').matches) detail.current?.focus(); }, [mobileDetail, name]);
  function back() { setMobileDetail(false); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.bounty-monsters button[aria-pressed=true]')?.focus()); }
  function exportRows() { download(`${name}-悬赏地点.csv`, csv([['妖怪', '副本', '地点', '位置', '难度', '数量'], ...rows.map(e => [e.name, categoryLabels[e.category] ?? e.category, e.location, e.position, e.difficulty, e.count])]), 'text/csv'); }
  return <div className={`bounty-page ${mobileDetail ? 'bounty-detail-open' : ''}`}><PageTitle title="悬赏封印" description="按妖怪名称或神秘线索，查找具体战斗位置与出现数量。" /><KnowledgeTabs page="bounty" />
    <div className="bounty-layout"><section className="sheet bounty-search" aria-label="妖怪查询"><h2>查妖怪，找地点</h2><label className="field">妖怪名称 / 拼音 / 神秘线索<div className="search-input"><Search size={17} /><input aria-label="妖怪名称或神秘线索" value={query} onChange={e => { setQuery(e.target.value); setMobileDetail(false); }} placeholder="例如：蝙蝠、鼓 单眼、tyg" />{query && <button className="icon-button" aria-label="清空妖怪查询" onClick={() => setQuery('')}><X size={15} /></button>}</div></label><p className="fineprint">支持不完整名称与拼音；多个关键词用空格分隔，同时匹配。</p><p className="bounty-count" role="status">{names.length ? `匹配 ${names.length} / ${bountyNames.length} 个资料妖怪` : '没有匹配的妖怪'}</p>
      <div className="bounty-monsters">{names.map(n => <button key={n} aria-pressed={n === name} onClick={() => { setSelected(n); setMobileDetail(true); }}><GameImage id={ids.get(n) ?? ''} name={n} /><span><b>{n}</b>{clues[n]?.length ? <small>{clues[n].join(' / ')}</small> : <small>按名称查询</small>}</span></button>)}</div>{!names.length && <Empty title="换个关键词试试"><p>线索尚未收录时，可直接输入妖怪名称。</p><button onClick={() => setQuery('')}>显示全部妖怪</button></Empty>}</section>
      <section ref={detail} tabIndex={-1} className="sheet bounty-detail" aria-label="妖怪出现地点" onKeyDown={e => { if (e.key === 'Escape') back(); }}><button className="bounty-back text" onClick={back}><ChevronLeft size={16} />返回妖怪列表</button>{name ? <><header className="bounty-detail-heading"><GameImage id={ids.get(name) ?? ''} name={name} /><div><h2>{name}</h2><p>{clues[name]?.length ? `神秘线索：${clues[name].join(' / ')}` : '暂无神秘线索，以下为按名称查询的出现地点。'}</p></div><button onClick={exportRows} disabled={!rows.length}><Download size={15} />导出地点</button></header>
        <div className="bounty-controls"><div className="bounty-categories" role="group" aria-label="副本类型">{['', ...bountyCategories].map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{categoryLabels[c] ?? (c || '全部')}</button>)}</div><div className="bounty-extra"><label className="field">探索难度<select aria-label="探索难度" value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="">全部难度</option><option>普通</option><option>困难</option></select></label><label className="field">需要击败数量<input aria-label="需要击败数量" type="number" min="1" max="9999" step="1" placeholder="可选" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><button className="text" onClick={() => { setCategory(''); setDifficulty(''); setQuantity(''); }}><RotateCcw size={15} />重置条件</button></div>{quantity && !wanted && <p role="alert" className="error-text">请输入 1–9999 的整数。</p>}</div>
        <div className="bounty-result-summary"><strong>{rows.length} 条位置记录</strong><span>探索挑战优先，其余按单条数量排列。</span></div><div className="bounty-encounters">{rows.slice(current * 12, (current + 1) * 12).map((e, i) => <article key={`${current}-${i}`}><div><small>{categoryLabels[e.category] ?? e.category}{e.category === '挑战' && <span><Ticket size={12} />消耗式神挑战券</span>}</small><h3>{e.location}</h3><p>{e.position} · {e.difficulty === '未区分' ? '资料未区分难度' : e.difficulty}</p></div><div className="bounty-kills"><strong>{e.count}<small>只</small></strong>{wanted && <span>按此记录约 {Math.ceil(wanted / e.count)} 次</span>}</div></article>)}</div>{!rows.length && <Empty title="该条件下没有出现地点"><button onClick={() => { setCategory(''); setDifficulty(''); }}>查看全部地点</button></Empty>}
        {rows.length > 12 && <nav className="bounty-pagination" aria-label="悬赏地点分页"><button disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={16} />上一页</button><span>{current + 1} / {Math.ceil(rows.length / 12)}</span><button disabled={(current + 1) * 12 >= rows.length} onClick={() => { setPage(current + 1); detail.current?.scrollIntoView({ block: 'start' }); }}>下一页<ChevronRight size={16} /></button></nav>}
        <details className="bounty-source"><summary>资料来源与使用说明</summary><p>地点和数量来自 <a href={bountySource} target="_blank" rel="noreferrer">Koncoo 悬赏封印查询器</a>，抓取于 {bountyDate}；神秘线索来自独立读取的游戏静态配置及 <a href={clueSource} target="_blank" rel="noreferrer">4399 线索资料</a>。公共攻略可能与当前游戏有差异，以游戏内为准。</p><p>次数按单条位置数量估算，不包含其他波次、额外召唤或路线合并；挑战消耗挑战券。普通 / 困难只筛除明确标注为另一难度的记录，未区分记录会保留。</p></details></> : <Empty title="先选择一个妖怪" />}</section></div></div>;
}
