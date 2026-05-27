import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchAirtableRecords, TABLES, T, PROJ } from '@/lib/airtable'

/**
 * POST /api/admin/fix-transaction-signs
 *
 * One-time migration:
 * 1. Re-fetches all transactions from Airtable
 * 2. Extracts the real type name from the Airtable single-select object
 * 3. Applies correct sign: הוצאה → negative, הכנסה → positive
 * 4. Bulk-updates Supabase
 *
 * Returns counts of records fixed.
 */
export async function POST() {
  try {
    // Fetch all transactions from Airtable
    const [rawTx, rawProjects] = await Promise.all([
      fetchAirtableRecords(TABLES.TRANSACTIONS, {
        fields: [T.AMOUNT, T.TYPE, T.DATE, T.MONTH_YEAR, T.NOTES, T.PARENT, T.PROJECT],
      }),
      fetchAirtableRecords(TABLES.PROJECTS, { fields: [PROJ.NAME] }),
    ])

    const projectNameMap: Record<string, string> = {}
    for (const r of rawProjects) {
      projectNameMap[r.id] = String(r.fields[PROJ.NAME] || '')
    }

    let fixedType = 0
    let fixedSign = 0

    // Build corrected rows
    const rows = rawTx.map(r => {
      const typeField = r.fields[T.TYPE]
      const typeName = typeField && typeof typeField === 'object' && 'name' in (typeField as object)
        ? String((typeField as { name: string }).name)
        : String(typeField || '')

      const rawAmount = Number(r.fields[T.AMOUNT]) || 0
      const amount = typeName.includes('הוצאה') ? -Math.abs(rawAmount) : rawAmount

      if (typeName !== '[object Object]') fixedType++
      if (typeName.includes('הוצאה') && rawAmount > 0) fixedSign++

      const projectIds = (r.fields[T.PROJECT] as string[]) || []
      return {
        id:            r.id,
        amount,
        type:          typeName,
        date:          (r.fields[T.DATE] as string) || null,
        month_year:    String(r.fields[T.MONTH_YEAR] || ''),
        notes:         String(r.fields[T.NOTES] || ''),
        parent_ids:    (r.fields[T.PARENT] as string[]) || [],
        project_ids:   projectIds,
        project_names: projectIds.map(pid => projectNameMap[pid]).filter(Boolean),
        synced_at:     new Date().toISOString(),
      }
    })

    if (rows.length === 0) {
      return NextResponse.json({ success: true, total: 0, fixedType: 0, fixedSign: 0 })
    }

    // Upsert in batches of 200
    const BATCH = 200
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { error } = await supabaseAdmin
        .from('transactions')
        .upsert(batch, { onConflict: 'id' })
      if (error) throw new Error(`upsert batch ${i}: ${error.message}`)
    }

    return NextResponse.json({
      success: true,
      total:      rows.length,
      fixedType,   // rows whose type was "[object Object]" that now have the real name
      fixedSign,   // הוצאה rows whose amount was positive and is now negative
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('fix-transaction-signs error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
