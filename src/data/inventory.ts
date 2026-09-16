import type { GroceryProduct } from './grocery'
import type { StockMovement } from './purchases'

export type StockStatus = 'IN STOCK' | 'LOW STOCK' | 'OUT OF STOCK' | 'INACTIVE'
export type InventoryMovementType = 'purchase' | 'sale' | 'adjustment' | 'return' | 'damage' | 'expired' | 'lost' | 'found'
export type AdjustmentReason = 'Stock Count Correction' | 'Damaged' | 'Expired' | 'Lost' | 'Found' | 'Other'
export type InventoryMovement = StockMovement & { previousStock: number; newStock: number; reason: string; notes: string; createdBy: string }

export function getStockStatus(product: GroceryProduct): StockStatus {
  if (!product.active) return 'INACTIVE'
  if (product.stockQuantity <= 0) return 'OUT OF STOCK'
  if (product.stockQuantity <= product.lowStockLevel) return 'LOW STOCK'
  return 'IN STOCK'
}
export const stockValue = (product: GroceryProduct) => product.stockQuantity * product.costPrice
export const isLowStock = (product: GroceryProduct) => product.active && product.stockQuantity > 0 && product.stockQuantity <= product.lowStockLevel
export const isOutOfStock = (product: GroceryProduct) => product.active && product.stockQuantity <= 0

const movementKey = 'stock-movements'
const read = <T,>(fallback: T): T => { try { return JSON.parse(localStorage.getItem(movementKey) || '') as T } catch { return fallback } }
const write = (items: InventoryMovement[]) => localStorage.setItem(movementKey, JSON.stringify(items))
export const inventoryStore = {
  getMovements: (): InventoryMovement[] => read<InventoryMovement[]>([]),
  getProductMovements: (productId: string) => inventoryStore.getMovements().filter(item => item.productId === productId).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)),
  addMovement: (movement: InventoryMovement) => write([movement, ...inventoryStore.getMovements()]),
  applyLocalChange: (products: GroceryProduct[], productId: string, delta: number, type: InventoryMovementType, reason: string, notes: string, createdBy: string, reference = '') => {
    if (!Number.isFinite(delta) || delta === 0) throw new Error('Stock adjustment cannot be zero.')
    const product = products.find(item => item.id === productId)
    if (!product) throw new Error('Product not found.')
    const newStock = product.stockQuantity + delta
    if (newStock < 0) throw new Error(`Insufficient stock. Available quantity: ${product.stockQuantity}`)
    const stamp = new Date(); const movement: InventoryMovement = { id: `movement-${stamp.getTime()}-${Math.random()}`, productId, productName: product.name, type, quantity: delta, referenceId: reference, referenceNumber: reference, date: stamp.toISOString().slice(0, 10), time: stamp.toLocaleTimeString(), previousStock: product.stockQuantity, newStock, reason, notes, createdBy }
    inventoryStore.addMovement(movement)
    return products.map(item => item.id === productId ? { ...item, stockQuantity: newStock, updatedAt: stamp.toISOString() } : item)
  },
}

export function normalizeMovement(item: StockMovement): InventoryMovement {
  return { ...item, previousStock: item.previousStock ?? 0, newStock: item.newStock ?? item.quantity, reason: item.reason ?? '', notes: item.notes ?? '', createdBy: item.createdBy ?? '' }
}
