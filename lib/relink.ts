import { supabaseAdmin } from '@/lib/supabase'
import { sortByMonth } from '@/lib/months'
import {
  insertSpilloverRows,
  recalcParentTuitionBalance,
  SPILLOVER_NOTES_PREFIX,
  type SpilloverRowInput,
} from '@/lib/ppPayments'

const UNDEFINED_COLUMN = '42703'
const round2 = (n: number) => Math.round(n * 100) / 100

export interface RelinkStats {
  ppsReset: number
  txsProcessed: number
  spilloverCreated: number
  spilloverTotal: number
  credit: number
}

/**
 * ריענון הורה — הרצה מחדש של כל התנועות המקושרות:
 * 1. מוחק שורות "זיכוי מעודף תשלום" שנוצרו בעבר (משוחזרות מחדש בהרצה)
 * 2. מאפס יתרות של כל ה-PP שאינם משכורת ואת יתרת הזכות
 * 3. מריץ כל תנועה מקושרת בסדר כרונולוגי: ה-PP המקושר קודם, גלישה
 *    לוותיקים באותו סוג חוב (שכ"ל↔שכ"ל, מגבית↔מגבית — לא מערבבים),
 *    וכל גלישה נרשמת כשורת "זיכוי מעודף תשלום" גלויה על ה-PP שקיבל אותה
 * 4. עודף סופי → יתרת זכות של ההורה; עדכון tuition_balance
 */
export async function relinkParent(parentId: string): Promise<RelinkStats> {
  // 1. Delete previously generated spillover rows — the replay recreates them.
  //    Match both the source_transaction_id marker (new rows) and the notes
  //    prefix (legacy rows created before the column existed).
  const delBySource = await supabaseAdmin
    .from('transactions')
    .delete()
    .contains('parent_ids', [parentId])
    .not('source_transaction_id', 'is', null)
  if (delBySource.error && delBySource.error.code !== UNDEFINED_COLUMN) throw delBySource.error
  const delByNotes = await supabaseAdmin
    .from('transactions')
    .delete()
    .contains('parent_ids', [parentId])
    .like('notes', `${SPILLOVER_NOTES_PREFIX}%`)
  if (delByNotes.error) throw delByNotes.error

  // 2. Non-salary PPs, reset in memory to the full amount
  const { data: ppsRaw, error: ppErr } = await supabaseAdmin
    .from('planned_payments')
    .select('id, amount, month_year, pp_type')
    .contains('parent_ids', [parentId])
    .neq('pp_type', 'salary')
  if (ppErr) throw ppErr
  const pps = sortByMonth(ppsRaw ?? [], true).map(p => ({
    id: p.id as string,
    amount: Number(p.amount) || 0,
    balance: Number(p.amount) || 0,
    month_year: (p.month_year as string) ?? '',
    pp_type: (p.pp_type as string) ?? null,
  }))

  // 3. Linked positive transactions, oldest first (spillover rows are gone)
  const { data: txs, error: txErr } = await supabaseAdmin
    .from('transactions')
    .select('id, amount, date, month_year, planned_payment_id')
    .contains('parent_ids', [parentId])
    .not('planned_payment_id', 'is', null)
    .gt('amount', 0)
    .order('date', { ascending: true })
  if (txErr) throw txErr

  const spillovers: SpilloverRowInput[] = []
  let credit = 0

  for (const tx of txs ?? []) {
    const linked = pps.find(p => p.id === tx.planned_payment_id)
    // הגלישה נשארת בתוך אותו סוג חוב; תנועה שה-PP שלה לא בבריכה (נמחק) — שכ"ל
    const poolType = linked?.pp_type ?? 'tuition'
    const open = pps.filter(p => p.balance > 0 && p.pp_type === poolType)
    const cascade = linked && linked.balance > 0
      ? [linked, ...open.filter(p => p.id !== linked.id)]
      : open

    let remaining = Math.abs(Number(tx.amount))
    for (const pp of cascade) {
      if (remaining <= 0) break
      const apply = Math.min(remaining, pp.balance)
      pp.balance = round2(pp.balance - apply)
      remaining = round2(remaining - apply)
      if (apply > 0 && pp.id !== tx.planned_payment_id) {
        spillovers.push({
          parentId,
          ppId: pp.id,
          ppMonthYear: pp.month_year,
          ppType: pp.pp_type,
          amount: apply,
          sourceTxId: tx.id as string,
          sourceLabel: (tx.month_year as string) || (tx.date as string) || null,
          date: (tx.date as string) || null,
        })
      }
    }
    credit = round2(credit + remaining)
  }

  // 4. Persist: PP balances (batched), spillover rows, credit, tuition balance
  for (let i = 0; i < pps.length; i += 50) {
    await Promise.all(pps.slice(i, i + 50).map(pp =>
      supabaseAdmin.from('planned_payments').update({ balance: pp.balance }).eq('id', pp.id)
    ))
  }
  await insertSpilloverRows(spillovers)
  await supabaseAdmin.from('parents').update({ credit_balance: credit }).eq('id', parentId)
  await recalcParentTuitionBalance(parentId)

  return {
    ppsReset: pps.length,
    txsProcessed: (txs ?? []).length,
    spilloverCreated: spillovers.length,
    spilloverTotal: round2(spillovers.reduce((s, r) => s + r.amount, 0)),
    credit,
  }
}
