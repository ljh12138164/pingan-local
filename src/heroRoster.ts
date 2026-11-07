import type { Document, Hero } from './types';

export interface HeroFact { skills: number[]; material: number; synthesis?: number; type?: number; tags: string[]; cv: string; story: number[] }
export interface HeroInstanceDetail { templateId: number; skills: [number, number][]; locked?: boolean }
export interface HeroStory { id: string; description: string | null; current: number | null; target: number | null; rewards?: [number, number][] }
export interface HeroGroup { id: string; name: string; rarity: string; instances: Hero[]; best: Hero | undefined; skills: number[] | null; maxStar: number; maxLevel: number; stories: HeroStory[]; fact?: HeroFact }
export const rarityOrder: Record<string, number> = { UR: 0, SP: 1, SSR: 2, SR: 3, R: 4, N: 5, MATERIAL: 6 };

export function heroGroups(catalog: Hero[], data: Document | null | undefined, facts: Record<string, HeroFact> = {}): HeroGroup[] {
  const details = data?.extras?.heroDetails as Record<string, HeroInstanceDetail> | undefined;
  const stories = data?.extras?.heroStories as Record<string, HeroStory[]> | undefined;
  const groups = new Map<string, HeroGroup>();
  const byName = new Map(catalog.map(h => [h.name, h.id]));
  const add = (h: Hero, id: string) => {
    if (!groups.has(id)) groups.set(id, { id, name: h.name, rarity: h.rarity, instances: [], best: undefined, skills: null, maxStar: 0, maxLevel: 0, stories: stories?.[id] ?? [], fact: facts[id] });
    return groups.get(id)!;
  };
  catalog.forEach(h => add(h, h.id));
  for (const hero of data?.heroes ?? []) {
    const id = String(details?.[hero.id]?.templateId ?? byName.get(hero.name) ?? `name:${hero.name}`);
    add(hero, id).instances.push(hero);
  }
  for (const group of groups.values()) {
    const skillValues = (h: Hero) => details?.[h.id]?.skills?.map(s => s[1]) ?? null;
    const total = (h: Hero) => skillValues(h)?.reduce((sum, value) => sum + value, 0) ?? -1;
    group.instances.sort((a, b) => b.star - a.star || b.level - a.level || total(b) - total(a) || a.id.localeCompare(b.id));
    group.best = group.instances[0];
    group.maxStar = Math.max(0, ...group.instances.map(h => h.star));
    group.maxLevel = Math.max(0, ...group.instances.map(h => h.level));
    const bestSkills = [...group.instances].sort((a, b) => total(b) - total(a))[0];
    group.skills = bestSkills ? skillValues(bestSkills) : null;
  }
  return [...groups.values()].sort((a, b) => (rarityOrder[a.rarity] ?? 9) - (rarityOrder[b.rarity] ?? 9) || a.name.localeCompare(b.name, 'zh-CN'));
}

export const storyComplete = (story: HeroStory) => story.current !== null && story.target !== null && story.current >= story.target;
export const storyKnown = (story: HeroStory) => story.current !== null && story.target !== null;
export const isCultivable = (group: HeroGroup) => !(group.fact?.material && group.fact.material < 100) && group.rarity !== 'MATERIAL';

// A requested skill pattern must be met by one actual instance. Never combine
// the strongest skill of different copies into an imaginary cultivated hero.
export function meetsSkills(group: HeroGroup, details: Record<string, HeroInstanceDetail>, targets: number[]) {
  return group.instances.some(hero => {
    const skills = details[hero.id]?.skills;
    return !!skills?.length && targets.every((target, index) => !target || (skills[index]?.[1] ?? 0) >= target);
  });
}
