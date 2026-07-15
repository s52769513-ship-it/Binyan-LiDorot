import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// PATCH /api/automations/specific-dates/[id]
// Update a specific date schedule (hour, enabled status)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { hour, enabled } = body

    const updates: Record<string, unknown> = {}
    if (hour !== undefined) updates.hour = Number(hour)
    if (enabled !== undefined) updates.enabled = Boolean(enabled)
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('automation_specific_dates')
      .update(updates)
      .eq('id', params.id)
      .select()

    if (error) throw error
    if (!data?.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ date: data[0] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
