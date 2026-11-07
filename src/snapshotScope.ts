export interface SnapshotScope { profileId: string; snapshotId: string }
const readable = new Set(['bootstrap','select_profile','get_snapshot','compare_snapshots','export_document','optimize','association_preview','simulate','simulate_batch','exchange_options','simulate_exchange','simulate_virtual','improvements','speed_overview','head_tail','upgrade_potential','hero_panel','character_panels','lineup_library','scroll_state','lookup_shards','template','open_api_status','write_file','write_workbook','write_image_export']);

// The common transport also covers pages which call execute directly.
let scope: SnapshotScope | null = null;
export function setSnapshotScope(value: SnapshotScope | null) { scope = value; }
export function snapshotInput(operation: string, input: unknown): unknown {
  if (['activity_list','activity_put','activity_update'].includes(operation)) return input;
  if (!scope) return input;
  if (!readable.has(operation)) throw new Error('正在只读预览历史版本，请先回到当前档案再修改或读取游戏。');
  return { ...(input as Record<string, unknown>), viewSnapshot: scope };
}
