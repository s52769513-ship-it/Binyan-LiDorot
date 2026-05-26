const BASE_URL = 'https://api.airtable.com/v0'
export const BASE_ID = process.env.AIRTABLE_BASE_ID!
export const API_KEY = process.env.AIRTABLE_API_KEY!

export const TABLES = {
  PARENTS: 'tblLUe8hRdvpejO9W',
  STUDENTS: 'tblgMvJzj8N9K8HRY',
  CLASSES: 'tblrc5CSfJiUCwIaK',
  TRANSACTIONS: 'tblcBmmWAe15NQjc3',
  SALARIES: 'tbl1wapC7DquFGuyy',
  PLANNED_PAYMENTS: 'tblM32gMmdJePBohJ',
  DEBTS: 'tbl9Si2hlAgEn0IFl',
  PROJECTS: 'tblZXTI3fMyW8C7Kj',
} as const

// Parent field IDs (tblLUe8hRdvpejO9W)
export const P = {
  NAME: 'fldqhIO3ADtcRUT7K',
  FIRST_NAME: 'fldE9HDGoybl039Wy',
  LAST_NAME: 'fldgqocod1Ab7vq3N',
  MOTHER_NAME: 'fldYkaR9YTyKE8nBh',
  FATHER_PHONE: 'fldzDBU35KyATeyac',
  MOTHER_PHONE: 'fldkwvRdJ2iAsYN6t',
  EMAIL: 'fldkiC29bCTDjMxlO',
  ADDRESS: 'fldPH3mXpjGFOdcyL',
  BUILDING: 'fldOPcSOUFWSpPaFI',
  CITY: 'fldjx0HD4GK6MIru3',
  STATUS: 'fldVYF0MsPONMLFqP',
  CHILDREN_COUNT: 'fldedXEJGfZ9l3Bex',
  TUITION_TOTAL: 'fldlotqovcq2qbiWU',
  TUITION_BALANCE: 'fldXCcFFSKOPE83AM',
  STUDENTS: 'fldAdSgOawhdkLdD9',
  DEBTS: 'fldD25LYefNeyVwQZ',
  PLANNED_PAYMENTS: 'fldnhdSjF4vJAX7GA',
  TRANSACTIONS: 'fldFJTh2tejd873up',
  NOTES: 'fldU4U061RDOmHJCJ',
} as const

// Student field IDs (tblgMvJzj8N9K8HRY)
export const S = {
  NAME: 'fldT0uIGjj7vIa3pP',
  GENDER: 'fld2avAGb9rwWl0vO',
  AGE: 'fldtUE1ey7AEECMKY',
  PARENT: 'fldEhJttpVYxEx5hm',
  CLASS_NAME_TEXT: 'fldEHRxiaPRzPdPun',
  STATUS: 'fldiEerXKAj5LlYv0',
  TRANSPORTATION: 'fldK2JuPs7ynLgINU',
  TRANSPORTATION_COST: 'fldj8Ns4LXRpCGe8o',
} as const

// Transaction field IDs (tblcBmmWAe15NQjc3)
export const T = {
  PARENT: 'flduygHbWfcTKCbFf',
  AMOUNT: 'fldDvtENIcW20GOcn',
  TYPE: 'fldwbIMWZieHZXhI6',
  DATE: 'fldsYlOVDOqFZLaLr',
  MONTH_YEAR: 'fldlGKB8pxQAG6p80',
  NOTES: 'fldQI8U3awTKD2sq6',
  PROJECT: 'fldZz08GumXFewrKa',
} as const

// Project field IDs (tblZXTI3fMyW8C7Kj)
export const PROJ = {
  NAME: 'fldzy5ydrMfDTvaGQ',
} as const

// Debt field IDs (tbl9Si2hlAgEn0IFl)
export const D = {
  PARENT: 'fldMBwsM7B8zs0M4J',
  AMOUNT: 'fldpvzocrbqKftfsA',
} as const

// Planned payment field IDs (tblM32gMmdJePBohJ)
export const PP = {
  NAME: 'fldmakQ2TT1ixDiB5',
  AMOUNT: 'fldwahhQ5dULhJ9xm',
  DATE: 'fldGCfMOAv6Ei4tmn',
  PARENT: 'fldWxiXVEjT0E9mOF',
  BALANCE: 'fldHrfV6mvI8gpHxg',
  MONTH_YEAR: 'fldC0iUgWbWrR9pKK',
} as const

export interface AirtableRecord {
  id: string
  fields: Record<string, unknown>
  createdTime: string
}

interface AirtableResponse {
  records: AirtableRecord[]
  offset?: string
}

type AirtableParams = {
  fields?: string[]
  filterByFormula?: string
  maxRecords?: number
  sort?: { field: string; direction?: 'asc' | 'desc' }[]
}

export async function fetchAirtableRecords(
  tableId: string,
  params: AirtableParams = {}
): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const url = new URL(`${BASE_URL}/${BASE_ID}/${tableId}`)
    url.searchParams.set('returnFieldsByFieldId', 'true')

    if (params.fields) {
      params.fields.forEach(f => url.searchParams.append('fields[]', f))
    }
    if (params.filterByFormula) {
      url.searchParams.set('filterByFormula', params.filterByFormula)
    }
    if (params.maxRecords) {
      url.searchParams.set('maxRecords', String(params.maxRecords))
    }
    if (params.sort) {
      params.sort.forEach((s, i) => {
        url.searchParams.set(`sort[${i}][field]`, s.field)
        url.searchParams.set(`sort[${i}][direction]`, s.direction || 'asc')
      })
    }
    if (offset) {
      url.searchParams.set('offset', offset)
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${API_KEY}` },
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Airtable ${res.status}: ${errText}`)
    }

    const data: AirtableResponse = await res.json()
    records.push(...data.records)
    offset = data.offset
  } while (offset)

  return records
}

export async function fetchAirtableRecord(
  tableId: string,
  recordId: string
): Promise<AirtableRecord> {
  const url = `${BASE_URL}/${BASE_ID}/${tableId}/${recordId}?returnFieldsByFieldId=true`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    next: { revalidate: 60 },
  })
  if (!res.ok) throw new Error(`Airtable ${res.status}`)
  return res.json()
}
