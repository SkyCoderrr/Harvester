import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { ScheduleSpec } from '@shared/types.js';
import { MTEAM_TIMEZONE } from '@shared/constants.js';

/** Current monotonic time in ms (same epoch as Date.now but preferred for diffs). */
export const now = (): number => Date.now();

export const unixSec = (): number => Math.floor(Date.now() / 1000);

/**
 * Parse an M-Team datetime string ("YYYY-MM-DD HH:mm:ss") into unix seconds.
 * M-Team times are in Asia/Taipei (UTC+8); see spike §4.
 */
export function parseMTeamDate(s: string | null | undefined): number | null {
  if (!s) return null;
  const iso = s.replace(' ', 'T');
  try {
    const taipei = fromZonedTime(iso, MTEAM_TIMEZONE);
    return Math.floor(taipei.getTime() / 1000);
  } catch {
    return null;
  }
}

/** Parse "HH:MM" into {hours, minutes}. */
export function parseHHMM(s: string): { h: number; m: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

const DAY_TO_IDX: Record<ScheduleSpec['windows'][number]['days'][number], number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};
const IDX_TO_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * True iff `now_ms` falls inside any of the schedule's windows. Handles midnight wrap
 * (end < start) and `timezone:'system'`.
 */
export function isScheduleActive(schedule: ScheduleSpec, now_ms: number): boolean {
  const tz =
    schedule.timezone === 'system'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : schedule.timezone;
  const zoned = toZonedTime(new Date(now_ms), tz);
  const weekdayIdx = zoned.getDay();
  const today = IDX_TO_DAY[weekdayIdx]!;
  const yesterday = IDX_TO_DAY[(weekdayIdx + 6) % 7]!;
  const hh = zoned.getHours();
  const mm = zoned.getMinutes();
  const cur = hh * 60 + mm;

  for (const w of schedule.windows) {
    const start = parseHHMM(w.start);
    const end = parseHHMM(w.end);
    if (!start || !end) continue;
    const sMin = start.h * 60 + start.m;
    const eMin = end.h * 60 + end.m;
    const days = new Set(w.days);
    if (sMin === eMin) {
      // zero-length window is treated as 24h active on the listed days
      if (days.has(today)) return true;
      continue;
    }
    if (sMin < eMin) {
      // same-day window
      if (days.has(today) && cur >= sMin && cur < eMin) return true;
    } else {
      // wraps midnight
      if (days.has(today) && cur >= sMin) return true;
      if (days.has(yesterday) && cur < eMin) return true;
    }
  }
  return false;
}

/** Returns ms since epoch "N days ago at 00:00 in tz". Helpers for daily rollups. */
export function startOfDayLocal(ts_ms: number, tz: string): number {
  const zoned = toZonedTime(new Date(ts_ms), tz);
  zoned.setHours(0, 0, 0, 0);
  return fromZonedTime(zoned, tz).getTime();
}
