import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('classes')
    .select('class_name, framework')
    .order('class_name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const { className, framework } = await req.json()
    if (!className) return NextResponse.json({ error: 'className required' }, { status: 400 })
    const { error } = await supabaseAdmin
      .from('classes')
      .upsert({ class_name: className, framework: framework ?? '' }, { onConflict: 'class_name' })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
