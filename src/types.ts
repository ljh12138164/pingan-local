export type Stats = Record<string, number>;
export interface Soul { id: string; set: string; slot: number; quality: number; level: number; main: string; value: number; sub: Stats; innate?: Stats; locked: boolean; equipped: string; initialSubstats?: number }
export interface Hero { id: string; name: string; rarity: string; level: number; star: number; awakened: boolean; shards: number; base: Stats; bonus?: Stats }
export interface Resource { name: string; amount: number; unit: string }
export interface Task { id: string; name: string; done: boolean; category: string; period?: string }
export interface GuildMember { id: string; name: string; level: number; contribution: number; note: string }
export interface SetDef { name: string; twoPiece: Stats; sixPiece?: Stats }
export interface Document { name: string; souls: Soul[]; heroes: Hero[]; resources: Resource[]; tasks: Task[]; guild: GuildMember[]; sets: SetDef[]; shards?: { id: string; name: string; quantity: number; normal?: number | null; bound?: number | null; contracts?: number | null; target?: number | null }[]; extras?: Record<string, unknown> }
export interface RuleCard { id: string; name: string; enabled: boolean; sets: string[]; slots: number[]; mains: Record<string, string[]>; initial: number[]; core: string[]; normal: string[]; scene: 'all' | 'pve' | 'pvp'; coreBase: number; normalBase: number; coreUpgrade: number; normalUpgrade: number; keep: number; observe: number }
export interface Rule { id: string; name: string; weights: Stats; keep: number; observe: number; model?: 'weighted' | 'conditions'; description?: string; cards?: RuleCard[] }
export interface Profile { id: string; name: string; source: string; createdAt: string; updatedAt: string; soulCount: number }
export interface Snapshot { id: string; profileId: string; name: string; createdAt: string }
export interface AppState { profiles: Profile[]; activeId: string | null; data: Document | null; rules: Rule[]; snapshots: Snapshot[]; events: { kind: string; message: string; createdAt: string }[]; catalog: Hero[]; heroFacts?: Record<string, import('./heroRoster').HeroFact>; serverNames?: Record<string, string>; settings: Record<string, unknown>; databasePath: string; version: string }
export interface Combination { ids: string[]; panel: Stats; objective: number; satisfied: boolean; deficits: Stats; sets: Record<string, number>; associationScore?: number }
export interface SearchResult { results: Combination[]; exact: boolean; combinations: string; checked: number; method: string; formula: string }
export interface Simulation { soul: Soul; steps: { level: number; attribute: string; gain: number; new: boolean; sub: Stats }[]; seed: number; model: string }
export const labels: Record<string, string> = { attack: '攻击', attack_pct: '攻击加成', hp: '生命', hp_pct: '生命加成', defense: '防御', defense_pct: '防御加成', speed: '速度', crit: '暴击', crit_damage: '暴击伤害', hit: '效果命中', resist: '效果抵抗', damage: '参考输出', fourSet: '四件套缺件', twoSet: '两件套缺件' };
export const attrs = Object.keys(labels).filter(k => !['damage', 'fourSet', 'twoSet'].includes(k));
export const percent = new Set(['attack_pct', 'hp_pct', 'defense_pct', 'crit', 'crit_damage', 'hit', 'resist']);
export const number = (v: number, digits = 2) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(v);
export const attribute = (k: string, v: number) => `${number(v)}${percent.has(k) ? '%' : ''}`;
export const date = (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false });
const rolls: Stats = { speed: 2.7, crit: 2.7, attack_pct: 2.7, hp_pct: 2.7, crit_damage: 3.6, hit: 3.6, resist: 3.6, defense_pct: 2.7, attack: 24.3, hp: 102.6, defense: 4.5 };
export const score = (soul: Soul, rule: Rule) => Object.entries(soul.sub).reduce((sum, [k, v]) => sum + v / (rolls[k] ?? 1) * (rule.weights[k] ?? 0), 0);
export const grade = (value: number, rule: Rule) => value >= rule.keep ? '保留参考' : value >= rule.observe ? '观察参考' : '低分参考';
