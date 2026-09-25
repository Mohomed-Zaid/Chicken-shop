import type { GroceryProduct, ProductPackPrice } from '../data/grocery'
import type { PackBreakdownItem } from '../data/records'
import { calculatePromotion, type PromotionCalculationResult } from './promotionService'

export type SellingMode = 'RETAIL' | 'WHOLESALE'
export type PriceType = 'RETAIL' | 'WHOLESALE'

export interface PricingResult {
  priceType: PriceType
  unitPrice: number
  meetsMinQuantity: boolean
  minQuantity: number | null
  wholesaleAvailable: boolean
  retailPrice: number
  wholesalePrice: number | null
}

export interface PackRuleInput {
  quantity: number
  packPrice: number
  active?: boolean
  sellingMode?: 'RETAIL' | 'WHOLESALE'
}

export interface PackPricingResult {
  individualQuantity: number
  packs: Array<{ quantity: number; packPrice: number; count: number; packs: number }>
  packPrice: number
  totalPrice: number
  savings: number
  packPricingApplied: boolean
  packBreakdown: PackBreakdownItem[]
  description: string
}

export interface ResolvedItemPricing {
  unitPrice: number
  sellingMode: SellingMode
  priceType: PriceType
  total: number
  packPricingResult?: PackPricingResult
  promo: PromotionCalculationResult
  packPricingApplied: boolean
  packBreakdown?: PackBreakdownItem[]
  packsDescription?: string
}

/**
 * Gets the effective retail price for a product, taking into account
 * any active discount price if configured and lower than retail price.
 */
export function getProductRetailPrice(product: GroceryProduct): number {
  const baseRetail =
    product.retailPrice !== undefined && product.retailPrice !== null
      ? Number(product.retailPrice)
      : Number(product.sellingPrice || 0)

  if (
    product.discountPrice !== undefined &&
    product.discountPrice !== null &&
    Number(product.discountPrice) > 0 &&
    Number(product.discountPrice) < baseRetail
  ) {
    return Number(product.discountPrice)
  }

  return baseRetail
}

/**
 * Gets the configured wholesale price for a product if wholesale is enabled.
 */
export function getProductWholesalePrice(product: GroceryProduct): number | null {
  if (
    product.wholesaleEnabled &&
    product.wholesalePrice !== undefined &&
    product.wholesalePrice !== null &&
    Number(product.wholesalePrice) > 0
  ) {
    return Number(product.wholesalePrice)
  }
  return null
}

/**
 * Centralized pricing calculation service for products based on quantity and selling mode.
 *
 * Requirements:
 * - In RETAIL mode: uses retail price.
 * - In WHOLESALE mode:
 *   - If product has wholesale enabled and wholesale price > 0:
 *     - If quantity >= wholesaleMinQuantity: applies wholesalePrice (priceType: 'WHOLESALE')
 *     - If quantity < wholesaleMinQuantity: does NOT silently apply wholesale price. Returns meetsMinQuantity: false.
 *   - If product does not have wholesale enabled: falls back to retail price (priceType: 'RETAIL').
 */
export function getProductSellingPrice(
  product: GroceryProduct,
  quantity: number,
  sellingMode: SellingMode = 'RETAIL'
): PricingResult {
  const retailPrice = getProductRetailPrice(product)
  const wholesalePrice = getProductWholesalePrice(product)
  const wholesaleAvailable = wholesalePrice !== null
  const minQuantity =
    product.wholesaleMinQuantity !== undefined && product.wholesaleMinQuantity !== null
      ? Number(product.wholesaleMinQuantity)
      : 1

  if (sellingMode === 'WHOLESALE' && wholesaleAvailable && wholesalePrice !== null) {
    const meetsMin = quantity >= minQuantity
    if (meetsMin) {
      return {
        priceType: 'WHOLESALE',
        unitPrice: wholesalePrice,
        meetsMinQuantity: true,
        minQuantity,
        wholesaleAvailable: true,
        retailPrice,
        wholesalePrice,
      }
    } else {
      return {
        priceType: 'RETAIL',
        unitPrice: retailPrice,
        meetsMinQuantity: false,
        minQuantity,
        wholesaleAvailable: true,
        retailPrice,
        wholesalePrice,
      }
    }
  }

  return {
    priceType: 'RETAIL',
    unitPrice: retailPrice,
    meetsMinQuantity: true,
    minQuantity: wholesaleAvailable ? minQuantity : null,
    wholesaleAvailable,
    retailPrice,
    wholesalePrice,
  }
}

/**
 * Checks if a product has wholesale pricing configured and enabled.
 */
export function isEligibleForWholesale(product: GroceryProduct): boolean {
  return (
    product.wholesaleEnabled === true &&
    product.wholesalePrice !== undefined &&
    product.wholesalePrice !== null &&
    Number(product.wholesalePrice) > 0
  )
}

