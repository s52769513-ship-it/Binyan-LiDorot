// Shared transport (הסעות) logic. A student's transport legs drive a monthly
// cost that is added onto tuition (see lib/recalcTuition.ts).
//
// Canonical leg labels — what the checkboxes in the UI write:
export const TRANSPORT_OPTIONS = ['הלוך', 'חזור שעה 1', 'חזור שעה 4'] as const

// Legacy data (from the old import / Airtable sync) stored legs as bare "1"
// tokens instead of these labels, which broke both the checkboxes and the cost
// calc (cost stayed 0, so it never reached the monthly amount). normalizeTransport
// maps whatever is stored onto the canonical labels:
//   - values already canonical  → kept as-is
//   - N bare tokens ("1", …)    → mapped by count (1 leg = הלוך, 2 = +חזור, 3 = both חזור)
// The two חזור variants can't be told apart from bare tokens, so a 2-leg legacy
// record defaults its return to "חזור שעה 1"; the cost is identical either way.
export function normalizeTransport(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw.map(v => String(v).trim()) : []
  const canonical = arr.filter(v => (TRANSPORT_OPTIONS as readonly string[]).includes(v))
  if (canonical.length) return [...new Set(canonical)]

  const legs = arr.filter(v => v && v !== '0').length
  if (legs <= 0) return []
  if (legs === 1) return ['הלוך']
  if (legs === 2) return ['הלוך', 'חזור שעה 1']
  return ['הלוך', 'חזור שעה 1', 'חזור שעה 4']
}

export function calcTransportCost(raw: unknown): number {
  const t = normalizeTransport(raw)
  if (!t.includes('הלוך')) return 0
  return (t.includes('חזור שעה 1') || t.includes('חזור שעה 4')) ? 130 : 65
}
