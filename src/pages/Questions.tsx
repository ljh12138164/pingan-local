import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Copy, Download, Search, X } from 'lucide-react';
import { Empty, PageTitle } from '../components';
import { csv, download } from '../api';
import KnowledgeTabs from '../KnowledgeTabs';
import { answerCount, excludedQuestions, questionDate, questions, questionSource, searchQuestions } from '../questions';

export default function Questions() {
  const [field, setField] = useState<'question' | 'answer'>('question');
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState(questions[0].id);
  const [page, setPage] = useState(0); const [mobileDetail, setMobileDetail] = useState(false);
  const [copyState, setCopyState] = useState(''); const detail = useRef<HTMLElement>(null);
  const results = useMemo(() => searchQuestions(query, field), [query, field]);
  const current = Math.min(page, Math.max(0, Math.ceil(results.length / 9) - 1));
  const shown = results.slice(current * 9, current * 9 + 9);
  const chosen = shown.find(r => r.item.id === selected) ?? shown[0];
  useEffect(() => { setPage(0); setMobileDetail(false); setCopyState(''); }, [query, field]);
  useEffect(() => { setCopyState(''); }, [chosen?.item.id]);
  useEffect(() => { if (mobileDetail && window.matchMedia('(max-width:700px)').matches) detail.current?.focus(); }, [mobileDetail]);
  function back() { setMobileDetail(false); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.question-results button[aria-pressed=true]')?.focus()); }
  async function copyAnswer() {
    if (!chosen) return;
    try { await navigator.clipboard.writeText(chosen.item.answers.join(' / ')); setCopyState('答案已复制'); }
    catch { setCopyState('无法写入剪贴板，请选中答案文字复制。'); }
  }
  return <div className={`question-page ${mobileDetail ? 'question-detail-open' : ''}`}><PageTitle title="阴阳师问题百科" description="按题目或答案查找逢魔密信与知识问答资料，遇到近似匹配时核对完整题意。" /><KnowledgeTabs page="wiki" />
    <section className="sheet question-search" aria-label="题库查询"><div className="question-search-form"><div className="question-fields" role="group" aria-label="查询字段"><button aria-pressed={field === 'question'} onClick={() => setField('question')}>搜问题</button><button aria-pressed={field === 'answer'} onClick={() => setField('answer')}>搜答案</button></div><label className="field">{field === 'question' ? '问题关键词' : '答案关键词'}<div className="search-input"><Search size={17} /><input aria-label="题库关键词" value={query} maxLength={120} onChange={e => setQuery(e.target.value)} placeholder={field === 'question' ? '例如：日轮刀 颜色' : '例如：黑色'} />{query && <button className="icon-button" aria-label="清空题库查询" onClick={() => setQuery('')}><X size={15} /></button>}</div></label><p className="fineprint">支持不完整词语；多个词用空格分隔。4 字以上可容错，近似结果排在精确命中之后。</p></div><div className="question-counts"><span><b>{questions.length}</b>道题目</span><span><b>{answerCount}</b>个资料答案</span></div></section>
    <div className="question-layout"><section className="sheet question-list" aria-label="题库结果"><header><h2>{query.trim() ? `找到 ${results.length} 条题目` : `共 ${results.length} 条题目`}</h2><button disabled={!results.length} onClick={() => download('百科查询结果.csv', csv([['题目', '资料答案', '匹配方式', '需核对'], ...results.map(r => [r.item.question, r.item.answers.join(' / '), r.approximate ? '近似' : '精确', r.item.answers.length > 1 ? '资料有不同记载' : ''])]), 'text/csv')}><Download size={15} />导出结果</button></header>
      <div className="question-results">{shown.map(r => <button key={r.item.id} aria-pressed={chosen?.item.id === r.item.id} onClick={() => { setSelected(r.item.id); setMobileDetail(true); }}><span className="question-result-text"><strong>{r.item.question}</strong><span>{r.item.answers.join(' / ')}</span>{(r.approximate || r.item.answers.length > 1) && <small>{[r.approximate ? '近似匹配，请核对题意' : '', r.item.answers.length > 1 ? '资料有不同记载' : ''].filter(Boolean).join(' · ')}</small>}</span><ArrowUpRight size={16} /></button>)}</div>
      {!results.length && <Empty title="没有找到这道题"><p>尝试更短的关键词，或切换为搜答案。</p><button onClick={() => setQuery('')}>查看全部题目</button></Empty>}
      {results.length > 0 && <nav className="question-pagination" aria-label="题库结果分页"><span>显示 {current * 9 + 1}–{Math.min(current * 9 + 9, results.length)} / {results.length}</span><div><button aria-label="上一页" disabled={!current} onClick={() => setPage(current - 1)}><ChevronLeft size={16} /></button><label className="visually-hidden" htmlFor="question-page">题库页码</label><select id="question-page" value={current} onChange={e => setPage(Number(e.target.value))}>{Array.from({ length: Math.ceil(results.length / 9) }, (_, i) => <option key={i} value={i}>第 {i + 1} 页</option>)}</select><button aria-label="下一页" disabled={(current + 1) * 9 >= results.length} onClick={() => setPage(current + 1)}><ChevronRight size={16} /></button></div></nav>}
    </section><aside ref={detail} tabIndex={-1} className="sheet question-detail" aria-label="答案核对" onKeyDown={e => { if (e.key === 'Escape') back(); }}><button className="question-back text" onClick={back}><ChevronLeft size={16} />返回题目列表</button>{chosen ? <><h2>答案核对</h2><h3>{chosen.item.question}</h3><p className="question-answer-label">{chosen.item.answers.length > 1 ? '资料有不同记载，不能直接确定答案' : '资料答案'}</p><div className="question-answer">{chosen.item.answers.map(a => <p key={a}>{a}</p>)}</div>{chosen.approximate && <p className="question-caution">这是近似匹配，请先确认题意与游戏中一致。</p>}<p className="fineprint">题库可能包含旧版本或不同选项下的答案；有多个备选时，请结合游戏题意及选项核对。</p><button onClick={() => void copyAnswer()}><Copy size={15} />复制{chosen.item.answers.length > 1 ? '资料答案' : '答案'}</button><p className="question-copy-state" role="status">{copyState}</p></> : <Empty title="暂无可核对的题目" />}</aside></div>
    <details className="question-source sheet"><summary>题库来源与版本说明</summary><p>数据来自 <a href={questionSource} target="_blank" rel="noreferrer">assttyys_autojs 开源题库</a>，按 MIT 许可使用，{questionDate} 整理。已排除 {excludedQuestions} 道只有 OCR 别名形式答案的题目；保留的答案分歧会明确提示。尚未与当前游戏全部题目核对。</p><p>Copyright (c) 2019 Chaos · <a href="/licenses/assttyys-questions-MIT.txt" target="_blank" rel="noreferrer">查看 MIT 授权声明</a></p></details>
  </div>;
}
