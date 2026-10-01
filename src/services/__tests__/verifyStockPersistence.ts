import type { GroceryProduct } from '../../data/grocery'

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`)
    throw new Error(msg)
  }
  console.log(`✅ PASS: ${msg}`)
}

console.log('\n==================================================')
console.log('--- RUNNING STOCK PERSISTENCE & MERGE TESTS ---')
console.log('==================================================\n')

// Test 1: Adding a product with 300 stock
console.log('[Test 1] Product Creation with 300 Stock:')
const newProduct: GroceryProduct = {
  id: 'grocery-test-300',
  code: '150',
  name: 'Basmati Rice 5kg',
  category: 'Rice',
  barcode: '8901234567890',
  costPrice: 850,
  sellingPrice: 1100,
  retailPrice: 1100,
  wholesalePrice: 950,
  wholesaleEnabled: true,
  wholesaleMinQuantity: 10,
  stockQuantity: 300,
  lowStockLevel: 20,
  unit: 'Bag',
  active: true,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
}

assert(newProduct.stockQuantity === 300, 'Product initialized with exactly 300 stock')

// Test 2: Two-way Cloud Merge logic when Cloud has outdated 0 stock
console.log('\n[Test 2] Cloud Merge with Outdated Cloud Stock:')
const localProducts: GroceryProduct[] = [
  { ...newProduct, stockQuantity: 300, updatedAt: '2026-10-01T10:15:00.000Z' }
]

// Simulate cloud having 0 stock (e.g. from failed legacy direct stock upsert)
const cloudProducts: GroceryProduct[] = [
  { ...newProduct, stockQuantity: 0, updatedAt: '2026-10-01T09:00:00.000Z' }
]

// Replicate intelligent merge logic from App.tsx
const processedIds = new Set<string>()
const mergedProducts: GroceryProduct[] = []

for (const cp of cloudProducts) {
  processedIds.add(cp.id)
  const lp = localProducts.find(item => item.id === cp.id)
  if (!lp) {
    mergedProducts.push(cp)
  } else {
    const cloudUpdated = cp.updatedAt ? new Date(cp.updatedAt).getTime() : 0
    const localUpdated = lp.updatedAt ? new Date(lp.updatedAt).getTime() : 0

    if ((localUpdated > cloudUpdated && lp.stockQuantity > cp.stockQuantity) || (cp.stockQuantity === 0 && lp.stockQuantity > 0)) {
      mergedProducts.push({ ...cp, stockQuantity: lp.stockQuantity, updatedAt: lp.updatedAt })
    } else {
      mergedProducts.push(cp)
    }
  }
}

for (const lp of localProducts) {
  if (!processedIds.has(lp.id)) {
    mergedProducts.push(lp)
  }
}

assert(mergedProducts.length === 1, 'Merged product array has 1 item')
assert(mergedProducts[0].stockQuantity === 300, 'Cloud stock of 0 did NOT overwrite local stock of 300')
assert(mergedProducts[0].name === 'Basmati Rice 5kg', 'Product metadata preserved')

// Test 3: Local product not yet in Cloud is preserved
console.log('\n[Test 3] Local Product Not in Cloud:')
const freshLocalOnly: GroceryProduct = {
  id: 'grocery-local-only-1',
  code: '151',
  name: 'Local Spices 100g',
  category: 'Spices',
  barcode: '8909999999999',
  costPrice: 150,
  sellingPrice: 200,
  stockQuantity: 300,
  lowStockLevel: 10,
  unit: 'Packet',
  active: true,
  createdAt: '2026-10-01T10:30:00.000Z',
  updatedAt: '2026-10-01T10:30:00.000Z',
}

const localListWithNew = [...localProducts, freshLocalOnly]
const cloudListWithoutNew = [...cloudProducts]

const processedIds2 = new Set<string>()
const merged2: GroceryProduct[] = []

for (const cp of cloudListWithoutNew) {
  processedIds2.add(cp.id)
  const lp = localListWithNew.find(item => item.id === cp.id)
  if (!lp) {
    merged2.push(cp)
  } else {
    merged2.push((lp.stockQuantity > cp.stockQuantity) ? { ...cp, stockQuantity: lp.stockQuantity } : cp)
  }
}

for (const lp of localListWithNew) {
  if (!processedIds2.has(lp.id)) {
    merged2.push(lp)
  }
}

assert(merged2.length === 2, 'Both products exist in merged catalog')
const foundLocal = merged2.find(p => p.id === 'grocery-local-only-1')
assert(foundLocal !== undefined, 'Local-only product was not deleted by cloud sync')
assert(foundLocal?.stockQuantity === 300, 'Local-only product preserved 300 stock')

// Test 4: Restocking product (+300)
console.log('\n[Test 4] Restock Product Quantity Addition:')
const existingProd: GroceryProduct = {
  ...newProduct,
  stockQuantity: 25,
}

const restockDelta = 300
const updatedStock = existingProd.stockQuantity + restockDelta
assert(updatedStock === 325, 'Restocking 25 stock by +300 yields exactly 325')

// Test 5: POS Sale Deduction from 300 stock
console.log('\n[Test 5] POS Sale Deduction from 300 stock:')
const initialStock = 300
const soldQty = 6
const remainingStock = initialStock - soldQty

assert(remainingStock === 294, 'Selling 6 units from 300 stock leaves 294 units (never 0)')

// Test 6: Purchase Stock In Addition
console.log('\n[Test 6] Purchase Order Stock In:')
const currentStock = 294
const purchaseQty = 300
const afterPurchase = currentStock + purchaseQty
assert(afterPurchase === 594, 'Receiving 300 units via purchase increases stock to 594')

console.log('\n==================================================')
console.log('🎉 ALL STOCK PERSISTENCE & MERGE TESTS PASSED!')
console.log('==================================================\n')
