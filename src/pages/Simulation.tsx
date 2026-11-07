import { useEffect, useRef, useState } from 'react';
import { Dices, Play } from 'lucide-react';
import { useApp } from '../context';
import { Badge, Empty, NeedData, PageTitle, SoulDetail } from '../components';
import { csv, download } from '../api';
import GameImage from '../GameImage';
import ExchangeSimulation from './ExchangeSimulation';
import { labels, attribute, number, type Rule, type Simulation, type Soul } from '../types';
import '../simulation.css';

function SingleSimulation() {
  const { state, busy, run } = useApp(); const choices = state?.data?.souls.filter(s => s.quality === 6 && s.level < 15) ?? [];
  const [id, setId] = useState(choices[0]?.id ?? ''); const [seed, setSeed] = useState(42); const [result, setResult] = useState<Simulation | null>(null);
  const soul = choices.find(s => s.id === id);
  return <><NeedData><div className="notice"><strong>参考强化模型</strong><p>主属性增量和副属性成长范围来自独立读取的游戏配置。抽样和取整仍是参考模型，不能预测真实强化；结果保留在本地，不写回游戏。</p></div><div className="two-columns"><section className="sheet padded"><h2><Dices size={20} />强化推演</h2><label className="field">选择六星未满级御魂<select disabled={busy} value={id} onChange={e => { setId(e.target.value); setResult(null); }}>{!choices.length && <option value="">无可模拟御魂</option>}{choices.map(s => <option key={s.id} value={s.id}>{s.set} · {s.slot}号位 · +{s.level} · {s.id}</option>)}</select></label><label className="field">随机种子<input type="number" min="0" max="9007199254740991" step="1" disabled={busy} value={seed} onChange={e => { setSeed(Number(e.target.value)); setResult(null); }} /></label><div className="actions"><button className="primary" disabled={busy || !soul || !Number.isSafeInteger(seed) || seed < 0} onClick={async () => { const r = await run<Simulation>('simulate', { id: state?.activeId, soulId: id, seed }); if (r) setResult(r); }}><Play size={16} />推演到 +15</button><button disabled={busy} onClick={() => { setSeed(Math.floor(Math.random() * 1e9)); setResult(null); }}>换一个种子</button></div>{soul ? <SoulDetail soul={soul} /> : <Empty title="暂无六星未满级御魂" />}</section><section className="sheet padded"><h2>模拟结果</h2>{result ? <><div className="table-scroll"><table><thead><tr><th>强化节点</th><th>变化</th><th>增加数值</th></tr></thead><tbody>{result.steps.map(s => <tr key={s.level}><td>+{s.level}</td><td><Badge>{s.new ? '新增' : '强化'}</Badge> {labels[s.attribute]}</td><td className="accent">+{attribute(s.attribute, s.gain)}</td></tr>)}</tbody></table></div><SoulDetail soul={result.soul} /><p className="notice">{result.model}</p><p className="fineprint">种子 {result.seed} · 相同御魂和种子会生成相同结果。</p></> : <Empty title="等待一次推演"><p>选择御魂，点击“推演到 +15”。</p></Empty>}</section></div></NeedData></>;
}

interface BatchRow { original:Soul; simulation:Simulation; beforeScore:number; afterScore:number }
interface BatchResult { schema:string; seed:number; selectionModel:string; rule:Rule; rows:BatchRow[] }
interface BatchRun extends BatchResult { source:{profileId:string;name:string;version:string;snapshotId:string|null} }

