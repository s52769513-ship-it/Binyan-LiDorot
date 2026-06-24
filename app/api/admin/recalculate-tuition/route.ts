import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { recalcTuitionForParent } from '@/lib/recalcTuition'

export async function POST() {
  try {
    const { data: parents, error } = await supabaseAdmin
      .from('parents')
      .select('id')

    if (error) throw error

    for (const parent of parents ?? []) {
      await recalcTuitionForParent(parent.id)
    }

    return NextResponse.json({ success: true, count: (parents ?? []).length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
