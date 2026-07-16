import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { MISSING_COLUMN_CODES } from '@/lib/ppPayments'

// Lightweight "create a person on the fly" endpoint — used by pickers (e.g. a
// supplier that isn't in the system yet). Unlike the full parents POST it needs
// only a name, and tags the person with the given type (default 'ספק').
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = String(body.name ?? '').trim()
    const type = String(body.personType ?? 'ספק').trim() || 'ספק'
    if (!name) return NextResponse.json({ error: 'יש להזין שם' }, { status: 400 })

    const id = crypto.randomUUID()
    const row = {
      id,
      name,
      first_name:  name,
      last_name:   '',
      status:      ['פעיל'],
      person_type: [type],
      children_count: 0,
      tuition_total:  0,
      tuition_balance: 0,
      // Far-future synced_at so the Airtable prune step never deletes it
      synced_at:   '2099-12-31T23:59:59.999Z',
    }
    const { error } = await supabaseAdmin.from('parents').insert(row)
    if (error && MISSING_COLUMN_CODES.has(error.code)) {
      // person_type column not migrated yet — insert without it
      const { person_type, ...rest } = row
      void person_type
      const { error: e2 } = await supabaseAdmin.from('parents').insert(rest)
      if (e2) throw e2
    } else if (error) {
      throw error
    }

    return NextResponse.json({ id, name })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
