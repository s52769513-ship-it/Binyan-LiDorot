import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { tuitionMonthForSalary } from '@/lib/months'

const FIELD_MAP: Record<string, string> = {
  firstName: 'first_name', lastName: 'last_name',
  motherName: 'mother_name', fatherPhone: 'father_phone',
  motherPhone: 'mother_phone', email: 'email',
  address: 'address', building: 'building', city: 'city',
  notes: 'notes', status: 'status',
  tuitionTotal: 'tuition_total', tuitionBalance: 'tuition_balance',
  birthDate: 'birth_date',
  // Personal fields
  idNumber:          'id_number',
  nickname:          'nickname',
  titleAfter:        'title_after',
  benReb:            'ben_reb',
  beneficiaryName:   'beneficiary_name',
  homePhone:         'home_phone',
  synagogue:         'synagogue',
  extraPhone:        'extra_phone',
  // Bank fields
  bankName:          'bank_name',
  bankBranch:        'bank_branch',
  bankAccount:       'bank_account',
  chargeDay:         'charge_day',
  standingOrderType: 'standing_order_type',
  standingOrderId:   'standing_order_id',
  // Salary fields
  baseHourlyRate:        'base_hourly_rate',
  seniorityBonusHourly:  'seniority_bonus_hourly',
  monthlyHoursDecimal:   'monthly_hours_decimal',
  fixedBonus:            'fixed_bonus',
  exceptionalExpenses:   'exceptional_expenses',
  transportReimbursement:'transport_reimbursement',
  deductTuition:         'deduct_tuition',
  showSpouseSalary:      'show_spouse_salary',
  calculateWifeTuition:  'calculate_wife_tuition',
  salaryGross:           'salary_gross',
  salaryAfterTuition:    'salary_after_tuition',
  creditBalance:         'credit_balance',
  ppCredit:              'pp_credit',
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const update: Record<string, unknown> = {}
    for (const [key, dbKey] of Object.entries(FIELD_MAP)) {
      if (key in body) update[dbKey] = body[key]
    }
    if (Object.keys(update).length === 0)
      return NextResponse.json({ error: 'no fields' }, { status: 400 })

    // Auto-adjust offsets when salary changes
    if ('salaryGross' in body) {
      const newSalary = Number(body.salaryGross) || 0
      const today     = new Date()
      const months    = [0, 1, 2].map(i => {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
        return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
      })

      // מודל: משכורת של חודש S מקוזזת מול שכ"ל של חודש T = S+1.
      // ניכוי שכ"ל (צד משכורת) מתויג ב-S; קיזוז שכ"ל (צד שכ"ל) ב-T.
      const tuitionMonths = months.map(m => tuitionMonthForSalary(m))

      // Fetch all offset transactions + salary PPs for recent months
      const [{ data: tuitionOffsetTxs }, { data: salaryOffsetTxs }, { data: salaryPPs }] = await Promise.all([
        supabaseAdmin.from('transactions').select('id, amount, month_year')
          .contains('parent_ids', [id]).in('type', ['קיזוז ממשכורת', 'קיזוז שכ"ל']).in('month_year', tuitionMonths),
        supabaseAdmin.from('transactions').select('id, amount, month_year, planned_payment_id')
          .contains('parent_ids', [id]).in('type', ['קיזוז משכר לימוד', 'ניכוי שכ"ל']).in('month_year', months),
        supabaseAdmin.from('planned_payments').select('id, amount, balance, month_year')
          .contains('parent_ids', [id]).eq('pp_type', 'salary').in('month_year', months),
      ])

      for (const my of months) {
        const tuitionMY        = tuitionMonthForSalary(my)
        const tuitionOffsetTx  = (tuitionOffsetTxs ?? []).find(t => t.month_year === tuitionMY)
        const salaryOffsetTx   = (salaryOffsetTxs  ?? []).find(t => t.month_year === my)
        const salaryPP         = (salaryPPs        ?? []).find(p => p.month_year === my)

        // ── Adjust salary PP amount + balance ──────────────────────────────
        if (salaryPP) {
          const oldAmount = Number(salaryPP.amount)
          const amountDelta = newSalary - oldAmount
          if (amountDelta !== 0) {
            await supabaseAdmin.from('planned_payments').update({
              amount:  newSalary,
              balance: Number(salaryPP.balance) + amountDelta,
            }).eq('id', salaryPP.id)
          }
        }

        // ── Adjust offset transactions (both increase and decrease) ──────────
        if (tuitionOffsetTx) {
          const oldOffset = Math.abs(Number(tuitionOffsetTx.amount))

          // Find tuition PP (בחודש השכ"ל T)
          const { data: tuitionPPs } = await supabaseAdmin
            .from('planned_payments').select('id, amount, balance')
            .contains('parent_ids', [id]).eq('month_year', tuitionMY).eq('pp_type', 'tuition').limit(1)
          const tuitionPP = tuitionPPs?.[0]

          // Undo old offset to get real outstanding, then recalculate: min(salary, outstanding)
          const effectiveTuition = tuitionPP
            ? Number(tuitionPP.balance) + oldOffset
            : oldOffset
          const newOffset   = Math.min(newSalary, effectiveTuition)
          const offsetDelta = newOffset - oldOffset  // positive = more offset, negative = less

          if (offsetDelta === 0) continue  // nothing changed

          // Update tuition-side offset tx
          await supabaseAdmin.from('transactions').update({ amount: newOffset }).eq('id', tuitionOffsetTx.id)

          // More offset → tuition balance decreases; less offset → balance increases
          if (tuitionPP) {
            await supabaseAdmin.from('planned_payments')
              .update({ balance: Number(tuitionPP.balance) - offsetDelta })
              .eq('id', tuitionPP.id)
          }

          // Update parent tuition_balance accordingly
          const { data: parentRow } = await supabaseAdmin
            .from('parents').select('tuition_balance').eq('id', id).single()
          if (parentRow) {
            await supabaseAdmin.from('parents')
              .update({ tuition_balance: (Number(parentRow.tuition_balance) || 0) - offsetDelta })
              .eq('id', id)
          }

          // Update salary-side offset tx (more offset → salary PP balance decreases)
          if (salaryOffsetTx) {
            await supabaseAdmin.from('transactions').update({ amount: newOffset }).eq('id', salaryOffsetTx.id)
            const sppId = salaryOffsetTx.planned_payment_id ?? salaryPP?.id
            if (sppId) {
              const { data: spp } = await supabaseAdmin
                .from('planned_payments').select('balance').eq('id', sppId).single()
              if (spp) {
                await supabaseAdmin.from('planned_payments')
                  .update({ balance: Number(spp.balance) - offsetDelta })
                  .eq('id', sppId)
              }
            }
          } else if (salaryPP) {
            // ניכוי שכ"ל was never created — create it and apply the full offset
            await supabaseAdmin.from('transactions').insert({
              id:                 crypto.randomUUID(),
              amount:             newOffset,
              planned_payment_id: salaryPP.id,
              parent_ids:         [id],
              date:               today.toISOString().split('T')[0],
              month_year:         my,
              notes:              `ניכוי שכ"ל ₪${newOffset}`,
              type:               'ניכוי שכ"ל',
              project_ids:        [],
              project_names:      [],
              synced_at:          '2099-12-31T23:59:59.999Z',
            })
            const { data: spp } = await supabaseAdmin
              .from('planned_payments').select('balance').eq('id', salaryPP.id).single()
            if (spp) {
              await supabaseAdmin.from('planned_payments')
                .update({ balance: Number(spp.balance) - newOffset })
                .eq('id', salaryPP.id)
            }
          }
        }
      }
    }

    const { error } = await supabaseAdmin.from('parents').update(update).eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [parentRes, studentsRes, debtsRes, plannedRes, transactionsRes, classesRes, womenRes, standingOrdersRes] =
      await Promise.all([
        supabaseAdmin.from('parents').select('*').eq('id', id).single(),
        supabaseAdmin.from('students').select('*').contains('parent_ids', [id]),
        supabaseAdmin.from('debts').select('*').contains('parent_ids', [id]),
        supabaseAdmin
          .from('planned_payments')
          .select('*')
          .contains('parent_ids', [id])
          .order('date', { ascending: false }),
        supabaseAdmin
          .from('transactions')
          .select('*')
          .contains('parent_ids', [id])
          .order('date', { ascending: false })
          .limit(150),
        supabaseAdmin.from('classes').select('class_name, framework'),
        supabaseAdmin.from('women').select('*').contains('parent_ids', [id]),
        supabaseAdmin
          .from('standing_orders')
          .select('*, linked_parent:linked_parent_id(id, name)')
          .eq('parent_id', id)
          .order('created_at', { ascending: true }),
      ])

    if (parentRes.error) throw parentRes.error

    const p = parentRes.data

    const toArray = (v: unknown): string[] =>
      Array.isArray(v) ? v : (v ? [String(v)] : [])

    const frameMap = Object.fromEntries(
      (classesRes.data ?? []).map(c => [c.class_name, c.framework])
    )

    // ── Calculate tuition dynamically from active students ──────────────────
    const activeStudents = (studentsRes.data ?? []).filter(s => s.status === 'פעיל')
    const activeCount    = activeStudents.length
    const transportTotal = activeStudents.reduce((sum, s) => sum + (Number(s.transportation_cost) || 0), 0)
    const baseTuition    = activeCount === 0 ? 0 : activeCount > 3 ? activeCount * 450 : activeCount * 500
    const computedTuitionTotal = baseTuition + transportTotal

    const storedBalance = Number(p.tuition_balance) || 0
    const storedTotal   = Number(p.tuition_total)   || 0
    const computedBalance = storedTotal === 0
      ? computedTuitionTotal
      : storedBalance + (computedTuitionTotal - storedTotal)

    if (computedTuitionTotal !== storedTotal || activeCount !== (p.children_count ?? 0)) {
      void supabaseAdmin.from('parents').update({
        tuition_total:   computedTuitionTotal,
        tuition_balance: computedBalance,
        children_count:  activeCount,
      }).eq('id', id)
    }
    // ────────────────────────────────────────────────────────────────────────

    return NextResponse.json({
      id: p.id,
      name: p.name ?? '',
      firstName: p.first_name ?? '',
      lastName: p.last_name ?? '',
      motherName: p.mother_name ?? '',
      fatherPhone: p.father_phone ?? '',
      motherPhone: p.mother_phone ?? '',
      email: p.email ?? '',
      address: p.address ?? '',
      building: p.building ?? '',
      city: p.city ?? '',
      status: toArray(p.status),
      childrenCount: activeCount,
      tuitionTotal: computedTuitionTotal,
      tuitionBalance: computedBalance,
      notes: p.notes ?? '',

      // New fields
      idNumber:          p.id_number ?? '',
      nickname:          p.nickname ?? '',
      titleAfter:        p.title_after ?? '',
      benReb:            p.ben_reb ?? '',
      beneficiaryName:   p.beneficiary_name ?? '',
      homePhone:         p.home_phone ?? '',
      role:              Array.isArray(p.role) ? p.role : [],
      synagogue:         p.synagogue ?? '',
      bankName:          p.bank_name ?? '',
      bankBranch:        p.bank_branch ?? null,
      bankAccount:       p.bank_account ?? null,
      chargeDay:         p.charge_day ?? null,
      standingOrderType: p.standing_order_type ?? '',
      standingOrderId:   p.standing_order_id ?? null,
      teacherClassIds:   (p.teacher_class_ids as string[]) ?? [],
      extraPhone:        p.extra_phone ?? '',

      // Salary fields
      baseHourlyRate: p.base_hourly_rate ?? 0,
      seniorityBonusHourly: p.seniority_bonus_hourly ?? 0,
      monthlyHoursDecimal: p.monthly_hours_decimal ?? 0,
      fixedBonus: p.fixed_bonus ?? 0,
      exceptionalExpenses: p.exceptional_expenses ?? 0,
      transportReimbursement: p.transport_reimbursement ?? 0,
      deductTuition: p.deduct_tuition ?? false,
      showSpouseSalary: p.show_spouse_salary ?? false,
      calculateWifeTuition: p.calculate_wife_tuition ?? false,
      salaryGross: p.salary_gross ?? 0,
      salaryNet: p.salary_after_tuition ?? 0,
      ppCredit: (Number(p.pp_credit ?? 0)) + (Number(p.credit_balance ?? 0)),
      birthDate: p.birth_date ?? '',

      women: (womenRes.data ?? []).map(w => ({
        id: w.id,
        name: w.name ?? '',
        baseHourlyRate: w.base_hourly_rate ?? 0,
        monthlyHoursDecimal: w.monthly_hours_decimal ?? 0,
        fixedBonus: w.fixed_bonus ?? 0,
        exceptionalExpenses: w.exceptional_expenses ?? 0,
        salaryGross: w.salary_gross ?? 0,
        isFixedSalary: w.is_fixed_salary ?? false,
        status: w.status ?? '',
        role: toArray(w.role),
        notes: w.notes ?? '',
      })),

      students: (studentsRes.data ?? []).map(s => ({
        id: s.id,
        name: s.name ?? '',
        gender: s.gender ?? '',
        age: s.age ?? '',
        className: s.class_name ?? '',
        classDepartment: s.class_department ?? s.class_name ?? '',
        framework: frameMap[s.class_name ?? ''] ?? '',
        status: s.status ?? '',
        transportation: toArray(s.transportation),
        transportationCost: s.transportation_cost ?? 0,
      })),

      debts: (debtsRes.data ?? []).map(d => ({
        id: d.id,
        amount: d.amount ?? 0,
        createdTime: d.created_time ?? '',
      })),

      plannedPayments: (plannedRes.data ?? []).map(pp => ({
        id: pp.id,
        name: pp.name ?? '',
        ppType: (pp.pp_type ?? (pp.name === 'משכורת' ? 'salary' : 'tuition')) as string,
        amount: pp.amount ?? 0,
        date: pp.date ?? '',
        monthYear: pp.month_year ?? '',
        balance: pp.balance ?? 0,
      })),

      transactions: (transactionsRes.data ?? []).map(tx => ({
        id: tx.id,
        amount: tx.amount ?? 0,
        type: tx.type ?? '',
        date: tx.date ?? '',
        monthYear: tx.month_year ?? '',
        notes: tx.notes ?? '',
        projectNames: (tx.project_names as string[]) ?? [],
        plannedPaymentId: tx.planned_payment_id ?? null,
        standingOrderId: tx.standing_order_id ?? null,
      })),

      standingOrders: (standingOrdersRes.data ?? []).map(so => ({
        id:                so.id,
        externalId:        so.external_id ?? '',
        standingOrderType: so.standing_order_type ?? '',
        bankName:          so.bank_name ?? '',
        bankBranch:        so.bank_branch ?? '',
        bankAccount:       so.bank_account ?? '',
        chargeDay:         so.charge_day ?? null,
        chargeAmount:      so.charge_amount ?? null,
        soStatus:          so.so_status ?? 'פעיל',
        cardLast4:         so.card_last4 ?? '',
        cardExpiry:        so.card_expiry ?? '',
        cardType:          so.card_type ?? '',
        cardHolderName:    so.card_holder_name ?? '',
        creditBalance:     so.credit_balance ?? null,
        linkedParentId:    so.linked_parent_id ?? null,
        linkedParentName:  (so.linked_parent as { name?: string } | null)?.name ?? null,
        projectName:       so.project_name ?? '',
        notes:             so.notes ?? '',
        createdAt:         so.created_at ?? '',
      })),
    })
  } catch (err) {
    console.error('parent detail error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת פרטי הורה' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const { deleteTransactions = false, deletePlannedPayments = false, deleteStandingOrders = false } = body

    if (deleteTransactions) {
      await supabaseAdmin.from('transactions').delete().contains('parent_ids', [id])
    }
    if (deletePlannedPayments) {
      // First unlink transactions linked to these PPs
      const { data: pps } = await supabaseAdmin.from('planned_payments').select('id').contains('parent_ids', [id])
      const ppIds = (pps ?? []).map(p => p.id as string)
      if (ppIds.length > 0 && !deleteTransactions) {
        await supabaseAdmin.from('transactions').update({ planned_payment_id: null }).in('planned_payment_id', ppIds)
      }
      await supabaseAdmin.from('planned_payments').delete().contains('parent_ids', [id])
    }
    if (deleteStandingOrders) {
      await supabaseAdmin.from('standing_orders').delete().eq('parent_id', id)
    }

    // Remove parent_id from students (don't delete students)
    const { data: students } = await supabaseAdmin.from('students').select('id, parent_ids').contains('parent_ids', [id])
    for (const s of students ?? []) {
      const newIds = ((s.parent_ids as string[]) ?? []).filter((pid: string) => pid !== id)
      await supabaseAdmin.from('students').update({ parent_ids: newIds }).eq('id', s.id)
    }

    // Delete the parent
    const { error } = await supabaseAdmin.from('parents').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
