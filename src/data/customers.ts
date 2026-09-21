import { salesStore, type Sale } from './records'

export interface Customer {
  id: string
  name: string
  phone: string
  address?: string
  creditLimit?: number
  openingBalance?: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export type CustomerPaymentMethod = 'Cash' | 'Card' | 'Other'

export interface CustomerPayment {
  id: string
  paymentNumber: string // e.g. PAY-000001
  customerId: string
  customerName?: string
  date: string // YYYY-MM-DD
  time: string // HH:MM:SS
  amount: number
  paymentMethod: CustomerPaymentMethod
  notes?: string
  createdBy?: string
  createdAt?: string
}

export type CustomerStatus = 'DUE' | 'PARTIALLY PAID' | 'PAID' | 'NO DUES'

const keys = {
  customers: 'customers',
  payments: 'customer-payments',
  sequence: 'customer-payment-sequence',
}

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const notifyCustomerChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('customers_updated'))
  }
}

export const customerStore = {
  getCustomers: (): Customer[] => {
    const list = read<Customer[]>(keys.customers, [])
    return list.sort((a, b) => a.name.localeCompare(b.name))
  },

  getCustomerById: (id: string): Customer | undefined => {
    return customerStore.getCustomers().find(c => c.id === id)
  },

  getCustomerByName: (name: string): Customer | undefined => {
    const clean = name.trim().toLowerCase()
    return customerStore.getCustomers().find(c => c.name.trim().toLowerCase() === clean)
  },

  saveCustomer: (customer: Customer): void => {
    const current = customerStore.getCustomers()
    const updated = [customer, ...current.filter(c => c.id !== customer.id)]
    localStorage.setItem(keys.customers, JSON.stringify(updated))
    notifyCustomerChange()
  },

  updateCustomer: (customer: Customer): void => {
    const current = customerStore.getCustomers()
    const updated = current.map(c => (c.id === customer.id ? customer : c))
    localStorage.setItem(keys.customers, JSON.stringify(updated))
    notifyCustomerChange()
  },

  deactivateCustomer: (id: string): void => {
    const target = customerStore.getCustomerById(id)
    if (target) {
      customerStore.updateCustomer({
        ...target,
        active: false,
        updatedAt: new Date().toISOString(),
      })
    }
  },

  deleteCustomer: (id: string): void => {
    const current = customerStore.getCustomers()
    const updated = current.filter(c => c.id !== id)
    localStorage.setItem(keys.customers, JSON.stringify(updated))
    notifyCustomerChange()
  },

  setCustomers: (customers: Customer[]): void => {
    localStorage.setItem(keys.customers, JSON.stringify(customers))
    notifyCustomerChange()
  },
}

export const customerPaymentStore = {
  getCustomerPayments: (): CustomerPayment[] => {
    const list = read<CustomerPayment[]>(keys.payments, [])
    return list.sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time || '00:00:00'}`).getTime()
      const dateB = new Date(`${b.date} ${b.time || '00:00:00'}`).getTime()
      return dateB - dateA
    })
  },

  getPaymentsByCustomerId: (customerId: string): CustomerPayment[] => {
    return customerPaymentStore.getCustomerPayments().filter(p => p.customerId === customerId)
  },

  peekNextPaymentNumber: (): string => {
    const seq = Number(localStorage.getItem(keys.sequence) || '0')
    const existing = customerPaymentStore.getCustomerPayments()
    let max = seq
    for (const p of existing) {
      const num = parseInt(p.paymentNumber?.replace(/[^0-9]/g, '') || '0', 10)
      if (num > max) max = num
    }
    return `PAY-${String(max + 1).padStart(6, '0')}`
  },

  getNextPaymentNumber: (): string => {
    const nextStr = customerPaymentStore.peekNextPaymentNumber()
    const num = parseInt(nextStr.replace(/[^0-9]/g, ''), 10)
    localStorage.setItem(keys.sequence, String(num))
    return nextStr
  },

  saveCustomerPayment: (payment: CustomerPayment): void => {
    const current = customerPaymentStore.getCustomerPayments()
    const updated = [payment, ...current.filter(p => p.id !== payment.id)]
    localStorage.setItem(keys.payments, JSON.stringify(updated))
    notifyCustomerChange()
  },

  setCustomerPayments: (payments: CustomerPayment[]): void => {
    localStorage.setItem(keys.payments, JSON.stringify(payments))
    notifyCustomerChange()
  },
}

/**
 * Total sales made on credit for a specific customer.
 */
export const getCustomerCreditSalesList = (customerId: string): Sale[] => {
  const customer = customerStore.getCustomerById(customerId)
  const custNameClean = customer?.name?.trim().toLowerCase()
  return salesStore.getSales().filter(sale => {
    if (sale.status !== 'completed' || sale.paymentMethod !== 'Credit') return false
    if (sale.customerId === customerId) return true
    if (custNameClean && sale.customerName?.trim().toLowerCase() === custNameClean) return true
    return false
  })
}

export const getCustomerCreditSales = (customerId: string): number => {
  const sales = getCustomerCreditSalesList(customerId)
  return sales.reduce((sum, s) => sum + Number(s.total || 0), 0)
}

/**
 * Total payments received from this customer.
 */
export const getCustomerPaymentsTotal = (customerId: string): number => {
  const payments = customerPaymentStore.getPaymentsByCustomerId(customerId)
  return payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
}

/**
 * Outstanding balance: Credit Sales - Customer Payments (+ Opening Balance)
 */
export const getCustomerOutstanding = (customerId: string): number => {
  const customer = customerStore.getCustomerById(customerId)
  const opening = Number(customer?.openingBalance || 0)
  const creditSales = getCustomerCreditSales(customerId)
  const payments = getCustomerPaymentsTotal(customerId)
  return Math.max(0, opening + creditSales - payments)
}

/**
 * Customer status:
 * - 'NO DUES': Never had any credit sales or opening balance
 * - 'DUE': Had credit sales, 0 payments made
 * - 'PARTIALLY PAID': Had payments made, but outstanding > 0
 * - 'PAID': Outstanding is 0, and has had credit sales or opening balance
 */
export const getCustomerStatus = (customerId: string): CustomerStatus => {
  const customer = customerStore.getCustomerById(customerId)
  const opening = Number(customer?.openingBalance || 0)
  const creditSales = getCustomerCreditSales(customerId)
  const payments = getCustomerPaymentsTotal(customerId)
  const totalCharge = opening + creditSales
  const outstanding = Math.max(0, totalCharge - payments)

  if (totalCharge <= 0) return 'NO DUES'
  if (outstanding <= 0.001) return 'PAID'
  if (payments > 0) return 'PARTIALLY PAID'
  return 'DUE'
}
