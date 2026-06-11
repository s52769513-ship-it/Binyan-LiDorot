import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

declare const process: { env: Record<string, string | undefined> }

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: s } = await supabaseAdmin
    .from('institution_settings')
    .select('tuition_offset_day, tuition_offset_hour, tuition_offset_time, tuition_offset_enabled, salary_pp_day, salary_pp_hour, salary_pp_time, salary_pp_enabled, credit_offset_day, credit_offset_hour, credit_offset_time, credit_offset_enabled')
    .limit(1)
    .single()

  const today     = new Date()
  const todayDate = today.getDate()
  const todayHour = today.getUTCHours()
  const todayMin  = today.getUTCMinutes()
  const base      = new URL(req.url).origin
  const results: Record<string, unknown> = {}

  const currentMY = `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  const prev      = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const prevMY    = `${String(prev.getMonth() + 1).padStart(2, '0')}/${prev.getFullYear()}`

  const matchTime = (timeStr: string | null | undefined, fallbackHour: number) => {
    if (timeStr) {
      const [h, m] = timeStr.split(':').map(Number)
      return todayHour === h && todayMin >= m && todayMin < m + 5
    }
    return todayHour === fallbackHour
  }

  // קיזוז שכ"ל — רץ לפי ההגדרות של האוטומציה הזו
  const toDay  = Number(s?.tuition_offset_day  ?? 1)
  const toOn   = s?.tuition_offset_enabled !== false

  if (toOn && todayDate === toDay && matchTime(s?.tuition_offset_time, Number(s?.tuition_offset_hour ?? 8))) {
    try {
      const r    = await fetch(`${base}/api/automations/tuition-offset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, monthYear: currentMY }),
      })
      const text = await r.text()
      const done = text.trim().split('\n')
        .map(l => { try { return JSON.parse(l) } catch { return null } })
        .find((l: { type?: string } | null) => l?.type === 'complete')
      results.tuitionOffset = done ?? { raw: text.slice(0, 200) }
    } catch (err) { results.tuitionOffset = { error: String(err) } }
  } else {
    results.tuitionOffset = { skipped: true, reason: !toOn ? 'disabled' : `day ${toDay} ≠ ${todayDate}` }
  }

  // PP משכורת — רץ לפי ההגדרות של האוטומציה הזו
  const spDay = Number(s?.salary_pp_day ?? 1)
  const spOn  = s?.salary_pp_enabled !== false

  if (spOn && todayDate === spDay && matchTime(s?.salary_pp_time, Number(s?.salary_pp_hour ?? 8))) {
    try {
      const r    = await fetch(`${base}/api/automations/salary-pp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, monthYear: prevMY }),
      })
      const text = await r.text()
      const done = text.trim().split('\n')
        .map(l => { try { return JSON.parse(l) } catch { return null } })
        .find((l: { type?: string } | null) => l?.type === 'complete')
      results.salaryPP = done ?? { raw: text.slice(0, 200) }
    } catch (err) { results.salaryPP = { error: String(err) } }
  } else {
    results.salaryPP = { skipped: true, reason: !spOn ? 'disabled' : `day ${spDay} ≠ ${todayDate}` }
  }

  // קיזוז זיכויי אשראי
  const coDay = Number(s?.credit_offset_day ?? 2)
  const coOn  = s?.credit_offset_enabled !== false

  if (coOn && todayDate === coDay && matchTime(s?.credit_offset_time, Number(s?.credit_offset_hour ?? 8))) {
    try {
      const r    = await fetch(`${base}/api/automations/credit-offset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, monthYear: currentMY }),
      })
      const text = await r.text()
      const done = text.trim().split('\n')
        .map(l => { try { return JSON.parse(l) } catch { return null } })
        .find((l: { type?: string } | null) => l?.type === 'complete')
      results.creditOffset = done ?? { raw: text.slice(0, 200) }
    } catch (err) { results.creditOffset = { error: String(err) } }
  } else {
    results.creditOffset = { skipped: true, reason: !coOn ? 'disabled' : `day ${coDay} ≠ ${todayDate}` }
  }

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
      summary:       `Cron יומי — קיזוז ${currentMY} (יום ${toDay}) · משכורת ${prevMY} (יום ${spDay}) · אשראי (יום ${coDay})`,
      details:       { todayDate, todayHour, todayMin, ...results },
    })
  } catch { /* best effort */ }

  return NextResponse.json({ success: true, todayDate, todayHour, todayMin, currentMY, prevMY, ...results })
}
