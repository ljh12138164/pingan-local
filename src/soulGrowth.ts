import type { Soul } from './types';

export interface RollFact { hands: number; base: number; low: number; high: number }
export interface SoulRolls { initial: number | null; focused?: boolean | null; attributes?: Record<string, RollFact> }
// CDF of the sum of h independent uniform [0, 1] variables.
function cumulative(value: number, hands: number) {
  if (value <= 0) return 0;
  if (value >= hands) return 1;
  let sum = 0, combinations = 1, factorial = 1;
  for (let k = 0; k <= hands; k++) {
    if (k) { combinations *= (hands - k + 1) / k; factorial *= k; }
    if (k <= value) sum += (k % 2 ? -1 : 1) * combinations * (value - k) ** hands;
  }
  return Math.max(0, Math.min(1, sum / factorial));
}
export function growthScore(value: number, fact: RollFact | undefined) {
  if (!fact || !Number.isInteger(fact.hands) || fact.hands < 1 || fact.hands > 9 || fact.base <= 0 || fact.high <= fact.low) return null;
  const normalized = (value / fact.base - fact.low * fact.hands) / (fact.high - fact.low);
  if (!Number.isFinite(normalized) || normalized < -1e-6 || normalized > fact.hands + 1e-6) return null;
  const probability = cumulative(normalized, fact.hands);
  const a = 0.626041;
  const average = 100 * probability ** a / (probability ** a + (1 - probability) ** a);
  return { average, total: average * fact.hands, hands: fact.hands, mean: value / fact.hands };
}
export function totalGrowth(soul: Soul, rolls: SoulRolls | undefined) {
  if (!rolls?.attributes || !Object.keys(soul.sub).length) return null;
  let total = 0;
  for (const [key, value] of Object.entries(soul.sub)) {
    const growth = growthScore(value, rolls.attributes[key]);
    if (!growth) return null;
    total += growth.total;
  }
  return total;
}
