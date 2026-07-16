import { SupabaseClient } from '@supabase/supabase-js'

// סוגי רשומות שניתן למחוק לאשפה. הערך הוא שם ה-record_type שנשמר ב-DB,
// והמיפוי למטה מתרגם אותו לשם הטבלה האמיתית (לשחזור/מחיקה סופית).
export type RecordType =
  | 'transaction'
  | 'planned_payment'
  | 'student'
  | 'parent'
  | 'standing_order'
  | 'woman'
  | 'recurring_payment'

export const recordTypeTableMap: Record<RecordType, string> = {
  'transaction':     'transactions',
  'planned_payment': 'planned_payments',
  'student':         'students',
  'parent':          'parents',
  'standing_order':  'standing_orders',
  'woman':           'women',
  'recurring_payment': 'recurring_payments',
}

// מוחק רשומה "רכות": שומר עותק מלא ב-deleted_records (עם מי מחק ומתי),
// ואז מוחק אותה מהטבלה המקורית כדי שלא תשפיע על שום דשבורד/דוח/סיכום.
// אם כבר קיימת רשומת אשפה לאותו פריט (record_type + record_id), מעדכן אותה
// במקום ליצור כפולה - כך שמחיקה חוזרת של אותו id לא תיכשל על האינדקס הייחודי.
export async function softDelete(
  supabase: SupabaseClient,
  recordType: RecordType,
  recordId: string,
  recordData: unknown,
  deletedBy: string
) {
  const { error } = await supabase
    .from('deleted_records')
    .upsert(
      {
        record_type: recordType,
        record_id: recordId,
        deleted_by: deletedBy,
        data: recordData,
        deleted_at: new Date().toISOString(),
        restore_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'record_type,record_id' }
    )

  if (error) throw error

  const tableName = recordTypeTableMap[recordType]
  const { error: delError } = await supabase
    .from(tableName)
    .delete()
    .eq('id', recordId)

  if (delError) throw delError
}

// Same as softDelete but for many rows of the same type in one round trip:
// a single upsert into deleted_records + a single `.in('id', ids)` delete,
// instead of N sequential pairs of queries (which is what made bulk deletes
// from the UI slow — 50 rows meant ~50 sequential request pairs).
export async function softDeleteMany(
  supabase: SupabaseClient,
  recordType: RecordType,
  records: { id: string; data: unknown }[],
  deletedBy: string
) {
  if (records.length === 0) return

  const now = new Date()
  const deadline = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const { error } = await supabase
    .from('deleted_records')
    .upsert(
      records.map(r => ({
        record_type: recordType,
        record_id: r.id,
        deleted_by: deletedBy,
        data: r.data,
        deleted_at: now.toISOString(),
        restore_deadline: deadline.toISOString(),
      })),
      { onConflict: 'record_type,record_id' }
    )

  if (error) throw error

  const tableName = recordTypeTableMap[recordType]
  const { error: delError } = await supabase
    .from(tableName)
    .delete()
    .in('id', records.map(r => r.id))

  if (delError) throw delError
}
