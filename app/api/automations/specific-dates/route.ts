import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/automations/specific-dates?automationId=X
// List all specific dates scheduled for an automation
export async function GET(req: NextRequest) {
  const automationId = req.nextUrl.searchParams.get('automationId')
  if (!automationId) {
    return NextResponse.json({ error: 'Missing automationId' }, { status: 400 })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('automation_specific_dates')
      .select('*')
      .eq('automation_id', automationId)
      .order('scheduled_date', { ascending: true })

    if (error) throw error
    return NextResponse.json({ dates: data ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/automations/specific-dates
// Add a specific date for an automation
export async function POST(req: NextRequest) {
  try {
    const { automationId, scheduledDate, hour = 8 } = await req.json()

    if (!automationId || !scheduledDate) {
      return NextResponse.json(
        { error: 'Missing automationId or scheduledDate' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('automation_specific_dates')
      .insert({
        automation_id: automationId,
        scheduled_date: scheduledDate,
        hour: Number(hour),
        enabled: true,
      })
      .select()

    if (error) throw error
    return NextResponse.json({ date: data?.[0] }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/automations/specific-dates?id=X
// Remove a specific date schedule
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  try {
    const { error } = await supabaseAdmin
      .from('automation_specific_dates')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
