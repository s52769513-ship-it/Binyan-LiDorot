import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

interface LogEntry {
  id: string
  actor: string
  action: string
  summary: string
  createdAt: string
}

// automation_logs rows written by a batch run (e.g. the monthly cron
// offsetting everyone at once) don't carry parent_id — the per-parent detail
// only lives inside the `details` actions array. Pull out this parent's own
// entry from that array so batch runs still show up on their card.
function extractBatchEntry(
  details: unknown, parentId: string, parentName: string,
): { skipped?: boolean; reason?: string; offset?: number; amount?: number } | null {
  if (!Array.isArray(details)) return null
  const hit = details.find((a: Record<string, unknown>) =>
    (a.parentId && a.parentId === parentId) || (!a.parentId && a.parentName === parentName))
  return (hit as Record<string, unknown>) ?? null
}

const AUTOMATION_LABELS: Record<string, string> = {
  'tuition-offset':   'קיזוז שכ"ל ממשכורת',
  'credit-offset':    'קיזוז זיכויי אשראי',
  'salary-pp':        'יצירת תשלום מתוכנן למשכורת',
  'donation-pp':      'יצירת PP מגבית',
  'donation-offset':  'קיזוז מגבית ממשכורת',
  'nadraim-webhook':  'תשלום נדרים פלוס',
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: parentId } = await params
    const limit = Math.min(500, parseInt(req.nextUrl.searchParams.get('limit') ?? '200'))

    const { data: parentRow } = await supabaseAdmin.from('parents').select('name').eq('id', parentId).maybeSingle()
    const parentName = (parentRow?.name as string) ?? ''

    const [{ data: activityRows }, { data: autoDirect }, { data: autoBatch }] = await Promise.all([
      supabaseAdmin
        .from('activity_log')
        .select('id, actor, action, summary, created_at')
        .eq('parent_id', parentId)
        .order('created_at', { ascending: false })
        .limit(limit),
      // Automations that logged directly against this parent (single-parent runs, webhooks)
      supabaseAdmin
        .from('automation_logs')
        .select('id, automation_id, run_at, summary, dry_run, details')
        .eq('parent_id', parentId)
        .eq('dry_run', false)
        .order('run_at', { ascending: false })
        .limit(limit),
      // Batch/cron runs covering many parents at once — parent_id is null,
      // this parent's own outcome (if any) is inside details[].
      supabaseAdmin
        .from('automation_logs')
        .select('id, automation_id, run_at, dry_run, details')
        .is('parent_id', null)
        .eq('dry_run', false)
        .order('run_at', { ascending: false })
        .limit(200),
    ])

    const entries: LogEntry[] = []

    for (const r of activityRows ?? []) {
      entries.push({
        id:        `a-${r.id}`,
        actor:     String(r.actor ?? 'מערכת'),
        action:    String(r.action ?? 'update'),
        summary:   String(r.summary ?? ''),
        createdAt: String(r.created_at ?? ''),
      })
    }

    for (const r of autoDirect ?? []) {
      entries.push({
        id:        `d-${r.id}`,
        actor:     'מערכת (אוטומציה)',
        action:    'automation',
        summary:   String(r.summary ?? AUTOMATION_LABELS[r.automation_id as string] ?? r.automation_id ?? ''),
        createdAt: String(r.run_at ?? ''),
      })
    }

    for (const r of autoBatch ?? []) {
      const hit = extractBatchEntry(r.details, parentId, parentName)
      if (!hit) continue
      const label = AUTOMATION_LABELS[r.automation_id as string] ?? String(r.automation_id ?? 'אוטומציה')
      const summary = hit.skipped
        ? `${label} — דולג (${hit.reason ?? 'ללא סיבה'})`
        : `${label}${hit.offset ? ` — ₪${hit.offset}` : ''}${hit.amount ? ` — ₪${hit.amount}` : ''}`
      entries.push({
        id:        `b-${r.id}`,
        actor:     'מערכת (אוטומציה)',
        action:    'automation',
        summary,
        createdAt: String(r.run_at ?? ''),
      })
    }

    entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

    return NextResponse.json({ entries: entries.slice(0, limit) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
