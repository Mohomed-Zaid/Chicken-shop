export interface ChickenItem {
  id: string
  code: string
  name: string
  cut: string
  pricePerKg: number
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
  { id: 'whole', code: '1', name: 'Fresh Chicken', cut: 'Whole', pricePerKg: 1000, active: true },
  { id: 'breast', code: '2', name: 'Chicken Breast', cut: 'Breast', pricePerKg: 1000, active: true },
  { id: 'legs', code: '3', name: 'Chicken Legs', cut: 'Legs', pricePerKg: 1000, active: true },
  { id: 'wings', code: '4', name: 'Chicken Wings', cut: 'Wings', pricePerKg: 1000, active: true },
  { id: 'liver', code: '5', name: 'Chicken Liver', cut: 'Liver', pricePerKg: 800, active: true },
  { id: 'mixed', code: '6', name: 'Mixed Chicken', cut: 'Mixed', pricePerKg: 1000, active: true },
  { id: 'other', code: '7', name: 'Other Chicken', cut: 'Other', pricePerKg: 1000, active: true },
  { id: 'gizzard', code: '8', name: 'Chicken Gizzard', cut: 'Gizzard', pricePerKg: 900, active: true },
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
    return migrateItemsWithCodes(raw)
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

