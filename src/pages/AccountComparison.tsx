import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useApp } from '../context';
import { NeedData, PageTitle } from '../components';
import { date, number, type Document } from '../types';

const metrics = [
  { name: '御魂库存', value: (d: Document) => d.souls.length },
  { name: '满级御魂', value: (d: Document) => d.souls.filter(s => s.level === 15).length },
  { name: '锁定御魂', value: (d: Document) => d.souls.filter(s => s.locked).length },
  { name: '式神记录', value: (d: Document) => d.heroes.length },
  { name: '六星式神', value: (d: Document) => d.heroes.filter(h => h.star === 6).length },
  { name: '持有 SSR 种类', value: (d: Document) => new Set(d.heroes.filter(h => h.rarity === 'SSR').map(h => h.name)).size },
  { name: '持有 SP 种类', value: (d: Document) => new Set(d.heroes.filter(h => h.rarity === 'SP').map(h => h.name)).size },
  { name: '御魂套装种类', value: (d: Document) => new Set(d.souls.map(s => s.set)).size },
];
export default function AccountComparison({ embedded = false }: { embedded?: boolean }) {
  const { state, run } = useApp(); const [id, setId] = useState(''); const [comparison, setComparison] = useState<Document | null>(null); const [loading, setLoading] = useState(false);
  const serial = useRef(0); useEffect(() => () => { serial.current++; }, []);
  async function choose(nextId: string) {
    const ticket = ++serial.current; setId(nextId); setComparison(null);
    if (!nextId) { setLoading(false); return; }
    setLoading(true); const result = await run<{ data: Document }>('export_document', { id: nextId });
    if (ticket !== serial.current) return;
    if (result) setComparison(result.data); setLoading(false);
  }
  const left = state?.data; const right = comparison;
  return <>{!embedded && <PageTitle title="角色分析" description="比较本机已读取的角色档案，包含游戏档案与藏宝阁商品档案。" actions={<a className="button" href="#import">读取藏宝阁或游戏档案<ArrowRight size={15} /></a>} />}<NeedData>
    <section className="sheet padded"><div className="form-grid"><div><h2>当前角色 · {left?.name}</h2><p className="muted">{state?.profiles.find(p => p.id === state.activeId)?.source} · 当前档案</p></div><label className="field">选择对照角色<select aria-label="角色分析对照档案" value={id} onChange={e => void choose(e.target.value)}><option value="">选择本机的另一份档案</option>{state?.profiles.filter(p => p.id !== state.activeId).map(p => <option key={p.id} value={p.id}>{p.name} · {p.source}</option>)}</select></label></div>
      <p className="fineprint">比较只读取本地档案，不切换当前角色，也不覆盖库存。这里只统计已经读取的记录；未读取的外观、技能和契灵不能据此判定未拥有。</p>
      {id && <p className="muted">对照更新时间：{date(state?.profiles.find(p => p.id === id)?.updatedAt ?? '')}</p>}
    </section>
    {loading ? <p role="status">正在载入对照角色…</p> : <section className="sheet"><div className="table-scroll"><table><thead><tr><th>比较项目</th><th>{left?.name ?? '当前角色'}</th><th>{right?.name ?? '选择对照角色'}</th><th>当前 − 对照</th></tr></thead><tbody>{left && metrics.map(metric => { const a = metric.value(left); const b = right ? metric.value(right) : null; const delta = b === null ? null : a - b; return <tr key={metric.name}><td>{metric.name}</td><td className="numeric">{number(a, 0)}</td><td className="numeric">{b === null ? '—' : number(b, 0)}</td><td className="numeric">{delta === null ? '—' : `${delta > 0 ? '+' : ''}${number(delta, 0)}`}</td></tr>; })}</tbody></table></div>{!right && <p className="padded muted">选择另一份已读取档案即可比较；没有其他档案时，先到数据读取中新增。</p>}</section>}
    <section className="sheet padded"><h2>资源对照</h2><div className="table-scroll"><table><thead><tr><th>资源</th><th>当前角色</th><th>对照角色</th></tr></thead><tbody>{['勾玉', '金币', '体力', '神秘的符咒', '皮肤券'].map(name => { const value = (d: Document | null | undefined) => d?.resources.find(r => r.name === name || r.name.startsWith(`${name} · #`))?.amount; return <tr key={name}><td>{name}</td><td>{value(left) === undefined ? '未读取' : number(value(left)!, 0)}</td><td>{value(right) === undefined ? '未读取' : number(value(right)!, 0)}</td></tr>; })}</tbody></table></div></section>
    <p className="fineprint">当前实现库存与资源比较。商品价格评估、外观收集、满技能覆盖和契灵质量比较尚未实现。</p>
  </NeedData></>;
}
