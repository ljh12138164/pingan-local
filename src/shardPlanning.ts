import type { Document, Profile } from './types';

export type Shard = NonNullable<Document['shards']>[number];
export type PlanningShard = Omit<Shard, 'quantity'> & { quantity: number | null };
export interface ShardArchive { profile: Profile; data: Document }

function identity(archive: ShardArchive) {
  const player = (archive.data.extras?.capture as { player?: { server_id?: number; short_id?: number } } | undefined)?.player;
  return player?.server_id && player.short_id ? `game:${player.server_id}:${player.short_id}` : archive.profile.source?.startsWith('game:') ? archive.profile.source : archive.profile.id;
}
export function shardPlan(recipient: ShardArchive, archives: ShardArchive[], id: string, reserve = 0, fallback?: PlanningShard) {
  const target = recipient.data.shards?.find(s => s.id === id) ?? fallback;
  const missing = target?.target == null || target.quantity == null ? null : Math.max(0, target.target - target.quantity);
  const distinct = new Map<string, ShardArchive>();
  for (const archive of archives) {
    const key = identity(archive); if (key === identity(recipient)) continue;
    const previous = distinct.get(key);
    if (!previous || archive.profile.updatedAt > previous.profile.updatedAt) distinct.set(key, archive);
  }
  const donors = [...distinct.values()].map(archive => {
    const item = archive.data.shards?.find(s => s.id === id);
    // Bound fragments and contracts cannot be offered as transferable inventory.
    const available = item?.normal == null ? null : Math.max(0, item.normal - reserve);
    return { ...archive, item, available };
  }).sort((a, b) => (b.available ?? -1) - (a.available ?? -1));
  const total = donors.reduce((sum, donor) => sum + (donor.available ?? 0), 0);
  return { target, missing, donors, total, unknownDonors: donors.filter(d => d.available === null).length, remaining: missing == null ? null : Math.max(0, missing - total) };
}
