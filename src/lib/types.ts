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

export interface AccountInfo {
  email: string;
  lastPickedAt: string | null;
}

export interface PickerSessionInfo {
  sessionId: string;
  pickerUri: string;
  pollIntervalMs: number;
  timeoutMs: number;
}
