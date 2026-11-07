import { useState } from 'react';
import { Save } from 'lucide-react';
import { useApp } from '../context';
import { Badge, ExportButton, NeedData, PageTitle } from '../components';
import { attrs, labels, attribute } from '../types';
import OpenApiSettings from './OpenApiSettings';
import '../fixed-sets.css';

export const features = [
  ['庭院工作台', '部分可用', '深浅主题、游戏档案与资源、结界 / 寄养、寮功勋、本地待办；布局保存、跨页只读历史数据 / 计算 / 导出、应用内到期提醒；本地后台任务与通知记录。云端活动与公告尚未接入'],
  ['自定义工作台组件', '可用', '独立 HTML / CSS / JavaScript 组件与只读摘要；沙箱隔离'],
  ['JSON 数据读取', '可用', '模板、预检、校验、新档案导入、完整导出'],
  ['独立桌面读取', '可用', 'Windows x64 客户端快照：御魂、式神、碎片和资产；无需原程序组件'],
  ['角色档案', '可用', '多档案切换、重命名、快照保存/恢复、御魂变化比较'],
  ['角色分析', '部分可用', '已纠正页面用途：本地多角色库存与资源比较；藏宝阁价格、外观、满技能与契灵质量对比尚未实现'],
  ['一速 / PVE', '部分可用', '一速精确动态规划、套装排名；面板上下限、目标值、任意六件内配方、号位主属性多选、额外属性、初始条数筛选、JSON / CSV 与单件提升。大库存通用目标近似；四件套触发、技能与敌防尚未建模'],
  ['御魂分析 / 条件评分', '部分可用', '图片、组合筛选、成长明细、本地弃置、CSV / Excel / PNG图片包的全部筛选结果；多条条件规则编辑与应用。关联分方案可保存 / 切换 / 导入导出，库存当前分、满级乐观估算与整套配装参考分；关联分数值与契灵完整战斗效果仍在持续完善'],
  ['模拟强化 / 头尾分析', '参考模型', '配置中的成长范围、主属性增量、单属性理论上限；抽样机制未与游戏逐次校验'],
  ['式神录', '可用', '持有与目录查询、筛选、手动添加'],
  ['碎片查询', '可用', '普通 / 绑定碎片分列、契约书、传记进度、手动维护与跨档案查询；142 项碎片总数及绑定数对照一致'],
  ['游戏资产', '可用', '本地资源账本、编辑和 CSV 导出'],
  ['任务记录', '部分可用', '多角色日常与每周待办、周期重置、自定义任务；仅部分任务接入真实进度，未读取项保留未知'],
  ['寮管理 / 结界卡', '部分可用', '游戏成员功勋、捐赠、活跃和本地备注；按需或每 15 秒刷新缓存；结界 / 寄养计时与卡片产出。成员今日 / 本周集体任务次数尚未接入'],
  ['小工具', '基础可用', '自定义概率实验、桌面版游戏启动器'],
  ['模拟器读取', '可用', 'MuMu x86_64 实机读取及保存、寮 / 寄养刷新已验证；ADB 与 root 诊断；ARM 与雷电尚未验证'],
  ['藏宝阁链接导入', '可用', '网易公开商品链接预检、御魂 / 式神 / 碎片转换与本地保存'],
  ['强化概率与四件套参考输出', '待核验', '模拟强化为参考模型，技能、敌防与四件套条件增伤尚未建模'],
  ['悬赏封印', '部分核验', '独立公开地点索引、游戏静态线索、名称 / 拼音 / 多线索查询、分类与难度、数量估算、分页和 CSV；天邪鬼绿 43 条位置核对一致'],
  ['百科答题', '部分核验', '957 道独立开源题目；问题 / 答案查询、近似匹配、分页、复制与 CSV。5 处答案分歧明确提示；尚未逐题核对当前游戏全部题目'],
  ['御魂掉落日历', '部分核验', '四类副本、24 层、168 条每周展示列表；名称 / 拼音查询、今日筛选和 CSV。来自独立游戏配置；通用奖励的完整范围、逢魔 / 秘闻轮换与爆率推荐仍缺失'],
  ['阵容 / 博主推荐', '部分可用', '独立公开阵容资料按需下载与本机缓存、成员图片、名称 / 拼音查询、PVE / PVP 分组、本地方案编辑、复制阵容码与 CSV；培养筛选检查不同实例的星级 / 等级 / 技能，不判断完整配装或通关。博主仅展示资料署名，尚无独立完整推荐名单'],
  ['绘卷助手', '部分可用', '独立读取本角色区服的六卷缓存、个人积分与完成时间；本地期次记录、CSV 和按角色隔离的一次性阈值提醒。应用需保持打开并刷新缓存；全区服数据、前20 / 100排行参考分与云端推送尚未接通'],
  ['外观清单', '部分可用', '六类外观资料、已确认正数持有、名称 / 拼音查询、只读跨角色对照、图片 / 缺图状态、详情与 CSV。2,670 项目录不代表当前可获得；缺失不等于未解锁，时效 / 穿戴 / 赠送未读取'],
  ['契灵资料与库存', '部分可用', '独立全量读取契灵实例、星级、等级、术印与装备归属；8 种契灵、48 种术印官方图文、组合筛选和 CSV；完整战斗机制模拟尚未实现'],
  ['虚拟定位', '未实现', '当前不提供定位修改'],
  ['桌面窗口管理', '部分验证', '游戏启动、窗口枚举、尺寸 / 位置预设与排列；实际排列与多实例登录尚未完成端到端验证'],
  ['云分享与在线攻略', '待适配', '当前仅本地档案导出，不依赖原作者云服务'],
  ['本机开放 API', '可用', '可选开启本机只读 HTTP API；随机端口及 Bearer 凭证；档案 / 御魂 / 式神 / 碎片 / 寮 / 结界，列表分页'],
];
export default function Settings() {
  const { state, busy: pending, saveData , history } = useApp(); const busy = pending || !!history; const [name, setName] = useState(''); const [setFilter, setSetFilter] = useState('all'); const [attr, setAttr] = useState('crit'); const [value, setValue] = useState(15);
  return <><PageTitle title="设置与功能进度" description="核对计算假设、套装数据与当前已经实现的能力。" actions={<ExportButton />} /><section className="sheet padded"><h2>本地数据</h2><dl className="info-list"><div><dt>应用版本</dt><dd>{state?.version} · 独立实现</dd></div><div><dt>技术栈</dt><dd>Tauri 2 + React + Rust + SQLite</dd></div><div><dt>数据库位置</dt><dd className="mono break">{state?.databasePath}</dd></div><div><dt>登录与会员</dt><dd>无需账号，所有已实现功能直接使用</dd></div></dl><p className="muted">本地导出文件可再次导入，建议定期导出重要档案。</p></section>
    <OpenApiSettings /><NeedData><section className="sheet padded"><div className="section-title"><h2>当前档案的固定套装加成</h2><select aria-label="固定加成显示范围" value={setFilter} onChange={e => setSetFilter(e.target.value)}><option value="all">全部套装</option><option value="six">有六件套固定属性</option><option value="two">有两件套固定属性</option></select></div><p className="muted">面板计入这里的两件套与六件套固定属性。六件同套时，两件套加成应用两次，六件套加成应用一次；四件套触发效果尚未建模。</p><p className="fineprint fixed-set-scroll-hint">左右滚动查看两件套与六件套属性，套装名称保持可见。</p><div className="table-scroll"><table className="fixed-set-table"><thead><tr><th>套装</th><th>两件套固定属性</th><th>六件套固定属性</th></tr></thead><tbody>{state?.data?.sets.filter(s => setFilter === 'all' || Object.keys(setFilter === 'six' ? s.sixPiece ?? {} : s.twoPiece).length).map(s => <tr key={s.name}><td>{s.name}</td><td>{Object.entries(s.twoPiece).map(([k, v]) => `${labels[k]} +${attribute(k, v)}`).join(' / ') || '无'}</td><td>{Object.entries(s.sixPiece ?? {}).map(([k, v]) => `${labels[k]} +${attribute(k, v)}`).join(' / ') || '无'}</td></tr>)}</tbody></table></div><form className="inline-form top-space fixed-set-editor" onSubmit={async e => { e.preventDefault(); if (!state?.data) return; const existing = state.data.sets.find(s => s.name === name.trim()); const def = { ...existing, name: name.trim(), twoPiece: { ...existing?.twoPiece, [attr]: value } }; await saveData({ ...state.data, sets: [...state.data.sets.filter(s => s.name !== name.trim()), def] }); }}><label className="field grow">套装名称<input aria-label="套装名称" required list="set-names" value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="选择或输入套装名称" /><datalist id="set-names">{[...new Set(state?.data?.souls.map(s => s.set))].map(s => <option key={s}>{s}</option>)}</datalist></label><label className="field">加成属性<select aria-label="加成属性" value={attr} onChange={e => setAttr(e.target.value)}>{attrs.map(k => <option key={k} value={k}>{labels[k]}</option>)}</select></label><label className="field short">数值<input aria-label="数值" type="number" min="0" step="0.1" value={value} onChange={e => setValue(Number(e.target.value))} /></label><button disabled={busy} className="primary"><Save size={16} />保存加成</button></form></section></NeedData>
    <section className="sheet"><div className="padded-heading"><h2>功能清单</h2><p className="muted">“可用”仅指下表列出的本地能力。</p></div><div className="table-scroll"><table><thead><tr><th>模块</th><th>状态</th><th>范围</th></tr></thead><tbody>{features.map(([name, status, scope]) => <tr key={name}><td>{name}</td><td><Badge tone={status === '可用' ? 'green' : 'amber'}>{status}</Badge></td><td>{scope}</td></tr>)}</tbody></table></div></section></>;
}
