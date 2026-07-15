import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  SCHEDULABLE, getSchedulable, israelClock, readConfig, isDue, isSpecificDateDue,
  monthYearOf, type SchedulableAutomation, type ScheduleClock, type SpecificDateSchedule,
} from '@/lib/automationSchedule'

declare const process: { env: Record<string, string | undefined> }

export const maxDuration = 300 // scheduled automations can take a while

// Guard rows are logged under this automation_id so they don't mix with the
// automations' own logs. One row per (automation, Israel-month) = ran already.
const GUARD_ID = 'cron-guard'

/** Drain a streaming (NDJSON) response, returning the last `complete`/`done` event. */
async function drainStream(res: Response): Promise<Record<string, unknown> | null> {
  if (!res.body) { await res.text().catch(() => {}); return null }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let last: Record<string, unknown> | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const ev = JSON.parse(line) as Record<string, unknown>
        if (ev.type === 'complete' || ev.type === 'done') last = ev
      } catch { /* ignore partial/non-json lines */ }
    }
  }
  return last
}

/** Actually invoke one automation's endpoint with its scheduled payload. */
async function runAutomation(
  base: string, a: SchedulableAutomation, clock: ScheduleClock,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${base}${a.endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(a.payload(clock)),
  })
  if (a.mode === 'stream') {
    const done = await drainStream(res)
    return done ?? { ok: res.ok, status: res.status }
  }
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, ...json }
}

async function alreadyRanThisMonth(automationId: string, monthKey: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('automation_logs')
    .select('id')
    .eq('automation_id', GUARD_ID)
    .filter('details->>automation', 'eq', automationId)
    .filter('details->>month', 'eq', monthKey)
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function writeGuard(automationId: string, monthKey: string, clock: ScheduleClock, result: unknown) {
  try {
    await supabaseAdmin.from('automation_logs').insert({
      id: crypto.randomUUID(),
      automation_id: GUARD_ID,
      run_at: new Date().toISOString(),
      dry_run: false,
      status: 'success',
      summary: `⏰ תזמון: ${automationId} — ${monthKey} (יום ${clock.day} ${String(clock.hour).padStart(2, '0')}:00)`,
      details: { automation: automationId, month: monthKey, scheduled: true, result },
    })
  } catch { /* best-effort */ }
}

// ── GET — the periodic cron tick (Vercel) ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const base = new URL(req.url).origin
  const clock = israelClock()
  const monthKey = monthYearOf(clock)

  const { data: settings } = await supabaseAdmin
    .from('institution_settings')
    .select('*')
    .limit(1)
    .maybeSingle()

  // Fetch all specific-date schedules for today
  const { data: specificDates } = await supabaseAdmin
    .from('automation_specific_dates')
    .select('*')
    .or(`scheduled_date.eq.${clock.year}-${String(clock.month).padStart(2, '0')}-${String(clock.day).padStart(2, '0')}`)

  const results: Record<string, unknown> = {}

  for (const a of SCHEDULABLE) {
    const cfg = readConfig(settings, a)

    // Check recurring schedule first
    let shouldRun = isDue(cfg, clock)
    let runReason = 'recurring'

    // Check specific dates
    if (!shouldRun && specificDates) {
      const specificSchedule = specificDates.find(s => s.automation_id === a.id) as SpecificDateSchedule | undefined
      if (specificSchedule && isSpecificDateDue(specificSchedule, clock)) {
        shouldRun = true
        runReason = 'specific-date'
      }
    }

    if (!shouldRun) {
      results[a.id] = { skipped: true, reason: !cfg.enabled ? 'disabled' : `not due (day ${cfg.day}, today is day ${clock.day})` }
      continue
    }

    // Check guard regardless of reason
    if (await alreadyRanThisMonth(a.id, monthKey)) {
      results[a.id] = { skipped: true, reason: 'already ran this month' }
      continue
    }

    try {
      const result = await runAutomation(base, a, clock)
      await writeGuard(a.id, monthKey, clock, { ...result, reason: runReason })
      results[a.id] = { ran: true, result, reason: runReason }
    } catch (err) {
      results[a.id] = { error: String((err as { message?: string })?.message ?? err) }
    }
  }

  return NextResponse.json({ success: true, clock, monthKey, results })
}

// ── POST — on-demand test run (from the UI "test now" button) ──────────────────
// Body: { force: '<automationId>' } runs that automation immediately via the
// exact scheduled path, ignoring day/hour/enabled and WITHOUT writing the
// monthly guard (so it won't block the real monthly run).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const forceId: string | undefined = body?.force
  if (!forceId) return NextResponse.json({ error: 'missing "force" automation id' }, { status: 400 })

  const a = getSchedulable(forceId)
  if (!a) return NextResponse.json({ error: `unknown automation: ${forceId}` }, { status: 400 })

  const base = new URL(req.url).origin
  const clock = israelClock()
  try {
    const result = await runAutomation(base, a, clock)
    return NextResponse.json({ success: true, forced: forceId, clock, result })
  } catch (err) {
    return NextResponse.json({ error: String((err as { message?: string })?.message ?? err) }, { status: 500 })
  }
}
