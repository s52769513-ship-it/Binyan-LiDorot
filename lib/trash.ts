import { SupabaseClient } from '@supabase/supabase-js'

export type RecordType = 'transaction' | 'planned_payment' | 'child' | 'parent' | 'salary'

const recordTypeTableMap: Record<RecordType, string> = {
  'transaction': 'transactions',
  'planned_payment': 'planned_payments',
  'child': 'children',
  'parent': 'parents',
  'salary': 'salaries',
}

export async function softDelete(
  supabase: SupabaseClient,
  recordType: RecordType,
  recordId: string,
  recordData: any,
  deletedBy: string
) {
  // Insert into deleted_records
  const { error } = await supabase
    .from('deleted_records')
    .insert({
      record_type: recordType,
      record_id: recordId,
      deleted_by: deletedBy,
      data: recordData,
    })

  if (error) throw error

  // Hard delete from original table
  const tableName = recordTypeTableMap[recordType]
  const { error: delError } = await supabase
    .from(tableName)
    .delete()
    .eq('id', recordId)

  if (delError) throw delError
}
