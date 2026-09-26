export interface ChickenItem {
  id: string
  code: string
  name: string
  cut: string
  pricePerKg: number
  wholesalePricePerKg?: number | null
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ChickenCartItem {
  id: string
  kind: 'chicken'
  chicken: ChickenItem
  productType: 'chicken'
  productId: string
  productName: string
  code?: string
  weightGrams: number
  pricePerKg: number
  unitPrice: number
  total: number
  sellingMode?: 'RETAIL' | 'WHOLESALE'
  priceType?: 'RETAIL' | 'WHOLESALE'
}

export interface PriceHistoryEntry {
  id: string
  productName: string
  oldPrice: number
  newPrice: number
  changedAt: string
}

const priceKey = 'chicken-prices'
const historyKey = 'chicken-price-history'

export const defaultChickenItems: ChickenItem[] = [
  { id: 'whole', code: '1', name: 'Fresh Chicken', cut: 'Whole', pricePerKg: 1000, wholesalePricePerKg: 920, active: true },
  { id: 'breast', code: '2', name: 'Chicken Breast', cut: 'Breast', pricePerKg: 1000, wholesalePricePerKg: 920, active: true },
  { id: 'legs', code: '3', name: 'Chicken Legs', cut: 'Legs', pricePerKg: 1000, wholesalePricePerKg: 920, active: true },
  { id: 'wings', code: '4', name: 'Chicken Wings', cut: 'Wings', pricePerKg: 1000, wholesalePricePerKg: 920, active: true },
  { id: 'liver', code: '5', name: 'Chicken Liver', cut: 'Liver', pricePerKg: 800, wholesalePricePerKg: 750, active: true },
  { id: 'mixed', code: '6', name: 'Mixed Chicken', cut: 'Mixed', pricePerKg: 1000, wholesalePricePerKg: 920, active: true },
  { id: 'other', code: '7', name: 'Other Chicken', cut: 'Other', pricePerKg: 1000, wholesalePricePerKg: 920, active: true },
  { id: 'gizzard', code: '8', name: 'Chicken Gizzard', cut: 'Gizzard', pricePerKg: 900, wholesalePricePerKg: 850, active: true },
]

export const defaultCodeMapping: Record<string, string> = {
  whole: '1',
  'fresh-chicken': '1',
  breast: '2',
  legs: '3',
  wings: '4',
  liver: '5',
  mixed: '6',
  other: '7',
  gizzard: '8',
}

export const normalizeChickenCode = (rawCode: string): string => {
  let trimmed = rawCode.trim().toUpperCase()
  if (!trimmed) return ''

  if (trimmed.startsWith('CH')) {
    trimmed = trimmed.replace(/^CH-?0*/, '')
  }

  // If numeric, remove leading zeros (e.g. 001 -> 1, 02 -> 2)
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed)
    // Chicken codes are strictly below 100 (1 to 99). 100+ is reserved for groceries!
    if (num > 0 && num < 100) {
      return String(num)
    }
  }

  return trimmed
}

export const findChickenByCode = (query: string, items: ChickenItem[]): ChickenItem | null => {
  const normalized = normalizeChickenCode(query)
  if (!normalized) return null

  // 1. Match by normalized code (e.g. '1', '2')
  const codeMatch = items.find(
    item =>
      (item.code && normalizeChickenCode(item.code) === normalized) ||
      defaultCodeMapping[item.id] === normalized ||
      (Number(item.code) === Number(normalized) && Number(normalized) > 0 && Number(normalized) < 100)
  )
  if (codeMatch) return codeMatch

  return null
}

export const compareChickenCuts = (a: ChickenItem, b: ChickenItem): number => {
  const codeA = (a.code || defaultCodeMapping[a.id] || '').trim()
  const codeB = (b.code || defaultCodeMapping[b.id] || '').trim()

  if (codeA && codeB) {
    const numA = Number(codeA)
    const numB = Number(codeB)
    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA !== numB) return numA - numB
    } else {
      const cmp = codeA.localeCompare(codeB, undefined, { numeric: true })
      if (cmp !== 0) return cmp
    }
  } else if (codeA) {
    return -1
  } else if (codeB) {
    return 1
  }

  return (a.name || '').localeCompare(b.name || '')
}

export const sortChickenItems = (items: ChickenItem[]): ChickenItem[] => {
  return [...items].sort(compareChickenCuts)
}

