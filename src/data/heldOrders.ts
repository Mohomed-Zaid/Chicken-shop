import type { ChickenCartItem } from './chicken'
import type { GroceryProduct } from './grocery'

export type GroceryCartItem = {
  id: string
  kind: 'grocery'
  product: GroceryProduct
  quantity: number
  unitPrice?: number
  sellingMode?: 'RETAIL' | 'WHOLESALE'
  priceType?: 'RETAIL' | 'WHOLESALE'
  paidQuantity?: number
  freeQuantity?: number
  totalQuantity?: number
  promotionApplied?: boolean
  total: number
}

export type CartItem = ChickenCartItem | GroceryCartItem

export const generateHeldOrderId = (): string => {
  return `hold-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
}

export interface HeldOrder {
  id: string
  reference: string
  note?: string
  createdAt: string
  items: CartItem[]
  itemCount: number
  total: number
  cashier?: string
  sellingMode?: 'RETAIL' | 'WHOLESALE'
}

const STORAGE_KEY = 'pos-held-orders'
const SEQUENCE_KEY = 'pos-held-order-sequence'

const readStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : defaultValue
  } catch {
    return defaultValue
  }
}

const notifyChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('held_orders_updated'))
  }
}

export const heldOrdersStore = {
  get: (): HeldOrder[] => {
    return readStorage<HeldOrder[]>(STORAGE_KEY, []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  },

  peekNextHoldNumber: (): number => {
    return Number(localStorage.getItem(SEQUENCE_KEY) || '0') + 1
  },

  getNextHoldNumber: (): number => {
    const current = Number(localStorage.getItem(SEQUENCE_KEY) || '0')
    const next = current + 1
    localStorage.setItem(SEQUENCE_KEY, String(next))
    return next
  },

  save: (order: HeldOrder) => {
    const current = heldOrdersStore.get()
    const filtered = current.filter(item => item.id !== order.id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([order, ...filtered]))
    notifyChange()
  },

  remove: (id: string) => {
    const current = heldOrdersStore.get()
    const filtered = current.filter(item => item.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    notifyChange()
  },

  clear: () => {
    localStorage.removeItem(STORAGE_KEY)
    notifyChange()
  },

  count: (): number => {
    return heldOrdersStore.get().length
  },
}