/**
 * Checks if a quantity is below the minimum threshold required for wholesale price.
 */
export function isBelowWholesaleMin(
  product: GroceryProduct,
  quantity: number,
  sellingMode: SellingMode
): boolean {
  if (sellingMode !== 'WHOLESALE') return false
  if (!isEligibleForWholesale(product)) return false
  const minQty =
    product.wholesaleMinQuantity !== undefined && product.wholesaleMinQuantity !== null
      ? Number(product.wholesaleMinQuantity)
      : 1
  return quantity < minQty
}

/**
 * Helper to resolve the final unit price and price type for a cart line item.
 */
export function resolvePricingForCart(
  product: GroceryProduct,
  quantity: number,
  sellingMode: SellingMode,
  forceRetail: boolean = false
): { unitPrice: number; priceType: PriceType } {
  if (forceRetail || sellingMode === 'RETAIL') {
    return { unitPrice: getProductRetailPrice(product), priceType: 'RETAIL' }
  }
  const pricing = getProductSellingPrice(product, quantity, sellingMode)
  if (pricing.priceType === 'WHOLESALE' && pricing.meetsMinQuantity) {
    return { unitPrice: pricing.unitPrice, priceType: 'WHOLESALE' }
  }
  return { unitPrice: getProductRetailPrice(product), priceType: 'RETAIL' }
}

/**
 * Filter and retrieve active pack pricing rules for a product under the specified selling mode.
 */
export function getProductPackRules(
  product: GroceryProduct,
  mode: SellingMode
): ProductPackPrice[] {
  if (!product.packPricingEnabled || !Array.isArray(product.packPrices)) {
    return []
  }
  return product.packPrices.filter(
    p => p && p.active !== false && p.sellingMode === mode && p.quantity > 1 && p.packPrice > 0
  )
}

/**
 * Centralized pack pricing calculation function.
 * Determines the cheapest combination of packs and individual units.
 *
 * Requirements:
 * - Uses dynamic programming (exact combination) to guarantee the minimum valid price.
 * - Supports multiple pack rules (e.g. 3-pack = 100, 6-pack = 190).
 * - Avoids forcing packs if buying individuals is cheaper.
 * - Handles remainder items at individual unit price.
 */
export function calculatePackPrice(
  quantity: number,
  individualPrice: number,
  packRules?: PackRuleInput[] | null
): PackPricingResult {
  const qty = Math.max(0, Math.floor(quantity || 0))
  const indPrice = Math.max(0, individualPrice || 0)
  const defaultTotal = qty * indPrice

  if (qty <= 0) {
    return {
      individualQuantity: 0,
      packs: [],
      packPrice: 0,
      totalPrice: 0,
      savings: 0,
      packPricingApplied: false,
      packBreakdown: [],
      description: '',
    }
  }

  // Filter valid pack rules: quantity > 1, packPrice > 0, active !== false
  const validRules = (packRules || []).filter(
    r => r && r.active !== false && r.quantity > 1 && r.packPrice > 0
  )

  // Deduplicate by quantity, keeping the lowest price for each quantity
  const rulesMap = new Map<number, PackRuleInput>()
  for (const r of validRules) {
    const existing = rulesMap.get(r.quantity)
    if (!existing || r.packPrice < existing.packPrice) {
      rulesMap.set(r.quantity, r)
    }
  }
  const rules = Array.from(rulesMap.values())

  if (rules.length === 0) {
    return {
      individualQuantity: qty,
      packs: [],
      packPrice: 0,
      totalPrice: defaultTotal,
      savings: 0,
      packPricingApplied: false,
      packBreakdown: [{ quantity: qty, unitPrice: indPrice }],
      description: `${qty} individual`,
    }
  }

  // Dynamic Programming to find lowest valid price for exactly q items
  const dp: number[] = new Array(qty + 1).fill(Infinity)
  const choice: Array<{ type: 'ind' | 'pack'; ruleIndex?: number }> = new Array(qty + 1)

  dp[0] = 0

  for (let q = 1; q <= qty; q++) {
    // Option 1: 1 individual unit
    dp[q] = dp[q - 1] + indPrice
    choice[q] = { type: 'ind' }

    // Option 2: any valid pack rule of size <= q
    for (let rIdx = 0; rIdx < rules.length; rIdx++) {
      const rule = rules[rIdx]
      if (q >= rule.quantity) {
        const costWithPack = dp[q - rule.quantity] + rule.packPrice
        if (costWithPack < dp[q]) {
          dp[q] = costWithPack
          choice[q] = { type: 'pack', ruleIndex: rIdx }
        }
      }
    }
  }

  // Backtrack to reconstruct solution
  let curr = qty
  const packCounts = new Map<number, { quantity: number; packPrice: number; count: number }>()
  let individualQuantity = 0

  while (curr > 0) {
    const c = choice[curr]
    if (c && c.type === 'pack' && c.ruleIndex !== undefined) {
      const rule = rules[c.ruleIndex]
      const existing = packCounts.get(rule.quantity)
      if (existing) {
        existing.count += 1
      } else {
        packCounts.set(rule.quantity, { quantity: rule.quantity, packPrice: rule.packPrice, count: 1 })
      }
      curr -= rule.quantity
    } else {
      individualQuantity += 1
      curr -= 1
    }
  }

  const packs = Array.from(packCounts.values())
    .sort((a, b) => b.quantity - a.quantity)
    .map(p => ({ ...p, packs: p.count }))

  const totalPackPrice = packs.reduce((sum, p) => sum + p.packPrice * p.count, 0)
  const totalPrice = dp[qty]
  const savings = Math.max(0, defaultTotal - totalPrice)
  const packPricingApplied = packs.length > 0 && savings > 0

  const packBreakdown: PackBreakdownItem[] = []
  for (const p of packs) {
    packBreakdown.push({
      quantity: p.quantity * p.count,
      packPrice: p.packPrice,
      packs: p.count,
    })
  }
  if (individualQuantity > 0) {
    packBreakdown.push({
      quantity: individualQuantity,
      unitPrice: indPrice,
    })
  }

  // Generate readable description: e.g. "6-pack × 1 + 2 individual"
  const parts: string[] = []
  for (const p of packs) {
    parts.push(`${p.quantity}-pack × ${p.count}`)
  }
  if (individualQuantity > 0) {
    parts.push(`${individualQuantity} individual`)
  }
  const description = parts.join(' + ')

  return {
    individualQuantity,
    packs,
    packPrice: totalPackPrice,
    totalPrice,
    savings,
    packPricingApplied,
    packBreakdown,
    description,
  }
}

