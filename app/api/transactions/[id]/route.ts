import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { softDelete } from '@/lib/trash'
import { relinkParent } from '@/lib/relink'
import { actorFromRequest, logActivityForParents } from '@/lib/activityLog'

const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Math.abs(n))

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('transactions').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const allowed = ['amount', 'type', 'date', 'month_year', 'notes', 'planned_payment_id', 'project_names', 'framework', 'receipt_url']
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }

    const { data: txBefore } = await supabaseAdmin
      .from('transactions').select('parent_ids, type, amount').eq('id', id).maybeSingle()

    const { error } = await supabaseAdmin.from('transactions').update(update).eq('id', id)
    if (error) throw error

    // אם השתנה שדה שמשפיע על יתרות/גלישה — מריצים ריענון מלא של ההורה, כך
    // שהשינוי מתפשט נכון על כל החודשים הפתוחים (עודף גולש הלאה במקום להיחתך
    // ולהיאבד). זו אותה לוגיקת cascade של הוספת תשלום, הקישור הידני והאוטומציות.
    const balanceFields = ['amount', 'planned_payment_id', 'month_year', 'date', 'project_names']
    if (balanceFields.some(k => k in body)) {
      for (const pid of ((txBefore?.parent_ids as string[]) ?? [])) {
        try { await relinkParent(pid) } catch (e) { console.error('relink after tx edit failed:', e) }
      }
    }

    if (txBefore) {
      const parts = Object.entries(update).map(([k, v]) =>
        k === 'amount' ? `סכום: ${fmtILS(Number(v))}` : k === 'notes' ? `הערות: ${v}` : `${k}: ${v}`)
      void logActivityForParents((txBefore.parent_ids as string[]) ?? [], {
        actor: actorFromRequest(req), action: 'update',
        summary: `עודכנה תנועה (${txBefore.type || ''} ${fmtILS(Number(txBefore.amount) || 0)}): ${parts.join(' · ')}`,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const deletedBy = req.headers.get('x-auth-email') || 'unknown'

    const { data: tx } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single()

    if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

    await softDelete(supabaseAdmin, 'transaction', id, tx, deletedBy)

    // מחיקת תשלום שגלש על כמה חודשים חייבת להחזיר את כל ההשפעה, לא רק את ה-PP
    // הבודד שהיה מקושר. לאחר שהתנועה ירדה מהטבלה החיה — ריענון מלא של ההורה
    // מחשב מחדש את כל היתרות/הגלישות בלעדיה.
    for (const pid of ((tx.parent_ids as string[]) ?? [])) {
      try { await relinkParent(pid) } catch (e) { console.error('relink after tx delete failed:', e) }
    }

    void logActivityForParents((tx.parent_ids as string[]) ?? [], {
      actor: deletedBy, action: 'delete',
      summary: `נמחקה תנועה: ${tx.type || 'ללא סוג'} · ${fmtILS(Number(tx.amount) || 0)}${tx.notes ? ` · ${tx.notes}` : ''}`,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}
