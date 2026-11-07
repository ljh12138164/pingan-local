import type { Rule, Soul } from './types';
import type { SoulRolls } from './soulGrowth';
import { evaluateSoul } from './soulScoring';

export type RadarView = 'set' | 'slot';
export type RadarMetric = 'count' | 'speed' | 'average';
export interface RadarGroup { name: string; count: number; full: number; speed: number | null; average: number | null; scored: number; unknown: number }

export function radarGroups(souls: Soul[], view: RadarView, rule: Rule | undefined, rolls?: Record<string, SoulRolls>, scene: 'all' | 'pve' | 'pvp' = 'all'): RadarGroup[] {
  const grouped = new Map<string, Soul[]>();
  if (view === 'slot') for (let slot = 1; slot <= 6; slot++) grouped.set(`${slot}号位`, []);
  for (const soul of souls) {
    const name = view === 'slot' ? `${soul.slot}号位` : soul.set;
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name)!.push(soul);
  }
  return [...grouped].map(([name, items]) => {
    let sum = 0, scored = 0;
    for (const soul of items) {
      const value = rule ? evaluateSoul(soul, rule, rolls?.[soul.id], scene).score : null;
      if (value !== null) { sum += value; scored++; }
    }
    return { name, count: items.length, full: items.filter(s => s.level === 15).length,
      speed: items.length ? Math.max(...items.map(s => (s.sub.speed ?? 0) + (s.main === 'speed' ? s.value : 0))) : null,
      average: items.length && scored === items.length ? sum / items.length : null,
      scored, unknown: items.length - scored };
  });
}
