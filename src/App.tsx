import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BookOpen, Boxes, Calculator, CalendarDays, ChevronRight, ChevronDown, RefreshCw, CircleHelp, Database, FileClock, Fingerprint, FlaskConical, Gauge, GitCompareArrows, LayoutDashboard, LoaderCircle, Menu, NotebookPen, Radar as RadarIcon, Settings2, Search, ShieldCheck, Sparkles, Users, Wallet, Wrench, X } from 'lucide-react';
import { useApp } from './context';
import { Badge } from './components';
import Dashboard from './pages/Dashboard';
import ImportPage from './pages/ImportPage';
import Inventory from './pages/Inventory';
import Optimizer from './pages/Optimizer';
import Rules from './pages/Rules';
import Association from './pages/Association';
import Radar from './pages/Radar';
import Simulation from './pages/Simulation';
import HeadTail from './pages/HeadTail';
import Archives from './pages/Archives';
import Heroes from './pages/Heroes';
import { Assets, Guild, Shards, Tasks } from './pages/Records';
import Tools from './pages/Tools';
import RealmCards from './pages/RealmCards';
import Settings from './pages/Settings';
import RealmReminders from './RealmReminders';
import ScrollReminders from './ScrollReminders';
import SnapshotBar from './SnapshotBar';
import ActivityCenter from './ActivityCenter';
import CharacterAnalysis from './pages/CharacterAnalysis';
import SpeedOverview from './pages/SpeedOverview';
const Bounty = lazy(() => import('./pages/Bounty'));
const Questions = lazy(() => import('./pages/Questions'));
const DropCalendar = lazy(() => import('./pages/DropCalendar'));
const Lineups = lazy(() => import('./pages/Lineups'));
const Collections = lazy(() => import('./pages/Collections'));
const Spirits = lazy(() => import('./pages/Spirits'));
const ScrollAssistant = lazy(() => import('./pages/ScrollAssistant'));

