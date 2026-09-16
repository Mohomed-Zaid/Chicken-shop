import { listRows, upsertRows } from './clientHelpers'
export const getExpenses = () => listRows('expenses')
export const saveExpenses = (rows: Record<string, unknown>[]) => upsertRows('expenses', rows)
