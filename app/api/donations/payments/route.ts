import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * תנועות תשלום של דמי מגבית — כל התנועות שמסווגות כ"דמי מגבית".
 * אינן חייבות להיות מקושרות ל-PP (תנועות מיובאות לרוב אינן מקושרות).
 * אופציונלי מסונן לפי חודש (month_year).
 */
export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month') ?? ''

    let query = supabaseAdmin
      .from('transactions')
      .select('id, amount, type, date, month_year, notes, parent_ids, project_names')
      .contains('project_names', ['דמי מגבית'])
      .order('date', { ascending: false })
    if (month) query = query.eq('month_year', month)

    const { data: txs, error } = await query
    if (error) throw error

    // Join parent names
    const allParentIds = [...new Set((txs ?? []).flatMap(t => (t.parent_ids as string[]) ?? []))]
    let parentMap: Record<string, string> = {}
    if (allParentIds.length > 0) {
      const { data: pData } = await supabaseAdmin.from('parents').select('id, name').in('id', allParentIds)
      parentMap = Object.fromEntries((pData ?? []).map(p => [p.id, p.name as string]))
    }

    const payments = (txs ?? []).map(t => {
      const ids = (t.parent_ids as string[]) ?? []
      return {
        id:           t.id as string,
        amount:       Number(t.amount) || 0,
        type:         String(t.type || ''),
        date:         String(t.date || ''),
        monthYear:    String(t.month_year || ''),
        notes:        String(t.notes || ''),
        parentIds:    ids,
        parentName:   ids.map(id => parentMap[id]).filter(Boolean).join(', '),
        projectNames: (t.project_names as string[]) ?? [],
      }
    })

    return NextResponse.json({ payments })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
