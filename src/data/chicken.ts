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
  { id: 'whole', code: '001', name: 'Fresh Chicken', cut: 'Whole', pricePerKg: 1000, active: true },
  { id: 'breast', code: '002', name: 'Chicken Breast', cut: 'Breast', pricePerKg: 1000, active: true },
  { id: 'legs', code: '003', name: 'Chicken Legs', cut: 'Legs', pricePerKg: 1000, active: true },
  { id: 'wings', code: '004', name: 'Chicken Wings', cut: 'Wings', pricePerKg: 1000, active: true },
  { id: 'liver', code: '005', name: 'Chicken Liver', cut: 'Liver', pricePerKg: 800, active: true },
  { id: 'mixed', code: '006', name: 'Mixed Chicken', cut: 'Mixed', pricePerKg: 1000, active: true },
  { id: 'other', code: '007', name: 'Other Chicken', cut: 'Other', pricePerKg: 1000, active: true },
  { id: 'gizzard', code: '008', name: 'Chicken Gizzard', cut: 'Gizzard', pricePerKg: 900, active: true },
]

export const defaultCodeMapping: Record<string, string> = {
  whole: '001',
  'fresh-chicken': '001',
  breast: '002',
  legs: '003',
  wings: '004',
  liver: '005',
  mixed: '006',
  other: '007',
  gizzard: '008',
}

const numericCodeMapping: Record<string, string> = {
  '101': '001',
  '102': '002',
  '103': '003',
  '104': '004',
  '105': '005',
  '106': '006',
  '107': '007',
  '1': '001',
  '2': '002',
  '3': '003',
  '4': '004',
  '5': '005',
  '6': '006',
  '7': '007',
  '8': '008',
  '01': '001',
  '02': '002',
  '03': '003',
  '04': '004',
  '05': '005',
  '06': '006',
  '07': '007',
  '08': '008',
  CH001: '001',
  CH002: '002',
  CH003: '003',
  CH004: '004',
  CH005: '005',
  CH006: '006',
  CH007: '007',
  CH008: '008',
}

export const normalizeChickenCode = (rawCode: string): string => {
  let trimmed = rawCode.trim().toUpperCase()
  if (numericCodeMapping[trimmed]) {
    return numericCodeMapping[trimmed]
  }
  if (trimmed.startsWith('CH')) {
    const numPart = trimmed.replace(/^CH-?0*/, '')
    if (/^\d+$/.test(numPart)) {
      return String(numPart).padStart(3, '0')
    }
  }
  return trimmed
}

export const findChickenByCode = (query: string, items: ChickenItem[]): ChickenItem | null => {
  const normalized = normalizeChickenCode(query)
  if (!normalized) return null

  // 1. Direct code match (e.g. 002)
  const codeMatch = items.find(
    item => (item.code && normalizeChickenCode(item.code) === normalized) ||
            defaultCodeMapping[item.id] === normalized
  )
  if (codeMatch) return codeMatch

  return null
}

const migrateItemsWithCodes = (items: ChickenItem[]): ChickenItem[] => {
  let changed = false
  const updated = items.map((item, index) => {
    const currentCode = item.code ? item.code.trim() : ''
    const fallback = defaultCodeMapping[item.id] || String(index + 1).padStart(3, '0')
    const normalized = normalizeChickenCode(currentCode || fallback)
    if (!currentCode || currentCode !== normalized || currentCode.startsWith('CH')) {
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

