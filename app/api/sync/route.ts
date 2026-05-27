import { NextResponse } from 'next/server'
import { fetchAirtableRecords, TABLES, P, S, T, D, PP, PROJ, PS, W } from '@/lib/airtable'
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

  // Call a SQL function to delete stale rows — bypasses PostgREST URL filtering
  const { error: pruneErr } = await supabaseAdmin.rpc('prune_stale_rows', {
    p_table: table,
    p_synced_at: syncedAt,
  })
  if (pruneErr) {
    const detail = `${pruneErr.message} | code:${pruneErr.code} | hint:${pruneErr.hint}`
    throw new Error(`prune ${table}: ${detail}`)
  }

  return records.length
}

export async function POST() {
  const syncedAt = new Date().toISOString()

  try {
    // Fetch all tables from Airtable in parallel
    const [rawParents, rawStudents, rawTransactions, rawDebts, rawPlanned, rawProjects, rawWomen] =
      await Promise.all([
        fetchAirtableRecords(TABLES.PARENTS, {
          fields: [
            P.NAME, P.FIRST_NAME, P.LAST_NAME, P.MOTHER_NAME,
            P.FATHER_PHONE, P.MOTHER_PHONE, P.EMAIL,
            P.ADDRESS, P.BUILDING, P.CITY, P.STATUS,
            P.CHILDREN_COUNT, P.TUITION_TOTAL, P.TUITION_BALANCE, P.NOTES,
            PS.BASE_HOURLY, PS.SENIORITY_HOURLY, PS.FIXED_BONUS,
            PS.EXCEPTIONAL_EXPENSES, PS.DEDUCT_TUITION, PS.SHOW_SPOUSE_SALARY,
            PS.CALC_WIFE_TUITION, PS.MONTHLY_HOURS_DECIMAL, PS.TRANSPORT_REIMBURSEMENT,
            PS.SALARY_GROSS, PS.SALARY_NET, PS.WOMAN_LINKS,
          ],
        }),

        fetchAirtableRecords(TABLES.STUDENTS, {
          fields: [
            S.NAME, S.GENDER, S.AGE, S.CLASS_NAME_TEXT,
            S.STATUS, S.TRANSPORTATION, S.TRANSPORTATION_COST, S.PARENT,
            S.DEPARTMENT_LINKS, S.CLASS_DEPARTMENT,
          ],
        }),

        fetchAirtableRecords(TABLES.TRANSACTIONS, {
          fields: [T.AMOUNT, T.TYPE, T.DATE, T.MONTH_YEAR, T.NOTES, T.PARENT, T.PROJECT],
        }),

        fetchAirtableRecords(TABLES.DEBTS, {
          fields: [D.AMOUNT, D.PARENT],
        }),

        fetchAirtableRecords(TABLES.PLANNED_PAYMENTS, {
          fields: [PP.NAME, PP.AMOUNT, PP.DATE, PP.MONTH_YEAR, PP.BALANCE, PP.PARENT],
        }),

        fetchAirtableRecords(TABLES.PROJECTS, { fields: [PROJ.NAME] }),

        fetchAirtableRecords(TABLES.WOMEN, {
          fields: [
            W.NAME, W.HUSBAND_LINKS, W.BASE_HOURLY, W.FIXED_BONUS,
            W.MONTHLY_HOURS_DECIMAL, W.SALARY_FIXED_TOTAL, W.SALARY_GROSS,
            W.STATUS, W.EXCEPTIONAL_EXPENSES, W.IS_FIXED_SALARY, W.ROLE, W.NOTES,
          ],
        }),
      ])

    // Map project record IDs → project names
    const projectNameMap: Record<string, string> = {}
    for (const r of rawProjects) {
      projectNameMap[r.id] = String(r.fields[PROJ.NAME] || '')
    }

    // Helper: extract string from Airtable single-select (may come as {id,name,color} object)
    const selectName = (v: unknown): string => {
      const raw = v && typeof v === 'object' && 'name' in (v as object)
        ? String((v as { name: string }).name)
        : String(v || '')
      // Normalise legacy values from this Airtable base
      if (raw === 'V') return 'פעיל'
      return raw
    }

    // Helper: extract array of strings from Airtable multi-select (may come as [{id,name,color}])
    const selectNames = (v: unknown): string[] => {
      if (!Array.isArray(v)) return []
      return v.map(item =>
        item && typeof item === 'object' && 'name' in item
          ? String((item as { name: string }).name)
          : String(item)
      ).filter(Boolean)
    }

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
        status: selectNames(r.fields[P.STATUS]),
        children_count: Number(r.fields[P.CHILDREN_COUNT]) || 0,
        tuition_total: Number(r.fields[P.TUITION_TOTAL]) || 0,
        tuition_balance: Number(r.fields[P.TUITION_BALANCE]) || 0,
        notes: String(r.fields[P.NOTES] || ''),
        // Salary fields
        base_hourly_rate:        Number(r.fields[PS.BASE_HOURLY]) || 0,
        seniority_bonus_hourly:  Number(r.fields[PS.SENIORITY_HOURLY]) || 0,
        fixed_bonus:             Number(r.fields[PS.FIXED_BONUS]) || 0,
        exceptional_expenses:    Number(r.fields[PS.EXCEPTIONAL_EXPENSES]) || 0,
        transport_reimbursement: Number(r.fields[PS.TRANSPORT_REIMBURSEMENT]) || 0,
        deduct_tuition:          Boolean(r.fields[PS.DEDUCT_TUITION]) || false,
        show_spouse_salary:      Boolean(r.fields[PS.SHOW_SPOUSE_SALARY]) || false,
        calculate_wife_tuition:  Boolean(r.fields[PS.CALC_WIFE_TUITION]) || false,
        monthly_hours_decimal:   Number(r.fields[PS.MONTHLY_HOURS_DECIMAL]) || 0,
        salary_gross:            Number(r.fields[PS.SALARY_GROSS]) || 0,
        salary_after_tuition:    Number(r.fields[PS.SALARY_NET]) || 0,
        woman_ids:               (r.fields[PS.WOMAN_LINKS] as string[]) || [],
        synced_at: syncedAt,
      }))

    const students = rawStudents.map(r => ({
      id: r.id,
      parent_ids: (r.fields[S.PARENT] as string[]) || [],
      name: String(r.fields[S.NAME] || ''),
      gender: selectName(r.fields[S.GENDER]),
      age: String(r.fields[S.AGE] || ''),
      class_name: String(r.fields[S.CLASS_NAME_TEXT] || ''),
      // formula field returns the combined "כיתה X – אגף Y" display string
      class_department: String(r.fields[S.CLASS_DEPARTMENT] || ''),
      department_ids: (r.fields[S.DEPARTMENT_LINKS] as string[]) || [],
      status: selectName(r.fields[S.STATUS]),
      transportation: selectNames(r.fields[S.TRANSPORTATION]),
      transportation_cost: Number(r.fields[S.TRANSPORTATION_COST]) || 0,
      synced_at: syncedAt,
    }))

    const transactions = rawTransactions.map(r => {
      const projectIds = (r.fields[T.PROJECT] as string[]) || []
      // Airtable single-select comes as {id, name, color} — extract the name
      const typeField = r.fields[T.TYPE]
      const typeName = typeField && typeof typeField === 'object' && 'name' in (typeField as object)
        ? String((typeField as { name: string }).name)
        : String(typeField || '')
      const rawAmount = Number(r.fields[T.AMOUNT]) || 0
      // הוצאה = expense → store as negative
      const amount = typeName.includes('הוצאה') ? -Math.abs(rawAmount) : rawAmount
      return {
        id: r.id,
        parent_ids: (r.fields[T.PARENT] as string[]) || [],
        amount,
        type: typeName,
        date: (r.fields[T.DATE] as string) || null,
        month_year: String(r.fields[T.MONTH_YEAR] || ''),
        notes: String(r.fields[T.NOTES] || ''),
        project_ids: projectIds,
        project_names: projectIds.map(pid => projectNameMap[pid]).filter(Boolean),
        synced_at: syncedAt,
      }
    })

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

    const women = rawWomen.map(r => ({
      id: r.id,
      parent_ids: (r.fields[W.HUSBAND_LINKS] as string[]) || [],
      name: String(r.fields[W.NAME] || ''),
      base_hourly_rate:      Number(r.fields[W.BASE_HOURLY]) || 0,
      fixed_bonus:           Number(r.fields[W.FIXED_BONUS]) || 0,
      monthly_hours_decimal: Number(r.fields[W.MONTHLY_HOURS_DECIMAL]) || 0,
      exceptional_expenses:  Number(r.fields[W.EXCEPTIONAL_EXPENSES]) || 0,
      salary_total:          Number(r.fields[W.SALARY_FIXED_TOTAL]) || 0,
      salary_gross:          Number(r.fields[W.SALARY_GROSS]) || 0,
      status:                selectName(r.fields[W.STATUS]),
      is_fixed_salary:       Boolean(r.fields[W.IS_FIXED_SALARY]) || false,
      role:                  selectNames(r.fields[W.ROLE]),
      notes:                 String(r.fields[W.NOTES] || ''),
      synced_at: syncedAt,
    }))

    // Upsert all tables (sequentially – parents first because others may reference them)
    const parentsCount       = await upsertAndPrune('parents', parents, syncedAt)
    const studentsCount      = await upsertAndPrune('students', students, syncedAt)
    const transactionsCount  = await upsertAndPrune('transactions', transactions, syncedAt)
    const debtsCount         = await upsertAndPrune('debts', debts, syncedAt)
    const plannedCount       = await upsertAndPrune('planned_payments', plannedPayments, syncedAt)
    const womenCount         = await upsertAndPrune('women', women, syncedAt)

    // Payment allocation: split "בנין לדורות" income transactions across active children
    let allocationsCount = 0
    try {
      const binyanTxs = transactions.filter(
        tx => tx.project_names.includes('בנין לדורות') && tx.amount > 0
      )
      if (binyanTxs.length > 0) {
        const studentsByParent: Record<string, typeof students> = {}
        for (const s of students) {
          for (const pid of s.parent_ids) {
            if (!studentsByParent[pid]) studentsByParent[pid] = []
            studentsByParent[pid].push(s)
          }
        }
        const allocations: Array<{
          transaction_id: string; student_id: string; parent_id: string
          amount: number; month_year: string; synced_at: string
        }> = []
        for (const tx of binyanTxs) {
          for (const parentId of tx.parent_ids) {
            const active = (studentsByParent[parentId] ?? []).filter(s => s.status === 'פעיל')
            if (active.length === 0) continue
            const perStudent = Math.floor((tx.amount / active.length) * 100) / 100
            const remainder  = Math.round((tx.amount - perStudent * active.length) * 100) / 100
            active.forEach((s, i) => allocations.push({
              transaction_id: tx.id,
              student_id:     s.id,
              parent_id:      parentId,
              amount:         i === active.length - 1 ? perStudent + remainder : perStudent,
              month_year:     tx.month_year,
              synced_at:      syncedAt,
            }))
          }
        }
        await supabaseAdmin.from('payment_allocations').delete().not('id', 'is', null)
        if (allocations.length > 0) {
          await supabaseAdmin.from('payment_allocations').insert(allocations)
        }
        allocationsCount = allocations.length
      }
    } catch (allocErr) {
      console.warn('payment_allocations skipped (run schema migration):', allocErr)
    }

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
        allocations: allocationsCount,
        women: womenCount,
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
