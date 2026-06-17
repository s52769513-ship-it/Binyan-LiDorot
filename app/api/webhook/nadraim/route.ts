import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Nadraim currency codes: 1 = ILS, 2 = USD
async function convertToILS(amount: number, currency: string): Promise<{ amount: number; currencyNote: string }> {
  if (currency !== '2') return { amount, currencyNote: '' }
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
    const data = await res.json() as { rates?: Record<string, number> }
    const rate = data.rates?.ILS ?? 3.7
    return {
      amount: Math.round(amount * rate * 100) / 100,
      currencyNote: `(${amount} USD × ${rate.toFixed(3)})`,
    }
  } catch {
    const rate = 3.7
    return {
      amount: Math.round(amount * rate * 100) / 100,
      currencyNote: `(${amount} USD, שער משוער ${rate})`,
    }
  }
}

function parseNadraimDate(dateStr: string): { date: string; monthYear: string } {
  // Format: "28/05/2026 11:07:56"
  const [datePart] = String(dateStr).split(' ')
  const [dd, mm, yyyy] = datePart.split('/')
  if (!dd || !mm || !yyyy) {
    const today = new Date().toISOString().split('T')[0]
    const [y, m] = today.split('-')
    return { date: today, monthYear: `${m}/${y}` }
  }
  return { date: `${yyyy}-${mm}-${dd}`, monthYear: `${mm}/${yyyy}` }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json()
    // Make sends array, Nadraim direct sends object
    const payload = Array.isArray(raw) ? raw[0] : raw

    const {
      Zeout, ClientName, Phone, Mail,
      Amount, Currency, TransactionType,
      Groupe, TransactionTime, Makor,
      TransactionId, Comments,
      KevaId,  // standing order external ID from Nadraim
    } = payload as Record<string, string>

    const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true'

    if (!Amount || !TransactionTime) {
      return NextResponse.json({ error: 'חסרים שדות חובה: Amount, TransactionTime' }, { status: 400 })
    }

    // 1. Currency conversion
    const rawAmount = parseFloat(Amount) || 0
    const { amount, currencyNote } = await convertToILS(rawAmount, String(Currency ?? '1'))

    // 2. Date
    const { date, monthYear } = parseNadraimDate(TransactionTime)

    // 3. Find or create parent by Zeout (ת"ז)
    let parentId: string | null = null
    let parentFound = false
    let parentCreated = false
    const zeout = String(Zeout ?? '').trim()

    if (zeout) {
      const { data: found, error: searchErr } = await supabaseAdmin
        .from('parents')
        .select('id, name, id_number')
        .eq('id_number', zeout)
        .limit(1)

      if (searchErr) throw new Error(`חיפוש הורה נכשל: ${searchErr.message}`)

      if (found?.[0]) {
        parentId = found[0].id
        parentFound = true
      } else {
        // Create new parent
        const nameParts  = String(ClientName ?? '').trim().split(' ')
        const lastName   = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''
        const firstName  = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameParts[0] ?? ''

        parentId = crypto.randomUUID()
        parentCreated = true
        if (!dryRun) {
          const { error: parentErr } = await supabaseAdmin.from('parents').insert({
            id:           parentId,
            name:         String(ClientName ?? '').trim(),
            first_name:   firstName,
            last_name:    lastName,
            id_number:    zeout,
            father_phone: String(Phone ?? '').trim() || null,
            email:        String(Mail  ?? '').trim() || null,
            status:       ['תורם'],
            synced_at:    '2099-12-31T23:59:59.999Z',
          })
          if (parentErr) throw new Error(`יצירת הורה נכשלה: ${parentErr.message}`)
        }
      }
    }

    // 3b. Look up standing order by HokId (if provided)
    const hokIdStr = String(KevaId ?? '').trim()
    let standingOrderDbId: string | null = null
    let billingParentId: string | null = parentId  // whose planned payments to link to
    if (hokIdStr) {
      const { data: soRows } = await supabaseAdmin
        .from('standing_orders')
        .select('id, parent_id, linked_parent_id')
        .eq('external_id', hokIdStr)
        .limit(1)
      if (soRows?.[0]) {
        standingOrderDbId = soRows[0].id
        // If the standing order has a linked_parent_id, use that for billing
        billingParentId = soRows[0].linked_parent_id ?? soRows[0].parent_id ?? parentId
        // If we didn't find the parent by Zeout, use the standing order's parent
        if (!parentId) parentId = soRows[0].parent_id
      }
    }

    // dry run — find PP too then return diagnostic info without writing
    if (dryRun) {
      let dryPP = null
      const ppParentId = billingParentId ?? parentId
      if (ppParentId) {
        const { data: openPPs } = await supabaseAdmin
          .from('planned_payments')
          .select('id, amount, balance, month_year, name')
          .contains('parent_ids', [ppParentId])
          .eq('pp_type', 'tuition')
          .gt('balance', 0)
          .order('month_year', { ascending: false })
        if (openPPs?.length) {
          const curr = openPPs.find(pp => pp.month_year === monthYear)
          dryPP = curr ?? openPPs[openPPs.length - 1]
        }
      }
      return NextResponse.json({
        dryRun: true,
        zeout, parentFound, parentCreated, parentId,
        hokId: hokIdStr || null, standingOrderDbId, billingParentId,
        amount, currencyNote, date, monthYear,
        txType:      String(TransactionType ?? '').trim() || 'נדרים',
        projectName: String(Groupe ?? '').trim() || 'בנין לדורות',
        clientName:  String(ClientName ?? ''),
        linkedPP: dryPP ? { id: dryPP.id, name: dryPP.name, monthYear: dryPP.month_year, balance: dryPP.balance } : null,
      })
    }

    // 4. Notes
    const notes = [
      'נדרים',
      Makor          ? String(Makor)          : null,
      TransactionId  ? `#${TransactionId}`    : null,
      currencyNote   || null,
      Comments       ? String(Comments)       : null,
    ].filter(Boolean).join(' · ')

    // 5. Find open PP to link — donation txs → donation PPs, others → tuition PPs
    // Priority: 1) same month  2) past (overdue, oldest first)  3) future (closest first)
    let linkedPPId: string | null = null
    let linkedPPBalance: number | null = null
    const ppParentId  = billingParentId ?? parentId
    const projectName = String(Groupe ?? '').trim() || 'בנין לדורות'
    const isDonation  = projectName === 'דמי מגבית'

    if (ppParentId) {
      const ppQuery = supabaseAdmin
        .from('planned_payments')
        .select('id, amount, balance, month_year, date')
        .contains('parent_ids', [ppParentId])
        .gt('balance', 0)

      const { data: openPPs } = isDonation
        ? await ppQuery.eq('pp_type', 'donation')
        : await ppQuery.or('pp_type.eq.tuition,pp_type.is.null')

      if (openPPs && openPPs.length > 0) {
        const today = new Date().toISOString().split('T')[0]
        // 1. Exact month match
        const sameMonth = openPPs.find(pp => pp.month_year === monthYear)
        // 2. Overdue (past date), oldest first
        const overdue   = openPPs
          .filter(pp => pp.date && pp.date < today && pp.month_year !== monthYear)
          .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
        // 3. Future, closest first
        const upcoming  = openPPs
          .filter(pp => !pp.date || pp.date >= today && pp.month_year !== monthYear)
          .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

        const chosen    = sameMonth ?? overdue[0] ?? upcoming[0] ?? null
        if (chosen) {
          linkedPPId      = chosen.id
          linkedPPBalance = Number(chosen.balance)
        }
      }
    }

    // 6. Create transaction
    const txId   = crypto.randomUUID()
    const txType = String(TransactionType ?? '').trim() || 'נדרים'

    // Include both the payer (parentId) and the billed person (billingParentId) in parent_ids
    const txParentIds = Array.from(new Set([
      ...(parentId ? [parentId] : []),
      ...(billingParentId && billingParentId !== parentId ? [billingParentId] : []),
    ]))

    const { error: txErr } = await supabaseAdmin.from('transactions').insert({
      id:                 txId,
      amount,
      type:               txType,
      date,
      month_year:         monthYear,
      notes,
      parent_ids:         txParentIds,
      project_ids:        [],
      project_names:      [projectName],
      planned_payment_id: linkedPPId,
      standing_order_id:  standingOrderDbId,
      synced_at:          '2099-12-31T23:59:59.999Z',
    })
    if (txErr) throw new Error(`יצירת תנועה נכשלה: ${txErr.message}`)

    // 7. Update linked PP balance
    if (linkedPPId && linkedPPBalance !== null) {
      const newBalance = Math.max(0, linkedPPBalance - amount)
      await supabaseAdmin
        .from('planned_payments')
        .update({ balance: newBalance })
        .eq('id', linkedPPId)
    }

    // 8. Automation log
    try {
      await supabaseAdmin.from('automation_logs').insert({
        id:            crypto.randomUUID(),
        automation_id: 'nadraim-webhook',
        run_at:        new Date().toISOString(),
        dry_run:       false,
        parent_id:     parentId,
        parent_name:   String(ClientName ?? ''),
        actions_count: 1,
        status:        'success',
        summary:       `נדרים: ${ClientName || 'אנונימי'} · ₪${amount} · ${projectName} (${monthYear})${hokIdStr ? ` · הו"ק ${hokIdStr}` : ''}`,
        details:       { payload, txId, parentId, billingParentId, standingOrderDbId, hokIdStr, amount, currencyNote },
      })
    } catch { /* table may not exist yet */ }

    return NextResponse.json({ success: true, txId, parentId, amount })
  } catch (err) {
    console.error('nadraim webhook error:', err)
    try {
      await supabaseAdmin.from('automation_logs').insert({
        id:            crypto.randomUUID(),
        automation_id: 'nadraim-webhook',
        run_at:        new Date().toISOString(),
        dry_run:       false,
        parent_id:     null,
        parent_name:   null,
        actions_count: 0,
        status:        'error',
        summary:       `שגיאה: ${String(err)}`,
        details:       null,
      })
    } catch { /* ignore */ }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
