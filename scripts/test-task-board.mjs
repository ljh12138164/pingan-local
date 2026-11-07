import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routineProgress } from '../src/taskBoard.ts';
const now = new Date('2026-10-27T01:00:00Z');
const document = data => ({ extras: { capture: { daily_task_timestamp: Date.parse('2026-10-26T16:00:00Z') / 1000, routineProgress: data } } });
test('daily prayer uses an explicit zero instead of treating missing data as zero', () => {
  assert.equal(routineProgress(document({}), 'prayer', now).current, null);
  assert.equal(routineProgress(document({ guild_beg_times: 0 }), 'prayer', now).current, 0);
  assert.equal(routineProgress(document({ guild_beg_times: 3 }), 'prayer', now).current, 1);
});
test('bounty completion requires known status for every current quest', () => {
  assert.deepEqual(routineProgress(document({ monster_task: { a: { fin: true }, b: { fin: false } } }), 'bounty', now).current, 1);
  assert.equal(routineProgress(document({ monster_task: { a: {} } }), 'bounty', now).current, null);
});
test('expired game progress is unknown even when the old snapshot says completed', () => {
  const progress = routineProgress(document({ guild_beg_times: 1 }), 'prayer', new Date('2026-10-28T01:00:00Z'));
  assert.equal(progress.expired, true); assert.equal(progress.current, null);
});
