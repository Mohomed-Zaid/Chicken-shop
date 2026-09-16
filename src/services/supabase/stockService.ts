import { listRows, upsertRows } from './clientHelpers'
export const getStockMovements = () => listRows('stock_movements')
export const saveStockMovements = (rows: Record<string, unknown>[]) => upsertRows('stock_movements', rows)
