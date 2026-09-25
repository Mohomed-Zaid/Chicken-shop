/**
 * Comprehensive verification test suite for Pack / Bundle Pricing System.
 * Covers all 14 test cases specified in the requirements.
 * Run with: npx tsx src/services/__tests__/verifyPackPricing.ts
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
  calculatePackPrice,
  resolveGroceryItemPricing,
} from '../pricingService'
import type { GroceryProduct, ProductPackPrice } from '../../data/grocery'
import { salesStore, type Sale, type SaleItem } from '../../data/records'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    process.exit(1)
  } else {
    console.log(`✅ PASS: ${message}`)
  }
}

console.log('\n==================================================')
console.log('RUNNING PACK / BUNDLE PRICING VERIFICATION TESTS')
console.log('==================================================\n')

// Base test product: Egg
const eggProduct: GroceryProduct = {
  id: 'prod-egg-001',
  code: '100',
  name: 'Egg',
  category: 'Grocery',
  barcode: '8901234567890',
  costPrice: 30,
  sellingPrice: 40,
  retailPrice: 40,
  wholesaleEnabled: false,
  stockQuantity: 100,
  lowStockLevel: 10,
  unit: 'Piece',
  active: true,
  packPricingEnabled: true,
  packPrices: [
    {
      id: 'rule-1',
      productId: 'prod-egg-001',
      sellingMode: 'RETAIL',
      quantity: 3,
      packPrice: 100,
      active: true,
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// ------------------------------------------------------------------
// TEST 1: Egg, Individual: 40, 3-pack: 100, Quantity: 1 -> Expected: 40
// ------------------------------------------------------------------
const t1 = calculatePackPrice(1, 40, [{ quantity: 3, packPrice: 100 }])
assert(t1.totalPrice === 40, `TEST 1: Quantity 1 total is Rs.${t1.totalPrice} (expected 40)`)
assert(t1.individualQuantity === 1, `TEST 1: individualQuantity is ${t1.individualQuantity} (expected 1)`)
assert(t1.packs.length === 0, `TEST 1: No packs applied for quantity 1`)

// ------------------------------------------------------------------
// TEST 2: Quantity: 2 -> Expected: 80
// ------------------------------------------------------------------
const t2 = calculatePackPrice(2, 40, [{ quantity: 3, packPrice: 100 }])
assert(t2.totalPrice === 80, `TEST 2: Quantity 2 total is Rs.${t2.totalPrice} (expected 80)`)
assert(t2.individualQuantity === 2, `TEST 2: individualQuantity is ${t2.individualQuantity} (expected 2)`)
assert(t2.packs.length === 0, `TEST 2: No packs applied for quantity 2`)

// ------------------------------------------------------------------
// TEST 3: Quantity: 3 -> Expected: 100
// ------------------------------------------------------------------
const t3 = calculatePackPrice(3, 40, [{ quantity: 3, packPrice: 100 }])
assert(t3.totalPrice === 100, `TEST 3: Quantity 3 total is Rs.${t3.totalPrice} (expected 100)`)
assert(t3.individualQuantity === 0, `TEST 3: individualQuantity is 0`)
assert(t3.packs.length === 1 && t3.packs[0].quantity === 3 && t3.packs[0].count === 1, `TEST 3: 1 × 3-pack used`)
assert(t3.savings === 20, `TEST 3: Savings is Rs.${t3.savings} (expected 20)`)

// ------------------------------------------------------------------
// TEST 4: Quantity: 4 -> Expected: 140 (1x 100 + 1x 40)
// ------------------------------------------------------------------
const t4 = calculatePackPrice(4, 40, [{ quantity: 3, packPrice: 100 }])
assert(t4.totalPrice === 140, `TEST 4: Quantity 4 total is Rs.${t4.totalPrice} (expected 140)`)
assert(t4.individualQuantity === 1, `TEST 4: 1 individual item remaining`)
assert(t4.packs.length === 1 && t4.packs[0].count === 1, `TEST 4: 1 × 3-pack used`)

// ------------------------------------------------------------------
// TEST 5: Quantity: 6 -> Expected: 200 (2x 100)
// ------------------------------------------------------------------
const t5 = calculatePackPrice(6, 40, [{ quantity: 3, packPrice: 100 }])
assert(t5.totalPrice === 200, `TEST 5: Quantity 6 total is Rs.${t5.totalPrice} (expected 200)`)
assert(t5.packs.length === 1 && t5.packs[0].count === 2, `TEST 5: 2 × 3-pack used`)
assert(t5.individualQuantity === 0, `TEST 5: 0 individual items`)

// ------------------------------------------------------------------
// TEST 6: Multiple Pack Rules: Individual: 40, 3-pack: 100, 6-pack: 190.
// Quantity: 6 -> Expected: 190 (optimal 6-pack chosen over 2x 3-pack)
// ------------------------------------------------------------------
const multiRules: ProductPackPrice[] = [
  { id: 'r1', productId: 'p1', sellingMode: 'RETAIL', quantity: 3, packPrice: 100, active: true },
  { id: 'r2', productId: 'p1', sellingMode: 'RETAIL', quantity: 6, packPrice: 190, active: true },
]
const t6 = calculatePackPrice(6, 40, multiRules)
assert(t6.totalPrice === 190, `TEST 6: Quantity 6 with multi-rules optimal price is Rs.${t6.totalPrice} (expected 190)`)
assert(t6.packs.length === 1 && t6.packs[0].quantity === 6 && t6.packs[0].count === 1, `TEST 6: 1 × 6-pack used instead of two 3-packs`)

// ------------------------------------------------------------------
// TEST 7: Quantity: 8 -> Expected: 270 (6-pack: 190 + 2 individual: 80)
// ------------------------------------------------------------------
const t7 = calculatePackPrice(8, 40, multiRules)
assert(t7.totalPrice === 270, `TEST 7: Quantity 8 total is Rs.${t7.totalPrice} (expected 270)`)
assert(t7.individualQuantity === 2, `TEST 7: 2 individual items (expected 2)`)
assert(t7.packs.some(p => p.quantity === 6 && p.count === 1), `TEST 7: 1 × 6-pack used`)
assert(t7.savings === 50, `TEST 7: Savings is Rs.${t7.savings} (expected 50)`)

// ------------------------------------------------------------------
// TEST 8: Quantity: 12 -> Expected: 380 (2 × 6-pack)
// ------------------------------------------------------------------
const t8 = calculatePackPrice(12, 40, multiRules)
assert(t8.totalPrice === 380, `TEST 8: Quantity 12 total is Rs.${t8.totalPrice} (expected 380)`)
assert(t8.packs.some(p => p.quantity === 6 && p.count === 2), `TEST 8: 2 × 6-pack used`)
assert(t8.individualQuantity === 0, `TEST 8: 0 individual items`)

// ------------------------------------------------------------------
// TEST 9: Barcode scan simulation: scanning 6 times incrementally
// ------------------------------------------------------------------
const eggWithMultiPacks: GroceryProduct = {
  ...eggProduct,
  packPrices: multiRules,
}
let currentQty = 0
for (let scan = 1; scan <= 6; scan++) {
  currentQty += 1
  const pricing = resolveGroceryItemPricing(eggWithMultiPacks, currentQty, 'RETAIL')
  if (scan === 1) assert(pricing.total === 40, `TEST 9 (Scan 1): Rs.${pricing.total}`)
  if (scan === 2) assert(pricing.total === 80, `TEST 9 (Scan 2): Rs.${pricing.total}`)
  if (scan === 3) assert(pricing.total === 100, `TEST 9 (Scan 3): Rs.${pricing.total}`)
  if (scan === 4) assert(pricing.total === 140, `TEST 9 (Scan 4): Rs.${pricing.total}`)
  if (scan === 5) assert(pricing.total === 180, `TEST 9 (Scan 5): Rs.${pricing.total}`)
  if (scan === 6) assert(pricing.total === 190, `TEST 9 (Scan 6): Rs.${pricing.total}`)
}
assert(currentQty === 6, `TEST 9: Barcode scanned 6 times successfully`)

// ------------------------------------------------------------------
// TEST 10: Change quantity directly: 6 -> 8 -> Price immediately changes to Rs.270
// ------------------------------------------------------------------
const directEditPricing = resolveGroceryItemPricing(eggWithMultiPacks, 8, 'RETAIL')
assert(directEditPricing.total === 270, `TEST 10: Direct edit to 8 qty immediately resolves to Rs.${directEditPricing.total} (expected 270)`)
assert(directEditPricing.packPricingApplied === true, `TEST 10: packPricingApplied is true`)

// ------------------------------------------------------------------
// TEST 11: Wholesale Compatibility:
// Retail: 1 = Rs.40, 3 = Rs.100
// Wholesale: 1 = Rs.35, 3 = Rs.90, Wholesale min: 12
// At qty 12 in WHOLESALE mode: Wholesale pack pricing applies (4 × 90 = 360)
// Below 12 in WHOLESALE mode: Retail pricing applies
// ------------------------------------------------------------------
const wholesaleEgg: GroceryProduct = {
  ...eggProduct,
  sellingPrice: 40,
  retailPrice: 40,
  wholesaleEnabled: true,
  wholesalePrice: 35,
  wholesaleMinQuantity: 12,
  packPricingEnabled: true,
  packPrices: [
    { id: 'r-ret', productId: 'p1', sellingMode: 'RETAIL', quantity: 3, packPrice: 100, active: true },
    { id: 'r-ws', productId: 'p1', sellingMode: 'WHOLESALE', quantity: 3, packPrice: 90, active: true },
  ],
}

// Below wholesale min (e.g. qty 6 in WHOLESALE mode) -> Retail pack pricing applies (2x 100 = 200)
const belowMin = resolveGroceryItemPricing(wholesaleEgg, 6, 'WHOLESALE')
assert(belowMin.priceType === 'RETAIL', `TEST 11: Below wholesale min uses RETAIL price type`)
assert(belowMin.total === 200, `TEST 11: Below wholesale min (6 eggs) uses retail pack price = Rs.${belowMin.total} (expected 200)`)

// At wholesale min (qty 12 in WHOLESALE mode) -> Wholesale pack pricing applies (4 × 90 = 360)
const atMin = resolveGroceryItemPricing(wholesaleEgg, 12, 'WHOLESALE')
assert(atMin.priceType === 'WHOLESALE', `TEST 11: At wholesale min uses WHOLESALE price type`)
assert(atMin.total === 360, `TEST 11: At wholesale min (12 eggs), wholesale pack price 4 × 90 = Rs.${atMin.total} (expected 360)`)

// ------------------------------------------------------------------
// TEST 12: Historical Sale Persistence
// 3-pack: Rs.100. Sell 6 -> Total Rs.200.
// Owner changes 3-pack to Rs.110. Old sale must remain Rs.200.
// ------------------------------------------------------------------
const saleItemSnapshot: SaleItem = {
  productId: 'prod-egg-001',
  productName: 'Egg',
  productType: 'grocery',
  quantity: 6,
  weightGrams: null,
  unitPrice: 40,
  pricePerKg: null,
  costPrice: 30,
  total: 200,
  paidQuantity: 6,
  freeQuantity: 0,
  totalQuantity: 6,
  sellingMode: 'RETAIL',
  priceType: 'RETAIL',
  packPricingApplied: true,
  packBreakdown: [
    { quantity: 6, packPrice: 100, packs: 2 },
  ],
}

const historicalSale: Sale = {
  id: 'sale-test-hist-001',
  invoiceNumber: 'INV-999001',
  date: '2026-09-25',
  time: '10:00:00',
  items: [saleItemSnapshot],
  subtotal: 240,
  discount: 40,
  tax: 0,
  service: 0,
  total: 200,
  paymentMethod: 'Cash',
  amountReceived: 200,
  change: 0,
  cashier: 'Cashier',
  customerName: 'Walk-in Customer',
  status: 'completed',
  sellingMode: 'RETAIL',
}

salesStore.saveSale(historicalSale)

// Now owner updates the pack price rule from Rs.100 to Rs.110
const updatedEgg: GroceryProduct = {
  ...eggProduct,
  packPrices: [
    { id: 'rule-1', productId: 'prod-egg-001', sellingMode: 'RETAIL', quantity: 3, packPrice: 110, active: true },
  ],
}
// New sale would be 2 × 110 = 220
const newSalePricing = resolveGroceryItemPricing(updatedEgg, 6, 'RETAIL')
assert(newSalePricing.total === 220, `TEST 12: New sale uses new pack price Rs.220`)

// But the saved historical sale in the store remains Rs.200
const retrievedSale = salesStore.getSaleById('sale-test-hist-001')
assert(retrievedSale !== undefined && retrievedSale.total === 200, `TEST 12: Historical sale total remains Rs.200`)
assert(retrievedSale?.items[0].packBreakdown?.[0].packPrice === 100, `TEST 12: Historical packBreakdown preserved with original price Rs.100`)

// ------------------------------------------------------------------
// TEST 13: Existing Product Without Pack Pricing
// ------------------------------------------------------------------
const standardProduct: GroceryProduct = {
  ...eggProduct,
  id: 'prod-std-002',
  name: 'Standard Milk',
  packPricingEnabled: false,
  packPrices: [],
}
const t13 = resolveGroceryItemPricing(standardProduct, 5, 'RETAIL')
assert(t13.total === 5 * 40, `TEST 13: Product without pack pricing calculates normal 5 × 40 = Rs.${t13.total}`)
assert(t13.packPricingApplied === false, `TEST 13: packPricingApplied is false`)

// ------------------------------------------------------------------
// TEST 14: Existing Buy X Get Y Free Product
// Buy 2 Get 1 Free promotion continues working identically
// ------------------------------------------------------------------
const promoProduct: GroceryProduct = {
  ...eggProduct,
  id: 'prod-promo-003',
  name: 'Biscuits Offer',
  packPricingEnabled: false,
  packPrices: [],
  promotionEnabled: true,
  promotionBuyQuantity: 2,
  promotionFreeQuantity: 1,
  promotionActive: true,
}
const t14 = resolveGroceryItemPricing(promoProduct, 2, 'RETAIL')
assert(t14.promo.promotionApplied === true, `TEST 14: Buy X Get Y Free promotion applied`)
assert(t14.promo.paidQuantity === 2, `TEST 14: Customer pays for 2`)
assert(t14.promo.freeQuantity === 1, `TEST 14: Customer gets 1 free`)
assert(t14.promo.totalQuantity === 3, `TEST 14: Physical total quantity is 3`)
assert(t14.total === 2 * 40, `TEST 14: Charge total is Rs.80 (2 × 40)`)

console.log('\n==================================================')
console.log('ALL 14 PACK / BUNDLE PRICING TESTS PASSED PERFECTLY!')
console.log('==================================================\n')
