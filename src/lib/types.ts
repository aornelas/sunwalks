export interface Shot {
  id: string;
  url: string;
  thumbUrl: string;
  takenAt: string;
  place?: string;
}

export interface DayData {
  date: string;
  shots: Shot[];
  dayShotId: string | null;
}

export interface Stats {
  total: number;
  last7: number;
  last30: number;
  avgPerWeek: number;
  currentRun: number;
}

export type ZoomLevel = "week" | "month" | "year";

export interface SyncInfo {
  lastSyncedAt: string | null;
  status: "running" | "ok" | "error" | "never";
  error?: string | null;
}

export interface AlbumInfo {
  id: string;
  title: string;
  photoCount: number;
  coverUrl: string | null;
}

export interface AccountInfo {
  email: string;
  albumId: string | null;
  albumName: string | null;
  autoSync: boolean;
}
