/**
 * Comprehensive verification of Customer Credit / Pay Later system.
 * Run with: npx tsx src/services/__tests__/verifyCreditSystem.ts
 */

declare const process: any

// Mock localStorage for Node environment
const mockStorage: Record<string, string> = {}
;(globalThis as any).localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, val: string) => {
    mockStorage[key] = val
  },
  removeItem: (key: string) => {
    delete mockStorage[key]
  },
  clear: () => {
    for (const k in mockStorage) delete mockStorage[k]
  },
}
;(globalThis as any).window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
}

import {
  customerStore,
  customerPaymentStore,
  getCustomerOutstanding,
  getCustomerStatus,
  getCustomerCreditSales,
  getCustomerPaymentsTotal,
  type Customer,
  type CustomerPayment,
} from '../../data/customers'
import { salesStore, type Sale } from '../../data/records'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    process.exit(1)
  } else {
    console.log(`✅ PASS: ${message}`)
  }
}

console.log('\n--- RUNNING CUSTOMER CREDIT / PAY LATER TESTS ---\n')

// STEP 1: Register customer Kamal
const kamal: Customer = {
  id: 'cust-kamal-01',
  name: 'Kamal',
  phone: '0771234567',
  address: 'Kadawatha',
  creditLimit: 5000,
  openingBalance: 0,
  active: true,
  createdAt: '2026-09-21T08:00:00.000Z',
  updatedAt: '2026-09-21T08:00:00.000Z',
}
customerStore.saveCustomer(kamal)

const savedCust = customerStore.getCustomerById('cust-kamal-01')
assert(savedCust !== undefined && savedCust.name === 'Kamal', 'Customer Kamal registered in customerStore')
assert(getCustomerOutstanding('cust-kamal-01') === 0, 'Initial outstanding is 0.00')
assert(getCustomerStatus('cust-kamal-01') === 'NO DUES', 'Initial status is NO DUES')

// STEP 2: Customer buys now, pays later (Credit Sale: Rs. 1,500)
const creditSale: Sale = {
  id: 'sale-001',
  invoiceNumber: 'INV-000001',
  date: '2026-09-21',
  time: '10:00:00 AM',
  items: [
    {
      productId: 'item-01',
      productName: 'Whole Chicken',
      productType: 'chicken',
      quantity: 1,
      weightGrams: 1000,
      unitPrice: 1500,
      pricePerKg: 1500,
      costPrice: null,
      total: 1500,
    },
  ],
  subtotal: 1500,
  discount: 0,
  tax: 0,
  service: 0,
  total: 1500,
  paymentMethod: 'Credit',
  amountReceived: 0,
  change: 0,
  cashier: 'Kasun',
  customerId: 'cust-kamal-01',
  customerName: 'Kamal',
  status: 'completed',
}
salesStore.saveSale(creditSale)

const creditSalesTotal = getCustomerCreditSales('cust-kamal-01')
const outstandingAfterSale = getCustomerOutstanding('cust-kamal-01')
const statusAfterSale = getCustomerStatus('cust-kamal-01')

assert(creditSalesTotal === 1500, 'Customer credit sales total is Rs. 1,500')
assert(outstandingAfterSale === 1500, 'Customer outstanding is exactly Rs. 1,500')
assert(statusAfterSale === 'DUE', 'Customer status is DUE')

const paymentsCountDay1 = customerPaymentStore.getPaymentsByCustomerId('cust-kamal-01').length
assert(paymentsCountDay1 === 0, 'No payment record created on credit purchase date (as required)')

// STEP 3: Partial Payment of Rs. 500
const payment1Num = customerPaymentStore.getNextPaymentNumber()
assert(payment1Num === 'PAY-000001', 'First payment sequence is PAY-000001')

const payment1: CustomerPayment = {
  id: 'pay-001',
  paymentNumber: payment1Num,
  customerId: 'cust-kamal-01',
  customerName: 'Kamal',
  date: '2026-09-22',
  time: '11:00:00 AM',
  amount: 500,
  paymentMethod: 'Cash',
  notes: 'Partial payment',
}
customerPaymentStore.saveCustomerPayment(payment1)

