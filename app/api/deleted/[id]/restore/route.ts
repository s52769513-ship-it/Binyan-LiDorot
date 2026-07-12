import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(
  req: NextRequest,
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
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // בדיקה שהעברה לא חלפה
    if (new Date(deleted.restore_deadline) < new Date()) {
      return NextResponse.json({ error: 'Restore deadline has passed' }, { status: 410 })
    }

    const { record_type, record_id, data: recordData } = deleted

    // בהתאם לסוג, החזר למקום המקורי
    const { error: restoreError } = await supabaseAdmin
      .from(mapRecordTypeToTable(record_type))
      .insert(recordData)

    if (restoreError) {
      return NextResponse.json({ error: restoreError.message }, { status: 400 })
    }

    // מחק מטבלת ההשאפה
    const { error: deleteError } = await supabaseAdmin
      .from('deleted_records')
      .delete()
      .eq('id', deletedId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      record: recordData,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function mapRecordTypeToTable(recordType: string): string {
  const mapping: { [key: string]: string } = {
    'transaction': 'transactions',
    'planned_payment': 'planned_payments',
    'child': 'children',
    'parent': 'parents',
    'salary': 'salaries',
  }
  return mapping[recordType] || recordType
}
