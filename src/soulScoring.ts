import { attrs, score, type Rule, type RuleCard, type Soul } from './types';
import type { SoulRolls } from './soulGrowth';

export const blankCard = (): RuleCard => ({ id: crypto.randomUUID(), name: '新规则', enabled: true, sets: [], slots: [], mains: {}, initial: [], core: [], normal: [], scene: 'all', coreBase: 10, normalBase: 5, coreUpgrade: 10, normalUpgrade: 5, keep: 70, observe: 50 });
export interface CardResult { id: string; name: string; score: number | null; keep: number; observe: number; reason?: string; contributions: { attribute: string; base: number; upgrades: number; points: number }[] }
export function validateRule(rule: Rule): string | null {
  if (!rule || typeof rule.id !== 'string' || !rule.id || typeof rule.name !== 'string' || !rule.name.trim() || rule.name.length > 100) return '标准名称需要 1–100 个字符';
  if (![rule.keep, rule.observe].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0) || rule.keep < rule.observe) return '保留阈值应不低于观察阈值，且不能为负数';
  if (!rule.weights || Object.entries(rule.weights).some(([k, v]) => !attrs.includes(k) || !Number.isFinite(v) || v < 0 || v > 1000)) return '属性权重需要是 0–1000 的数值';
  if (rule.model !== undefined && !['weighted', 'conditions'].includes(rule.model)) return '不支持的评分方式';
  if (rule.model !== 'conditions') return null;
  if (!Array.isArray(rule.cards) || rule.cards.length > 200) return '每份标准最多包含 200 条规则';
  const ids = new Set<string>();
  for (const c of rule.cards) {
    if (!c || typeof c.id !== 'string' || !c.id || ids.has(c.id) || typeof c.name !== 'string' || !c.name.trim()) return '规则名称不能为空，编号不能重复';
    ids.add(c.id);
    if (typeof c.enabled !== 'boolean' || !Array.isArray(c.sets) || c.sets.some(s => typeof s !== 'string') || !Array.isArray(c.slots) || c.slots.some(n => !Number.isInteger(n) || n < 1 || n > 6) || !Array.isArray(c.initial) || c.initial.some(n => ![2, 3, 4].includes(n))) return '规则的套装、号位或初始条数不合法';
    if (!c.mains || Object.entries(c.mains).some(([slot, list]) => !['1', '2', '3', '4', '5', '6'].includes(slot) || !Array.isArray(list) || list.some(a => !attrs.includes(a)))) return '规则主属性条件不合法';
    if (![c.core, c.normal].every(list => Array.isArray(list) && list.every(a => attrs.includes(a))) || c.core.some(a => c.normal.includes(a))) return '核心与一般属性不能重复';
    if (!['all', 'pve', 'pvp'].includes(c.scene) || ![c.coreBase, c.normalBase, c.coreUpgrade, c.normalUpgrade, c.keep, c.observe].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100) || c.keep < c.observe) return '计分与阈值需为 0–100，且保留不低于观察';
  }
  return null;
}
export function evaluateSoul(soul: Soul, rule: Rule, rolls?: SoulRolls, scene: 'all' | 'pve' | 'pvp' = 'all') {
  if (rule.model !== 'conditions') return { score: score(soul, rule) as number | null, grade: score(soul, rule) >= rule.keep ? '保留参考' : score(soul, rule) >= rule.observe ? '观察参考' : '低分参考', matches: [] as CardResult[], winner: undefined as CardResult | undefined };
  const matches: CardResult[] = [];
  for (const c of rule.cards ?? []) {
    if (!c.enabled || c.sets.length && !c.sets.includes(soul.set) || c.slots.length && !c.slots.includes(soul.slot) || c.mains[String(soul.slot)]?.length && !c.mains[String(soul.slot)].includes(soul.main) || scene !== 'all' && c.scene !== 'all' && c.scene !== scene) continue;
    if (c.initial.length && rolls?.initial != null && !c.initial.includes(rolls.initial)) continue;
    const result: CardResult = { id: c.id, name: c.name, score: 0, keep: c.keep, observe: c.observe, contributions: [] };
    if (c.initial.length && rolls?.initial == null) { result.score = null; result.reason = '初始条数未读取'; }
    for (const key of Object.keys(soul.sub)) {
      const core = c.core.includes(key); if (!core && !c.normal.includes(key)) continue;
      const base = core ? c.coreBase : c.normalBase, upgrade = core ? c.coreUpgrade : c.normalUpgrade;
      const fact = rolls?.attributes?.[key];
      if (upgrade && (!fact || !Number.isInteger(fact.hands) || fact.hands < 1)) { result.score = null; result.reason = '强化次数未读取'; }
      const upgrades = fact ? Math.max(0, fact.hands - 1) : 0;
      const points = base + upgrades * upgrade;
      result.contributions.push({ attribute: key, base, upgrades, points });
      if (result.score !== null) result.score += points;
    }
    if (result.score !== null) result.score = Math.min(100, result.score);
    matches.push(result);
  }
  const winner = matches.filter(m => m.score !== null).sort((a, b) => b.score! - a.score!)[0];
  const unknown = matches.some(m => m.score === null);
  const value = unknown ? null : winner?.score ?? 0;
  return { score: value, grade: unknown ? '条件未读取' : !winner ? '未命中' : value! >= winner.keep ? '保留参考' : value! >= winner.observe ? '观察参考' : '低分参考', matches, winner };
}
