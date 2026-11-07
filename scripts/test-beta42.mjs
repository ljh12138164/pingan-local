import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
await build({ entryPoints: ['src/speedAssets.ts', 'src/soulFilters.ts', 'src/soulRadar.ts'], outdir: 'work/beta42-test', bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' } });
const { speedAssets, fullSpeedStatus } = await import('../work/beta42-test/speedAssets.mjs');
const { matchesMainFilters, describeMainFilters } = await import('../work/beta42-test/soulFilters.mjs');
const { radarGroups } = await import('../work/beta42-test/soulRadar.mjs');
const soul = (id, changes = {}) => ({ id, set: '招财猫', slot: 1, quality: 6, level: 15, main: 'attack', value: 486, sub: { speed: 17 }, locked: false, equipped: '', ...changes });
const fact = (hands = 6, initial = 4) => ({ initial, attributes: { speed: { hands, base: 3, low: .8, high: 1 } } });

test('speed roll counts include the initial roll; an added speed line is not five upgrades', () => {
  assert.equal(fullSpeedStatus(soul('a'), fact(6)), true);
  assert.equal(fullSpeedStatus(soul('a'), fact(5, 3)), false);
});
test('missing, fractional and impossible roll counts stay unknown instead of guessed from speed', () => {
  for (const rolls of [undefined, { initial: 4 }, fact(7), fact(0), fact(5.5), fact(6, 3), fact(6, null)]) assert.equal(fullSpeedStatus(soul('a'), rolls), null);
});
test('non-six-star, unlevelled and no-speed souls are not eligible', () => {
  for (const s of [soul('a', { quality: 5 }), soul('a', { level: 12 }), soul('a', { sub: {} }), soul('a', { sub: { speed: NaN } })]) assert.equal(fullSpeedStatus(s, fact()), false);
});
test('head, foot, tail require both full speed and the correct slot and main', () => {
  const input = [soul('head', { slot: 2, main: 'speed' }), soul('foot', { slot: 4, main: 'resist' }), soul('tail', { slot: 4, main: 'hit' }), soul('not-head', { slot: 2, main: 'attack_pct' }), soul('unknown')];
  const rolls = Object.fromEntries(input.slice(0, 4).map(s => [s.id, fact()]));
  const result = speedAssets(input, rolls);
  assert.deepEqual(result.groups.head.map(s => s.id), ['head']);
  assert.deepEqual(result.groups.foot.map(s => s.id), ['foot']);
  assert.deepEqual(result.groups.tail.map(s => s.id), ['tail']);
  assert.equal(result.groups.full.length, 4); assert.equal(result.unknown, 1); assert.equal(result.eligible, 5);
});
test('true17 compares raw sub-speed, excluding main and innate speed and display rounding', () => {
  const rows = [soul('rounded', { slot: 2, main: 'speed', value: 57, innate: { speed: 50 }, sub: { speed: 16.9999 } }), soul('exact'), soul('above', { sub: { speed: 17.001 } })];
  const result = speedAssets(rows, Object.fromEntries(rows.map(s => [s.id, fact()])));
  assert.deepEqual(result.groups.true17.map(s => s.id), ['above', 'exact']);
});
test('legacy captures return confirmed zero with unknown coverage, never a fabricated count', () => {
  const result = speedAssets([soul('old')]);
  assert.equal(result.groups.full.length, 0); assert.equal(result.unknown, 1);
});
test('statistics preserve the source inventory order and original soul objects', () => {
  const rows = [soul('a'), soul('b', { sub: { speed: 18 } })];
  const before = JSON.stringify(rows);
  assert.equal(speedAssets(rows, { a: fact(), b: fact() }).groups.full[0], rows[1]);
  assert.equal(JSON.stringify(rows), before);
});
test('main filters allow multiple alternatives within a slot and independent choices across slots', () => {
  const filters = { 2: ['speed'], 4: ['hit', 'resist'], 6: ['crit', 'crit_damage'] };
  const rows = [soul('fixed'), soul('speed', { slot: 2, main: 'speed' }), soul('reject', { slot: 2, main: 'hp_pct' }), soul('hit', { slot: 4, main: 'hit' }), soul('resist', { slot: 4, main: 'resist' }), soul('crit', { slot: 6, main: 'crit' })];
  assert.deepEqual(rows.filter(s => matchesMainFilters(s, filters)).map(s => s.id), ['fixed', 'speed', 'hit', 'resist', 'crit']);
  assert.equal(rows.filter(s => matchesMainFilters(s, { 4: [] })).length, rows.length);
});
test('filter descriptions retain all selected conditions for exports', () => {
  assert.equal(describeMainFilters({ 4: ['hit', 'resist'] }, { hit: '命中', resist: '抵抗' }), '2号位：不限；4号位：命中 / 抵抗；6号位：不限');
});
test('radar totals and averages use the filtered inventory including known zero scores', () => {
  const rows = [soul('hit', { slot: 4, main: 'hit', sub: { speed: 10 } }), soul('resist', { slot: 4, main: 'resist', sub: {} }), soul('excluded', { slot: 4, main: 'hp_pct', sub: { speed: 100 } })];
  const filtered = rows.filter(s => matchesMainFilters(s, { 4: ['hit', 'resist'] }));
  const group = radarGroups(filtered, 'slot', { id: 'zero', name: '零分', weights: {}, keep: 10, observe: 5 })[3];
  assert.equal(group.count, 2); assert.equal(group.average, 0); assert.equal(group.speed, 10);
});
test('radar includes innate speed and preserves empty-slot unknown results', () => {
  const rows = radarGroups([soul('innate', { innate: { speed: 50 } })], 'slot', undefined);
  assert.equal(rows[0].speed, 67); assert.equal(rows[0].average, null);
  assert.equal(rows[1].speed, null); assert.equal(rows.length, 6);
});
