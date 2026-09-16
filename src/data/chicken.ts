export interface ChickenItem { id: string; name: string; cut: string; pricePerKg: number; active: boolean }
export interface ChickenCartItem {
  id: string
  kind: 'chicken'
  chicken: ChickenItem
  productType: 'chicken'
  productId: string
  productName: string
  weightGrams: number
  pricePerKg: number
  unitPrice: number
  total: number
}
export interface PriceHistoryEntry { id: string; productName: string; oldPrice: number; newPrice: number; changedAt: string }
const priceKey = 'chicken-prices'
const historyKey = 'chicken-price-history'
export const defaultChickenItems: ChickenItem[] = [
  { id: 'whole', name: 'Fresh Chicken', cut: 'Whole', pricePerKg: 1000, active: true },
  { id: 'wings', name: 'Chicken Wings', cut: 'Wings', pricePerKg: 1000, active: true },
  { id: 'breast', name: 'Chicken Breast', cut: 'Breast', pricePerKg: 1000, active: true },
  { id: 'legs', name: 'Chicken Legs', cut: 'Legs', pricePerKg: 1000, active: true },
  { id: 'liver', name: 'Chicken Liver', cut: 'Liver', pricePerKg: 800, active: true },
  { id: 'gizzard', name: 'Chicken Gizzard', cut: 'Gizzard', pricePerKg: 900, active: true },
  { id: 'mixed', name: 'Mixed Chicken', cut: 'Mixed', pricePerKg: 1000, active: true },
  { id: 'other', name: 'Other Chicken', cut: 'Other', pricePerKg: 1000, active: true },
]
const fromStorage = <T,>(key: string, fallback: T): T => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback } }
export const chickenStore = {
  loadItems: () => fromStorage<ChickenItem[]>(priceKey, defaultChickenItems),
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
