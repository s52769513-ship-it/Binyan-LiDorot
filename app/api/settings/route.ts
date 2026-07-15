import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('institution_settings')
    .select('*')
    .limit(1)
    .single()
  if (error) return NextResponse.json({})
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const allowed = [
      'institution_name', 'address', 'phone', 'primary_color', 'logo_url',
      'automation_day', 'automation_hour', 'automation_enabled',
      'tuition_offset_day', 'tuition_offset_hour', 'tuition_offset_time', 'tuition_offset_enabled',
      'credit_offset_day', 'credit_offset_hour', 'credit_offset_time', 'credit_offset_enabled',
      'salary_pp_day', 'salary_pp_hour', 'salary_pp_time', 'salary_pp_enabled',
      'donation_pp_day', 'donation_pp_hour', 'donation_pp_time', 'donation_pp_enabled',
      'donation_offset_day', 'donation_offset_hour', 'donation_offset_time', 'donation_offset_enabled',
      // Nedarim sync/pull automations and the Airtable transactions pull are
      // manual-only by design — no schedule keys for them.
    ]
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }
    // Upsert row with id=1
    const { error } = await supabaseAdmin
      .from('institution_settings')
      .upsert({ id: 1, ...update }, { onConflict: 'id' })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message
      : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message)
      : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
