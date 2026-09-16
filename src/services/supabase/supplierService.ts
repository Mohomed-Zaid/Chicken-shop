import { listRows, upsertRows } from './clientHelpers'
export const getSuppliers = () => listRows('suppliers')
export const getSupplierPayments = () => listRows('supplier_payments')
export const saveSuppliers = (rows: Record<string, unknown>[]) => upsertRows('suppliers', rows)
export const saveSupplierPayments = (rows: Record<string, unknown>[]) => upsertRows('supplier_payments', rows)