/**
 * Resolves full pricing for a grocery product in the cart, seamlessly combining:
 * 1. Retail vs. Wholesale mode and minimum quantity thresholds
 * 2. Pack Pricing rules (if enabled)
 * 3. Buy X Get Y Free promotions (if pack pricing is not enabled)
 */
export function resolveGroceryItemPricing(
  product: GroceryProduct,
  quantity: number,
  sellingMode: SellingMode,
  forcePriceType?: PriceType
): ResolvedItemPricing {
  // 1. Determine base selling price and price type
  let effectivePriceType: PriceType = 'RETAIL'
  let baseUnitPrice = getProductRetailPrice(product)

  if (forcePriceType === 'WHOLESALE') {
    effectivePriceType = 'WHOLESALE'
    baseUnitPrice =
      product.wholesalePrice && Number(product.wholesalePrice) > 0
        ? Number(product.wholesalePrice)
        : getProductRetailPrice(product)
  } else if (forcePriceType === 'RETAIL') {
    effectivePriceType = 'RETAIL'
    baseUnitPrice = getProductRetailPrice(product)
  } else if (sellingMode === 'WHOLESALE') {
    const pricing = getProductSellingPrice(product, quantity, 'WHOLESALE')
    if (pricing.priceType === 'WHOLESALE' && pricing.meetsMinQuantity) {
      effectivePriceType = 'WHOLESALE'
      baseUnitPrice = pricing.unitPrice
    } else {
      effectivePriceType = 'RETAIL'
      baseUnitPrice = pricing.unitPrice
    }
  }

  // 2. Check if pack pricing is enabled and active for this selling mode
  const packRules = getProductPackRules(product, effectivePriceType)
  const hasPackPricing = Boolean(product.packPricingEnabled && packRules.length > 0)

  if (hasPackPricing) {
    const packResult = calculatePackPrice(quantity, baseUnitPrice, packRules)
    return {
      unitPrice: baseUnitPrice,
      sellingMode,
      priceType: effectivePriceType,
      total: packResult.totalPrice,
      packPricingResult: packResult,
      packPricingApplied: packResult.packPricingApplied,
      packBreakdown: packResult.packBreakdown,
      packsDescription: packResult.description,
      promo: {
        paidQuantity: quantity,
        freeQuantity: 0,
        totalQuantity: quantity,
        promotionApplied: false,
      },
    }
  }

  // 3. Fallback to existing promotion (Buy X Get Y Free)
  const promo = calculatePromotion(quantity, product)
  const total = promo.paidQuantity * baseUnitPrice

  return {
    unitPrice: baseUnitPrice,
    sellingMode,
    priceType: effectivePriceType,
    total,
    promo,
    packPricingApplied: false,
  }
}


