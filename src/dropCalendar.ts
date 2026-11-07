import data from './data/drop-calendar.json';
import { matchesHero } from './heroSearch';

export interface DropSet { id: string; name: string }
export interface DropDay { rewardId: string; sets: DropSet[]; unspecified: boolean }
export interface DropFloor { id: string; dungeon: number; floor: number; name: string; description: string; stamina: number; days: DropDay[] }
export const dropFloors: DropFloor[] = data.floors;
export const dropDate = data.capturedAt.slice(0, 10);
export const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
export const dungeons = [{ id: 1, name: '八岐大蛇' }, { id: 2, name: '业原火' }, { id: 4, name: '永生之海' }, { id: 3, name: '日轮之陨' }];
export function east8Weekday(at = new Date()): number { return (new Date(at.getTime() + 8 * 3600000).getUTCDay() + 6) % 7; }
export function dropColumns(dungeon: number) {
  const floors = dropFloors.filter(f => f.dungeon === dungeon);
  if (dungeon !== 1) return floors.map(floor => ({ label: floor.name, floor, additional: false }));
  const get = (n: number) => floors.find(f => f.floor === n)!;
  return [{ label: '10 层 · 基础掉落', floor: get(10), additional: false }, { label: '1–9 层 · 另含', floor: get(1), additional: true }, ...[11, 12, 13].map(n => ({ label: `${get(n).name} · 额外掉落`, floor: get(n), additional: true }))];
}
export function columnDay(column: ReturnType<typeof dropColumns>[number], day: number): DropDay {
  const value = column.floor.days[day];
  if (!column.additional) return value;
  const base = new Set(dropFloors.find(f => f.dungeon === 1 && f.floor === 10)!.days[day].sets.map(s => s.id));
  return { ...value, sets: value.sets.filter(s => !base.has(s.id)) };
}
export function matchesDrop(set: DropSet, query: string): boolean { return matchesHero(set.name, query, set.id); }
export function calendarDays(dungeon: number, query: string, todayOnly: boolean, today: number) {
  const floors = dropFloors.filter(f => f.dungeon === dungeon);
  return weekdays.map((name, day) => ({ name, day })).filter(({ day }) => (!todayOnly || day === today) && (!query.trim() || floors.some(f => f.days[day].sets.some(s => matchesDrop(s, query)))));
}
