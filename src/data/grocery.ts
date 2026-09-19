export interface GroceryProduct {
  id: string
  code: string // Code starting from 100 onwards (e.g. "100", "101", ...)
  name: string
  category: string
  barcode: string
  costPrice: number
  sellingPrice: number
  discountPrice?: number | null
  stockQuantity: number
  lowStockLevel: number
  unit: string
  active: boolean
  createdAt: string
  updatedAt: string
}

const key = 'grocery-products'
const now = () => new Date().toISOString()

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

export const demo: GroceryProduct[] = [
  ['Sugar 1kg', 'Grocery', '4790012345678', 220, 250, 50, 10, '100'],
  ['Milk Powder', 'Dairy', '4790012345679', 1000, 1200, 20, 5, '101'],
  ['Biscuits', 'Biscuits', '4790012345680', 100, 150, 100, 20, '102'],
  ['Rice 5kg', 'Rice', '4790012345681', 1200, 1400, 15, 5, '103'],
].map(([name, category, barcode, costPrice, sellingPrice, stockQuantity, lowStockLevel, code], i) => ({
  id: `grocery-${i + 1}`,
  code: code as string,
  name: name as string,
  category: category as string,
  barcode: barcode as string,
  costPrice: costPrice as number,
  sellingPrice: sellingPrice as number,
  stockQuantity: stockQuantity as number,
  lowStockLevel: lowStockLevel as number,
  unit: 'Piece',
  active: true,
  createdAt: now(),
  updatedAt: now(),
}))

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
      const withCodes = ensureGroceryCodes(parsed)
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