import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/admin/recalculate-allocations
 *
 * Recalculates payment_allocations from existing Supabase data:
 * - Takes all income transactions linked to "בנין לדורות" project
 * - For each transaction, splits amount equally among the parent's active students
 * - Deletes all existing allocations and inserts fresh ones
 *
 * Safe to run multiple times — fully idempotent.
 */
export async function POST() {
  try {
    const syncedAt = new Date().toISOString()

    // Fetch all relevant data from Supabase in parallel
    const [{ data: txData, error: txErr }, { data: stuData, error: stuErr }] = await Promise.all([
      supabaseAdmin
        .from('transactions')
        .select('id, amount, parent_ids, project_names, month_year')
        .gt('amount', 0),   // income only
      supabaseAdmin
        .from('students')
        .select('id, parent_ids, status'),
    ])

    if (txErr) throw new Error(`fetch transactions: ${txErr.message}`)
    if (stuErr) throw new Error(`fetch students: ${stuErr.message}`)

    // Filter to בנין לדורות income transactions
    const binyanTxs = (txData ?? []).filter(tx =>
      Array.isArray(tx.project_names) && tx.project_names.includes('בנין לדורות')
    )

    // Build parent → active students map
    const studentsByParent: Record<string, Array<{ id: string }>> = {}
    for (const s of stuData ?? []) {
      if (s.status !== 'פעיל') continue
      for (const pid of (s.parent_ids as string[]) ?? []) {
        if (!studentsByParent[pid]) studentsByParent[pid] = []
        studentsByParent[pid].push({ id: s.id })
      }
    }

    // Build allocations
    const allocations: Array<{
      transaction_id: string
      student_id: string
      parent_id: string
      amount: number
      month_year: string
      synced_at: string
    }> = []

    for (const tx of binyanTxs) {
      const parentIds = (tx.parent_ids as string[]) ?? []
      for (const parentId of parentIds) {
        const active = studentsByParent[parentId] ?? []
        if (active.length === 0) continue

        const txAmount = Number(tx.amount)
        const perStudent = Math.floor((txAmount / active.length) * 100) / 100
        const remainder  = Math.round((txAmount - perStudent * active.length) * 100) / 100

        active.forEach((s, i) => {
          allocations.push({
            transaction_id: tx.id as string,
            student_id:     s.id,
            parent_id:      parentId,
            amount:         i === active.length - 1 ? perStudent + remainder : perStudent,
            month_year:     String(tx.month_year || ''),
            synced_at:      syncedAt,
          })
        })
      }
    }

    // Delete all existing allocations and re-insert
    const { error: delErr } = await supabaseAdmin
      .from('payment_allocations')
      .delete()
      .not('id', 'is', null)
    if (delErr) throw new Error(`delete allocations: ${delErr.message}`)

    if (allocations.length > 0) {
      // Insert in batches of 500
      const BATCH = 500
      for (let i = 0; i < allocations.length; i += BATCH) {
        const { error: insErr } = await supabaseAdmin
          .from('payment_allocations')
          .insert(allocations.slice(i, i + BATCH))
        if (insErr) throw new Error(`insert allocations batch ${i}: ${insErr.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      binyanTransactions: binyanTxs.length,
      allocations: allocations.length,
      parentsWithActiveKids: Object.keys(studentsByParent).length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('recalculate-allocations error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
