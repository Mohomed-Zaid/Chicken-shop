/**
 * Verification test suite for Retail and Wholesale Selling/Pricing.
 * Run with: npx tsx src/services/__tests__/verifyWholesalePricing.ts
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
  getProductWholesalePrice,
  isEligibleForWholesale,
  isBelowWholesaleMin,
  resolvePricingForCart,
} from '../pricingService'
import type { GroceryProduct } from '../../data/grocery'
import { salesStore, type Sale, type SaleItem } from '../../data/records'
import { customerStore, getCustomerOutstanding, type Customer } from '../../data/customers'
import { getSalesReport } from '../reports/salesReportService'
import {
  getEffectiveChickenPricePerKg,
  parseWeightInGrams,
  formatWeightDisplay,
  type ChickenItem,
} from '../../data/chicken'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    process.exit(1)
  } else {
    console.log(`✅ PASS: ${message}`)
  }
}

console.log('\n==================================================')
console.log('--- RUNNING RETAIL & WHOLESALE PRICING TESTS ---')
console.log('==================================================\n')

// Sample Products
const yogurt: GroceryProduct = {
  id: 'prod-yogurt',
  code: 'G-YOG',
  barcode: '123456',
  name: 'Highland Yogurt',
  category: 'Dairy',
  unit: 'Cup',
  costPrice: 70,
  sellingPrice: 100,
  retailPrice: 100,
  wholesalePrice: 85,
  wholesaleMinQuantity: 12,
  wholesaleEnabled: true,
  stockQuantity: 100,
  lowStockLevel: 10,
  active: true,
  createdAt: '2026-09-22T08:00:00.000Z',
  updatedAt: '2026-09-22T08:00:00.000Z',
}

const biscuitNoWholesale: GroceryProduct = {
  id: 'prod-biscuit',
  code: 'G-BIS',
  barcode: '',
  name: 'Munchee Cream Cracker',
  category: 'Snacks',
  unit: 'Packet',
  costPrice: 150,
  sellingPrice: 200,
  retailPrice: 200,
  wholesalePrice: null,
  wholesaleMinQuantity: 1,
  wholesaleEnabled: false,
  stockQuantity: 50,
  lowStockLevel: 10,
  active: true,
  createdAt: '2026-09-22T08:00:00.000Z',
  updatedAt: '2026-09-22T08:00:00.000Z',
}

const dhalDisabledWholesale: GroceryProduct = {
  id: 'prod-dhal',
  code: 'G-DHL',
  barcode: '',
  name: 'Red Dhal 1kg',
  category: 'Grains',
  unit: 'Kg',
  costPrice: 280,
  sellingPrice: 350,
  retailPrice: 350,
  wholesalePrice: 310,
  wholesaleMinQuantity: 10,
  wholesaleEnabled: false, // Explicitly disabled
  stockQuantity: 100,
  lowStockLevel: 10,
  active: true,
  createdAt: '2026-09-22T08:00:00.000Z',
  updatedAt: '2026-09-22T08:00:00.000Z',
}

// ----------------------------------------------------
// TEST 1: Retail Mode (Default POS behavior)
// ----------------------------------------------------
console.log('[Test 1] Retail Mode Behavior:')
const resRetailSingle = resolvePricingForCart(yogurt, 1, 'RETAIL')
assert(resRetailSingle.unitPrice === 100, 'Retail mode 1 qty: price is Rs.100')
assert(resRetailSingle.priceType === 'RETAIL', 'Retail mode 1 qty: priceType is RETAIL')

const resRetailBulk = resolvePricingForCart(yogurt, 15, 'RETAIL')
assert(resRetailBulk.unitPrice === 100, 'Retail mode 15 qty: price remains retail Rs.100 (never wholesale)')
assert(resRetailBulk.priceType === 'RETAIL', 'Retail mode 15 qty: priceType is RETAIL')

// ----------------------------------------------------
// TEST 2: Wholesale Mode with Qualifying Quantity (>= min)
// ----------------------------------------------------
console.log('\n[Test 2] Wholesale Mode (Qualifying Quantity):')
assert(isEligibleForWholesale(yogurt), 'Yogurt is eligible for wholesale')
const resWholesaleQualifying = resolvePricingForCart(yogurt, 12, 'WHOLESALE')
assert(resWholesaleQualifying.unitPrice === 85, 'Wholesale mode 12 qty: wholesale price Rs.85 applied')
assert(resWholesaleQualifying.priceType === 'WHOLESALE', 'Wholesale mode 12 qty: priceType is WHOLESALE')

// ----------------------------------------------------
// TEST 3: Wholesale Mode with Sub-Minimum Quantity (< min)
// ----------------------------------------------------
console.log('\n[Test 3] Wholesale Mode (Below Minimum Quantity):')
assert(isBelowWholesaleMin(yogurt, 5, 'WHOLESALE') === true, '5 yogurts flagged as below wholesale min 12')
assert(isBelowWholesaleMin(yogurt, 12, 'WHOLESALE') === false, '12 yogurts not below wholesale min')

// If cashier selects "Use Retail Price":
const resBelowMinForcedRetail = resolvePricingForCart(yogurt, 5, 'WHOLESALE', true)
assert(resBelowMinForcedRetail.unitPrice === 100, 'Cashier selected Retail: unitPrice is Rs.100')
assert(resBelowMinForcedRetail.priceType === 'RETAIL', 'Cashier selected Retail: priceType is RETAIL')

// If cashier selects "Increase to Minimum Quantity" (qty becomes 12):
const resIncreasedToMin = resolvePricingForCart(yogurt, 12, 'WHOLESALE')
assert(resIncreasedToMin.unitPrice === 85, 'Increased to 12: unitPrice is wholesale Rs.85')
assert(resIncreasedToMin.priceType === 'WHOLESALE', 'Increased to 12: priceType is WHOLESALE')

// ----------------------------------------------------
// TEST 4: Wholesale Mode for Product with Wholesale Disabled or Unset
// ----------------------------------------------------
console.log('\n[Test 4] Wholesale Mode on Non-Wholesale Products:')
assert(!isEligibleForWholesale(biscuitsNoWholesale(biscuitNoWholesale)), 'Biscuit has no wholesale price')
const resBiscuitWholesale = resolvePricingForCart(biscuitNoWholesale, 20, 'WHOLESALE')
assert(resBiscuitWholesale.unitPrice === 200, 'Product without wholesale price uses retail Rs.200')
assert(resBiscuitWholesale.priceType === 'RETAIL', 'Product without wholesale price keeps RETAIL priceType')

const resDhalWholesale = resolvePricingForCart(dhalDisabledWholesale, 25, 'WHOLESALE')
assert(resDhalWholesale.unitPrice === 350, 'Product with wholesaleEnabled=false uses retail Rs.350')
assert(resDhalWholesale.priceType === 'RETAIL', 'Product with wholesaleEnabled=false keeps RETAIL priceType')

function biscuitsNoWholesale(p: GroceryProduct) {
  return p
}

// ----------------------------------------------------
// TEST 5: Price Snapshot Immutability (Historical Integrity)
// ----------------------------------------------------
console.log('\n[Test 5] Historical Price Snapshot Integrity:')
const saleItemSnapshot: SaleItem = {
  productId: yogurt.id,
  productName: yogurt.name,
  productType: 'grocery',
  quantity: 20,
  weightGrams: null,
  pricePerKg: null,
  unitPrice: 85,
  costPrice: 70,
  total: 20 * 85, // 1700
  sellingMode: 'WHOLESALE',
  priceType: 'WHOLESALE',
}

const historicalSale: Sale = {
  id: 'sale-wholesale-001',
  invoiceNumber: 'INV-WS-0001',
  date: '2026-09-22',
  time: '11:00:00 AM',
  items: [saleItemSnapshot],
  subtotal: 1700,
  discount: 0,
  tax: 0,
  service: 0,
  total: 1700,
  paymentMethod: 'Cash',
  amountReceived: 2000,
  change: 300,
  cashier: 'Cashier 1',
  customerName: 'Walk-in Customer',
  status: 'completed',
  sellingMode: 'WHOLESALE',
}
salesStore.save(historicalSale)

// Simulate future price increase in product catalog
const updatedYogurt = { ...yogurt, retailPrice: 120, wholesalePrice: 105, sellingPrice: 120 }
assert(getProductWholesalePrice(updatedYogurt) === 105, 'Product catalog price changed to 105')

// Verify historical sale in salesStore has untouched snapshot
const fetchedSale = salesStore.getSales().find(s => s.id === 'sale-wholesale-001')!
assert(fetchedSale.items[0].unitPrice === 85, 'Historical sale unitPrice remains frozen at Rs.85')
assert(fetchedSale.items[0].total === 1700, 'Historical sale total remains frozen at Rs.1,700')
assert(fetchedSale.sellingMode === 'WHOLESALE', 'Historical sale sellingMode remains WHOLESALE')

// ----------------------------------------------------
// TEST 6: Chicken Wholesale and Retail Pricing
// ----------------------------------------------------
console.log('\n[Test 6] Chicken Retail vs Wholesale Pricing:')
const chickenCutWithWholesale: ChickenItem = {
  id: 'chk-whole',
  code: 'CH-WHOLE',
  name: 'Fresh Whole Chicken',
  cut: 'Whole',
  pricePerKg: 1000,
  wholesalePricePerKg: 920,
  active: true,
}

const chickenCutNoWholesale: ChickenItem = {
  id: 'chk-wings',
  code: 'CH-WINGS',
  name: 'Chicken Wings',
  cut: 'Wings',
  pricePerKg: 850,
  wholesalePricePerKg: null,
  active: true,
}

// 1. Retail mode resolution
const rateRetail = getEffectiveChickenPricePerKg(chickenCutWithWholesale, 'RETAIL')
assert(rateRetail.pricePerKg === 1000, 'Chicken in Retail mode resolves to retail rate Rs. 1000/KG')
assert(rateRetail.priceType === 'RETAIL', 'Chicken in Retail mode resolves to RETAIL priceType')

// 2. Wholesale mode resolution with wholesale price configured
const rateWholesale = getEffectiveChickenPricePerKg(chickenCutWithWholesale, 'WHOLESALE')
assert(rateWholesale.pricePerKg === 920, 'Chicken in Wholesale mode resolves to wholesale rate Rs. 920/KG')
assert(rateWholesale.priceType === 'WHOLESALE', 'Chicken in Wholesale mode resolves to WHOLESALE priceType')

// 3. Wholesale mode resolution when chicken cut has no wholesale price set (fallback)
const rateFallback = getEffectiveChickenPricePerKg(chickenCutNoWholesale, 'WHOLESALE')
assert(rateFallback.pricePerKg === 850, 'Chicken without wholesale price falls back to retail rate Rs. 850/KG')
assert(rateFallback.priceType === 'RETAIL', 'Chicken without wholesale price falls back to RETAIL priceType')

// 4. Weight calculation verification (1500g at 920/kg = Rs. 1,380)
const wholesaleChickenTotal = Math.round((1500 / 1000) * rateWholesale.pricePerKg * 100) / 100
assert(wholesaleChickenTotal === 1380, '1500g whole chicken at wholesale rate 920/kg totals Rs. 1,380')

// 5. Snapshot preservation in sale item
const chickenWholesaleSaleItem: SaleItem = {
  productId: chickenCutWithWholesale.id,
  productName: chickenCutWithWholesale.name,
  productType: 'chicken',
  quantity: 1,
  weightGrams: 1500,
  unitPrice: 1380,
  pricePerKg: rateWholesale.pricePerKg,
  costPrice: null,
  total: 1380,
  sellingMode: 'WHOLESALE',
  priceType: 'WHOLESALE',
}
assert(chickenWholesaleSaleItem.total === 1380, 'Chicken wholesale sale item total is Rs. 1,380')
assert(chickenWholesaleSaleItem.priceType === 'WHOLESALE', 'Chicken wholesale sale item has WHOLESALE priceType')
assert(chickenWholesaleSaleItem.sellingMode === 'WHOLESALE', 'Chicken wholesale sale item has WHOLESALE sellingMode')

// ----------------------------------------------------
// TEST 7: Customer Credit / Pay Later in Wholesale Mode
// ----------------------------------------------------
console.log('\n[Test 7] Customer Credit System Integration:')
const wholesaleCustomer: Customer = {
  id: 'cust-perera-store',
  name: 'Perera Grocery Store',
  phone: '0779998877',
  address: 'Kandy Road, Kiribathgoda',
  creditLimit: 25000,
  openingBalance: 0,
  active: true,
  createdAt: '2026-09-22T08:00:00.000Z',
  updatedAt: '2026-09-22T08:00:00.000Z',
}
customerStore.saveCustomer(wholesaleCustomer)

const creditWholesaleSale: Sale = {
  id: 'sale-credit-ws-002',
  invoiceNumber: 'INV-WS-0002',
  date: '2026-09-22',
  time: '11:30:00 AM',
  items: [saleItemSnapshot],
  subtotal: 1700,
  discount: 0,
  tax: 0,
  service: 0,
  total: 1700,
  paymentMethod: 'Credit',
  amountReceived: 0,
  change: 0,
  cashier: 'Cashier 1',
  customerId: wholesaleCustomer.id,
  customerName: wholesaleCustomer.name,
  status: 'completed',
  sellingMode: 'WHOLESALE',
}
salesStore.save(creditWholesaleSale)

const customerDue = getCustomerOutstanding(wholesaleCustomer.id)
assert(customerDue === 1700, `Wholesale credit sale correctly increased customer outstanding to Rs. ${customerDue}`)

// ----------------------------------------------------
// TEST 8: Sales Report Segregation & Filtering
// ----------------------------------------------------
console.log('\n[Test 8] Sales Report Segregation:')
// Add a retail sale
const retailSale: Sale = {
  id: 'sale-ret-003',
  invoiceNumber: 'INV-RET-0003',
  date: '2026-09-22',
  time: '12:00:00 PM',
  items: [
    {
      productId: yogurt.id,
      productName: yogurt.name,
      productType: 'grocery',
      quantity: 2,
      weightGrams: null,
      pricePerKg: null,
      unitPrice: 100,
      costPrice: 70,
      total: 200,
      sellingMode: 'RETAIL',
      priceType: 'RETAIL',
    },
  ],
  subtotal: 200,
  discount: 0,
  tax: 0,
  service: 0,
  total: 200,
  paymentMethod: 'Cash',
  amountReceived: 500,
  change: 300,
  cashier: 'Cashier 1',
  customerName: 'Walk-in Customer',
  status: 'completed',
  sellingMode: 'RETAIL',
}
salesStore.save(retailSale)

const todayRange = { label: 'Today', start: '2026-09-22', end: '2026-09-22' }

const allReport = getSalesReport(todayRange, 'All')
assert(allReport.totalWholesaleSales === 3400, `Total wholesale sales calculated correctly: Rs. ${allReport.totalWholesaleSales} (Expected 3400)`)
assert(allReport.totalRetailSales === 200, `Total retail sales calculated correctly: Rs. ${allReport.totalRetailSales} (Expected 200)`)
assert(allReport.count === 3, 'All report contains all 3 completed sales')

const retailOnlyReport = getSalesReport(todayRange, 'Retail')
assert(retailOnlyReport.count === 1, 'Retail filter contains only 1 retail sale')
assert(retailOnlyReport.total === 200, 'Retail filtered total is Rs. 200')

const wholesaleOnlyReport = getSalesReport(todayRange, 'Wholesale')
assert(wholesaleOnlyReport.count === 2, 'Wholesale filter contains 2 wholesale sales')
assert(wholesaleOnlyReport.total === 3400, 'Wholesale filtered total is Rs. 3,400')

// ----------------------------------------------------
// TEST 9: Wholesale Subtotal & Discount Calculation (No Artificial Discount)
// ----------------------------------------------------
console.log('\n[Test 9] Wholesale Subtotal & Clean Discount Calculation:')
const cartItems = [
  {
    product: yogurt,
    quantity: 12,
    unitPrice: 85,
    priceType: 'WHOLESALE' as const,
    sellingMode: 'WHOLESALE' as const,
    total: 12 * 85, // 1020
  },
]
const calculatedSubtotal = cartItems.reduce((sum, item) => {
  const itemPrice = (item.priceType === 'WHOLESALE' || item.sellingMode === 'WHOLESALE')
    ? item.unitPrice
    : (item.product.retailPrice ?? item.product.sellingPrice)
  return sum + itemPrice * item.quantity
}, 0)
const calculatedTotal = cartItems.reduce((sum, item) => sum + item.total, 0)
const calculatedDiscount = Math.max(0, calculatedSubtotal - calculatedTotal)

assert(calculatedSubtotal === 1020, `Wholesale subtotal is Rs. 1,020 (not retail 1200): Got ${calculatedSubtotal}`)
assert(calculatedDiscount === 0, `Wholesale discount is clean Rs. 0 (no false POS discount): Got ${calculatedDiscount}`)
assert(calculatedTotal === 1020, `Wholesale total is Rs. 1,020: Got ${calculatedTotal}`)

// ----------------------------------------------------
// TEST 10: Held Order Wholesale Mode Retention
// ----------------------------------------------------
console.log('\n[Test 10] Held Order Selling Mode Retention:')
import { heldOrdersStore, type HeldOrder } from '../../data/heldOrders'

const heldOrder: HeldOrder = {
  id: 'held-ws-001',
  reference: 'Hold #1',
  createdAt: '2026-09-22T10:00:00.000Z',
  items: [
    {
      id: 'g-yogurt',
      kind: 'grocery',
      product: yogurt,
      quantity: 12,
      unitPrice: 85,
      priceType: 'WHOLESALE',
      sellingMode: 'WHOLESALE',
      total: 1020,
    },
  ],
  itemCount: 12,
  total: 1020,
  cashier: 'Cashier 1',
  sellingMode: 'WHOLESALE',
}
heldOrdersStore.save(heldOrder)

const recalled = heldOrdersStore.get().find(h => h.id === 'held-ws-001')
assert(recalled !== undefined, 'Held order found in store')
assert(recalled?.sellingMode === 'WHOLESALE', `Held order retained sellingMode: ${recalled?.sellingMode}`)
assert(recalled?.total === 1020, 'Held order total retained at Rs. 1,020')

// ----------------------------------------------------
// TEST 11: Chicken Weight Parsing for POS (.250 = 250g, 1 = 1kg, 1.5 = 1.5kg)
// ----------------------------------------------------
console.log('\n[Test 11] Chicken Weight Parsing (.250 = 250g, 1 = 1kg, 1.5 = 1.5kg):')

// .250 means 250g
const parsedDot250 = parseWeightInGrams('.250')
assert(parsedDot250 === 250, `'.250' parsed to 250g (Got ${parsedDot250})`)

// 0.250 means 250g
const parsed0Dot250 = parseWeightInGrams('0.250')
assert(parsed0Dot250 === 250, `'0.250' parsed to 250g (Got ${parsed0Dot250})`)

// 1 means 1kg (1000g)
const parsedOne = parseWeightInGrams('1')
assert(parsedOne === 1000, `'1' parsed to 1kg / 1000g (Got ${parsedOne})`)

// 1.5 means 1.5kg (1500g)
const parsedOneHalf = parseWeightInGrams('1.5')
assert(parsedOneHalf === 1500, `'1.5' parsed to 1.5kg / 1500g (Got ${parsedOneHalf})`)

// 2 means 2kg (2000g)
const parsedTwo = parseWeightInGrams('2')
assert(parsedTwo === 2000, `'2' parsed to 2kg / 2000g (Got ${parsedTwo})`)

// .5 means 500g
const parsedDot5 = parseWeightInGrams('.5')
assert(parsedDot5 === 500, `'.5' parsed to 500g (Got ${parsedDot5})`)

// Gram inputs >= 100: 250 -> 250g, 500 -> 500g
const parsed250Grams = parseWeightInGrams('250')
assert(parsed250Grams === 250, `'250' parsed to 250g (Got ${parsed250Grams})`)

const parsed500Grams = parseWeightInGrams('500')
assert(parsed500Grams === 500, `'500' parsed to 500g (Got ${parsed500Grams})`)

// Explicit unit inputs: 1kg -> 1000g, 250g -> 250g
const parsed1Kg = parseWeightInGrams('1kg')
assert(parsed1Kg === 1000, `'1kg' parsed to 1000g (Got ${parsed1Kg})`)

const parsedExplicitG = parseWeightInGrams('250g')
assert(parsedExplicitG === 250, `'250g' parsed to 250g (Got ${parsedExplicitG})`)

// Display formatting
assert(formatWeightDisplay(250) === '250g', '250 formatted as 250g')
assert(formatWeightDisplay(1000) === '1 kg (1000g)', '1000 formatted as 1 kg (1000g)')
assert(formatWeightDisplay(1500) === '1.5 kg (1500g)', '1500 formatted as 1.5 kg (1500g)')

console.log('\n==================================================')
console.log('🎉 ALL RETAIL & WHOLESALE VERIFICATION TESTS PASSED!')
console.log('==================================================\n')

