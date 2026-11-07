import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroGroups, meetsSkills, storyComplete } from '../src/heroRoster.ts';
const hero = (id, star, level) => ({ id, name: '神堕八岐大蛇', rarity: 'SP', star, level, awakened: true, shards: 0, base: {} });
test('groups instances by template and keeps real cultivation combinations', () => {
  const groups = heroGroups([{ ...hero('383', 6, 40) }], { heroes: [hero('a', 2, 1), hero('b', 6, 40)], extras: { heroDetails: { a: { templateId: 383, skills: [[1, 5], [2, 1], [3, 1]] }, b: { templateId: 383, skills: [[1, 1], [2, 5], [3, 5]] } } } });
  assert.equal(groups.length, 1); assert.equal(groups[0].instances.length, 2); assert.equal(groups[0].maxStar, 6); assert.equal(groups[0].best.id, 'b');
  const details = { a: { skills: [[1, 5], [2, 1], [3, 1]] }, b: { skills: [[1, 1], [2, 5], [3, 5]] } };
  assert.equal(meetsSkills(groups[0], details, [5, 5, 5]), false);
  assert.equal(meetsSkills(groups[0], details, [0, 5, 5]), true);
});
test('unknown biography progress never means completed', () => {
  assert.equal(storyComplete({ current: null, target: 12 }), false);
  assert.equal(storyComplete({ current: 12, target: 12 }), true);
  assert.equal(storyComplete({ current: 11, target: 12 }), false);
});
test('name fallback preserves manually maintained records', () => {
  const groups = heroGroups([hero('383', 6, 40)], { heroes: [hero('local-test', 2, 1)] });
  assert.equal(groups[0].id, '383'); assert.equal(groups[0].instances[0].id, 'local-test');
});
