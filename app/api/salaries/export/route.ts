import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import * as XLSX from 'xlsx'

const PAYMENT_METHODS = ['העברה', 'מזומן', 'הו"ק', 'אשראי', "צ'ק"]

function currentMY() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export async function GET(req: NextRequest) {
  const monthYear = req.nextUrl.searchParams.get('monthYear') || currentMY()

  const [parentsRes, womenRes, offsetRes] = await Promise.all([
    supabaseAdmin
      .from('parents')
      .select('id, name, salary_gross, show_spouse_salary, deduct_tuition, tuition_balance')
      .gt('salary_gross', 0)
      .order('name'),
    supabaseAdmin
      .from('women')
      .select('id, name, parent_ids, salary_gross')
      .gt('salary_gross', 0),
    supabaseAdmin
      .from('transactions')
      .select('parent_ids, amount')
      .eq('month_year', monthYear)
      .in('type', ['קיזוז ממשכורת', 'קיזוז שכ"ל']),
  ])

  // Wife lookup
  const wifeByParent: Record<string, number> = {}
  for (const w of womenRes.data ?? []) {
    for (const pid of (w.parent_ids ?? [])) {
      wifeByParent[pid] = (wifeByParent[pid] || 0) + (Number(w.salary_gross) || 0)
    }
  }

  // Offset lookup
  const offsetByParent: Record<string, number> = {}
  for (const tx of offsetRes.data ?? []) {
    for (const pid of (tx.parent_ids ?? [])) {
      offsetByParent[pid] = (offsetByParent[pid] || 0) + Math.abs(Number(tx.amount))
    }
  }

  // Headers
  const headers = [
    '__id',
    'שם משפחה',
    'משכורת בעל',
    'משכורת אשה',
    'סה"כ משפחתי',
    'קיזוז שכ"ל',
    'לתשלום',
    ...PAYMENT_METHODS,
    'סה"כ שולם',
    'יתרה',
  ]

  const rows: (string | number | null)[][] = [headers]

  for (const p of parentsRes.data ?? []) {
    const husbandSalary = Number(p.salary_gross) || 0
    const wifeSalary    = wifeByParent[p.id] || 0
    const offset        = offsetByParent[p.id] || 0

    rows.push([
      p.id,
      p.name,
      husbandSalary,
      wifeSalary || null,
      null, // E — formula
      offset || null,
      null, // G — formula
      null, null, null, null, null, // H-L — payment methods
      null, // M — formula
      null, // N — formula
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Add formulas for data rows (row 2 onward)
  for (let i = 1; i < rows.length; i++) {
    const r = i + 1
    ws[`E${r}`] = { t: 'n', f: `C${r}+IF(ISNUMBER(D${r}),D${r},0)` }
    ws[`G${r}`] = { t: 'n', f: `E${r}-IF(ISNUMBER(F${r}),F${r},0)` }
    ws[`M${r}`] = { t: 'n', f: `H${r}+I${r}+J${r}+K${r}+L${r}` }
    ws[`N${r}`] = { t: 'n', f: `G${r}-M${r}` }
  }

  // Column widths; hide column A (id)
  ws['!cols'] = [
    { hidden: true }, // A id
    { wch: 22 },      // B name
    { wch: 14 },      // C husband
    { wch: 14 },      // D wife
    { wch: 14 },      // E total
    { wch: 12 },      // F offset
    { wch: 12 },      // G to pay
    { wch: 12 },      // H transfer
    { wch: 10 },      // I cash
    { wch: 10 },      // J standing
    { wch: 10 },      // K credit
    { wch: 10 },      // L check
    { wch: 12 },      // M total paid
    { wch: 12 },      // N balance
  ]

  // Freeze top row
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'משכורות')

  const safeMY = monthYear.replace('/', '_')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="salaries_${safeMY}.xlsx"`,
    },
  })
}
