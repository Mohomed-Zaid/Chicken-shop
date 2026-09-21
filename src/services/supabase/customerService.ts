import { listRows, upsertRows } from './clientHelpers'
import type { Customer, CustomerPayment } from '../../data/customers'

export const getCustomers = () => listRows<CustomerRow>('customers')
export const getCustomerPayments = () => listRows<CustomerPaymentRow>('customer_payments')
export const saveCustomers = (rows: Record<string, unknown>[]) => upsertRows('customers', rows)
export const saveCustomerPayments = (rows: Record<string, unknown>[]) => upsertRows('customer_payments', rows)

export interface CustomerRow {
  id: string
  name: string
  phone?: string | null
  address?: string | null
  credit_limit?: number | null
  opening_balance?: number | null
  active?: boolean | null
  created_at?: string
  updated_at?: string
}

export interface CustomerPaymentRow {
  id: string
  payment_number?: string | null
  customer_id: string
  customer_name?: string | null
  payment_date: string
  payment_time?: string | null
  amount: number
  payment_method?: string | null
  notes?: string | null
  created_by_user_id?: string | null
  created_at?: string
}

export async function fetchCustomersFromSupabase(): Promise<Customer[]> {
  try {
    const rows = await getCustomers()
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone || '',
      address: r.address || '',
      creditLimit: Number(r.credit_limit || 0),
      openingBalance: Number(r.opening_balance || 0),
      active: r.active ?? true,
      createdAt: r.created_at || new Date().toISOString(),
      updatedAt: r.updated_at || new Date().toISOString(),
    }))
  } catch (err) {
    console.error('Failed to fetch customers from Supabase:', err)
    return []
  }
}

export async function fetchCustomerPaymentsFromSupabase(): Promise<CustomerPayment[]> {
  try {
    const rows = await getCustomerPayments()
    return rows.map(r => ({
      id: r.id,
      paymentNumber: r.payment_number || `PAY-${r.id.slice(0, 6)}`,
      customerId: r.customer_id,
      customerName: r.customer_name || '',
      date: r.payment_date,
      time: r.payment_time || '00:00:00',
      amount: Number(r.amount || 0),
      paymentMethod: (r.payment_method as 'Cash' | 'Card' | 'Other') || 'Cash',
      notes: r.notes || '',
      createdAt: r.created_at,
    }))
  } catch (err) {
    console.error('Failed to fetch customer payments from Supabase:', err)
    return []
  }
}

export async function syncCustomerToSupabase(customer: Customer): Promise<void> {
  await upsertRows('customers', [
    {
      id: customer.id,
      name: customer.name,
      phone: customer.phone || null,
      address: customer.address || null,
      credit_limit: customer.creditLimit ?? 0,
      opening_balance: customer.openingBalance ?? 0,
      active: customer.active,
      created_at: customer.createdAt,
      updated_at: customer.updatedAt,
    },
  ])
}

export async function syncCustomerPaymentToSupabase(payment: CustomerPayment): Promise<void> {
  await upsertRows('customer_payments', [
    {
      id: payment.id,
      payment_number: payment.paymentNumber,
      customer_id: payment.customerId,
      customer_name: payment.customerName || null,
      payment_date: payment.date,
      payment_time: payment.time,
      amount: payment.amount,
      payment_method: payment.paymentMethod,
      notes: payment.notes || null,
    },
  ])
}
