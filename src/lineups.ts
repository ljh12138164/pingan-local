import type { Document, Hero } from './types';
import type { HeroInstanceDetail } from './heroRoster';

export interface LineupMember { name: string; templateId: string; soul: string; stats: string; skillNote: string; star: number; level: number; skills: number[] }
export interface Lineup { id: string; name: string; scene: 'pve' | 'pvp'; dungeon: string; author: string; sourceUrl: string; notes: string; code: string; members: LineupMember[] }
export interface LineupLibrary { public: { teams: Lineup[]; updatedAt: string | null; sourceUrl?: string }; custom: Lineup[] }
export interface MemberMatch { member: LineupMember; hero?: Hero; status: 'met' | 'unknown' | 'missing'; detail: string }

// A separate instance is required for each slot; skill levels must belong to that
// same instance. Maximum matching prevents a lenient slot consuming the only
// copy that satisfies a later, stricter slot.
export function matchLineup(team: Lineup, data: Document | null | undefined): MemberMatch[] {
  if (!data) return team.members.map(member => ({ member, status: 'unknown', detail: '尚未读取角色库存' }));
  const details = data.extras?.heroDetails as Record<string, HeroInstanceDetail> | undefined;
  const candidates = team.members.map(member => data.heroes.filter(hero => {
    const template = details?.[hero.id]?.templateId;
    return member.templateId && template !== undefined ? String(template) === member.templateId : hero.name === member.name;
  }).map(hero => {
    const levels = details?.[hero.id]?.skills?.map(s => s[1]);
    const requiresSkills = member.skills.some(n => n > 0);
    const known = !requiresSkills || !!levels?.length;
    const met = hero.star >= member.star && hero.level >= member.level && (!requiresSkills || !known || member.skills.every((n, i) => !n || (levels?.[i] ?? 0) >= n));
    return { hero, status: known ? 'met' as const : 'unknown' as const, met };
  }).filter(candidate => candidate.met).sort((a,b) => Number(a.status === 'unknown') - Number(b.status === 'unknown') || a.hero.id.localeCompare(b.hero.id)));
  const owned = new Map<string, number>();
  const chosen = new Map<number, (typeof candidates)[number][number]>();
  const assign = (slot: number, seen: Set<string>): boolean => {
    for (const candidate of candidates[slot]) {
      if (seen.has(candidate.hero.id)) continue;
      seen.add(candidate.hero.id);
      const other = owned.get(candidate.hero.id);
      if (other === undefined || assign(other, seen)) { owned.set(candidate.hero.id, slot); chosen.set(slot, candidate); return true; }
    }
    return false;
  };
  // First establish assignments using fully known candidates, then try unknown
  // skill candidates for the remaining slots without displacing known matches.
  const original = candidates.map(rows => [...rows]);
  candidates.forEach((rows, i) => { candidates[i] = rows.filter(row => row.status === 'met'); });
  team.members.forEach((_, i) => assign(i, new Set()));
  const knownSlots = new Set(chosen.keys());
  candidates.forEach((_, i) => { candidates[i] = original[i].filter(row => !knownSlots.has(i) || row.status === 'met'); });
  team.members.forEach((_, i) => { if (!chosen.has(i)) assign(i, new Set()); });
  return team.members.map((member, index) => {
    const candidate = chosen.get(index);
    return candidate ? { member, hero: candidate.hero, status: candidate.status, detail: candidate.status === 'unknown' ? '技能数据未读取' : '满足已填写培养条件' } : { member, status: 'missing', detail: original[index].length ? '同名式神数量不足' : '缺少式神或培养条件未达标' };
  });
}

export const blankMember = (): LineupMember => ({ name: '', templateId: '', soul: '', stats: '', skillNote: '', star: 0, level: 0, skills: [0,0,0] });
export const blankLineup = (): Lineup => ({ id: '', name: '', scene: 'pve', dungeon: '', author: '', sourceUrl: '', notes: '', code: '', members: [blankMember()] });