const migrateItemsWithCodes = (items: ChickenItem[]): ChickenItem[] => {
  let changed = false
  const updated = items.map((item, index) => {
    const currentCode = item.code ? item.code.trim() : ''
    const fallback = defaultCodeMapping[item.id] || String(index + 1)
    const normalized = normalizeChickenCode(currentCode || fallback)
    if (!currentCode || currentCode !== normalized || currentCode.startsWith('0') || currentCode.startsWith('CH')) {
      changed = true
      return { ...item, code: normalized }
    }
    return { ...item, code: normalized }
  })
  if (changed) {
    try {
      localStorage.setItem(priceKey, JSON.stringify(updated))
    } catch {
      // ignore
    }
  }
  return updated
}

const fromStorage = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

export const chickenStore = {
  loadItems: (): ChickenItem[] => {
    const raw = fromStorage<ChickenItem[]>(priceKey, defaultChickenItems)
    return sortChickenItems(migrateItemsWithCodes(raw))
  },
  saveItems: (items: ChickenItem[]) => localStorage.setItem(priceKey, JSON.stringify(items)),
  loadHistory: () => fromStorage<PriceHistoryEntry[]>(historyKey, []),
  saveHistory: (entries: PriceHistoryEntry[]) => localStorage.setItem(historyKey, JSON.stringify(entries)),
}

export const roundCurrency = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100
export const calculateChickenPrice = (weightInGrams: number, pricePerKg: number) => {
  if (!Number.isFinite(weightInGrams) || !Number.isFinite(pricePerKg) || weightInGrams <= 0 || pricePerKg <= 0) return 0
  return roundCurrency((weightInGrams / 1000) * pricePerKg)
}
export const calculateChickenTotal = (weightGrams: number, pricePerKg: number) => calculateChickenPrice(weightGrams, pricePerKg)
export const formatMoney = (amount: number) => `Rs. ${Number(amount).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const getEffectiveChickenPricePerKg = (
  item: ChickenItem,
  mode: 'RETAIL' | 'WHOLESALE' = 'RETAIL',
  forcePriceType?: 'RETAIL' | 'WHOLESALE'
): { pricePerKg: number; priceType: 'RETAIL' | 'WHOLESALE' } => {
  if (forcePriceType === 'WHOLESALE') {
    if (item.wholesalePricePerKg !== undefined && item.wholesalePricePerKg !== null && item.wholesalePricePerKg > 0) {
      return { pricePerKg: item.wholesalePricePerKg, priceType: 'WHOLESALE' }
    }
  }
  if (forcePriceType === 'RETAIL') {
    return { pricePerKg: item.pricePerKg, priceType: 'RETAIL' }
  }
  if (mode === 'WHOLESALE' && item.wholesalePricePerKg !== undefined && item.wholesalePricePerKg !== null && item.wholesalePricePerKg > 0) {
    return { pricePerKg: item.wholesalePricePerKg, priceType: 'WHOLESALE' }
  }
  return { pricePerKg: item.pricePerKg, priceType: 'RETAIL' }
}

export const parseWeightInGrams = (value: string): number | null => {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null

  // 1. Explicit 'kg' suffix (e.g. "1kg", "1.5 kg", "0.25kg", ".25kg")
  if (trimmed.endsWith('kg')) {
    const num = parseFloat(trimmed.replace('kg', '').trim())
    if (Number.isFinite(num) && num > 0) return Math.round(num * 1000)
    return null
  }

  // 2. Explicit 'g', 'gm', or 'grams' suffix (e.g. "250g", "500 g", "1000g")
  if (trimmed.endsWith('g') || trimmed.endsWith('gm') || trimmed.endsWith('grams')) {
    const num = parseFloat(trimmed.replace(/grams|gm|g/, '').trim())
    if (Number.isFinite(num) && num > 0) return Math.round(num)
    return null
  }

  // 3. Numeric string parse
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric) || numeric <= 0) return null

  // 4. Decimals (e.g. ".250", "0.250", "1.5", "2.75", "0.5") represent Kilograms
  // .250 -> 250g
  // 1.5  -> 1500g
  // 0.25 -> 250g
  if (trimmed.includes('.')) {
    return Math.round(numeric * 1000)
  }

  // 5. Integers:
  // In chicken/meat retail POS counters:
  // - Quantities < 100 (e.g. 1, 2, 3, 5, 10, 20) are Kilograms (1 -> 1kg = 1000g, 2 -> 2000g)
  // - Quantities >= 100 (e.g. 100, 200, 250, 500, 750, 1200, 1500) are Grams (250 -> 250g)
  if (numeric < 100) {
    return Math.round(numeric * 1000)
  }

  return Math.round(numeric)
}

export const formatWeightDisplay = (grams: number): string => {
  if (grams >= 1000) {
    const kg = grams / 1000
    return `${kg.toFixed(3).replace(/\.?0+$/, '')} kg (${grams}g)`
  }
  return `${grams}g`
}


