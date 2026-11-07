import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shardPlan } from '../src/shardPlanning.ts';
const archive = (id, shard) => ({ profile: { id, name: id }, data: { shards: [{ id: '383', name: '神堕八岐大蛇', target: 60, ...shard }] } });
test('bound fragments count toward synthesis but never toward transferable donor inventory', () => {
  const recipient = archive('recipient', { quantity: 40, normal: 30, bound: 10 });
  const donor = archive('donor', { quantity: 70, normal: 5, bound: 65, contracts: 8 });
  const plan = shardPlan(recipient, [recipient, donor], '383');
  assert.equal(plan.missing, 20); assert.equal(plan.total, 5); assert.equal(plan.remaining, 15); assert.equal(plan.donors.length, 1);
});
test('reserve applies independently to every donor and cannot produce negative availability', () => {
  const recipient = archive('recipient', { quantity: 0 });
  const plan = shardPlan(recipient, [archive('one', { quantity: 4, normal: 4 }), archive('two', { quantity: 12, normal: 12 })], '383', 5);
  assert.equal(plan.total, 7); assert.deepEqual(plan.donors.map(d => d.available), [7, 0]);
});
test('unknown ordinary inventory is not guessed from a total or contracts', () => {
  const recipient = archive('recipient', { quantity: 60 });
  const plan = shardPlan(recipient, [archive('unknown', { quantity: 100, contracts: 2 })], '383');
  assert.equal(plan.missing, 0); assert.equal(plan.donors[0].available, null); assert.equal(plan.total, 0);
  assert.equal(plan.unknownDonors, 1);
});
test('unrecorded catalog target remains unknown rather than claiming a zero balance', () => {
  const recipient = { profile: { id: 'recipient' }, data: { shards: [] } };
  const plan = shardPlan(recipient, [], '383', 0, { id: '383', name: '神堕八岐大蛇', quantity: null, target: 60 });
  assert.equal(plan.target.target, 60); assert.equal(plan.missing, null); assert.equal(plan.remaining, null);
});
test('same game account in multiple snapshots contributes only its newest inventory', () => {
  const recipient = archive('recipient', { quantity: 0 });
  const old = archive('old', { quantity: 10, normal: 10 });
  const latest = archive('latest', { quantity: 7, normal: 7 });
  for (const [item, updatedAt] of [[old, '2026-10-01'], [latest, '2026-10-02']]) {
    item.profile.updatedAt = updatedAt;
    item.data.extras = { capture: { player: { server_id: 10040, short_id: 123 } } };
  }
  const plan = shardPlan(recipient, [old, latest], '383');
  assert.equal(plan.total, 7); assert.equal(plan.donors.length, 1); assert.equal(plan.donors[0].profile.id, 'latest');
});
