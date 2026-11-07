import data from './data/bounty.json';
import clueData from './data/bounty-clues.json';
import { matchesHero } from './heroSearch';

export interface Encounter { name: string; category: string; location: string; position: string; difficulty: string; count: number }
export const encounters: Encounter[] = data.encounters;
export const bountyNames = [...new Set(encounters.map(e => e.name))];
export const bountyCategories = data.categories;
export const clues: Record<string, string[]> = clueData.clues;
export const bountySource = data.source;
export const bountyDate = data.fetchedAt.slice(0, 10);
export const clueSource = clueData.sources[1];
export function findBountyNames(query: string) {
  return bountyNames.filter(name => query.trim().split(/\s+/).filter(Boolean).every(word => matchesHero(name, word) || (clues[name] ?? []).some(clue => matchesHero(clue, word))));
}
export function bountyLocations(name: string, category: string, difficulty: string) {
  return encounters.filter(e => e.name === name && (!category || e.category === category) && (!difficulty || e.difficulty === '未区分' || e.difficulty === difficulty))
    .sort((a, b) => Number(b.category === '挑战') - Number(a.category === '挑战') || b.count - a.count || a.location.localeCompare(b.location, 'zh-CN'));
}
