import type { Soul } from './types';

export type MainFilters = Partial<Record<2 | 4 | 6, string[]>>;
export const mainSlots = [2, 4, 6] as const;
export const mainOptions: Record<2 | 4 | 6, string[]> = {
  2: ['attack_pct', 'hp_pct', 'defense_pct', 'speed'],
  4: ['attack_pct', 'hp_pct', 'defense_pct', 'hit', 'resist'],
  6: ['attack_pct', 'hp_pct', 'defense_pct', 'crit', 'crit_damage'],
};

export function matchesMainFilters(soul: Soul, filters: MainFilters): boolean {
  if (soul.slot !== 2 && soul.slot !== 4 && soul.slot !== 6) return true;
  const selected = filters[soul.slot];
  return !selected?.length || selected.includes(soul.main);
}

export function describeMainFilters(filters: MainFilters, labels: Record<string, string>): string {
  return mainSlots.map(slot => `${slot}号位：${filters[slot]?.length ? filters[slot]!.map(key => labels[key] ?? key).join(' / ') : '不限'}`).join('；');
}
