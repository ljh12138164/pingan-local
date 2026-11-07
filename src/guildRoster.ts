export interface GameGuildMember { id: string; name: string; level: number | null; duty: number | null; weekly: number | null; lastWeekly: number | null; total: number | null; donated: number | null; active: number | null; joinedAt: number | null; offlineAt: number | null; pvpScore: number | null }
export function guildBaseline(capturedAt: string, daily = 65) {
  const date = new Date(capturedAt);
  if (!Number.isFinite(date.getTime())) return null;
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' }).format(date);
  const elapsed = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday) + 1;
  return daily * elapsed;
}
export function guildTags(members: GameGuildMember[], baseline: number | null) {
  const known = members.filter(m => m.active !== null && m.active !== undefined).sort((a, b) => b.active! - a.active! || (a.joinedAt ?? Infinity) - (b.joinedAt ?? Infinity) || a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
  const leaders = new Set(known.slice(0, Math.ceil(known.length * .1)).map(m => m.id));
  return Object.fromEntries(members.map(m => [m.id, m.active == null || baseline == null ? '未读取' : leaders.has(m.id) ? '顶梁柱' : m.active >= baseline * .8 ? '中坚成员' : m.active >= baseline * .3 ? '随缘玩家' : '摸鱼怪']));
}
export function sortGuildMembers(members: GameGuildMember[], key: keyof GameGuildMember, ascending: boolean) {
  return [...members].sort((a, b) => {
    const left = a[key], right = b[key];
    if (left == null) return right == null ? a.name.localeCompare(b.name, 'zh-CN') : 1;
    if (right == null) return -1;
    const compared = typeof left === 'string' && typeof right === 'string' ? left.localeCompare(right, 'zh-CN') : Number(left) - Number(right);
    return (ascending ? compared : -compared) || a.name.localeCompare(b.name, 'zh-CN');
  });
}
