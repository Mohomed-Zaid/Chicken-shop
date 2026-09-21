import { calculatePromotion, getPromotionStatus, isPromotionActive, type PromotionConfig } from '../promotionService'

interface TestCase {
  name: string
  run: () => void
}

const tests: TestCase[] = [
  {
    name: 'TEST 1: Buy 2 Get 1 Free with quantity 2',
    run: () => {
      const promo: PromotionConfig = {
        promotionEnabled: true,
        promotionType: 'BUY_X_GET_Y_FREE',
        promotionBuyQuantity: 2,
        promotionFreeQuantity: 1,
        promotionActive: true,
      }
      const res = calculatePromotion(2, promo)
      const unitPrice = 100
      const price = res.paidQuantity * unitPrice

      if (res.paidQuantity !== 2) throw new Error(`Expected paidQuantity 2, got ${res.paidQuantity}`)
      if (res.freeQuantity !== 1) throw new Error(`Expected freeQuantity 1, got ${res.freeQuantity}`)
      if (res.totalQuantity !== 3) throw new Error(`Expected totalQuantity 3, got ${res.totalQuantity}`)
      if (price !== 200) throw new Error(`Expected price 200, got ${price}`)
    },
  },
  {
    name: 'TEST 2: Buy 2 Get 1 Free with quantity 4',
    run: () => {
      const promo: PromotionConfig = {
        promotionEnabled: true,
        promotionType: 'BUY_X_GET_Y_FREE',
        promotionBuyQuantity: 2,
        promotionFreeQuantity: 1,
        promotionActive: true,
      }
      const res = calculatePromotion(4, promo)
      const unitPrice = 100
      const price = res.paidQuantity * unitPrice

      if (res.paidQuantity !== 4) throw new Error(`Expected paidQuantity 4, got ${res.paidQuantity}`)
      if (res.freeQuantity !== 2) throw new Error(`Expected freeQuantity 2, got ${res.freeQuantity}`)
      if (res.totalQuantity !== 6) throw new Error(`Expected totalQuantity 6, got ${res.totalQuantity}`)
      if (price !== 400) throw new Error(`Expected price 400, got ${price}`)
    },
  },
  {
    name: 'TEST 3: Buy 2 Get 1 Free with quantity 6',
    run: () => {
      const promo: PromotionConfig = {
        promotionEnabled: true,
        promotionType: 'BUY_X_GET_Y_FREE',
        promotionBuyQuantity: 2,
        promotionFreeQuantity: 1,
        promotionActive: true,
      }
      const res = calculatePromotion(6, promo)
      const unitPrice = 100
      const price = res.paidQuantity * unitPrice

      if (res.paidQuantity !== 6) throw new Error(`Expected paidQuantity 6, got ${res.paidQuantity}`)
      if (res.freeQuantity !== 3) throw new Error(`Expected freeQuantity 3, got ${res.freeQuantity}`)
      if (res.totalQuantity !== 9) throw new Error(`Expected totalQuantity 9, got ${res.totalQuantity}`)
      if (price !== 600) throw new Error(`Expected price 600, got ${price}`)
    },
  },
  {
    name: 'TEST 4: Buy 2 Get 1 Free with quantity 5',
    run: () => {
      const promo: PromotionConfig = {
        promotionEnabled: true,
        promotionType: 'BUY_X_GET_Y_FREE',
        promotionBuyQuantity: 2,
        promotionFreeQuantity: 1,
        promotionActive: true,
      }
      const res = calculatePromotion(5, promo)
      const unitPrice = 100
      const price = res.paidQuantity * unitPrice

      if (res.paidQuantity !== 5) throw new Error(`Expected paidQuantity 5, got ${res.paidQuantity}`)
      if (res.freeQuantity !== 2) throw new Error(`Expected freeQuantity 2, got ${res.freeQuantity}`)
      if (res.totalQuantity !== 7) throw new Error(`Expected totalQuantity 7, got ${res.totalQuantity}`)
      if (price !== 500) throw new Error(`Expected price 500, got ${price}`)
    },
  },
  {
    name: 'TEST 5: Stock validation with stock = 5 and buys = 4 (required 6)',
    run: () => {
      const promo: PromotionConfig = {
        promotionEnabled: true,
        promotionType: 'BUY_X_GET_Y_FREE',
        promotionBuyQuantity: 2,
        promotionFreeQuantity: 1,
        promotionActive: true,
      }
      const stock = 5
      const res = calculatePromotion(4, promo)
      if (res.totalQuantity <= stock) {
        throw new Error(`Sale should have been blocked. Total ${res.totalQuantity} <= stock ${stock}`)
      }
      const errorMessage = `Insufficient stock for promotion. Available: ${stock}, Required: ${res.totalQuantity}`
      if (errorMessage !== 'Insufficient stock for promotion. Available: 5, Required: 6') {
        throw new Error(`Wrong error message: ${errorMessage}`)
      }
    },
  },
  {
    name: 'TEST 6: Stock reduction with stock = 10 and buys = 4 (receives 6)',
    run: () => {
      const promo: PromotionConfig = {
        promotionEnabled: true,
        promotionType: 'BUY_X_GET_Y_FREE',
        promotionBuyQuantity: 2,
        promotionFreeQuantity: 1,
        promotionActive: true,
      }
      const initialStock = 10
      const res = calculatePromotion(4, promo)
      const newStock = initialStock - res.totalQuantity
      if (newStock !== 4) {
        throw new Error(`Expected remaining stock to be 4 (10 - 6), got ${newStock}`)
      }
    },
  },
  {
    name: 'TEST 7: Product without promotion, quantity 4',
    run: () => {
      const noPromo: PromotionConfig = {
        promotionEnabled: false,
      }
      const res = calculatePromotion(4, noPromo)
      if (res.paidQuantity !== 4) throw new Error(`Expected paidQuantity 4, got ${res.paidQuantity}`)
      if (res.freeQuantity !== 0) throw new Error(`Expected freeQuantity 0, got ${res.freeQuantity}`)
      if (res.totalQuantity !== 4) throw new Error(`Expected totalQuantity 4, got ${res.totalQuantity}`)
      if (res.promotionApplied) throw new Error('Promotion should not be applied')
    },
  },
  {
    name: 'TEST 8: Buy 3 Get 1 Free, quantity 6',
    run: () => {
      const promo: PromotionConfig = {
        promotionEnabled: true,
        promotionType: 'BUY_X_GET_Y_FREE',
        promotionBuyQuantity: 3,
        promotionFreeQuantity: 1,
        promotionActive: true,
      }
      const res = calculatePromotion(6, promo)
      const unitPrice = 100
      const price = res.paidQuantity * unitPrice

      if (res.paidQuantity !== 6) throw new Error(`Expected paidQuantity 6, got ${res.paidQuantity}`)
      if (res.freeQuantity !== 2) throw new Error(`Expected freeQuantity 2, got ${res.freeQuantity}`)
      if (res.totalQuantity !== 8) throw new Error(`Expected totalQuantity 8, got ${res.totalQuantity}`)
      if (price !== 600) throw new Error(`Expected price 600, got ${price}`)
    },
  },
  {
    name: 'TEST 9: Expired promotion, quantity 2',
    run: () => {
      const promo: PromotionConfig = {
        promotionEnabled: true,
        promotionType: 'BUY_X_GET_Y_FREE',
        promotionBuyQuantity: 2,
        promotionFreeQuantity: 1,
        promotionStartDate: '2026-09-01',
        promotionEndDate: '2026-09-10',
        promotionActive: true,
      }
      // Test reference date after expiration date
      const today = '2026-09-21'
      const status = getPromotionStatus(promo, today)
      if (status !== 'expired') throw new Error(`Expected status expired, got ${status}`)
      if (isPromotionActive(promo, today)) throw new Error('isPromotionActive should be false')

      const res = calculatePromotion(2, promo, today)
      if (res.paidQuantity !== 2) throw new Error(`Expected paidQuantity 2, got ${res.paidQuantity}`)
      if (res.freeQuantity !== 0) throw new Error(`Expected freeQuantity 0, got ${res.freeQuantity}`)
      if (res.totalQuantity !== 2) throw new Error(`Expected totalQuantity 2, got ${res.totalQuantity}`)
      if (res.promotionApplied) throw new Error('Expired promotion should not apply')
    },
  },
]

let passed = 0
let failed = 0

console.log('--- RUNNING PROMOTION UNIT TESTS ---')
for (const t of tests) {
  try {
    t.run()
    console.log(`PASS: ${t.name}`)
    passed++
  } catch (err) {
    console.error(`FAIL: ${t.name}:`, err)
    failed++
  }
}

console.log(`\nRESULTS: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  throw new Error(`${failed} promotion test(s) failed.`)
}
