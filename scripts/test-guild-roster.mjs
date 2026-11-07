import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guildBaseline, guildTags, sortGuildMembers } from '../src/guildRoster.ts';
const member=(id,active)=>({id,name:id,active,weekly:active,joinedAt:1});
test('weekly baseline follows the captured Shanghai weekday',()=>{
  assert.equal(guildBaseline('2026-10-26T11:50:00Z'),65);
  assert.equal(guildBaseline('2026-10-26T17:00:00Z'),130);
  assert.equal(guildBaseline('invalid'),null);
});
test('unknown medals are excluded from ranking and tier assignment',()=>{
  const tags=guildTags([member('one',130),member('two',100),member('three',30),member('unknown',null)],130);
  assert.equal(tags.one,'顶梁柱');assert.equal(tags.two,'随缘玩家');assert.equal(tags.three,'摸鱼怪');assert.equal(tags.unknown,'未读取');
});
test('unknown sort values stay last in either direction',()=>{
  const rows=[member('unknown',null),member('one',1),member('two',2)];
  assert.deepEqual(sortGuildMembers(rows,'active',true).map(m=>m.id),['one','two','unknown']);
  assert.deepEqual(sortGuildMembers(rows,'active',false).map(m=>m.id),['two','one','unknown']);
});
