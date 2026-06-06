/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

declare const process: { env: Record<string, string | undefined> }

// Called by Vercel Cron — secured via CRON_SECRET env var
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Load settings to check if automations are enabled and what day/hour is configured
  const { data: settings } = await supabaseAdmin
    .from('institution_settings')
    .select('automation_day, automation_hour, automation_enabled')
    .limit(1)
    .single()

  if (!settings?.automation_enabled) {
    return NextResponse.json({ skipped: true, reason: 'automations disabled' })
  }

  const today = new Date()
  const configDay  = Number(settings?.automation_day  ?? 1)
  const configHour = Number(settings?.automation_hour ?? 8)

  // Only run on the configured day of month (Vercel Cron runs daily at midnight, we check day here)
  if (today.getDate() !== configDay) {
    return NextResponse.json({ skipped: true, reason: `not the configured day (${configDay})`, today: today.getDate() })
  }

  const currentMY = `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const prevMY = `${String(prev.getMonth() + 1).padStart(2, '0')}/${prev.getFullYear()}`

  const results: Record<string, unknown> = { configDay, configHour, currentMY, prevMY }

  // 1. Run tuition-offset for current month
  try {
    const r1 = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/automations/tuition-offset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: false, monthYear: currentMY }),
    })
    const text1 = await r1.text()
    const lines1 = text1.trim().split('\n').map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const complete1 = lines1.find((l: { type?: string }) => l?.type === 'complete')
    results.tuitionOffset = complete1 ?? { error: 'no complete event' }
  } catch (err) {
    results.tuitionOffset = { error: String(err) }
  }

  // 2. Run salary-pp for previous month
  try {
    const r2 = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/automations/salary-pp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: false, monthYear: prevMY }),
    })
    const text2 = await r2.text()
    const lines2 = text2.trim().split('\n').map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const complete2 = lines2.find((l: { type?: string }) => l?.type === 'complete')
    results.salaryPP = complete2 ?? { error: 'no complete event' }
  } catch (err) {
    results.salaryPP = { error: String(err) }
  }

  // Log this cron run
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
      summary:       `ריצה אוטומטית חודשית — קיזוז ${currentMY}, משכורת ${prevMY}`,
      details:       results,
    })
  } catch { /* best effort */ }

  return NextResponse.json({ success: true, ...results })
}