const sections = [
  { name: '工作台', items: [{ id: 'dashboard', label: '阴阳师工作台', icon: LayoutDashboard }, { id: 'import', label: '数据读取', icon: Database }, { id: 'archives', label: '角色档案', icon: Fingerprint }, { id: 'character', label: '角色分析', icon: GitCompareArrows }, { id: 'tasks', label: '任务记录', icon: FileClock }] },
  { name: '御魂', items: [{ id: 'inventory', label: '御魂分析', icon: Boxes }, { id: 'speed', label: '一速预览', icon: Gauge }, { id: 'optimizer', label: '面板计算 / 提升', icon: Calculator }, { id: 'head-tail', label: '头尾分析', icon: GitCompareArrows }, { id: 'radar', label: '御魂雷达', icon: RadarIcon }, { id: 'simulation', label: '模拟玩法', icon: FlaskConical }, { id: 'rules', label: '评分标准', icon: Settings2 }, { id: 'association', label: '关联分方案', icon: Calculator }] },
  { name: '资料与工具', items: [{ id: 'heroes', label: '式神录', icon: BookOpen }, { id: 'shards', label: '碎片查询', icon: Sparkles }, { id: 'realm-cards', label: '结界卡库存', icon: NotebookPen }, { id: 'collections', label: '外观清单', icon: BookOpen }, { id: 'spirits', label: '契灵资料 / 库存', icon: Sparkles }, { id: 'assets', label: '游戏资产', icon: Wallet }, { id: 'guild', label: '寮管理', icon: Users }, { id: 'wiki', label: '百科/悬赏', icon: Search }, { id: 'scroll', label: '绘卷小助手', icon: NotebookPen }, { id: 'lineups', label: '阵容 / 博主推荐', icon: Users }, { id: 'calendar', label: '日历', icon: CalendarDays }, { id: 'tools', label: '小工具', icon: Wrench }] },
];
const pageTitle = (page: string) => sections.flatMap(s => s.items).find(i => i.id === (page === 'bounty' ? 'wiki' : page))?.label ?? '设置与功能进度';
export default function App() {
  const { state, busy, connectionError, refresh, mutate, history } = useApp();
  const [soulNav, setSoulNav] = useState(true);
  const [smallWindow, setSmallWindow] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => { const query = window.matchMedia('(max-width: 700px)'); const changed = () => setSmallWindow(query.matches); query.addEventListener('change', changed); return () => query.removeEventListener('change', changed); }, []);
  const [page, setPage] = useState(location.hash.slice(1).split('?')[0] || 'dashboard'); const [nav, setNav] = useState(false);
  const navWasOpen = useRef(false);
  useEffect(() => { const handler = () => { setPage(location.hash.slice(1).split('?')[0] || 'dashboard'); setNav(false); document.getElementById('workspace')?.scrollTo(0, 0); }; window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler); }, []);
  useEffect(() => { document.title = `${pageTitle(page)} · 平安手札`; }, [page]);
  useEffect(() => { if (smallWindow) { if (nav) document.querySelector<HTMLButtonElement>('.nav-close')?.focus(); else if (navWasOpen.current) document.querySelector<HTMLButtonElement>('.nav-toggle')?.focus(); } navWasOpen.current = nav; }, [nav, smallWindow]);
  useEffect(() => { if (sections[1].items.some(item => item.id === page)) setSoulNav(true); }, [page]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (event.key === 'Escape' && nav) setNav(false); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [nav]);
  const profile = state?.profiles.find(p => p.id === state.activeId);
  useEffect(() => { document.documentElement.dataset.theme = state?.settings.theme === 'light' ? 'light' : 'dark'; }, [state?.settings.theme]);
  let content;
  switch (page) {
    case 'dashboard': content = <Dashboard />; break;
    case 'import': content = <ImportPage />; break;
    case 'inventory': content = <Inventory />; break;
    case 'character': content = <CharacterAnalysis />; break;
    case 'speed': content = <SpeedOverview />; break;
    case 'optimizer': content = <Optimizer />; break;
    case 'rules': content = <Rules />; break;
    case 'association': content = <Association />; break;
    case 'radar': content = <Radar />; break;
    case 'head-tail': content = <HeadTail />; break;
    case 'simulation': content = <Simulation />; break;
    case 'archives': content = <Archives />; break;
    case 'heroes': content = <Heroes />; break;
    case 'shards': content = <Shards />; break;
    case 'realm-cards': content = <RealmCards />; break;
    case 'assets': content = <Assets />; break;
    case 'tasks': content = <Tasks />; break;
    case 'guild': content = <Guild />; break;
    case 'tools': content = <Tools />; break;
    case 'bounty': content = <Suspense fallback={<section className="sheet padded" role="status">正在打开悬赏资料…</section>}><Bounty /></Suspense>; break;
    case 'wiki': content = <Suspense fallback={<section className="sheet padded" role="status">正在打开题库…</section>}><Questions /></Suspense>; break;
    case 'calendar': content = <Suspense fallback={<section className="sheet padded" role="status">正在打开掉落日历…</section>}><DropCalendar /></Suspense>; break;
    case 'collections': content = <Suspense fallback={<section className="sheet padded" role="status">正在打开外观资料…</section>}><Collections /></Suspense>; break;
    case 'spirits': content = <Suspense fallback={<section className="sheet padded" role="status">正在打开契灵资料…</section>}><Spirits /></Suspense>; break;
    case 'scroll': content = <Suspense fallback={<section className="sheet padded" role="status">正在打开绘卷缓存…</section>}><ScrollAssistant /></Suspense>; break;
    case 'lineups': content = <Suspense fallback={<section className="sheet padded" role="status">正在打开阵容资料…</section>}><Lineups /></Suspense>; break;
    case 'settings': content = <Settings />; break;
    default: content = <section className="sheet padded"><h1>未找到页面</h1><a href="#dashboard">返回工作台</a></section>;
  }
  return <div className={`app-shell ${page === 'dashboard' ? 'home-page' : ''}`}><RealmReminders /><ScrollReminders /><a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>跳转到内容</a>{nav && <button className="nav-backdrop" aria-label="关闭导航" onClick={() => setNav(false)} />}
    <aside inert={smallWindow && !nav} className={`sidebar ${nav ? 'open' : ''}`}><a className="brand" href="#dashboard"><span className="brand-mark">札</span><div><strong>平安手札</strong><small>本地数据工作台</small></div></a><button className="nav-close icon-button" aria-label="关闭导航" onClick={() => setNav(false)}><X size={20} /></button><nav aria-label="主导航">{sections.map(section => <div className="nav-section" key={section.name}><p>{section.name === '御魂' ? <button className="nav-group-toggle" aria-expanded={soulNav} onClick={() => setSoulNav(!soulNav)}>御魂分析<ChevronDown size={14} className={soulNav ? '' : 'collapsed'} /></button> : section.name}</p>{section.items.filter(() => section.name !== '御魂' || soulNav).map(item => <a key={item.id} href={`#${item.id}`} className={(page === 'bounty' ? 'wiki' : page) === item.id ? 'active' : ''} aria-current={(page === 'bounty' ? 'wiki' : page) === item.id ? 'page' : undefined} title={item.label}><item.icon size={19} strokeWidth={1.7} /><span>{item.label}</span></a>)}</div>)}</nav><div className="sidebar-bottom"><a href="#settings" className={page === 'settings' ? 'active' : ''}><CircleHelp size={18} /><span>设置与功能进度</span></a><span className="local-status"><i />本地保存 · 无需账号</span></div></aside>
    <div className="main-shell" inert={smallWindow && nav}><header className="topbar"><div className="row"><button className="nav-toggle icon-button" aria-label="打开导航" onClick={() => setNav(true)}><Menu size={20} /></button><span className="breadcrumb">工作空间 <ChevronRight size={14} /><b>{pageTitle(page)}</b></span></div><div className="topbar-actions"><a className="topbar-read" href="#import"><RefreshCw size={15} /><span>更新数据</span></a><div className="profile-switch"><ShieldCheck size={16} /><label className="visually-hidden" htmlFor="profile-select">当前角色档案</label><select id="profile-select" disabled={busy || !state?.profiles.length} value={state?.activeId ?? ''} onChange={e => void mutate('select_profile', { id: e.target.value })}>{!state?.profiles.length && <option value="">尚未选择档案</option>}{state?.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div></header><SnapshotBar />
    {busy && <div className="busy-indicator" role="status"><LoaderCircle size={14} className="spin" /><span>正在处理…</span></div>}
    <main id="workspace" className="workspace"><div id="main-content" tabIndex={-1}>{profile?.source === 'demo' && <div className="demo-banner"><FlaskConical size={16} /><span>当前为演示档案，所有御魂与角色均为合成数据。</span><a href="#import">导入真实数据<ChevronRight size={14} /></a></div>}
    {state ? <div key={`${page}-${state.activeId}-${history?.id ?? "latest"}`}>{content}</div> : <section className="sheet connection-state">{connectionError ? <><Database size={30} /><h1>暂时无法连接本地数据服务</h1><p>{connectionError}</p><button className="primary" onClick={() => void refresh()}>重新连接</button><p className="fineprint">开发预览请在项目目录运行 npm run dev；桌面程序由自身提供数据服务。</p></> : <><LoaderCircle className="spin" size={30} /><h2>正在打开本地工作台…</h2></>}</section>}
    <footer className="workspace-footer"><span>平安手札 · 独立本地版</span><a href="#settings">查看功能范围与计算假设</a></footer></div></main></div><ActivityCenter /></div>;
}
