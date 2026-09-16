import { listRows, upsertRows } from './clientHelpers'
export const getPurchases = () => listRows('purchases')
export const getPurchaseItems = () => listRows('purchase_items')
export const savePurchases = (rows: Record<string, unknown>[]) => upsertRows('purchases', rows)
export const savePurchaseItems = (rows: Record<string, unknown>[]) => upsertRows('purchase_items', rows)
