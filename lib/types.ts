export interface ParentSummary {
  id: string
  name: string
  firstName: string
  lastName: string
  fatherPhone: string
  motherPhone: string
  email: string
  city: string
  status: string[]
  childrenCount: number
  tuitionTotal: number
  tuitionBalance: number
}

export interface StudentDetail {
  id: string
  name: string
  gender: string
  age: string | number
  className: string
  classDepartment: string   // formula: "כיתה X – אגף Y"
  framework: string
  status: string
  transportation: string[]
  transportationCost: number
}

export interface TransactionItem {
  id: string
  amount: number
  type: string
  date: string
  monthYear: string
  notes: string
  projectNames: string[]
  plannedPaymentId?: string | null
}

export interface DebtItem {
  id: string
  amount: number
  createdTime: string
}

export interface PlannedPaymentItem {
  id: string
  name: string
  ppType: 'tuition' | 'salary' | string
  amount: number
  date: string
  monthYear: string
  balance: number
}

export interface WomanDetail {
  id: string
  name: string
  baseHourlyRate: number
  monthlyHoursDecimal: number
  fixedBonus: number
  exceptionalExpenses: number
  salaryGross: number
  isFixedSalary: boolean
  status: string
  role: string[]
  notes: string
}

export interface ParentDetail extends ParentSummary {
  motherName: string
  address: string
  building: string
  notes: string
  students: StudentDetail[]
  debts: DebtItem[]
  plannedPayments: PlannedPaymentItem[]
  transactions: TransactionItem[]
  // New personal/banking fields
  idNumber: string
  nickname: string
  titleAfter: string
  benReb: string
  beneficiaryName: string
  homePhone: string
  role: string[]
  synagogue: string
  bankName: string
  bankBranch: number | null
  bankAccount: number | null
  chargeDay: number | null
  standingOrderType: string
  standingOrderId: number | null
  teacherClassIds: string[]
  extraPhone: string
  // Salary fields
  baseHourlyRate: number
  seniorityBonusHourly: number
  monthlyHoursDecimal: number
  fixedBonus: number
  exceptionalExpenses: number
  transportReimbursement: number
  deductTuition: boolean
  showSpouseSalary: boolean
  calculateWifeTuition: boolean
  salaryGross: number
  salaryNet: number
  ppCredit: number
  birthDate: string
  women: WomanDetail[]
}

export interface MonthlyStat {
  month: string
  amount: number
}

export interface DashboardSummary {
  totalDebts: number
  totalPlannedPayments: number
  currentMonthTransactions: number
  monthlyData: MonthlyStat[]
  lastSync?: string | null
}

export type SortField = 'last_name' | 'city' | 'children_count' | 'tuition_total' | 'tuition_balance'
export type FilterDebt = 'all' | 'debt' | 'credit'

export interface SyncResult {
  success: boolean
  syncedAt: string
  counts: {
    parents: number
    students: number
    transactions: number
    debts: number
    plannedPayments: number
  }
  error?: string
}
