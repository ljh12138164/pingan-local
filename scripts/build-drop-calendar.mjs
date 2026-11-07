import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const [runePath, rewardPath, suitPath] = process.argv.slice(2);
if (!suitPath) throw Error('Pass independently read dungeon_rune, reward and equip_suit JSON paths');
const files = await Promise.all([runePath, rewardPath, suitPath].map(p => fs.readFile(p, 'utf8')));
const [runes, rewards, suits] = files.map(s => JSON.parse(s));
// The equip_suit acquisition text independently anchors loot_id[0] to Monday.
const weekdayNames = ['周一', '周二', '周三', '周四', '周五'];
for (let day = 0; day < 5; day++) {
  const ids = rewards[runes['1'].loot_id.split('|')[day]].looticon.split(':').map(s => s.split('|')[0]);
  if (!ids.some(id => suits[id]?.way?.includes(weekdayNames[day]))) throw Error(`Weekday ${day} has no independent acquisition-text anchor`);
}
const floors = Object.values(runes).filter(r => [1, 2, 3, 4].includes(r.type)).map(r => {
  const lootIds = r.loot_id.split('|');
  if (lootIds.length !== 7) throw Error(`Expected seven weekday rewards for ${r.id}`);
  return { id: String(r.id), dungeon: r.type, floor: r.floor_num, name: r.floordesc, description: r.leveldesc, stamina: r.strength,
    days: lootIds.map(rewardId => {
      const reward = rewards[rewardId];
      if (!reward) throw Error(`Missing reward ${rewardId}`);
      const ids = reward.looticon.split(':').map(x => x.split('|')[0]);
      if (ids.some(id => !suits[id] && !['900109', '900180'].includes(id))) throw Error(`Unrecognized display reward ${rewardId}`);
      return { rewardId, sets: ids.filter(id => suits[id]).map(id => ({ id, name: suits[id].suit_n })), unspecified: ids.some(id => !suits[id]) };
    }) };
}).sort((a, b) => a.dungeon - b.dungeon || a.floor - b.floor);
if (floors.length !== 24) throw Error(`Unexpected floor count ${floors.length}`);
const low = floors.filter(f => f.dungeon === 1 && f.floor <= 9);
if (!low.every(f => JSON.stringify(f.days.map(({ sets, unspecified }) => ({ sets, unspecified }))) === JSON.stringify(low[0].days.map(({ sets, unspecified }) => ({ sets, unspecified }))))) throw Error('Cannot group floors 1-9: display lists differ');
const output = { source: 'independently read game static dungeon_rune / reward / equip_suit', capturedAt: new Date().toISOString(), sourceHashes: files.map(s => crypto.createHash('sha256').update(s).digest('hex')), timezone: 'Asia/Shanghai', weekdayAnchor: 'equip_suit.way and dungeon_rune.loot_id / reward.looticon', kind: 'display-rewards-only', floors };
await fs.writeFile('src/data/drop-calendar.json', JSON.stringify(output));
console.log(JSON.stringify({ floors: floors.length, rows: floors.length * 7, sets: new Set(floors.flatMap(f => f.days.flatMap(d => d.sets.map(s => s.id)))).size, unspecified: floors.reduce((n, f) => n + f.days.filter(d => d.unspecified).length, 0) }));
