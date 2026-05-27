import { BASE_ID, API_KEY, TABLES, P, S, T, PP } from './airtable'

const BASE_URL = 'https://api.airtable.com/v0'

async function createRecord(tableId: string, fields: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE_URL}/${BASE_ID}/${tableId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Airtable create (${tableId}): ${res.status} ${text}`)
  }
  const data = await res.json()
  return data.id as string
}

export interface CreateParentInput {
  firstName: string; lastName: string; motherName?: string
  fatherPhone?: string; motherPhone?: string; email?: string
  address?: string; building?: string; city?: string
  status?: string[]; notes?: string
}

export async function createParentInAirtable(input: CreateParentInput): Promise<string> {
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(' ')
  const fields: Record<string, unknown> = {
    [P.NAME]: fullName,
    [P.FIRST_NAME]: input.firstName,
    [P.LAST_NAME]: input.lastName,
  }
  if (input.motherName)  fields[P.MOTHER_NAME]  = input.motherName
  if (input.fatherPhone) fields[P.FATHER_PHONE] = input.fatherPhone
  if (input.motherPhone) fields[P.MOTHER_PHONE] = input.motherPhone
  if (input.email)       fields[P.EMAIL]        = input.email
  if (input.address)     fields[P.ADDRESS]      = input.address
  if (input.building)    fields[P.BUILDING]     = input.building
  if (input.city)        fields[P.CITY]         = input.city
  if (input.status?.length) fields[P.STATUS]    = input.status
  if (input.notes)       fields[P.NOTES]        = input.notes
  return createRecord(TABLES.PARENTS, fields)
}

export interface CreateStudentInput {
  firstName: string; lastName: string; gender?: string
  age?: string; className?: string; status?: string
  transportation?: string[]; transportationCost?: number; parentIds?: string[]
}

export async function createStudentInAirtable(input: CreateStudentInput): Promise<string> {
  const fields: Record<string, unknown> = {
    [S.NAME]: [input.firstName, input.lastName].filter(Boolean).join(' '),
  }
  if (input.gender)       fields[S.GENDER]            = input.gender
  if (input.age)          fields[S.AGE]               = input.age
  if (input.className)    fields[S.CLASS_NAME_TEXT]   = input.className
  if (input.status)       fields[S.STATUS]            = input.status
  if (input.transportation?.length) fields[S.TRANSPORTATION] = input.transportation
  if (input.transportationCost)     fields[S.TRANSPORTATION_COST] = input.transportationCost
  if (input.parentIds?.length)      fields[S.PARENT]  = input.parentIds
  return createRecord(TABLES.STUDENTS, fields)
}

export interface CreateTransactionInput {
  amount: number; type?: string; date?: string
  monthYear?: string; notes?: string; parentIds?: string[]
}

export async function createTransactionInAirtable(input: CreateTransactionInput): Promise<string> {
  const fields: Record<string, unknown> = { [T.AMOUNT]: input.amount }
  if (input.type)           fields[T.TYPE]       = input.type
  if (input.date)           fields[T.DATE]       = input.date
  if (input.monthYear)      fields[T.MONTH_YEAR] = input.monthYear
  if (input.notes)          fields[T.NOTES]      = input.notes
  if (input.parentIds?.length) fields[T.PARENT]  = input.parentIds
  return createRecord(TABLES.TRANSACTIONS, fields)
}

export interface CreatePlannedPaymentInput {
  amount: number; name?: string; date?: string
  monthYear?: string; parentIds?: string[]
}

export async function createPlannedPaymentInAirtable(input: CreatePlannedPaymentInput): Promise<string> {
  const fields: Record<string, unknown> = { [PP.AMOUNT]: input.amount }
  if (input.name)           fields[PP.NAME]       = input.name
  if (input.date)           fields[PP.DATE]       = input.date
  if (input.monthYear)      fields[PP.MONTH_YEAR] = input.monthYear
  if (input.parentIds?.length) fields[PP.PARENT]  = input.parentIds
  return createRecord(TABLES.PLANNED_PAYMENTS, fields)
}
