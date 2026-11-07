import { useState } from 'react';
import { Smartphone, RefreshCw } from 'lucide-react';
import { useApp } from '../context';
import type { AppState } from '../types';
import ReadProgress from '../ReadProgress';

interface Device { serial: string; status: string; description: string }
interface Probe { root: boolean; abi: string; games: { package: string; pid: number }[]; ready: boolean }
export default function EmulatorReader({ onReading }: { onReading?: (value: boolean) => void }) {
  const { busy: pending, run, setState, notify , history } = useApp(); const busy = pending || !!history;
  const [root, setRoot] = useState('D:\\Program Files\\Netease\\MuMu'); const [devices, setDevices] = useState<Device[]>([]); const [serial, setSerial] = useState('');
  const [probe, setProbe] = useState<Probe | null>(null); const [pid, setPid] = useState(''); const [enableRoot, setEnableRoot] = useState(true); const [warnings, setWarnings] = useState<string[]>([]);
  const [reading, setReading] = useState(false); const [saved, setSaved] = useState(false);
  function reset() { setProbe(null); setPid(''); setWarnings([]); }
  return <section className="sheet padded"><h2><Smartphone size={20} />MuMu 模拟器读取</h2><p className="muted">先在模拟器设置中开启 root，重启并登录阴阳师。当前适配 x86_64 客户端；读取时保持庭院界面。</p>
    <label className="field">MuMu 安装目录或 adb.exe 路径<input value={root} onChange={e => { setRoot(e.target.value); setDevices([]); setSerial(''); reset(); }} /></label>
    <button disabled={busy || !root.trim()} onClick={async () => { reset(); const result = await run<{ devices: Device[] }>('emulator_devices', { root }); if (result) { setDevices(result.devices); setSerial(result.devices.find(d => d.status === 'device')?.serial ?? ''); if (!result.devices.length) notify('没有连接的模拟器，请先启动 MuMu', true); } }}><RefreshCw size={16} />扫描模拟器</button>
    <label className="field">ADB 实例<select aria-label="ADB 实例" value={serial} onChange={e => { setSerial(e.target.value); reset(); }}><option value="">请选择已连接实例</option>{devices.map(d => <option key={d.serial} value={d.serial} disabled={d.status !== 'device'}>{d.serial} · {d.status} · {d.description}</option>)}</select></label>
    <label className="row"><input type="checkbox" checked={enableRoot} onChange={e => { setEnableRoot(e.target.checked); reset(); }} />使用已开启的 root 权限连接</label>
    <button disabled={busy || !serial} onClick={async () => { reset(); const result = await run<Probe>('emulator_probe', { root, serial, enableRoot }); if (result) { setProbe(result); setPid(result.games[0]?.pid.toString() ?? ''); } }}>检查权限与游戏</button>
    {probe && <div className="notice"><p>root：{probe.root ? '已连接' : '未取得'} · 架构：{probe.abi}</p>{!probe.root && <p>请先在 MuMu 设置中开启 root 并重启模拟器，再勾选上方 root 连接后检查。</p>}{!probe.games.length && <p>未发现运行中的阴阳师，请登录游戏后重新检查。</p>}{probe.games.length > 0 && <label className="field">游戏进程<select value={pid} onChange={e => setPid(e.target.value)}>{probe.games.map(g => <option key={g.pid} value={g.pid}>{g.package} · PID {g.pid}</option>)}</select></label>}</div>}
    <div className="actions"><button className="primary" disabled={busy || !probe?.ready || !pid} onClick={async () => { setReading(true); onReading?.(true); setSaved(false); const result = await run<{ state: AppState; warnings: string[] }>('read_emulator', { root, serial, pid: Number(pid) }); setReading(false); onReading?.(false); if (result) { setState(result.state); setWarnings(result.warnings); setSaved(true); notify('模拟器角色快照已保存到本机'); } }}>{reading ? '正在读取模拟器角色…' : '读取模拟器角色'}</button>{saved && <a className="button" href="#dashboard">查看工作台</a>}</div>
    {reading && <ReadProgress />}
    {warnings.length > 0 && <div className="notice"><strong>读取报告</strong><ul>{warnings.map(w => <li key={w}>{w}</li>)}</ul></div>}
  </section>;
}
