'use client'

import { useCallback, useEffect, useState } from 'react'
import { ParentSummary, SortField, FilterDebt } from '@/lib/types'
import ParentList from '@/components/ParentList'
import EmployeeCard from '@/components/EmployeeCard'
import StudentCard from '@/components/StudentCard'
import PaymentCard from '@/components/PaymentCard'

export default function ParentsPage() {
  const [parents, setParents]           = useState<ParentSummary[]>([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(0)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDebt, setFilterDebt]     = useState<FilterDebt>('all')
  const [sortField, setSortField]       = useState<SortField>('last_name')
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('asc')
  const [selectedId, setSelectedId]         = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')

  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const loadParents = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page), search: debouncedSearch,
      status: filterStatus, debt: filterDebt,
      sort: sortField, dir: sortDir,
    })
    fetch(`/api/parents?${params}`)
      .then(r => r.json())
      .then(d => { if (d.error) { setError(d.error); return }; setParents(d.data ?? []); setTotal(d.total ?? 0) })
      .catch(() => setError('שגיאה בטעינת הורים'))
      .finally(() => setLoading(false))
  }, [page, debouncedSearch, filterStatus, filterDebt, sortField, sortDir])

  useEffect(() => { loadParents() }, [loadParents])

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
    setPage(0)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">{loading ? 'טוען...' : `${total} אנ"ש`}</span>
        <h2 className="text-2xl font-bold text-gray-800">רשימת אנ&quot;ש</h2>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <button onClick={loadParents} className="text-red-600 underline text-xs">נסה שוב</button>
          <span>{error}</span>
        </div>
      )}

      {loading && parents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="space-y-3 animate-pulse">
            {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
          </div>
        </div>
      ) : (
        <ParentList
          parents={parents} total={total} page={page}
          totalPages={Math.ceil(total / 50)} loading={loading}
          search={search} filterStatus={filterStatus} filterDebt={filterDebt}
          sortField={sortField} sortDir={sortDir}
          onSelectParent={setSelectedId}
          onSearch={v => { setSearch(v); setPage(0) }}
          onFilterStatus={v => { setFilterStatus(v); setPage(0) }}
          onFilterDebt={v => { setFilterDebt(v); setPage(0) }}
          onSort={handleSort}
          onPageChange={setPage}
        />
      )}

      {selectedId && (
        <EmployeeCard
          parentId={selectedId}
          onClose={() => setSelectedId(null)}
          onOpenStudent={id => { setSelectedId(null); setSelectedStudentId(id) }}
          onOpenPayment={id => { setSelectedId(null); setSelectedPaymentId(id) }}
        />
      )}
      {selectedStudentId && (
        <StudentCard studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)}
          onOpenParent={id => { setSelectedStudentId(null); setSelectedId(id) }} />
      )}
      {selectedPaymentId && (
        <PaymentCard paymentId={selectedPaymentId} onClose={() => setSelectedPaymentId(null)}
          onOpenParent={id => { setSelectedPaymentId(null); setSelectedId(id) }} />
      )}
    </div>
  )
}
