import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { relinkParent } from '@/lib/relink'
import { round2 } from '@/lib/money'

export const maxDuration = 300

/**
 * POST /api/dashboard/attention/fix-positive-returns
 *
 * החזרת הו"ק חייבת להיות שלילית — היא כסף שיצא. החזרה שנרשמה בסכום חיובי
 * נספרת ע"י הריענון כתשלום (סכום חיובי + קטגוריית "בנין לדורות") ולכן מקטינה
 * את החוב במקום להגדיל אותו — טעות בכיוון הנגדי, כלומר כפולה.
 *
 * החשוד: app/api/admin/fix-transaction-signs, שהופך לשלילי רק סוגים שמכילים
 * "הוצאה" — ו-"החזרת הו״ק" אינו כזה, ולכן קיבל את הסכום הגולמי מ-Airtable.
 *
 * body: { dryRun?: boolean } — ברירת מחדל תצוגה מקדימה בלבד.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const dryRun: boolean = body?.dryRun !== false

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, date, notes, parent_ids')
      .eq('type', 'החזרת הו"ק')
      .gt('amount', 0)
    if (error) throw error

    const rows = data ?? []
    const total = round2(rows.reduce((s, t) => s + (Number(t.amount) || 0), 0))
    const parentIds = [...new Set(rows.flatMap(t => (t.parent_ids as string[]) ?? []))]

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        matched: rows.length,
        total,
        parents: parentIds.length,
        sample: rows.slice(0, 20).map(t => ({
          id: t.id as string,
          date: String(t.date ?? ''),
          amount: Number(t.amount) || 0,
          notes: String(t.notes ?? '').slice(0, 60),
        })),
      })
    }

    // הפיכת הסימן. נעשה אחת-אחת ולא בבת אחת: לכל שורה סכום אחר, ואין כאן
    // ערך משותף שאפשר לעדכן בבת אחת.
    let flipped = 0
    for (const t of rows) {
      const neg = -Math.abs(Number(t.amount) || 0)
      const { error: upErr } = await supabaseAdmin
        .from('transactions')
        .update({ amount: neg, planned_payment_id: null })
        .eq('id', t.id as string)
      if (!upErr) flipped++
    }

    // חישוב מחדש להורים שנפגעו — החוב שלהם היה נמוך מהאמת
    let recalculated = 0
    for (const pid of parentIds) {
      try { await relinkParent(pid); recalculated++ } catch { /* ממשיכים לשאר */ }
    }

    return NextResponse.json({ dryRun: false, flipped, total, recalculated })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
