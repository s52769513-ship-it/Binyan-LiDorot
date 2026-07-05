import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'
const API_PASS = process.env.NEDARIM_API_PASSWORD ?? 'nu247'

// "YYYY-MM-DD" | Date → "dd/mm/yyyy" (Nedarim's required format)
function toNedarimDate(input?: string): string {
  const d = input ? new Date(input) : new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const amount   = Number(body.amount)
    const currency: 1 | 2 = body.currency === 2 ? 2 : 1
    const comments = body.comments ? String(body.comments) : ''
    const date     = body.date ? String(body.date) : ''

    if (!amount || amount <= 0)
      return NextResponse.json({ success: false, message: 'סכום לא תקין' }, { status: 400 })

    const { data: so, error } = await supabaseAdmin
      .from('standing_orders')
      .select('id, external_id, standing_order_type, project_name')
      .eq('id', id)
      .single()

    if (error || !so)
      return NextResponse.json({ success: false, message: 'הוראת קבע לא נמצאה' }, { status: 404 })

    if (!so.external_id)
      return NextResponse.json({ success: false, message: 'להוראת קבע זו אין מזהה נדרים (external_id)' }, { status: 400 })

    if (so.standing_order_type === 'אשראי') {
      const form = new URLSearchParams({
        Action:       'TashlumBodedNew',
        MosadNumber:  MOSAD_ID,
        ApiPassword:  API_PASS,
        Currency:     String(currency),
        KevaId:       so.external_id,
        Amount:       String(amount),
        Tashloumim:   '1',
        JoinToKevaId: 'Join',
      })
      if (so.project_name) form.set('Groupe', so.project_name)
      if (comments) form.set('Comments', comments)

      const resp = await fetch('https://matara.pro/nedarimplus/Reports/Manage3.aspx', {
        method: 'POST', body: form,
      })
      if (!resp.ok)
        return NextResponse.json({ success: false, message: `שגיאת רשת (${resp.status})` }, { status: 502 })

      const json = await resp.json().catch(() => null)
      if (!json || json.Status !== 'OK')
        return NextResponse.json({ success: false, message: json?.Message || 'שגיאה מנדרים' }, { status: 400 })

      return NextResponse.json({ success: true })
    }

    if (so.standing_order_type === 'בנקאי') {
      const url = new URL('https://matara.pro/nedarimplus/Reports/Masav3.aspx')
      url.searchParams.set('Action', 'MasavBoded')
      url.searchParams.set('MosadNumber', MOSAD_ID)
      url.searchParams.set('ApiPassword', API_PASS)
      url.searchParams.set('MasavId', so.external_id)
      url.searchParams.set('Amount', String(amount))
      url.searchParams.set('Date', toNedarimDate(date))
      url.searchParams.set('AjaxId', String(Date.now()))

      const resp = await fetch(url.toString())
      if (!resp.ok)
        return NextResponse.json({ success: false, message: `שגיאת רשת (${resp.status})` }, { status: 502 })

      const raw = await resp.text()
      const json = (() => { try { return JSON.parse(raw) } catch { return null } })()
      const result = json?.Result ?? (raw.trim() === 'OK' ? 'OK' : raw.trim())
      if (result !== 'OK')
        return NextResponse.json({ success: false, message: json?.Message || result || 'שגיאה מנדרים' }, { status: 400 })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, message: `סוג הו"ק לא נתמך לחיוב: ${so.standing_order_type || '—'}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
