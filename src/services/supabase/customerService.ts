import { listRows, upsertRows } from './clientHelpers'
export const getCustomers = () => listRows('customers')
export const getCustomerPayments = () => listRows('customer_payments')
export const saveCustomers = (rows: Record<string, unknown>[]) => upsertRows('customers', rows)
export const saveCustomerPayments = (rows: Record<string, unknown>[]) => upsertRows('customer_payments', rows)
