import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const ALLOWED_TABLES = ['transactions', 'planned_payments', 'debts', 'standing_orders', 'automation_logs']

export async function POST(req: NextRequest) {
  try {
    const { tables, confirm } = await req.json()
    if (confirm !== 'DELETE_ALL') {
      return NextResponse.json({ error: 'missing confirmation' }, { status: 400 })
    }
    const toDelete: string[] = (tables ?? []).filter((t: string) => ALLOWED_TABLES.includes(t))
    if (toDelete.length === 0) {
      return NextResponse.json({ error: 'no valid tables' }, { status: 400 })
    }

    const results: Record<string, string> = {}
    for (const table of toDelete) {
      // Delete all rows — use a dummy filter that matches everything
      const { error } = await supabaseAdmin.from(table).delete().neq('id', '__never__')
      results[table] = error ? `שגיאה: ${error.message}` : 'נמחק'
    }

    return NextResponse.json({ success: true, results })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
