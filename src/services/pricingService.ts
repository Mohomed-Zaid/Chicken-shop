import type { GroceryProduct } from '../data/grocery'

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