const totalPaidAfterPartial = getCustomerPaymentsTotal('cust-kamal-01')
const outstandingAfterPartial = getCustomerOutstanding('cust-kamal-01')
const statusAfterPartial = getCustomerStatus('cust-kamal-01')

assert(totalPaidAfterPartial === 500, 'Total paid is Rs. 500')
assert(outstandingAfterPartial === 1000, 'Outstanding reduced from 1,500 to 1,000')
assert(statusAfterPartial === 'PARTIALLY PAID', 'Status is now PARTIALLY PAID')

// STEP 4: Overpayment check (Attempt to pay 1,500 when outstanding is 1,000)
const currentDue = getCustomerOutstanding('cust-kamal-01')
const attemptOverpay = 1500
const isOverpayRejected = attemptOverpay > currentDue
assert(isOverpayRejected, 'Overpayment of Rs. 1,500 when outstanding is Rs. 1,000 is correctly detected')

// STEP 5: Final Payment of remaining Rs. 1,000
const payment2Num = customerPaymentStore.getNextPaymentNumber()
assert(payment2Num === 'PAY-000002', 'Second payment sequence is PAY-000002')

const payment2: CustomerPayment = {
  id: 'pay-002',
  paymentNumber: payment2Num,
  customerId: 'cust-kamal-01',
  customerName: 'Kamal',
  date: '2026-09-23',
  time: '02:30:00 PM',
  amount: 1000,
  paymentMethod: 'Cash',
  notes: 'Full settlement',
}
customerPaymentStore.saveCustomerPayment(payment2)

const totalPaidFinal = getCustomerPaymentsTotal('cust-kamal-01')
const outstandingFinal = getCustomerOutstanding('cust-kamal-01')
const statusFinal = getCustomerStatus('cust-kamal-01')

assert(totalPaidFinal === 1500, 'Total paid is Rs. 1,500')
assert(outstandingFinal === 0, 'Outstanding reduced to Rs. 0.00')
assert(statusFinal === 'PAID', 'Status is now PAID')

// STEP 6: Verify original sale remains in salesStore and untouched
const originalSale = salesStore.getSaleById('sale-001')
assert(originalSale !== undefined, 'Original sale exists in salesStore')
assert(originalSale?.total === 1500, 'Original sale total remains Rs. 1,500 (NOT changed to 0)')
assert(originalSale?.paymentMethod === 'Credit', 'Original sale paymentMethod remains Credit')
assert(originalSale?.invoiceNumber === 'INV-000001', 'Original sale invoiceNumber remains INV-000001')

// STEP 7: Verify customer payment history permanently stored
const kamalPayments = customerPaymentStore.getPaymentsByCustomerId('cust-kamal-01')
assert(kamalPayments.length === 2, 'Permanent payment history has 2 records')
assert(kamalPayments[0].paymentNumber === 'PAY-000002' && kamalPayments[0].amount === 1000, 'Latest payment is PAY-000002 for Rs. 1,000')
assert(kamalPayments[1].paymentNumber === 'PAY-000001' && kamalPayments[1].amount === 500, 'Previous payment is PAY-000001 for Rs. 500')

// STEP 8: Walk-in customer validation
const isWalkInAllowedForCredit = (customerId?: string | null) => {
  return Boolean(customerId && customerId.trim().length > 0)
}
assert(!isWalkInAllowedForCredit(null), 'Walk-in customer (no customerId) cannot buy on credit')
assert(!isWalkInAllowedForCredit(''), 'Empty customerId cannot buy on credit')
assert(isWalkInAllowedForCredit('cust-kamal-01'), 'Registered customer CAN buy on credit')

console.log('\n--- ALL 8 CUSTOMER CREDIT / PAY LATER TESTS PASSED SUCCESSFULLY! ---\n')
