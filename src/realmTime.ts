export interface RealmReward { name: string; amount: number }
export interface RealmStatusData {
  capturedAt?: string;
  cards: { id: string; name: string | null; startedAt: number | null; endsAt: number | null; hours: number | null; rewards?: { name: string; perHour: number | null; total: number | null }[] }[] | null;
  fosterLoaded: boolean;
  foster: { heroId: string; heroName: string | null; friendId: string; friendName: string | null; cardName: string | null; startedAt: number | null; endsAt: number | null; rewards: RealmReward[] } | null;
  accruedRewards: RealmReward[];
}
export function realmCountdown(end: number | null, now: number) {
  if (end === null || !Number.isFinite(end)) return '结束时间未读取';
  const seconds = Math.max(0, Math.ceil(end - now));
  if (!seconds) return '已到期，待游戏确认';
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function realmDueEvents(status: RealmStatusData | undefined, armedAt: number, now: number) {
  const events = (status?.cards ?? []).map(card => ({ key: `card:${card.id}:${card.endsAt}`, end: card.endsAt, text: `${card.name ?? '结界卡'}已到期，请在游戏中确认` }));
  if (status?.foster) events.push({ key: `foster:${status.foster.heroId}:${status.foster.endsAt}`, end: status.foster.endsAt, text: `${status.foster.heroName ?? '式神'}寄养已到期，请在游戏中确认` });
  return events.filter(event => event.end !== null && Number.isFinite(event.end) && event.end > armedAt && event.end <= now);
}
