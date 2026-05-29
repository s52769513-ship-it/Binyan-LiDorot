import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const automationId = req.nextUrl.searchParams.get('automationId') ?? ''
  try {
    let q = supabaseAdmin
      .from('automation_logs')
      .select('id, automation_id, run_at, dry_run, parent_name, actions_count, status, summary')
      .order('run_at', { ascending: false })
      .limit(50)
    if (automationId) q = q.eq('automation_id', automationId)
    const { data, error } = await q
    if (error) {
      // 42P01 = relation does not exist (table not created yet)
      if ((error as { code?: string }).code === '42P01')
        return NextResponse.json({ logs: [], needsMigration: true })
      throw error
    }
    return NextResponse.json({ logs: data ?? [], needsMigration: false })
  } catch {
    return NextResponse.json({ logs: [], needsMigration: true })
  }
}
