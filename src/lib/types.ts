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
  thisWeek: number;
  bestWeek: number;
  thisMonth: number;
  bestMonth: number;
  thisYear: number;
  bestYear: number;
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
