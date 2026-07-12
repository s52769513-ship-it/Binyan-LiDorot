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

export const recordTypeTableMap: Record<RecordType, string> = {
  'transaction':     'transactions',
  'planned_payment': 'planned_payments',
  'student':         'students',
  'parent':          'parents',
  'standing_order':  'standing_orders',
  'woman':           'women',
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
