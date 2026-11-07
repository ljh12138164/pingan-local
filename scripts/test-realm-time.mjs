import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realmCountdown, realmDueEvents } from '../src/realmTime.ts';
test('countdown distinguishes unknown, active and expired', () => {
  assert.equal(realmCountdown(null, 10), '结束时间未读取');
  assert.equal(realmCountdown(NaN, 10), '结束时间未读取');
  assert.equal(realmCountdown(3671, 10), '1:01:01');
  assert.equal(realmCountdown(10, 10), '已到期，待游戏确认');
});
test('reminders exclude old cached expiries, future and unread times', () => {
  const status = { cards: [5, 12, 30, null].map((end, i) => ({ id: String(i), name: '太鼓', endsAt: end })), foster: { heroId: 'hero', heroName: '辉夜姬', endsAt: 11 } };
  const due = realmDueEvents(status, 10, 20);
  assert.equal(due.length, 2);
  assert.match(due[0].key, /card:1:12/);
  assert.match(due[1].text, /辉夜姬寄养/);
  assert.deepEqual(realmDueEvents(undefined, 10, 20), []);
});
