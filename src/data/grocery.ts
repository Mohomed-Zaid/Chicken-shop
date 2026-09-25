export interface ProductPackPrice {
  id: string
  productId?: string
  sellingMode: 'RETAIL' | 'WHOLESALE'
  quantity: number
  packPrice: number
  active?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface GroceryProduct {
  id: string
  code: string // Code starting from 100 onwards (e.g. "100", "101", ...)
  name: string
  category: string
  barcode: string
  costPrice: number
  sellingPrice: number
  retailPrice?: number | null
  wholesalePrice?: number | null
  wholesaleEnabled?: boolean | null
  wholesaleMinQuantity?: number | null
  discountPrice?: number | null
  stockQuantity: number
  lowStockLevel: number
  unit: string
  active: boolean
  packPricingEnabled?: boolean | null
  packPrices?: ProductPackPrice[]
  promotionEnabled?: boolean | null
  promotionType?: string | null
  promotionBuyQuantity?: number | null
  promotionFreeQuantity?: number | null
  promotionStartDate?: string | null
  promotionEndDate?: string | null
  promotionActive?: boolean | null
  createdAt: string
  updatedAt: string
}

const key = 'grocery-products'

export const categories = [
  'Grocery',
  'Beverages',
  'Biscuits',
  'Dairy',
  'Rice',
  'Spices',
  'Snacks',
  'Household',
  'Cleaning',
  'Other',
]

export const demo: GroceryProduct[] = []

/**
 * Calculates the next available grocery code starting from 100.
 */
export const getNextGroceryCode = (products: GroceryProduct[]): string => {
  let maxCode = 99
  for (const p of products) {
    if (p.code && /^\d+$/.test(p.code.trim())) {
      const val = parseInt(p.code.trim(), 10)
      if (val >= 100 && val > maxCode) {
        maxCode = val
      }
    }
  }
  return String(maxCode + 1)
}

/**
 * Normalizes query string for grocery code lookup.
 */
export const normalizeGroceryCode = (raw: string): string => {
  const trimmed = raw.trim()
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed)
    if (num >= 100) return String(num)
  }
  return trimmed
}

/**
 * Finds a grocery product by code (e.g. "100", "101") or exact code match.
 */
export const findGroceryByCode = (query: string, products: GroceryProduct[]): GroceryProduct | null => {
  const trimmed = query.trim()
  if (!trimmed) return null
  const num = /^\d+$/.test(trimmed) ? Number(trimmed) : null

  // If numeric and >= 100, match by code
  if (num !== null && num >= 100) {
    const match = products.find(p => p.code && Number(p.code) === num)
    if (match) return match
  }

  // Direct string match
  const codeMatch = products.find(p => p.code && p.code.trim() === trimmed)
  if (codeMatch) return codeMatch

  return null
}

/**
 * Ensures all products have a valid code >= 100.
 */
export const ensureGroceryCodes = (products: GroceryProduct[]): GroceryProduct[] => {
  let nextCode = 100
  const usedCodes = new Set<string>()

  // First pass: collect existing valid codes >= 100
  for (const p of products) {
    if (p.code && /^\d+$/.test(p.code.trim())) {
      const num = parseInt(p.code.trim(), 10)
      if (num >= 100) {
        usedCodes.add(String(num))
        if (num >= nextCode) nextCode = num + 1
      }
    }
  }

  return products.map(p => {
    if (p.code && /^\d+$/.test(p.code.trim()) && parseInt(p.code.trim(), 10) >= 100) {
      return p
    }
    // Find next available code >= 100
    while (usedCodes.has(String(nextCode))) {
      nextCode++
    }
    const assigned = String(nextCode)
    usedCodes.add(assigned)
    nextCode++
    return { ...p, code: assigned }
  })
}

export const groceryStore = {
  load: (): GroceryProduct[] => {
    try {
      const raw = localStorage.getItem(key)
      const parsed: GroceryProduct[] = raw ? JSON.parse(raw) : demo
      const normalized: GroceryProduct[] = parsed.map(p => ({
        ...p,
        retailPrice: p.retailPrice !== undefined && p.retailPrice !== null ? Number(p.retailPrice) : Number(p.sellingPrice || 0),
        wholesaleEnabled: Boolean(p.wholesaleEnabled),
        wholesalePrice: p.wholesalePrice !== undefined && p.wholesalePrice !== null ? Number(p.wholesalePrice) : null,
        wholesaleMinQuantity: p.wholesaleMinQuantity !== undefined && p.wholesaleMinQuantity !== null ? Number(p.wholesaleMinQuantity) : null,
        packPricingEnabled: Boolean(p.packPricingEnabled),
        packPrices: Array.isArray(p.packPrices) ? p.packPrices : [],
      }))
      const withCodes = ensureGroceryCodes(normalized)
      if (JSON.stringify(parsed) !== JSON.stringify(withCodes)) {
        try {
          localStorage.setItem(key, JSON.stringify(withCodes))
        } catch {
          // ignore
        }
      }
      return withCodes
    } catch {
      return demo
    }
  },
  save: (items: GroceryProduct[]) => {
    const withCodes = ensureGroceryCodes(items)
    localStorage.setItem(key, JSON.stringify(withCodes))
  },
}