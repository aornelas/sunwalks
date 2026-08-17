import type { VerdictWord } from "./verdict";

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

export interface PlanningDay {
  date: string;
  sunrise: string; // ISO instant
  civilTwilightBegin: string;
  goldenHourEnd: string;
  cloudTotal: number;
  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;
  tempAtSunrise: number;
  apparentTemp: number;
  windSpeed: number;
  windDir: number;
  precipProbability: number;
  fogProbability: number;
  ceilingFt: number | null;
  verdict: VerdictWord;
  score: number;
  reason: string;
}

export interface PlanningResponse {
  days: PlanningDay[];
  windowStartMinutes: number;
  windowEndMinutes: number;
  fetchedAt: string | null;
  stale: boolean;
  error?: string;
}
