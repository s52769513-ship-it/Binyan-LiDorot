import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  SCHEDULABLE, getSchedulable, israelClock, readConfig, isDueFor, periodKeyOf,
  monthYearOf, type SchedulableAutomation, type ScheduleClock,
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

// One guard row per (automation, period). `period` is the month for monthly
// automations and the date for daily ones — same column, different granularity.
async function alreadyRanThisPeriod(automationId: string, periodKey: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('automation_logs')
    .select('id')
    .eq('automation_id', GUARD_ID)
    .filter('details->>automation', 'eq', automationId)
    .filter('details->>month', 'eq', periodKey)
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function writeGuard(automationId: string, periodKey: string, clock: ScheduleClock, result: unknown) {
  try {
    await supabaseAdmin.from('automation_logs').insert({
      id: crypto.randomUUID(),
      automation_id: GUARD_ID,
      run_at: new Date().toISOString(),
      dry_run: false,
      status: 'success',
      summary: `⏰ תזמון: ${automationId} — ${periodKey} (יום ${clock.day} ${String(clock.hour).padStart(2, '0')}:00)`,
      details: { automation: automationId, month: periodKey, scheduled: true, result },
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

  const results: Record<string, unknown> = {}

  for (const a of SCHEDULABLE) {
    const cfg = readConfig(settings, a)
    const periodKey = periodKeyOf(a, clock)
    if (!isDueFor(a, cfg, clock)) {
      results[a.id] = { skipped: true, reason: !cfg.enabled ? 'disabled' : a.cadence === 'daily' ? `not due yet (hour ${cfg.hour}, now ${clock.hour})` : `not due (day ${cfg.day}, today is day ${clock.day})` }
      continue
    }
    if (await alreadyRanThisPeriod(a.id, periodKey)) {
      results[a.id] = { skipped: true, reason: a.cadence === 'daily' ? 'already ran today' : 'already ran this month' }
      continue
    }
    try {
      const result = await runAutomation(base, a, clock)
      await writeGuard(a.id, periodKey, clock, result)
      results[a.id] = { ran: true, result }
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
