import type { Document } from './types';

export interface Routine { id: string; name: string; category: '日常' | '每周'; icon?: string; note?: string }
export const routines: Routine[] = [
  { id: 'prayer', name: '祈愿换片', category: '日常', icon: '490001' },
  { id: 'guild-funds', name: '寮资金领取', category: '日常', icon: '900001' },
  { id: 'shop-gift', name: '商店每日礼包', category: '日常', icon: '900003' },
  { id: 'friend-news', name: '好友吉闻', category: '日常' },
  { id: 'guild-quests', name: '寮三十', category: '日常', note: '寮集体任务记录需在游戏内载入。' },
  { id: 'area-boss', name: '地域鬼王', category: '日常' },
  { id: 'kylin', name: '风麒麟', category: '日常' },
  { id: 'fengmo', name: '逢魔之时', category: '日常', note: '17:00–23:00' },
  { id: 'retreat', name: '首领退治', category: '日常' },
  { id: 'cooperate', name: '协战 50 次', category: '日常' },
  { id: 'bounty', name: '悬赏封印', category: '日常' },
  { id: 'gold-monster', name: '金币妖怪', category: '日常', icon: '900001' },
  { id: 'exp-monster', name: '经验妖怪', category: '日常' },
  { id: 'godapp', name: '大神每日福利', category: '日常' },
];
const day = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export interface TaskSnapshot { capturedAt?: string; dailyTimestamp?: number; routines?: Record<string, unknown>; rules?: { retreat?: { open_week_day?: number[] }; godapp?: { condition?: number } }; facts?: { id: string; name: string; current: number | null; target: number | null; completed: boolean | null }[] }
export function routineAvailable(data: Document, id: string, now = new Date()) {
  if (id !== 'retreat') return true;
  const rule = (data.extras?.taskSnapshot as TaskSnapshot | undefined)?.rules?.retreat;
  const days = rule?.open_week_day;
  if (!Array.isArray(days) || !days.length || !days.every(n => Number.isInteger(n) && n >= 0 && n <= 6)) return true;
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' }).format(now));
  return days.includes(weekday);
}
export function routineProgress(data: Document, id: string, now = new Date()) {
  const snapshot = data.extras?.taskSnapshot as TaskSnapshot | undefined;
  const capture = data.extras?.capture as { daily_task_timestamp?: number; reader?: { capturedAt?: string }; routineProgress?: Record<string, unknown> } | undefined;
  const timestamp = snapshot ? snapshot.dailyTimestamp : capture?.daily_task_timestamp;
  const expired = !timestamp || day(new Date(timestamp * 1000)) !== day(now);
  const raw = snapshot ? snapshot.routines : capture?.routineProgress;
  let current: number | null = null, target: number | null = null;
  if (id === 'prayer' && typeof raw?.guild_beg_times === 'number' && raw.guild_beg_times >= 0) { current = Math.min(1, raw.guild_beg_times); target = 1; }
  if (id === 'godapp' && raw?.godapp_task && typeof raw.godapp_task === 'object') {
    const task = (raw.godapp_task as Record<string, { process?: number }>)['201'];
    const goal = snapshot?.rules?.godapp?.condition;
    if (typeof task?.process === 'number' && task.process >= 0 && typeof goal === 'number' && goal > 0) { current = Math.min(goal, task.process); target = goal; }
  }
  if (id === 'bounty' && raw?.monster_task && typeof raw.monster_task === 'object') {
    const quests = Object.values(raw.monster_task as Record<string, { fin?: boolean }>);
    if (quests.length && quests.every(q => typeof q.fin === 'boolean')) { current = quests.filter(q => q.fin).length; target = quests.length; }
  }
  return { current: expired ? null : current, target, expired, readAt: snapshot?.capturedAt ?? capture?.reader?.capturedAt };
}
