import type { Soul } from './types';
import type { SoulRolls } from './soulGrowth';

export const speedCategories = [
  { key: 'head', label: '头', note: '2号位 · 速度主属性' },
  { key: 'foot', label: '脚', note: '4号位 · 抵抗主属性' },
  { key: 'tail', label: '尾', note: '4号位 · 命中主属性' },
  { key: 'true17', label: '真17', note: '满速 · 副速度 ≥ 17' },
  { key: 'full', label: '满速御魂', note: '速度获得 6 次 · 含初始 1 次' },
] as const;
export type SpeedCategory = typeof speedCategories[number]['key'];

// Capture hands counts include the initial roll. A newly added speed line with
// four later upgrades has only five hands and must not count as full speed.
export function fullSpeedStatus(soul: Soul, rolls?: SoulRolls): boolean | null {
  if (soul.quality !== 6 || soul.level !== 15 || !Number.isFinite(soul.sub.speed) || soul.sub.speed <= 0) return false;
  const hands = rolls?.attributes?.speed?.hands;
  if (!Number.isInteger(hands) || hands! < 1 || hands! > 6) return null;
  if (hands === 6 && rolls?.initial !== 4) return null;
  return hands === 6;
}

export function speedAssets(souls: Soul[], rolls?: Record<string, SoulRolls>) {
  const groups: Record<SpeedCategory, Soul[]> = { head: [], foot: [], tail: [], true17: [], full: [] };
  let unknown = 0, eligible = 0;
  for (const soul of souls) {
    if (soul.quality === 6 && soul.level === 15 && Number.isFinite(soul.sub.speed) && soul.sub.speed > 0) eligible++;
    const full = fullSpeedStatus(soul, rolls?.[soul.id]);
    if (full === null) { unknown++; continue; }
    if (!full) continue;
    groups.full.push(soul);
    if (soul.slot === 2 && soul.main === 'speed') groups.head.push(soul);
    if (soul.slot === 4 && soul.main === 'resist') groups.foot.push(soul);
    if (soul.slot === 4 && soul.main === 'hit') groups.tail.push(soul);
    if (soul.sub.speed >= 17) groups.true17.push(soul);
  }
  for (const items of Object.values(groups)) items.sort((a, b) => b.sub.speed - a.sub.speed || a.id.localeCompare(b.id));
  return { groups, unknown, eligible };
}
