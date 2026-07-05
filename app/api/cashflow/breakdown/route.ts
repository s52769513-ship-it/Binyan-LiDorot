import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

/**
 * GET /api/cashflow/breakdown?month=MM/YYYY&pool=tuition|donation|salary&field=planned|collected|remaining
 *
 * ממה מורכב מספר בטבלת התזרים: רשימת ההורים והסכום שלהם עבור התא הנבחר
 * (חודש × בריכה × שדה). משמש את החלון הנפתח בלחיצה על מספר בתזרים.
 */

type Pool = 'tuition' | 'donation' | 'salary'
type Field = 'planned' | 'collected' | 'remaining'

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const month = sp.get('month') ?? ''
    const pool = (sp.get('pool') ?? 'tuition') as Pool
    const field = (sp.get('field') ?? 'planned') as Field
    if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })

    const ppType = pool === 'salary' ? 'salary' : pool === 'donation' ? 'donation' : 'tuition'
    const { data: pps, error } = await supabase
      .from('planned_payments')
      .select('parent_ids, amount, balance')
      .eq('pp_type', ppType)
      .eq('month_year', month)
    if (error) throw error

    const valueOf = (amount: number, balance: number): number => {
      if (field === 'planned') return amount
      if (field === 'remaining') return balance
      return amount - balance // collected / paid
    }

    // parentId → { value (של השדה הנבחר), remaining (יתרה פתוחה) }
    // ה-remaining מאפשר לצבוע שורות שכבר שולמו במלואן בירוק.
    const byParent = new Map<string, { value: number; remaining: number }>()
    const allIds = new Set<string>()
    const add = (pid: string, value: number, remaining: number) => {
      const cur = byParent.get(pid) ?? { value: 0, remaining: 0 }
      cur.value += value
      cur.remaining += remaining
      byParent.set(pid, cur)
      if (pid) allIds.add(pid)
    }
    for (const pp of pps ?? []) {
      const amount = Number(pp.amount) || 0
      const balance = Number(pp.balance) || 0
      const val = valueOf(amount, balance)
      if (val === 0) continue
      const pids = (pp.parent_ids as string[]) ?? []
      const n = pids.length
      if (n === 0) {
        add('', val, balance)
      } else {
        for (const pid of pids) add(pid, val / n, balance / n)
      }
    }

    const idList = [...allIds]
    const nameMap = new Map<string, string>()
    if (idList.length > 0) {
      const CHUNK = 300
      for (let i = 0; i < idList.length; i += CHUNK) {
        const { data } = await supabase.from('parents').select('id, name').in('id', idList.slice(i, i + CHUNK))
        for (const p of data ?? []) nameMap.set(p.id as string, (p.name as string) ?? '')
      }
    }

    const rows = [...byParent.entries()]
      .map(([parentId, v]) => ({
        parentId,
        parentName: parentId ? (nameMap.get(parentId) || '—') : 'ללא הורה משויך',
        amount: Math.round(v.value),
        // שולם במלואו כשאין יתרה פתוחה (מאפשר צביעה ירוקה בחלון)
        paid: Math.round(v.remaining) <= 0,
      }))
      .filter(r => Math.abs(r.amount) > 0)
      .sort((a, b) => b.amount - a.amount)

    const total = rows.reduce((s, r) => s + r.amount, 0)
    return NextResponse.json({ month, pool, field, rows, total })
  } catch (err) {
    console.error('cashflow-breakdown error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת פירוט' }, { status: 500 })
  }
}
