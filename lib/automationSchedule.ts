// ── Shared automation scheduling registry & helpers ──────────────────────────
//
// Single source of truth for which automations can be scheduled, how their
// settings keys are named, and what payload each one should be called with on a
// scheduled run. Used by the cron tick (`/api/cron/monthly`) and can be reused
// by the UI for "next run" display.

export type RunMode = 'stream' | 'json'

export interface ScheduleClock {
  year: number
  month: number  // 1-12
  day: number    // 1-31
  hour: number   // 0-23
  minute: number // 0-59
}

export interface SchedulableAutomation {
  id: string
  label: string
  endpoint: string
  mode: RunMode
  /** Default day-of-month when the setting is missing. */
  defaultDay: number
  /** Default hour (Israel local, 0-23) when the setting is missing. */
  defaultHour: number
  /** Build the POST body for a scheduled (real) run at the given Israel clock. */
  payload: (clock: ScheduleClock) => Record<string, unknown>
}

// ── Month helpers (all in Israel local time) ─────────────────────────────────

function pad2(n: number): string { return String(n).padStart(2, '0') }

/** "MM/YYYY" for the given clock's month. */
export function monthYearOf(clock: ScheduleClock): string {
  return `${pad2(clock.month)}/${clock.year}`
}

/** "MM/YYYY" for the month before the given clock's month. */
export function prevMonthYearOf(clock: ScheduleClock): string {
  const m = clock.month === 1 ? 12 : clock.month - 1
  const y = clock.month === 1 ? clock.year - 1 : clock.year
  return `${pad2(m)}/${y}`
}

/** "YYYY-MM-DD" for the first of the clock's month. */
export function firstOfMonthOf(clock: ScheduleClock): string {
  return `${clock.year}-${pad2(clock.month)}-01`
}

/** "YYYY-MM-DD" for the clock's own date. */
export function isoDateOf(clock: ScheduleClock): string {
  return `${clock.year}-${pad2(clock.month)}-${pad2(clock.day)}`
}

/** Days in the given month (handles leap years). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// ── Current Israel wall-clock ────────────────────────────────────────────────

/**
 * Current date/time in Asia/Jerusalem, honoring DST automatically.
 * Vercel runs in UTC, so we must convert explicitly to fire at the hour the
 * user actually picked (which is Israel local time).
 */
export function israelClock(now: Date = new Date()): ScheduleClock {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0')
  // Intl can emit hour "24" at midnight in some runtimes — normalize to 0.
  const hour = get('hour') % 24
  return { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute') }
}

// ── Settings key naming (matches existing flat columns) ──────────────────────

/** e.g. settingsKey('tuition-offset', 'day') → 'tuition_offset_day' */
export function settingsKey(id: string, field: 'day' | 'hour' | 'time' | 'enabled'): string {
  return `${id.replace(/-/g, '_')}_${field}`
}

// ── The registry ─────────────────────────────────────────────────────────────

export const SCHEDULABLE: SchedulableAutomation[] = [
  {
    id: 'tuition-offset', label: 'קיזוז שכ"ל ממשכורת',
    endpoint: '/api/automations/tuition-offset', mode: 'stream',
    defaultDay: 1, defaultHour: 8,
    payload: c => ({ dryRun: false, monthYear: monthYearOf(c) }),
  },
  {
    id: 'credit-offset', label: 'קיזוז זיכויי אשראי',
    endpoint: '/api/automations/credit-offset', mode: 'stream',
    defaultDay: 2, defaultHour: 8,
    payload: c => ({ dryRun: false, monthYear: monthYearOf(c) }),
  },
  {
    id: 'salary-pp', label: 'יצירת תשלום מתוכנן למשכורת',
    endpoint: '/api/automations/salary-pp', mode: 'stream',
    defaultDay: 1, defaultHour: 8,
    // Salary PP is for the previous month.
    payload: c => ({ dryRun: false, monthYear: prevMonthYearOf(c) }),
  },
  {
    id: 'donation-pp', label: 'יצירת PP מגבית',
    endpoint: '/api/automations/donation-pp', mode: 'stream',
    defaultDay: 1, defaultHour: 8,
    payload: c => ({ dryRun: false, monthYear: monthYearOf(c) }),
  },
  {
    id: 'donation-offset', label: 'קיזוז מגבית ממשכורת',
    endpoint: '/api/automations/donation-offset', mode: 'stream',
    defaultDay: 3, defaultHour: 8,
    payload: c => ({ dryRun: false, monthYear: monthYearOf(c) }),
  },
  // Nedarim sync/pull automations and the Airtable transactions pull are
  // intentionally manual-only (run from the UI) — not part of the schedule.
]

export function getSchedulable(id: string): SchedulableAutomation | undefined {
  return SCHEDULABLE.find(a => a.id === id)
}

// ── Match logic ──────────────────────────────────────────────────────────────

export interface ScheduleConfig { day: number; hour: number; enabled: boolean }

/**
 * Decide whether an automation is due at the given Israel clock.
 *
 * Honors both the chosen day AND hour using a "catch-up" comparison: due once
 * the clock has reached the scheduled (day, hour) within the month. With an
 * hourly tick (the GitHub Actions workflow, .github/workflows/hourly-cron.yml)
 * this fires exactly at the chosen hour; if a tick is delayed or missed, the
 * next tick still satisfies the >= condition so the run isn't lost. The caller
 * MUST enforce once-per-month via an idempotency guard (alreadyRanThisMonth),
 * otherwise every later tick that month would re-run it.
 *
 * This also stays safe under Vercel's single daily tick (kept as a backup):
 * a late-hour automation simply catches up on the next day's tick rather than
 * being silently skipped for the whole month.
 */
export function isDue(cfg: ScheduleConfig, clock: ScheduleClock): boolean {
  if (!cfg.enabled) return false
  // Clamp the target day to the month length (e.g. day 31 in a 30-day month).
  const targetDay = Math.min(cfg.day, daysInMonth(clock.year, clock.month))
  if (clock.day < targetDay) return false
  if (clock.day === targetDay && clock.hour < cfg.hour) return false
  return true
}

/** Read a ScheduleConfig from a flat settings object for one automation. */
export function readConfig(
  settings: Record<string, unknown> | null | undefined,
  a: SchedulableAutomation,
): ScheduleConfig {
  const s = settings ?? {}
  const rawDay = s[settingsKey(a.id, 'day')]
  const rawEnabled = s[settingsKey(a.id, 'enabled')]
  // hour: prefer explicit hour; fall back to HH from the "time" field.
  let hour = a.defaultHour
  const rawHour = s[settingsKey(a.id, 'hour')]
  const rawTime = s[settingsKey(a.id, 'time')]
  if (rawHour != null && rawHour !== '') hour = Number(rawHour)
  else if (typeof rawTime === 'string' && /^\d{1,2}:/.test(rawTime)) hour = Number(rawTime.split(':')[0])
  return {
    day: rawDay != null && rawDay !== '' ? Number(rawDay) : a.defaultDay,
    hour,
    enabled: rawEnabled !== false, // missing → enabled
  }
}
