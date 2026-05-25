import { NextResponse } from 'next/server'
import { fetchAirtableRecords, TABLES, P, S, T, D, PP } from '@/lib/airtable'
import { supabaseAdmin } from '@/lib/supabase'

async function upsertAndPrune<R extends { id: string; synced_at: string }>(
  table: string,
  records: R[],
  syncedAt: string
): Promise<number> {
  if (records.length > 0) {
    const { error: upsertErr } = await supabaseAdmin
      .from(table)
      .upsert(records, { onConflict: 'id' })
    if (upsertErr) throw new Error(`upsert ${table}: ${upsertErr.message}`)
  }

  // Delete any row not touched in this sync cycle
  const { error: deleteErr } = await supabaseAdmin
    .from(table)
    .delete()
    .neq('synced_at', syncedAt)
  if (deleteErr) throw new Error(`prune ${table}: ${deleteErr.message}`)

  return records.length
}

export async function POST() {
  const syncedAt = new Date().toISOString()

  try {
    // Fetch all tables from Airtable in parallel
    const [rawParents, rawStudents, rawTransactions, rawDebts, rawPlanned] =
      await Promise.all([
        fetchAirtableRecords(TABLES.PARENTS, {
          fields: [
            P.NAME, P.FIRST_NAME, P.LAST_NAME, P.MOTHER_NAME,
            P.FATHER_PHONE, P.MOTHER_PHONE, P.EMAIL,
            P.ADDRESS, P.BUILDING, P.CITY, P.STATUS,
            P.CHILDREN_COUNT, P.TUITION_TOTAL, P.TUITION_BALANCE, P.NOTES,
          ],
        }),

        fetchAirtableRecords(TABLES.STUDENTS, {
          fields: [
            S.NAME, S.GENDER, S.AGE, S.CLASS_NAME_TEXT,
            S.STATUS, S.TRANSPORTATION, S.TRANSPORTATION_COST, S.PARENT,
          ],
        }),

        fetchAirtableRecords(TABLES.TRANSACTIONS, {
          fields: [T.AMOUNT, T.TYPE, T.DATE, T.MONTH_YEAR, T.NOTES, T.PARENT],
        }),

        fetchAirtableRecords(TABLES.DEBTS, {
          fields: [D.AMOUNT, D.PARENT],
        }),

        fetchAirtableRecords(TABLES.PLANNED_PAYMENTS, {
          fields: [PP.NAME, PP.AMOUNT, PP.DATE, PP.MONTH_YEAR, PP.BALANCE, PP.PARENT],
        }),
      ])

    // Transform to Supabase rows
    const parents = rawParents
      .filter(r => r.fields[P.NAME])
      .map(r => ({
        id: r.id,
        name: String(r.fields[P.NAME] || ''),
        first_name: String(r.fields[P.FIRST_NAME] || ''),
        last_name: String(r.fields[P.LAST_NAME] || ''),
        mother_name: String(r.fields[P.MOTHER_NAME] || ''),
        father_phone: String(r.fields[P.FATHER_PHONE] || ''),
        mother_phone: String(r.fields[P.MOTHER_PHONE] || ''),
        email: String(r.fields[P.EMAIL] || ''),
        address: String(r.fields[P.ADDRESS] || ''),
        building: String(r.fields[P.BUILDING] || ''),
        city: String(r.fields[P.CITY] || ''),
        status: (r.fields[P.STATUS] as string[]) || [],
        children_count: Number(r.fields[P.CHILDREN_COUNT]) || 0,
        tuition_total: Number(r.fields[P.TUITION_TOTAL]) || 0,
        tuition_balance: Number(r.fields[P.TUITION_BALANCE]) || 0,
        notes: String(r.fields[P.NOTES] || ''),
        synced_at: syncedAt,
      }))

    const students = rawStudents.map(r => ({
      id: r.id,
      parent_ids: (r.fields[S.PARENT] as string[]) || [],
      name: String(r.fields[S.NAME] || ''),
      gender: String(r.fields[S.GENDER] || ''),
      age: String(r.fields[S.AGE] || ''),
      class_name: String(r.fields[S.CLASS_NAME_TEXT] || ''),
      status: String(r.fields[S.STATUS] || ''),
      transportation: (r.fields[S.TRANSPORTATION] as string[]) || [],
      transportation_cost: Number(r.fields[S.TRANSPORTATION_COST]) || 0,
      synced_at: syncedAt,
    }))

    const transactions = rawTransactions.map(r => ({
      id: r.id,
      parent_ids: (r.fields[T.PARENT] as string[]) || [],
      amount: Number(r.fields[T.AMOUNT]) || 0,
      type: String(r.fields[T.TYPE] || ''),
      date: (r.fields[T.DATE] as string) || null,
      month_year: String(r.fields[T.MONTH_YEAR] || ''),
      notes: String(r.fields[T.NOTES] || ''),
      synced_at: syncedAt,
    }))

    const debts = rawDebts.map(r => ({
      id: r.id,
      parent_ids: (r.fields[D.PARENT] as string[]) || [],
      amount: Number(r.fields[D.AMOUNT]) || 0,
      created_time: r.createdTime,
      synced_at: syncedAt,
    }))

    const plannedPayments = rawPlanned.map(r => ({
      id: r.id,
      parent_ids: (r.fields[PP.PARENT] as string[]) || [],
      name: String(r.fields[PP.NAME] || ''),
      amount: Number(r.fields[PP.AMOUNT]) || 0,
      date: (r.fields[PP.DATE] as string) || null,
      month_year: String(r.fields[PP.MONTH_YEAR] || ''),
      balance: Number(r.fields[PP.BALANCE]) || 0,
      synced_at: syncedAt,
    }))

    // Upsert all tables (sequentially – parents first because others may reference them)
    const parentsCount       = await upsertAndPrune('parents', parents, syncedAt)
    const studentsCount      = await upsertAndPrune('students', students, syncedAt)
    const transactionsCount  = await upsertAndPrune('transactions', transactions, syncedAt)
    const debtsCount         = await upsertAndPrune('debts', debts, syncedAt)
    const plannedCount       = await upsertAndPrune('planned_payments', plannedPayments, syncedAt)

    // Record sync log
    await supabaseAdmin.from('sync_log').insert({
      parents_count: parentsCount,
      students_count: studentsCount,
      transactions_count: transactionsCount,
      debts_count: debtsCount,
      planned_payments_count: plannedCount,
      status: 'success',
    })

    return NextResponse.json({
      success: true,
      syncedAt,
      counts: {
        parents: parentsCount,
        students: studentsCount,
        transactions: transactionsCount,
        debts: debtsCount,
        plannedPayments: plannedCount,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Sync error:', message)

    await supabaseAdmin.from('sync_log').insert({ status: 'error', error: message })

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET returns last sync info
export async function GET() {
  const { data } = await supabaseAdmin
    .from('sync_log')
    .select('synced_at, status, parents_count, students_count, transactions_count, debts_count, planned_payments_count, error')
    .order('synced_at', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json(data || null)
}
