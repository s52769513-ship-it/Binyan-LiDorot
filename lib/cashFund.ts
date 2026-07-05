// Category that marks a transaction as part of the cash-fund swap flow (bank
// transfer to a person who returns the equivalent in physical cash) — such
// transactions must be excluded from every income/expense dashboard, since
// no real money was gained or spent, only its form changed.
export const CASH_FUND_PROJECT = 'מזומנים'

export function isCashFundTransaction(projectNames: string[] | null | undefined): boolean {
  return (projectNames ?? []).includes(CASH_FUND_PROJECT)
}
