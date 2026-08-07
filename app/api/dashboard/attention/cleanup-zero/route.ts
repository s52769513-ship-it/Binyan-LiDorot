import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { softDeleteMany } from '@/lib/trash'
import { deriveTxSource } from '@/lib/txSource'

export const maxDuration = 120

/**
 * POST /api/dashboard/attention/cleanup-zero
 *
 * מוחק תנועות בסכום 0 שמקורן בסנכרון Airtable — שאריות ייבוא שאינן כסף
 * ורק מרעישות. body: { dryRun?: boolean }, ברירת מחדל תצוגה מקדימה בלבד.
 *
 * המחיקה היא לאשפה (softDeleteMany) ולא מחיקה קשה — הכל ניתן לשחזור מ-🗑 אשפה
 * במשך 30 יום. חשוב במיוחד כאן: זו פעולה קבוצתית על נתוני כסף בייצור.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const dryRun: boolean = body?.dryRun !== false
    const deletedBy = req.headers.get('x-auth-email') || 'attention-cleanup'

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('amount', 0)
    if (error) throw error

    // מקור Airtable: או שנשמר במפורש, או שנגזר מ-synced_at אמיתי (הסנטינל
    // 2099 מסמן "לא לסנכרן בחזרה" ומשמש ייבוא/אוטומציות — לא Airtable).
    const targets = (data ?? []).filter(t => {
      const info = deriveTxSource({
        source:          (t as { source?: string | null }).source ?? null,
        notes:           t.notes as string | null,
        standingOrderId: (t.standing_order_id as string | null) ?? null,
        syncedAt:        (t.synced_at as string | null) ?? null,
      })
      return info.source === 'airtable'
    })

    const sample = targets.slice(0, 20).map(t => ({
      id: t.id as string,
      date: String(t.date ?? ''),
      type: String(t.type ?? ''),
      notes: String(t.notes ?? '').slice(0, 60),
      projectNames: (t.project_names as string[]) ?? [],
    }))

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        zeroTotal: (data ?? []).length,
        matched: targets.length,
        sample,
      })
    }

    if (targets.length > 0) {
      const CH = 200
      for (let i = 0; i < targets.length; i += CH) {
        const chunk = targets.slice(i, i + CH)
        await softDeleteMany(
          supabaseAdmin,
          'transaction',
          chunk.map(t => ({ id: t.id as string, data: t })),
          deletedBy,
        )
        const { error: delErr } = await supabaseAdmin
          .from('transactions').delete().in('id', chunk.map(t => t.id as string))
        if (delErr) throw delErr
      }
    }

    return NextResponse.json({
      dryRun: false,
      zeroTotal: (data ?? []).length,
      deleted: targets.length,
      sample,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
