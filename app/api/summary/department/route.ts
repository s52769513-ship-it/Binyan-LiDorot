import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const now = new Date()
    const currentMonthYear = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`

    const [studentsRes, classesRes, ppRes, parentsRes] = await Promise.all([
      supabase.from('students').select('id, parent_ids, class_name, status').eq('status', 'פעיל'),
      supabase.from('classes').select('class_name, framework'),
      supabase.from('planned_payments').select('parent_ids, amount, balance').eq('month_year', currentMonthYear),
      supabase.from('parents').select('id, tuition_balance'),
    ])

    const classToFramework: Record<string, string> = {}
    for (const c of classesRes.data ?? []) {
      classToFramework[String(c.class_name)] = String(c.framework || '')
    }

    // Map each parent to a framework via their active children
    const parentFramework: Record<string, string> = {}
    for (const s of studentsRes.data ?? []) {
      const fw = classToFramework[String(s.class_name)] || ''
      for (const pid of (s.parent_ids as string[]) ?? []) {
        if (!parentFramework[pid] || (!parentFramework[pid] && fw)) {
          parentFramework[pid] = fw
        }
      }
    }

    type FrameworkStats = { expected: number; paid: number; remaining: number; families: Set<string> }
    const byFramework: Record<string, FrameworkStats> = {}

    const getOrCreate = (fw: string): FrameworkStats => {
      if (!byFramework[fw]) byFramework[fw] = { expected: 0, paid: 0, remaining: 0, families: new Set() }
      return byFramework[fw]
    }

    for (const pp of ppRes.data ?? []) {
      const parentIds = (pp.parent_ids as string[]) ?? []
      for (const pid of parentIds) {
        const fw = parentFramework[pid] || 'לא מוגדר'
        const stats = getOrCreate(fw)
        const amt  = Number(pp.amount)  || 0
        const bal  = Number(pp.balance) || 0
        stats.expected  += amt
        stats.paid      += Math.max(0, amt - bal)
        stats.remaining += Math.max(0, bal)
        stats.families.add(pid)
      }
    }

    // Total debt per framework
    const debtByFramework: Record<string, number> = {}
    for (const p of parentsRes.data ?? []) {
      const fw = parentFramework[String(p.id)] || 'לא מוגדר'
      debtByFramework[fw] = (debtByFramework[fw] || 0) + Math.max(0, Number(p.tuition_balance) || 0)
    }

    const FRAMEWORK_ORDER = ['תלמוד תורה', 'בית חינוך לבנות', 'לא מוגדר']
    const result = FRAMEWORK_ORDER
      .filter(fw => byFramework[fw])
      .map(fw => {
        const s = byFramework[fw]
        return {
          framework: fw,
          expected:       Math.round(s.expected),
          paid:           Math.round(s.paid),
          remaining:      Math.round(s.remaining),
          totalDebt:      Math.round(debtByFramework[fw] || 0),
          familiesCount:  s.families.size,
          pct:            s.expected > 0 ? Math.round((s.paid / s.expected) * 100) : 0,
        }
      })

    return NextResponse.json({ departments: result, month: currentMonthYear })
  } catch (err) {
    console.error('summary/department error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת סיכום לפי אגף' }, { status: 500 })
  }
}
