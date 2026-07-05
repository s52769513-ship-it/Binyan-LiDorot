import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { monthKey } from '@/lib/months'

/**
 * GET /api/debt-breakdown?pool=tuition|donation|salary&dueOnly=1
 *
 * פירוט חוב פתוח לפי חודש → הורים. משמש את המודל הנפתח מכרטיסי הדשבורד.
 * טאב לכל חודש שיש בו חוב פתוח, ותחתיו רשומות ההורים עם היתרה שלהם.
 *
 * pool   — בריכת החוב: שכ"ל / מגבית / משכורות (לעולם לא מערבבים).
 * dueOnly — כשדולק, נכללים רק PP שתאריך היעד שלהם כבר עבר (date <= היום),
 *           כדי שחודשים עתידיים שעדיין לא הגיע מועדם לא ייספרו כחוב.
 *
 * המקור היחיד לאמת: יתרות ה-planned_payments (לא parents.tuition_balance),
 * כדי שהסכומים יהיו עקביים עם כרטיס ה-PP ועם הריענון.
 */

type Pool = 'tuition' | 'donation' | 'salary'

interface ParentRecord {
  parentId: string
  parentName: string
  balance: number
  childrenCount: number
}
interface MonthBucket {
  monthYear: string
  total: number
  parents: ParentRecord[]
}

// legacy `type` param → pool/dueOnly (backward compat)
function resolveParams(sp: URLSearchParams): { pool: Pool; dueOnly: boolean } {
  const legacy = sp.get('type')
  if (legacy === 'overdue') return { pool: 'tuition', dueOnly: true }
  if (legacy === 'salary')  return { pool: 'salary', dueOnly: false }
  if (legacy === 'tuition') return { pool: 'tuition', dueOnly: true }
  if (legacy === 'donation') return { pool: 'donation', dueOnly: true }
  const pool = (sp.get('pool') ?? 'tuition') as Pool
  const dueOnly = sp.get('dueOnly') === '1' || sp.get('dueOnly') === 'true'
  return { pool, dueOnly }
}

export async function GET(req: NextRequest) {
  try {
    const { pool, dueOnly } = resolveParams(req.nextUrl.searchParams)
    const todayStr = new Date().toISOString().slice(0, 10)

    let query = supabase
      .from('planned_payments')
      .select('parent_ids, balance, month_year')
      .gt('balance', 0)

    if (pool === 'salary') {
      query = query.eq('pp_type', 'salary')
    } else if (pool === 'donation') {
      query = query.eq('pp_type', 'donation')
    } else {
      // tuition — כולל PP שמקורם ב-Airtable (pp_type ריק)
      query = query.or('pp_type.eq.tuition,pp_type.is.null')
    }

    // רק תאריכים שכבר עברו (חוב אמיתי שהגיע מועדו)
    if (dueOnly) query = query.lte('date', todayStr)

    const { data: pps, error } = await query
    if (error) throw error

    // month_year → parentId → aggregated balance
    const byMonth = new Map<string, Map<string, number>>()
    const allParentIds = new Set<string>()
    for (const pp of pps ?? []) {
      const my = String(pp.month_year || '')
      const bal = Number(pp.balance) || 0
      if (bal <= 0) continue
      const pids = (pp.parent_ids as string[]) ?? []
      // חלוקת יתרה משותפת שווה בשווה בין ההורים הרשומים על ה-PP
      const share = pids.length > 0 ? bal / pids.length : bal
      if (!byMonth.has(my)) byMonth.set(my, new Map())
      const bucket = byMonth.get(my)!
      for (const pid of pids) {
        bucket.set(pid, (bucket.get(pid) ?? 0) + share)
        allParentIds.add(pid)
      }
      if (pids.length === 0) bucket.set('', (bucket.get('') ?? 0) + bal)
    }

    // Resolve parent names + children count in bulk
    const idList = [...allParentIds].filter(Boolean)
    const nameMap = new Map<string, { name: string; children: number }>()
    if (idList.length > 0) {
      const CHUNK = 300
      for (let i = 0; i < idList.length; i += CHUNK) {
        const { data } = await supabase
          .from('parents')
          .select('id, name, children_count')
          .in('id', idList.slice(i, i + CHUNK))
        for (const p of data ?? []) {
          nameMap.set(p.id as string, {
            name: (p.name as string) ?? '',
            children: Number(p.children_count) || 0,
          })
        }
      }
    }

    const round = (n: number) => Math.round(n)
    const months: MonthBucket[] = [...byMonth.entries()]
      .map(([monthYear, parentBalances]) => {
        const parents: ParentRecord[] = [...parentBalances.entries()]
          .map(([parentId, balance]) => ({
            parentId,
            parentName: parentId ? (nameMap.get(parentId)?.name || '—') : 'ללא הורה משויך',
            balance: round(balance),
            childrenCount: parentId ? (nameMap.get(parentId)?.children ?? 0) : 0,
          }))
          .filter(p => p.balance > 0)
          .sort((a, b) => b.balance - a.balance)
        const total = parents.reduce((s, p) => s + p.balance, 0)
        return { monthYear, total, parents }
      })
      .filter(m => m.parents.length > 0)
      .sort((a, b) => monthKey(a.monthYear) - monthKey(b.monthYear))

    const grandTotal = months.reduce((s, m) => s + m.total, 0)
    const parentCount = new Set(
      months.flatMap(m => m.parents.map(p => p.parentId).filter(Boolean))
    ).size

    return NextResponse.json({ pool, dueOnly, months, grandTotal, parentCount })
  } catch (err) {
    console.error('debt-breakdown error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת פירוט חוב' }, { status: 500 })
  }
}
