import { NextResponse } from 'next/server'
import { fetchAirtableRecords, TABLES, P } from '@/lib/airtable'

export async function GET() {
  try {
    const records = await fetchAirtableRecords(TABLES.PARENTS, {
      fields: [
        P.NAME, P.FIRST_NAME, P.LAST_NAME, P.FATHER_PHONE, P.MOTHER_PHONE,
        P.EMAIL, P.CITY, P.STATUS, P.CHILDREN_COUNT,
        P.TUITION_TOTAL, P.TUITION_BALANCE,
      ],
      sort: [{ field: P.LAST_NAME, direction: 'asc' }],
    })

    const parents = records
      .filter(r => r.fields[P.NAME]) // skip blank records
      .map(r => ({
        id: r.id,
        name: String(r.fields[P.NAME] || ''),
        firstName: String(r.fields[P.FIRST_NAME] || ''),
        lastName: String(r.fields[P.LAST_NAME] || ''),
        fatherPhone: String(r.fields[P.FATHER_PHONE] || ''),
        motherPhone: String(r.fields[P.MOTHER_PHONE] || ''),
        email: String(r.fields[P.EMAIL] || ''),
        city: String(r.fields[P.CITY] || ''),
        status: (r.fields[P.STATUS] as string[]) || [],
        childrenCount: Number(r.fields[P.CHILDREN_COUNT]) || 0,
        tuitionTotal: Number(r.fields[P.TUITION_TOTAL]) || 0,
        tuitionBalance: Number(r.fields[P.TUITION_BALANCE]) || 0,
      }))

    return NextResponse.json(parents)
  } catch (err) {
    console.error('parents error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת הורים' }, { status: 500 })
  }
}
