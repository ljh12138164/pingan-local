import { useEffect, useMemo, useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import { csv, download } from '../api';
import { Empty, PageTitle } from '../components';
import GameImage from '../GameImage';
import { calendarDays, columnDay, dropColumns, dropDate, dropFloors, dungeons, east8Weekday, matchesDrop, weekdays, type DropDay } from '../dropCalendar';

export default function DropCalendar() {
  const [dungeon, setDungeon] = useState(1); const [query, setQuery] = useState(''); const [onlyToday, setOnlyToday] = useState(false);
  const [today, setToday] = useState(east8Weekday); const [mobileDay, setMobileDay] = useState(east8Weekday);
  useEffect(() => { const timer = window.setInterval(() => setToday(east8Weekday()), 60000); return () => clearInterval(timer); }, []);
  const columns = useMemo(() => dropColumns(dungeon), [dungeon]);
  const days = useMemo(() => calendarDays(dungeon, query, onlyToday, today), [dungeon, query, onlyToday, today]);
  const selectedDay = days.some(d => d.day === mobileDay) ? mobileDay : days[0]?.day;
  const name = dungeons.find(d => d.id === dungeon)!.name;
  function exportRows() {
    const rows = days.flatMap(({ name: weekday, day }) => dropFloors.filter(f => f.dungeon === dungeon).map(f => [weekday, name, f.name, f.days[day].sets.map(s => s.name).join(' / '), f.days[day].unspecified ? '另含未展开的通用奖励图标' : '', '游戏界面展示奖励，不代表完整掉落池或概率']));
    download(`${name}-每周掉落.csv`, csv([['星期', '副本', '层数', '展示御魂', '未展开奖励', '范围'], ...rows]), 'text/csv');
  }
  function renderDrops(value: DropDay) {
    return <div className="drop-cell-list">{value.sets.map(set => <span key={set.id} className={query.trim() && matchesDrop(set, query) ? 'drop-match' : ''}><GameImage kind="suit" id={set.id} name={set.name} /><b>{set.name}</b></span>)}{value.unspecified && <p className="drop-unspecified">通用奖励图标<br />配置未展开完整范围</p>}{!value.sets.length && !value.unspecified && <span className="drop-unspecified">未展示额外御魂</span>}</div>;
  }
  return <div className="drop-page"><PageTitle title="御魂掉落日历" description="查看四类副本的每周展示掉落，按御魂名称查找对应星期。" actions={<button disabled={!days.length} onClick={exportRows}><Download size={16} />导出当前结果</button>} />
    <section className="sheet drop-controls"><nav aria-label="掉落副本">{dungeons.map(d => <button key={d.id} aria-pressed={d.id === dungeon} onClick={() => setDungeon(d.id)}>{d.name}</button>)}</nav><div className="drop-search-row"><label className="field">查御魂 / 拼音 / 编号<div className="search-input"><Search size={17} /><input aria-label="查找掉落御魂" maxLength={80} value={query} onChange={e => setQuery(e.target.value)} placeholder="例如：招财猫、狂骨、zcm" />{query && <button className="icon-button" aria-label="清空掉落查询" onClick={() => setQuery('')}><X size={15} /></button>}</div></label><label className="check"><input type="checkbox" checked={onlyToday} onChange={e => setOnlyToday(e.target.checked)} />只看今天</label><span className="drop-today">北京时间 · 今天{weekdays[today]}</span></div></section>
    <section className="sheet drop-results" aria-label={`${name}每周展示掉落`}><header><h2>{name}</h2><span role="status">匹配 {days.length} 天</span></header>{days.length ? <><p className="drop-table-hint">{dungeon === 1 ? '10 层列出基础御魂，其余列只列相对 10 层新增的展示御魂。' : '各层分别列出游戏界面的展示御魂。'} 表格可左右滚动。</p><div className="drop-table-scroll" role="region" aria-label="可横向滚动的掉落表" tabIndex={0}><table><thead><tr><th scope="col">星期</th>{columns.map(c => <th scope="col" key={c.floor.id}>{c.label}</th>)}</tr></thead><tbody>{days.map(({ name: weekday, day }) => <tr key={day} className={day === today ? 'drop-is-today' : ''}><th scope="row">{weekday}{day === today && <small>今日</small>}</th>{columns.map(c => <td key={c.floor.id}>{renderDrops(columnDay(c, day))}</td>)}</tr>)}</tbody></table></div>
      <div className="drop-mobile"><nav aria-label="选择掉落星期">{days.map(({ name: weekday, day }) => <button key={day} aria-pressed={selectedDay === day} onClick={() => setMobileDay(day)}>{weekday.replace('星期', '周')}{day === today && <small>今日</small>}</button>)}</nav>{selectedDay !== undefined && <><h3>{weekdays[selectedDay]}的展示掉落</h3>{columns.map(c => <article key={c.floor.id}><h4>{c.label}</h4>{renderDrops(columnDay(c, selectedDay))}</article>)}</>}</div></> : <Empty title="没有匹配的展示掉落"><p>通用奖励图标没有展开具体御魂，因此不会命中名称查询。</p><button onClick={() => { setQuery(''); setOnlyToday(false); }}>查看全部星期</button></Empty>}</section>
    <details className="sheet drop-source"><summary>数据来源与规则说明</summary><p>从已登录游戏独立读取 dungeon_rune、reward、equip_suit 的静态资料，于 {dropDate} 整理。桌面版与 MuMu 的 78 种御魂、145 条奖励配置对照一致。仅使用公开及本地配置。</p><p>这里只显示游戏界面配置中的奖励图标，不代表完整掉落池、固定掉落数量或概率。部分周末和业原火奖励仅配置通用图标，具体范围仍需核验；搜索与导出不会补造这些御魂。1–9 层展示列表已逐层核对一致后合并，奖励星级与概率仍因层数而异。</p><p>星期按北京时间计算，每分钟校时。图片来自网易公开资源；8 种新御魂的公开地址尚不可用，保留名称并明确显示图片未收录。</p></details>
  </div>;
}
