export interface ScrollPainting { id: string; name: string; issue: number; heroId: number; progress: number | null; score: number | null; personalScore: number | null; finishedAt: number | null; top20: number | null; top100: number | null }
export interface ScrollSnapshot { capturedAt: string | null; loaded: boolean; serverId: number | null; paintings: ScrollPainting[]; error?: string; issue?: number }
export interface ScrollMonitor { id: string; issue: number; paintingId: string; target: number; enabled: boolean; notifiedAt: string | null }
export interface ScrollState { history: ScrollSnapshot[]; monitors: ScrollMonitor[] }
