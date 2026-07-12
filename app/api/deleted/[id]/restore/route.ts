import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { recordTypeTableMap, RecordType } from '@/lib/trash'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deletedId } = await params

    // שלוף את הרשומה המחוקה
    const { data: deleted, error: fetchError } = await supabaseAdmin
      .from('deleted_records')
      .select('*')
      .eq('id', deletedId)
      .single()

    if (fetchError || !deleted) {
      return NextResponse.json({ error: 'הרשומה לא נמצאה' }, { status: 404 })
    }

    // בדיקה שתקופת השחזור לא חלפה
    if (new Date(deleted.restore_deadline) < new Date()) {
      return NextResponse.json({ error: 'תקופת השחזור (30 יום) חלפה' }, { status: 410 })
    }

    const { record_type, data: recordData } = deleted
    const table = recordTypeTableMap[record_type as RecordType]
    if (!table) {
      return NextResponse.json({ error: `סוג רשומה לא מוכר: ${record_type}` }, { status: 400 })
    }

    // החזר למקום המקורי (upsert כדי לא להיכשל אם מזהה חזר בינתיים)
    const { error: restoreError } = await supabaseAdmin
      .from(table)
      .upsert(recordData, { onConflict: 'id' })

    if (restoreError) {
      return NextResponse.json({ error: restoreError.message }, { status: 400 })
    }

    // הסר מטבלת האשפה
    const { error: deleteError } = await supabaseAdmin
      .from('deleted_records')
      .delete()
      .eq('id', deletedId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, record: recordData })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}
