import { match } from 'pinyin-pro';

const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[·・\s'’-]/g, '');
const cache = new Map<string, boolean>();

// Search names, rather than individual instances, so a large duplicate inventory stays responsive.
export function matchesHero(name: string, query: string, id = ''): boolean {
  const words = query.trim().split(/\s+/).filter(Boolean);
  return words.every(word => {
    const key = normalize(word);
    if (id && id.toLowerCase().includes(key)) return true;
    const cacheKey = `${name}\0${key}`;
    const found = cache.get(cacheKey);
    if (found !== undefined) return found;
    const text = normalize(name);
    let cursor = 0;
    const spacedCharacters = [...key].every(char => { const next = text.indexOf(char, cursor); cursor = next + 1; return next >= 0; });
    const result = text.includes(key) || spacedCharacters || (/^[a-z]+$/.test(key) && match(name, key) !== null);
    if (cache.size > 12000) cache.clear();
    cache.set(cacheKey, result);
    return result;
  });
}
