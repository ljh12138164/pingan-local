import { labels, number, attribute, score, type Rule, type Soul } from './types';
import { evaluateSoul } from './soulScoring';
import type { SoulRolls } from './soulGrowth';

export default function ScoreExplanation({ soul, rule, rolls, scene }: { soul: Soul; rule: Rule; rolls?: SoulRolls; scene: 'all' | 'pve' | 'pvp' }) {
  if (rule.model !== 'conditions') return <div><h3>副属性权重评分明细</h3><table><thead><tr><th>副属性</th><th>数值</th><th>权重</th><th>贡献分</th></tr></thead><tbody>{Object.entries(soul.sub).map(([key, value]) => <tr key={key}><td>{labels[key]}</td><td>{attribute(key, value)}</td><td>{rule.weights[key] ?? 0}</td><td>{number(score({ ...soul, sub: { [key]: value } }, rule))}</td></tr>)}</tbody></table><p className="fineprint">评分 = Σ（副属性 ÷ 参考成长步长 × 权重）。当前为本机配置的参考尺度。</p></div>;
  const result = evaluateSoul(soul, rule, rolls, scene);
  return <div><h3>条件评分明细 · {result.grade}</h3>{!result.matches.length && <p className="muted">没有规则满足此御魂的套装、号位、主属性、初始条数及场景条件。</p>}{result.matches.map(m => <details className="inventory-score-match" key={m.id} open={m.id === result.winner?.id || !!m.reason}><summary>{m.name} · {m.score === null ? m.reason : `${number(m.score)} 分`}{m.id === result.winner?.id ? ' · 最高命中' : ''}</summary><table><thead><tr><th>有效属性</th><th>条数分</th><th>额外强化</th><th>贡献分</th></tr></thead><tbody>{m.contributions.map(c => <tr key={c.attribute}><td>{labels[c.attribute]}</td><td>{number(c.base)}</td><td>{c.upgrades} 次</td><td>{number(c.points)}</td></tr>)}</tbody></table><p className="fineprint">保留 ≥ {m.keep} · 观察 ≥ {m.observe} · 每条规则上限 100 分</p></details>)}<p className="fineprint">多条规则独立计算后取最高分。未读取的条件或强化次数保留未知；主属性和固有属性不计分。</p></div>;
}
