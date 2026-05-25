import { NextResponse } from 'next/server'
import { fetchAirtableRecord, fetchAirtableRecords, TABLES, P, S, T, D, PP } from '@/lib/airtable'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const parent = await fetchAirtableRecord(TABLES.PARENTS, id)

    const [students, debts, plannedPayments, transactions] = await Promise.all([
      fetchAirtableRecords(TABLES.STUDENTS, {
        fields: [S.NAME, S.GENDER, S.AGE, S.CLASS_NAME_TEXT, S.STATUS, S.TRANSPORTATION, S.TRANSPORTATION_COST],
        filterByFormula: `FIND('${id}', ARRAYJOIN({${S.PARENT}}))`,
      }),

      fetchAirtableRecords(TABLES.DEBTS, {
        fields: [D.AMOUNT],
        filterByFormula: `FIND('${id}', ARRAYJOIN({${D.PARENT}}))`,
      }),

      fetchAirtableRecords(TABLES.PLANNED_PAYMENTS, {
        fields: [PP.NAME, PP.AMOUNT, PP.DATE, PP.MONTH_YEAR, PP.BALANCE],
        filterByFormula: `FIND('${id}', ARRAYJOIN({${PP.PARENT}}))`,
        sort: [{ field: PP.DATE, direction: 'desc' }],
      }),

      fetchAirtableRecords(TABLES.TRANSACTIONS, {
        fields: [T.AMOUNT, T.TYPE, T.DATE, T.NOTES],
        filterByFormula: `FIND('${id}', ARRAYJOIN({${T.PARENT}}))`,
        sort: [{ field: T.DATE, direction: 'desc' }],
        maxRecords: 30,
      }),
    ])

    return NextResponse.json({
      id: parent.id,
      name: String(parent.fields[P.NAME] || ''),
      firstName: String(parent.fields[P.FIRST_NAME] || ''),
      lastName: String(parent.fields[P.LAST_NAME] || ''),
      motherName: String(parent.fields[P.MOTHER_NAME] || ''),
      fatherPhone: String(parent.fields[P.FATHER_PHONE] || ''),
      motherPhone: String(parent.fields[P.MOTHER_PHONE] || ''),
      email: String(parent.fields[P.EMAIL] || ''),
      address: String(parent.fields[P.ADDRESS] || ''),
      building: String(parent.fields[P.BUILDING] || ''),
      city: String(parent.fields[P.CITY] || ''),
      status: (parent.fields[P.STATUS] as string[]) || [],
      childrenCount: Number(parent.fields[P.CHILDREN_COUNT]) || 0,
      tuitionTotal: Number(parent.fields[P.TUITION_TOTAL]) || 0,
      tuitionBalance: Number(parent.fields[P.TUITION_BALANCE]) || 0,
      notes: String(parent.fields[P.NOTES] || ''),

      students: students.map(r => ({
        id: r.id,
        name: String(r.fields[S.NAME] || ''),
        gender: String(r.fields[S.GENDER] || ''),
        age: r.fields[S.AGE],
        className: String(r.fields[S.CLASS_NAME_TEXT] || ''),
        status: String(r.fields[S.STATUS] || ''),
        transportation: (r.fields[S.TRANSPORTATION] as string[]) || [],
        transportationCost: Number(r.fields[S.TRANSPORTATION_COST]) || 0,
      })),

      debts: debts.map(r => ({
        id: r.id,
        amount: Number(r.fields[D.AMOUNT]) || 0,
        createdTime: r.createdTime,
      })),

      plannedPayments: plannedPayments.map(r => ({
        id: r.id,
        name: String(r.fields[PP.NAME] || ''),
        amount: Number(r.fields[PP.AMOUNT]) || 0,
        date: String(r.fields[PP.DATE] || ''),
        monthYear: String(r.fields[PP.MONTH_YEAR] || ''),
        balance: Number(r.fields[PP.BALANCE]) || 0,
      })),

      transactions: transactions.map(r => ({
        id: r.id,
        amount: Number(r.fields[T.AMOUNT]) || 0,
        type: String(r.fields[T.TYPE] || ''),
        date: String(r.fields[T.DATE] || ''),
        notes: String(r.fields[T.NOTES] || ''),
      })),
    })
  } catch (err) {
    console.error('parent detail error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת פרטי הורה' }, { status: 500 })
  }
}
