import { useEffect, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useApp } from '../context';
import { csv, download, execute } from '../api';
import { Empty, PageTitle } from '../components';
import GameImage from '../GameImage';
import RealmStatus from './RealmStatus';
import { date, number, type Document, type Resource } from '../types';

interface Card { itemId: number; name: string; star: number; type: number; hours: number; quantity: number; rewards: { name: string; perHour: number | null; totalPerCard: number | null }[] }
interface ResourceFact { type: number; description?: string }
const idOf = (resource: Resource) => resource.name.match(/ · #(\d+)$/)?.[1] ?? '';
const nameOf = (resource: Resource) => resource.name.replace(/ · #\d+$/, '');
const collections: Record<string, { name: string; types: number[] }> = { skin: { name: '式神与阴阳师皮肤', types: [41, 905] }, frame: { name: '头像框', types: [903, 924] }, yard: { name: '庭院', types: [904] }, space: { name: '空间装扮', types: [912] }, paper: { name: '小纸人', types: [45] } };
const resourceCategories = [
  { name: '常用货币', ids: ['900001', '900002', '900006', '900012', '900016'] },
  { name: '体力与挑战', ids: ['900003', '900273', '900024', '900215', '900007', '900120', '900039', '900040', '900041'] },
  { name: '召唤', ids: ['490001', '490002', '490004', '900390', '900391', '490017'] },
  { name: '兑换与养成', ids: ['900178', '900188', '900216', '900217', '900218', '1001416', '900197', '900198'] },
  { name: '皮肤与兑换券', ids: ['900023', '900252'] },
];

export default function GameAssets() {
  const { state, notify } = useApp(); const [view, setView] = useState('resources'); const [query, setQuery] = useState(''); const [allItems, setAllItems] = useState(false); const [collection, setCollection] = useState('skin'); const [page, setPage] = useState(0); const [selectedCard, setSelectedCard] = useState('');
  const [profileId, setProfileId] = useState(''); const [preview, setPreview] = useState<{ id: string; revision: string; data: Document } | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const selectedId = profileId || state?.activeId || ''; const profile = state?.profiles.find(p => p.id === selectedId);
  const data = selectedId === state?.activeId ? state.data : preview?.id === selectedId && preview.revision === profile?.updatedAt ? preview.data : null;
  const showAll = allItems || !!query.trim();
  const facts = data?.extras?.resourceDetails as Record<string, ResourceFact> | undefined;
  const inventory = data?.extras?.realmInventory as { groups: Card[]; unknown: number; source: string } | undefined;
  const cards = inventory?.groups ?? [];
  const resourceMatches = (resource: Resource) => !query || resource.name.toLowerCase().includes(query.toLowerCase());
  const resources = data?.resources.filter(resourceMatches) ?? [];
  const skinRows = resources.filter(r => collections[collection].types.includes(facts?.[idOf(r)]?.type ?? -1));
  const shards = (data?.shards ?? []).filter(s => !query || s.name.includes(query) || s.id.includes(query));
  const cardGroups = [...new Set(cards.map(c => c.name))].filter(name => name.includes(query)).map(name => ({ name, rows: cards.filter(c => c.name === name) })).sort((a, b) => b.rows.reduce((n, c) => n + c.quantity, 0) - a.rows.reduce((n, c) => n + c.quantity, 0));
  const selectedRows = cards.filter(c => c.name === selectedCard);
  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);
  const paged = view === 'shards' ? shards : view === 'cosmetics' ? skinRows : resources;
  const pages = Math.max(1, Math.ceil(paged.length / 48)); const currentPage = Math.min(page, pages - 1);
  useEffect(() => { setPage(0); }, [view, query, collection, profileId]);
  useEffect(() => {
    let valid = true; setPreview(null); setError(''); setSelectedCard('');
    if (!selectedId || selectedId === state?.activeId) { setLoading(false); return; }
    setLoading(true); void execute<{ data: Document }>('export_document', { id: selectedId }).then(result => { if (valid) setPreview({ id: selectedId, revision: profile?.updatedAt ?? '', data: result.data }); }).catch(e => { if (valid) setError(String(e instanceof Error ? e.message : e)); }).finally(() => { if (valid) setLoading(false); });
    return () => { valid = false; };
  }, [selectedId, profile?.updatedAt, state?.activeId, retry]);
  async function exportAssets() { try { if (data) await download('游戏资产.csv', csv([['名称', '数量', '单位'], ...data.resources.map(r => [nameOf(r), r.amount, r.unit])]), 'text/csv'); } catch (e) { notify(String(e), true); } }
  const resourceCard = (r: Resource) => <article className="asset-resource" key={r.name}><GameImage kind="currency" id={idOf(r)} name={nameOf(r)} /><div><h3>{nameOf(r)}</h3><strong title={number(r.amount, 0)}>{number(r.amount, 0)}</strong></div><small>{facts?.[idOf(r)]?.description?.replace(/<[^>]*>|\[[^\]]*\]/g, '').slice(0, 75)}</small></article>;
  return <div className="game-assets"><PageTitle title="游戏资产" description="资源余额、结界卡库存和外观收藏 · 本地角色快照" actions={<button disabled={!data} onClick={() => void exportAssets()}><Download size={16} />导出资源</button>} />
    <section className="sheet padded"><div className="filters asset-controls"><label className="field">查看角色<select aria-label="资产查看角色" value={profileId || state?.activeId || ''} onChange={e => setProfileId(e.target.value)}>{state?.profiles.map(p => <option key={p.id} value={p.id}>{p.name}{p.source === 'demo' ? '（演示）' : ''}</option>)}</select></label><label className="search-input grow"><Search size={17} /><input aria-label="搜索游戏资产" placeholder="搜索名称或物品编号" value={query} onChange={e => setQuery(e.target.value)} /></label><span className="muted">{profile ? `快照 ${date(profile.updatedAt)}` : '尚无角色'}</span></div></section>
    <nav className="roster-views" aria-label="游戏资产分类">{[['resources', '核心资源'], ['realm', '结界卡'], ['shards', '碎片'], ['cosmetics', '外观收藏']].map(([key, name]) => <button key={key} aria-current={view === key ? 'page' : undefined} onClick={() => setView(key)}>{name}</button>)}</nav>
    {error ? <section className="sheet padded" role="alert"><h2>无法读取这个角色的资产</h2><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>重新读取</button></section> : loading || selectedId !== state?.activeId && !data && !!profile ? <section className="sheet padded" role="status">正在读取角色资产…</section> : !data ? <Empty title="还没有游戏快照"><a className="button" href="#source">读取游戏数据</a></Empty> : <>
      {view === 'resources' && <><div className="row asset-section-heading"><h2>{query.trim() ? `搜索结果 · ${resources.length} 项` : allItems ? '全部物品余额' : '常用资源'}</h2><label className="check"><input type="checkbox" checked={allItems} onChange={e => setAllItems(e.target.checked)} />查看全部物品</label></div>{showAll ? <div className="asset-resource-grid">{resources.slice(currentPage * 48, (currentPage + 1) * 48).map(resourceCard)}</div> : resourceCategories.map(category => { const rows = category.ids.flatMap(id => resources.filter(r => idOf(r) === id)); return rows.length ? <section className="asset-category" key={category.name}><h3>{category.name}</h3><div className="asset-resource-grid">{rows.map(resourceCard)}</div></section> : null; })}{showAll && !resources.length && <Empty title={query ? "没有匹配的资源" : "资源库存尚未读取"}><p>{query ? "尝试缩短名称或输入物品编号。" : "请重新读取游戏物品数据。"}</p></Empty>}<p className="fineprint">搜索会查询全部物品；显示快照明确保存的余额。未读取的项目不补成零；完整物品可通过“查看全部物品”搜索。</p></>}
      {view === 'realm' && <><RealmStatus data={data} /><section className="sheet"><div className="padded-heading"><h2>结界卡库存</h2><span>{number(totalCards, 0)} 张 · {new Set(cards.map(c => c.name)).size} 种</span></div>{inventory ? <><div className="table-scroll"><table><thead><tr><th>卡片类型</th>{[1, 2, 3, 4, 5, 6].map(star => <th key={star}>{star} 星</th>)}<th>合计</th></tr></thead><tbody>{cardGroups.map(group => <tr key={group.name}><td><button className="text" aria-expanded={selectedCard === group.name} onClick={() => setSelectedCard(selectedCard === group.name ? '' : group.name)}>{group.name}</button></td>{[1, 2, 3, 4, 5, 6].map(star => <td key={star}>{number(group.rows.filter(c => c.star === star).reduce((sum, c) => sum + c.quantity, 0), 0)}</td>)}<td><strong>{number(group.rows.reduce((sum, c) => sum + c.quantity, 0), 0)}</strong></td></tr>)}</tbody></table></div>{!cardGroups.length && <Empty title="没有匹配结界卡" />}{selectedRows.length > 0 && <div className="padded asset-card-details"><h3>{selectedCard} · 时长与产出</h3><div className="table-scroll"><table><thead><tr><th>星级</th><th>数量</th><th>持续时间</th><th>每小时</th><th>单卡总产出</th></tr></thead><tbody>{selectedRows.sort((a, b) => b.star - a.star || b.hours - a.hours).map((card, i) => <tr key={i}><td>{card.star} 星</td><td>{card.quantity}</td><td>{card.hours} 小时</td><td>{card.rewards.map(r => `${r.name} ${r.perHour == null ? '未知' : number(r.perHour)}`).join(' / ')}</td><td>{card.rewards.map(r => `${r.name} ${r.totalPerCard == null ? '未知' : number(r.totalPerCard)}`).join(' / ')}</td></tr>)}</tbody></table></div></div>}<p className="padded fineprint">{inventory.source}{inventory.unknown > 0 && ` · 另有 ${inventory.unknown} 条未识别记录。`}</p></> : <Empty title="结界卡库存尚未读取" />}</section></>}
      {view === 'shards' && <section className="sheet"><div className="padded-heading"><h2>碎片库存 · {shards.length} 种</h2><a className="button" href="#shards">查询供养来源</a></div><div className="table-scroll"><table><thead><tr><th>式神</th><th>普通</th><th>绑定</th><th>总计</th><th>契约书</th></tr></thead><tbody>{shards.slice(currentPage * 48, (currentPage + 1) * 48).map(s => <tr key={s.id}><td><span className="shard-hero"><GameImage id={s.id} name={s.name} />{s.name}</span></td><td>{s.normal ?? '未读取'}</td><td>{s.bound ?? '未读取'}</td><td>{s.quantity}</td><td>{s.contracts ?? '未读取'}</td></tr>)}</tbody></table></div>{!shards.length && <Empty title={query ? "没有匹配的碎片" : "碎片库存尚未读取"}><p>{query ? "尝试其他式神名称或编号。" : "请重新读取游戏式神与碎片数据。"}</p></Empty>}</section>}
      {view === 'cosmetics' && <><div className="asset-collection-summary">{Object.entries(collections).map(([key, group]) => <button key={key} aria-pressed={collection === key} onClick={() => setCollection(key)}><strong>{facts ? data.resources.filter(r => group.types.includes(facts[idOf(r)]?.type)).length : '未知'}</strong><span>{group.name}</span></button>)}</div>{facts ? <><p className="fineprint">按库存中确认持有的外观种类统计；同款多份仅计一种。当前分类 {skinRows.length} 种。</p><div className={`asset-cosmetic-grid ${collection}`}>{skinRows.slice(currentPage * 48, (currentPage + 1) * 48).map(r => <article key={r.name}><GameImage kind="currency" id={idOf(r)} name={nameOf(r)} /><h3>{nameOf(r)}</h3><small>#{idOf(r)}{r.amount > 1 ? ` · 持有 ${r.amount} 份` : ''}</small></article>)}</div>{!skinRows.length && <Empty title="没有匹配的外观收藏" />}</> : <Empty title="这份旧快照尚未包含外观分类"><p>重新读取游戏后可查看皮肤、头像框和庭院收藏。</p></Empty>}</>}
      {(view === 'cosmetics' || view === 'shards' || view === 'resources' && showAll) && paged.length > 48 && <nav className="roster-pagination" aria-label="游戏资产分页"><span>{currentPage * 48 + 1}–{Math.min(paged.length, (currentPage + 1) * 48)} / {paged.length}</span><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {pages}</span><button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button></nav>}
    </>}
  </div>;
}
