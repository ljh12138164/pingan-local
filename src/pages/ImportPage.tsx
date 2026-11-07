import { useRef, useState } from 'react';
import { Download, FileJson, Upload, FlaskConical, Monitor, RefreshCw, Smartphone, ShoppingBag, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context';
import { download } from '../api';
import { Badge, PageTitle } from '../components';
import type { AppState, Document } from '../types';
import EmulatorReader from './EmulatorReader';
import ReadProgress from '../ReadProgress';

const sources = [
  { id: 'desktop', title: 'Windows 桌面版', hint: '读取已登录游戏', icon: Monitor },
  { id: 'emulator', title: 'MuMu 模拟器', hint: '通过本机 ADB 读取', icon: Smartphone },
  { id: 'json', title: '本地 JSON', hint: '恢复自己的档案', icon: FileJson },
  { id: 'cbg', title: '藏宝阁', hint: '预览公开商品', icon: ShoppingBag },
  { id: 'demo', title: '演示数据', hint: '体验合成库存', icon: FlaskConical },
];
export default function ImportPage() {
  const { state, busy: pending, run, mutate, setState, notify , history } = useApp(); const busy = pending || !!history;
  const [source, setSource] = useState('desktop'); const [reading, setReading] = useState(false); const [saved, setSaved] = useState(false);
  const [text, setText] = useState(''); const [fileName, setFileName] = useState('');
  const [processes, setProcesses] = useState<{ pid: number; name: string }[]>([]); const [pid, setPid] = useState(''); const [warnings, setWarnings] = useState<string[]>([]);
  const [scanned, setScanned] = useState(false);
  const [cbgUrl, setCbgUrl] = useState(''); const [cbg, setCbg] = useState<{ data: Document; warnings: string[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const loadFile = async (f?: File) => { if (!f) return; if (f.size > 64 * 1024 * 1024) { notify('文件超过 64 MB', true); return; } try { setText(await f.text()); setFileName(f.name); } catch (e) { notify(String(e), true); } };
  let preview = ''; try { const parsed = JSON.parse(text); const d = parsed.data ?? parsed; preview = `${d.souls?.length ?? 0} 枚御魂 · ${d.heroes?.length ?? 0} 位式神`; } catch { if (text) preview = 'JSON 尚未完整，请检查格式'; }
  return <><PageTitle title="数据读取" description="选择数据来源，读取后即可在工作台分析。所有档案保存在本机。" />
    <div className="source-tabs" aria-label="数据来源">{sources.map(item => <button key={item.id} className={source === item.id ? 'active' : ''} aria-pressed={source === item.id} disabled={reading} onClick={() => setSource(item.id)}><item.icon size={21} strokeWidth={1.6} /><span><b>{item.title}</b><small>{item.hint}</small></span></button>)}</div>
    <div className="reader-layout"><div className="reader-content">
      <section hidden={source !== 'desktop'} className="sheet padded"><div className="section-title"><h2><Monitor size={19} />Windows 桌面版读取</h2><Badge>只读采集</Badge></div><p className="muted">登录阴阳师桌面版并进入庭院，再扫描已启动的游戏。</p>
        <div className="reader-step"><span className="step-number">1</span><div><h3>找到游戏进程</h3><button disabled={busy} onClick={async () => { const rows = await run<{ pid: number; name: string }[]>('game_processes'); if (rows) { setScanned(true); setProcesses(rows); setPid(rows[0]?.pid.toString() ?? ''); setSaved(false); } }}><RefreshCw size={16} />扫描已启动的游戏</button>{scanned && !processes.length && <p className="inline-warning" role="status">未找到 onmyoji.exe。请启动桌面版并登录，再重新扫描。</p>}<label className="field">选择游戏进程<select disabled={busy || !processes.length} value={pid} onChange={e => { setPid(e.target.value); setSaved(false); }}><option value="">请选择进程</option>{processes.map(p => <option key={p.pid} value={p.pid}>{p.name} · PID {p.pid}</option>)}</select></label></div></div>
        <div className="reader-step"><span className="step-number">2</span><div><h3>读取角色与库存</h3><p className="muted">采集御魂、式神、碎片、资产，以及游戏已载入的寮与结界缓存。</p><button className="primary" disabled={busy || !pid} onClick={async () => { setReading(true); setSaved(false); const r = await run<{ state: AppState; warnings: string[] }>('read_desktop', { pid: Number(pid) }); setReading(false); if (r) { setState(r.state); setWarnings(r.warnings); setSaved(true); notify('游戏快照已保存到本机'); } }}><Download size={16} />{reading ? '正在读取角色…' : '读取角色数据'}</button></div></div>
        {reading && <ReadProgress />}{saved && <div className="read-success" role="status"><CheckCircle2 size={20} /><div><strong>游戏快照已保存</strong><p>{state?.data?.souls.length ?? 0} 枚御魂 · {state?.data?.heroes.length ?? 0} 位式神</p></div><a href="#dashboard">前往工作台<ArrowRight size={15} /></a></div>}
        {warnings.length > 0 && <details className="notice"><summary>读取报告 · {warnings.length} 项说明</summary><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
      </section>
      <div hidden={source !== 'emulator'}><EmulatorReader onReading={setReading} /></div>
      <section hidden={source !== 'json'} className="sheet padded"><div className="section-title"><h2><FileJson size={20} />JSON 文件导入</h2><Badge tone="green">本地解析</Badge></div><p className="muted">支持本应用标准 JSON 与导出档案。导入后创建独立档案。</p>
        <input ref={file} className="visually-hidden" type="file" accept=".json,application/json" aria-label="选择 JSON 文件" onChange={e => { void loadFile(e.target.files?.[0]); e.target.value = ''; }} />
        <button className="dropzone" onClick={() => file.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void loadFile(e.dataTransfer.files[0]); }}><Upload size={27} /><strong>{fileName || '选择或拖入 JSON 文件'}</strong><span>最大 64 MB</span></button>
        <details open={!!text}><summary>粘贴或检查 JSON 内容</summary><label className="field">JSON 内容<textarea value={text} onChange={e => setText(e.target.value)} placeholder={'{ "name": "我的角色", "souls": [], "heroes": [] }'} rows={7} spellCheck={false} /></label></details>
        {preview && <p className="muted" role="status">预检：{preview}</p>}
        <div className="actions"><button className="primary" disabled={busy || !text.trim()} onClick={async () => { const next = await mutate('import_document', { text, name: fileName.replace(/\.json$/i, '') || '导入档案' }); if (next) { setText(''); setFileName(''); } }}><Upload size={16} />导入为新档案</button><button disabled={busy} onClick={async () => { const value = await run('template'); if (value) try { await download('平安手札-导入模板.json', JSON.stringify(value, null, 2)); } catch (e) { notify(String(e), true); } }}><Download size={16} />下载模板</button></div>
      </section>
      <section hidden={source !== 'cbg'} className="sheet padded"><div className="section-title"><h2>藏宝阁公开商品</h2><Badge>网易公开接口</Badge></div><p className="muted">粘贴阴阳师藏宝阁的 HTTPS 商品链接，先预检库存，再保存为独立档案。读取上架时的公开数据。</p><label className="field">商品链接<input type="url" value={cbgUrl} placeholder="https://yys.cbg.163.com/cgi/mweb/equip/…" onChange={e => { setCbgUrl(e.target.value); setCbg(null); }} /></label><div className="actions"><button disabled={busy || !cbgUrl.trim()} onClick={async () => { const r = await run<{ data: Document; warnings: string[] }>('preview_cbg', { url: cbgUrl }); if (r) setCbg(r); }}>预检公开商品</button>{cbg && <button className="primary" disabled={busy} onClick={async () => { const next = await mutate('import_cbg', { url: cbgUrl, data: cbg.data }); if (next) { setCbg(null); notify('藏宝阁快照已保存到本机'); } }}>导入商品快照</button>}</div>{cbg && <div className="notice"><strong>{cbg.data.name} · {cbg.data.souls.length} 枚御魂 · {cbg.data.heroes.length} 位式神 · {cbg.data.shards?.length ?? 0} 项碎片</strong><ul>{cbg.warnings.map(w => <li key={w}>{w}</li>)}</ul></div>}</section>
      <section hidden={source !== 'demo'} className="sheet padded"><h2><FlaskConical size={20} />体验演示档案</h2><p className="muted">创建 240 枚合成御魂与示例角色，体验评分、配装、强化和档案比较。演示数据会明确标记。</p><button disabled={busy} onClick={() => void mutate('create_demo')}>创建演示档案</button></section>
    </div><aside className="reader-guide"><h2>读取前准备</h2><p>保持游戏登录，建议停留在庭院。寮成员、结界与寄养需要先在游戏里打开对应页面，才能更新缓存。</p><h3>已有档案怎么更新？</h3><p>同一角色重新读取会更新游戏快照。手动记录和历史快照按本地档案管理。</p><h3>接下来可以做什么</h3><a href="#inventory">筛选御魂与查看评分<ArrowRight size={14} /></a><a href="#optimizer">计算套装面板<ArrowRight size={14} /></a><a href="#shards">查询碎片与传记进度<ArrowRight size={14} /></a><p className="fineprint">读取器、解析与计算由本项目实现。名称等事实目录来自网易公开配置。</p><a href="#settings">查看功能范围与数据来源</a></aside></div>
  </>;
}