function BatchSimulation(){
  const {state,history,busy,run,notify}=useApp();const data=state?.data;
  const rules=state?.rules.filter(r=>r.model!=='conditions')??[];
  const [set,setSet]=useState(''),[slot,setSlot]=useState(''),[main,setMain]=useState(''),[initial,setInitial]=useState('');
  const [includeLocked,setIncludeLocked]=useState(true),[includeEquipped,setIncludeEquipped]=useState(true);
  const [seed,setSeed]=useState('42'),[model,setModel]=useState('reinforced'),[ruleId,setRuleId]=useState(rules[0]?.id??'default');
  const [result,setResult]=useState<BatchRun|null>(null),[query,setQuery]=useState(''),[minimum,setMinimum]=useState(''),[sort,setSort]=useState('score'),[page,setPage]=useState(1);
  const ticket=useRef(0);
  function invalidate(){ticket.current++;setResult(null);setPage(1);}
  useEffect(()=>{invalidate();return()=>{ticket.current++;};},[data,state?.rules,history?.id]);
  const eligible=data?.souls.filter(s=>s.quality===6&&s.level===0)??[];
  const scope=eligible.filter(s=>(!set||s.set===set)&&(!slot||s.slot===Number(slot))&&(!main||s.main===main)&&(!initial||Object.keys(s.sub).length===Number(initial))&&(includeLocked||!s.locked)&&(includeEquipped||!s.equipped));
  const seedError=seed.trim()===''||!Number.isSafeInteger(Number(seed))||Number(seed)<0?'请输入0–9007199254740991之间的整数种子。':'';
  const minimumError=minimum!==''&&(!Number.isFinite(Number(minimum))||Number(minimum)<0);
  const shown=(result?.rows??[]).filter(r=>(!query.trim()||`${r.original.id} ${r.original.set} ${labels[r.original.main]}`.includes(query.trim()))&&(!minimum||(!minimumError&&r.afterScore>=Number(minimum)))).slice().sort((a,b)=>sort==='speed'?(b.simulation.soul.sub.speed??0)-(a.simulation.soul.sub.speed??0)||b.afterScore-a.afterScore:sort==='gain'?(b.afterScore-b.beforeScore)-(a.afterScore-a.beforeScore):b.afterScore-a.afterScore);
  const pages=Math.max(1,Math.ceil(shown.length/12));
  async function calculate(){if(!data||!state?.activeId||busy||seedError||!scope.length)return;const current=++ticket.current;setResult(null);const source={profileId:state.activeId,name:data.name,version:history?.createdAt??state.profiles.find(p=>p.id===state.activeId)?.updatedAt??'',snapshotId:history?.id??null};const response=await run<BatchResult>('simulate_batch',{id:state.activeId,soulIds:scope.map(s=>s.id),seed:Number(seed),model,ruleId});if(response&&current===ticket.current){setResult({...response,source});setPage(1);}}
  async function exportResult(format:'json'|'csv'){if(!result)return;try{if(format==='json')await download('库存强化-完整推演.json',JSON.stringify(result,null,2));else await download('库存强化-筛选结果.csv',csv([['御魂ID','套装','号位','主属性','原始评分','模拟评分','评分标准','随机模型','批次种子','单件种子','模拟副属性JSON','五次强化JSON','原始御魂JSON','角色','档案时间','历史版本ID'],...shown.map(r=>[r.original.id,r.original.set,r.original.slot,labels[r.original.main],r.beforeScore,r.afterScore,result.rule.name,result.selectionModel,result.seed,r.simulation.seed,JSON.stringify(r.simulation.soul.sub),JSON.stringify(r.simulation.steps),JSON.stringify(r.original),result.source.name,result.source.version,result.source.snapshotId])]),'text/csv');}catch(e){notify(String(e),true);}}
  return <NeedData>
    <section className="sheet padded batch-settings" aria-label="库存强化设置">
      <div className="section-title"><h2>库存强化</h2><span className="muted">六星 +0 · 五次强化至 +15</span></div>
      <p className="muted">从当前档案选择御魂，生成独立的虚拟结果；不会消耗资源或改动库存。</p>
      <fieldset className="batch-fields" disabled={busy}><legend className="visually-hidden">选择模拟范围</legend>
        <label className="field">御魂套装<select value={set} onChange={e=>{setSet(e.target.value);invalidate();}}><option value="">全部套装</option>{[...new Set(eligible.map(s=>s.set))].sort((a,b)=>a.localeCompare(b,'zh-CN')).map(s=><option key={s}>{s}</option>)}</select></label>
        <label className="field">号位<select value={slot} onChange={e=>{setSlot(e.target.value);invalidate();}}><option value="">全部号位</option>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}号位</option>)}</select></label>
        <label className="field">主属性<select value={main} onChange={e=>{setMain(e.target.value);invalidate();}}><option value="">全部主属性</option>{[...new Set(eligible.map(s=>s.main))].map(a=><option key={a} value={a}>{labels[a]}</option>)}</select></label>
        <label className="field">初始副属性<select value={initial} onChange={e=>{setInitial(e.target.value);invalidate();}}><option value="">全部条数</option>{[2,3,4].map(n=><option key={n} value={n}>{n}条</option>)}</select></label>
        <label className="field">随机种子<input value={seed} type="number" min="0" max="9007199254740991" step="1" aria-invalid={!!seedError} aria-describedby={seedError?'batch-seed-error':undefined} onChange={e=>{setSeed(e.target.value);invalidate();}}/></label>
        <label className="field">随机模型<select value={model} onChange={e=>{setModel(e.target.value);invalidate();}}><option value="reinforced">娱乐累计权重</option><option value="uniform">等概率参考</option></select></label>
        <label className="field">副属性权重评分<select value={ruleId} onChange={e=>{setRuleId(e.target.value);invalidate();}}>{rules.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      </fieldset>
      <div className="actions batch-options"><label className="check"><input type="checkbox" checked={includeLocked} disabled={busy} onChange={e=>{setIncludeLocked(e.target.checked);invalidate();}}/>包含已锁定</label><label className="check"><input type="checkbox" checked={includeEquipped} disabled={busy} onChange={e=>{setIncludeEquipped(e.target.checked);invalidate();}}/>包含已装备</label></div>
      {seedError&&<p className="error" id="batch-seed-error" role="alert">{seedError}</p>}
      <div className="batch-run"><p role="status"><strong>{number(scope.length,0)}</strong> 枚符合范围 <span className="muted">/ {number(eligible.length,0)} 枚六星 +0</span></p><div className="actions"><button disabled={busy} onClick={()=>{setSeed(String(Math.floor(Math.random()*1e9)));invalidate();}}>换一个种子</button><button className="primary" disabled={busy||!!seedError||!scope.length||!rules.some(r=>r.id===ruleId)} onClick={()=>void calculate()}><Play size={16}/>{busy?'正在处理…':`模拟强化 ${number(scope.length,0)} 枚`}</button></div></div>
      {!scope.length&&<p className="empty-inline">没有符合范围的六星 +0 御魂。放宽筛选条件，或先读取游戏库存。</p>}
      {history&&<p className="fineprint">范围来自所选历史版本；评分标准使用本机当前配置。</p>}
      <details className="batch-rules"><summary>随机模型与评分说明</summary><p>主属性增量和副属性成长范围来自独立读取的游戏配置。每次成长在80%–100%范围内连续均匀抽样；实际随机及取整过程尚未逐次校验。</p><p>娱乐累计权重：已有副属性初始权重为1，命中一次加1。新增先按攻击36%、防御36%、功能28%选择类别，再在该类别的剩余属性中等概率抽取；类别抽空时归一化。主、副属性允许同名，副属性内部去重。等概率模型在可选属性间均匀抽样。</p><p>评分沿用“评分标准”中的副属性权重，不含主属性、固有属性和套装效果。相同种子和御魂产生相同结果，缩小范围不会重新随机。</p></details>
    </section>
    <section className="sheet padded batch-results" aria-label="批量强化结果" aria-busy={busy}>
      <div className="section-title"><h2>模拟结果</h2>{result&&<span className="muted">{number(result.rows.length,0)} 枚 · 种子 {result.seed}</span>}</div>
      {!result?<Empty title="等待批量推演"><p>选择范围后点击“模拟强化”，查看全部结果与五次强化明细。</p></Empty>:<>
        <p className="fineprint">{result.source.name} · {result.source.snapshotId?'历史版本':'当前档案'} · {result.source.version?new Date(result.source.version).toLocaleString('zh-CN'):''} · {result.rule.name}</p>
        <div className="batch-result-tools"><label className="field">筛选结果<input type="search" placeholder="套装 / 主属性 / 御魂编号" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></label><label className="field">最低模拟评分<input type="number" min="0" step="any" value={minimum} aria-invalid={!!minimumError} onChange={e=>{setMinimum(e.target.value);setPage(1);}}/></label><label className="field">结果排序<select value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}}><option value="score">模拟评分降序</option><option value="gain">评分提升降序</option><option value="speed">副属性速度降序</option></select></label></div>
        {minimumError&&<p className="error" role="alert">最低评分需要非负数，清空可查看全部结果。</p>}
        <div className="batch-export"><span role="status">{number(shown.length,0)} 枚匹配</span><div className="actions"><button onClick={()=>void exportResult('json')}>导出全部 JSON</button><button disabled={!shown.length} onClick={()=>void exportResult('csv')}>导出筛选 CSV</button></div></div>
        <div className="batch-list">{shown.slice((page-1)*12,page*12).map(r=><details key={`${result.seed}:${r.original.id}`}><summary><GameImage kind="suit" id="" name={r.original.set}/><span className="batch-soul-name"><strong>{r.original.set} · {r.original.slot}号位</strong><small>{labels[r.original.main]} · {r.original.id}</small></span><span className="batch-score"><small>模拟评分</small><strong>{number(r.afterScore,2)}</strong></span><span className="batch-score"><small>副属性速度</small><strong>{attribute('speed',r.simulation.soul.sub.speed??0)}</strong></span><span className="batch-open">明细</span></summary><div className="batch-detail"><p className="fineprint">评分 {number(r.beforeScore)} → {number(r.afterScore)} · 单件种子 {r.simulation.seed}</p><div className="batch-comparison"><div><h3>原始 +0</h3><SoulDetail soul={r.original}/></div><div><h3>模拟 +15</h3><SoulDetail soul={r.simulation.soul}/></div></div><div className="table-scroll"><table><caption>五次强化落点</caption><thead><tr><th>节点</th><th>变化</th><th>成长</th></tr></thead><tbody>{r.simulation.steps.map(s=><tr key={s.level}><td>+{s.level}</td><td>{s.new?'新增':'强化'} {labels[s.attribute]}</td><td>+{attribute(s.attribute,s.gain)}</td></tr>)}</tbody></table></div></div></details>)}</div>
        {!shown.length&&<Empty title="没有匹配的模拟结果"><p>清空搜索或降低评分门槛，无需重新运行。</p><button onClick={()=>{setQuery('');setMinimum('');setPage(1);}}>清空结果筛选</button></Empty>}
        <div className="batch-pagination"><span>第 {page} / {pages} 页 · 每页12枚</span><div className="actions"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>下一页</button></div></div>
        <p className="fineprint">完整JSON包含原始御魂、全部结果、五次强化和评分权重；CSV导出当前筛选的全部匹配项。模拟结果在离开此页后清空，请及时导出。</p>
      </>}
    </section>
  </NeedData>;
}

export default function SimulationPage(){
  const [mode,setMode]=useState('batch');const {state,history}=useApp();
  return <div className="simulation-page"><PageTitle title="模拟玩法" description="独立模拟御魂兑换与强化，所有结果均为虚拟参考。"/><div className="actions simulation-modes" aria-label="强化模拟方式">{[['batch','库存批量强化'],['gold','金蛇皮兑换'],['boss','首领／星痕兑换'],['bag','待强化背包'],['single','单件强化推演']].map(([key,name])=><button key={key} aria-pressed={mode===key} className={mode===key?'primary':''} onClick={()=>setMode(key)}>{name}</button>)}</div>{mode==='batch'&&<BatchSimulation/>}{mode==='single'&&<SingleSimulation key={`${state?.activeId}:${history?.id??state?.profiles.find(p=>p.id===state.activeId)?.updatedAt}`}/>}<div hidden={!['gold','boss','bag'].includes(mode)}><ExchangeSimulation key={`${state?.activeId}:${history?.id??state?.profiles.find(p=>p.id===state.activeId)?.updatedAt}`} mode={mode==='boss'||mode==='bag'?mode:'gold'}/></div></div>;
}
