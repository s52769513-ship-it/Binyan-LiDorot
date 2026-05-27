import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createPlannedPaymentInAirtable } from '@/lib/airtable-write'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { amount, name, date, monthYear, parentIds } = body

    if (!amount || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'סכום שגוי' }, { status: 400 })
    }

    const syncedAt = new Date().toISOString()

    const airtableId = await createPlannedPaymentInAirtable({
      amount: Number(amount),
      name: name || undefined,
      date: date || undefined,
      monthYear: monthYear || undefined,
      parentIds: Array.isArray(parentIds) ? parentIds : [],
    })

    const row = {
      id: airtableId,
      amount: Number(amount),
      name: name || '',
      date: date || null,
      month_year: monthYear || '',
      balance: Number(amount),   // new planned payment → full amount is balance
      parent_ids: Array.isArray(parentIds) ? parentIds : [],
      synced_at: syncedAt,
    }
    const { error } = await supabaseAdmin.from('planned_payments').upsert(row, { onConflict: 'id' })
    if (error) throw error

    return NextResponse.json({ success: true, id: airtableId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('planned-payments POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
