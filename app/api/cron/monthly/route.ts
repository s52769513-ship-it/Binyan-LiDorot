import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

declare const process: { env: Record<string, string | undefined> }

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: settings } = await supabaseAdmin
    .from('institution_settings')
    .select('automation_day, automation_hour, automation_enabled')
    .limit(1)
    .single()

  if (!settings?.automation_enabled) {
    return NextResponse.json({ skipped: true, reason: 'automations disabled' })
  }

  const today     = new Date()
  const configDay = Number(settings?.automation_day ?? 1)
  if (today.getDate() !== configDay) {
    return NextResponse.json({ skipped: true, reason: `not day ${configDay}`, today: today.getDate() })
  }

  // Use request origin — works without any env var
  const base    = new URL(req.url).origin
  const results: Record<string, unknown> = {}

  const currentMY = `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  const prev      = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const prevMY    = `${String(prev.getMonth() + 1).padStart(2, '0')}/${prev.getFullYear()}`

  // 1. קיזוז שכ"ל — חודש נוכחי
  try {
    const r1   = await fetch(`${base}/api/automations/tuition-offset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: false, monthYear: currentMY }),
    })
    const text = await r1.text()
    const done = text.trim().split('\n').map(l => { try { return JSON.parse(l) } catch { return null } })
      .find((l: { type?: string } | null) => l?.type === 'complete')
    results.tuitionOffset = done ?? { raw: text.slice(0, 200) }
  } catch (err) { results.tuitionOffset = { error: String(err) } }

  // 2. PP משכורת — חודש קודם
  try {
    const r2   = await fetch(`${base}/api/automations/salary-pp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: false, monthYear: prevMY }),
    })
    const text = await r2.text()
    const done = text.trim().split('\n').map(l => { try { return JSON.parse(l) } catch { return null } })
      .find((l: { type?: string } | null) => l?.type === 'complete')
    results.salaryPP = done ?? { raw: text.slice(0, 200) }
  } catch (err) { results.salaryPP = { error: String(err) } }

  try {
    await supabaseAdmin.from('automation_logs').insert({
      id:            crypto.randomUUID(),
      automation_id: 'cron-monthly',
      run_at:        new Date().toISOString(),
      dry_run:       false,
      parent_id:     null,
      parent_name:   null,
      actions_count: 0,
      status:        'success',
      summary:       `ריצה אוטומטית — קיזוז ${currentMY} · משכורת ${prevMY}`,
      details:       results,
    })
  } catch { /* best effort */ }

  return NextResponse.json({ success: true, currentMY, prevMY, ...results })
}
