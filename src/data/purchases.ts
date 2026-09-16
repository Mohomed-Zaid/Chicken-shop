import type { GroceryProduct } from './grocery'

export type PurchasePaymentMethod = 'Cash' | 'Card' | 'Credit' | 'Other'
export type SupplierPaymentMethod = 'Cash' | 'Card' | 'Other'
export interface Supplier { id: string; name: string; phone: string; address: string; email: string; openingBalance: number; active: boolean; createdAt: string; updatedAt: string }
export interface PurchaseItem { productId: string; productName: string; quantity: number; costPrice: number; total: number }
export interface Purchase { id: string; purchaseNumber: string; supplierId: string | null; supplierName: string; date: string; time: string; items: PurchaseItem[]; subtotal: number; discount: number; total: number; paymentMethod: PurchasePaymentMethod; amountPaid: number; balanceDue: number; status: 'completed' | 'cancelled'; createdAt: string }
export interface SupplierPayment { id: string; supplierId: string; date: string; time: string; amount: number; paymentMethod: SupplierPaymentMethod; notes: string }
export interface StockMovement { id: string; productId: string; productName: string; type: 'purchase' | 'sale' | 'adjustment' | 'return' | 'damage' | 'expired' | 'lost' | 'found'; quantity: number; referenceId: string; referenceNumber: string; date: string; time: string; previousStock?: number; newStock?: number; reason?: string; notes?: string; createdBy?: string }

const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback } }
const keys = { suppliers: 'suppliers', purchases: 'purchases', payments: 'supplier-payments', movements: 'stock-movements', sequence: 'purchase-sequence' }
const now = () => new Date()
const date = () => now().toISOString().slice(0, 10)
const time = () => now().toLocaleTimeString()

export const supplierStore = {
  getSuppliers: () => read<Supplier[]>(keys.suppliers, []),
  getSupplierById: (id: string) => supplierStore.getSuppliers().find(item => item.id === id),
  saveSupplier: (supplier: Supplier) => localStorage.setItem(keys.suppliers, JSON.stringify([supplier, ...supplierStore.getSuppliers()])),
  updateSupplier: (supplier: Supplier) => localStorage.setItem(keys.suppliers, JSON.stringify(supplierStore.getSuppliers().map(item => item.id === supplier.id ? supplier : item))),
  deactivateSupplier: (id: string) => { const supplier = supplierStore.getSupplierById(id); if (supplier) supplierStore.updateSupplier({ ...supplier, active: false, updatedAt: new Date().toISOString() }) },
}
export const purchaseStore = {
  getPurchases: () => read<Purchase[]>(keys.purchases, []),
  getPurchaseById: (id: string) => purchaseStore.getPurchases().find(item => item.id === id),
  getNextPurchaseNumber: () => `PUR-${String(Number(localStorage.getItem(keys.sequence) || '0') + 1).padStart(6, '0')}`,
  savePurchase: (purchase: Purchase) => { localStorage.setItem(keys.purchases, JSON.stringify([purchase, ...purchaseStore.getPurchases()])); localStorage.setItem(keys.sequence, String(Number(localStorage.getItem(keys.sequence) || '0') + 1)) },
  saveCompleted: (input: Omit<Purchase, 'id' | 'purchaseNumber' | 'createdAt' | 'date' | 'time' | 'status'>, products: GroceryProduct[]) => {
    const stamp = new Date(); const purchase: Purchase = { ...input, id: `purchase-${Date.now()}-${Math.random()}`, purchaseNumber: purchaseStore.getNextPurchaseNumber(), date: stamp.toISOString().slice(0, 10), time: stamp.toLocaleTimeString(), status: 'completed', createdAt: stamp.toISOString() }
    const updated = products.map(product => { const item = purchase.items.find(line => line.productId === product.id); return item ? { ...product, stockQuantity: product.stockQuantity + item.quantity, updatedAt: stamp.toISOString() } : product })
    localStorage.setItem('grocery-products', JSON.stringify(updated))
    purchaseStore.savePurchase(purchase)
    movementStore.addMany(purchase.items.map(item => { const product = products.find(existing => existing.id === item.productId); const previousStock = product?.stockQuantity || 0; return { id: `movement-${Date.now()}-${item.productId}`, productId: item.productId, productName: item.productName, type: 'purchase' as const, quantity: item.quantity, previousStock, newStock: previousStock + item.quantity, reason: 'Completed purchase', notes: '', createdBy: 'Local Administrator', referenceId: purchase.id, referenceNumber: purchase.purchaseNumber, date: purchase.date, time: purchase.time } }))
    return { purchase, products: updated }
  },
}
export const supplierPaymentStore = {
  getSupplierPayments: () => read<SupplierPayment[]>(keys.payments, []),
  saveSupplierPayment: (payment: SupplierPayment) => localStorage.setItem(keys.payments, JSON.stringify([payment, ...supplierPaymentStore.getSupplierPayments()])),
}
export const movementStore = {
  getStockMovements: () => read<StockMovement[]>(keys.movements, []),
  addMany: (movements: StockMovement[]) => localStorage.setItem(keys.movements, JSON.stringify([...movements, ...movementStore.getStockMovements()])),
  addSale: (productId: string, productName: string, quantity: number, referenceId: string, referenceNumber: string) => movementStore.addMany([{ id: `movement-${Date.now()}-${productId}`, productId, productName, type: 'sale', quantity: -quantity, referenceId, referenceNumber, date: date(), time: time() }]),
  getProductStockHistory: (productId: string) => movementStore.getStockMovements().filter(item => item.productId === productId),
}
export const getSupplierCreditPurchases = (supplierId: string) => purchaseStore.getPurchases().filter(item => item.supplierId === supplierId && item.status === 'completed').reduce((sum, item) => sum + item.balanceDue, 0)
export const getSupplierPayments = (supplierId: string) => supplierPaymentStore.getSupplierPayments().filter(item => item.supplierId === supplierId).reduce((sum, item) => sum + item.amount, 0)
export const getSupplierOutstanding = (supplierId: string) => { const supplier = supplierStore.getSupplierById(supplierId); return (supplier?.openingBalance || 0) + getSupplierCreditPurchases(supplierId) - getSupplierPayments(supplierId) }
export const purchaseToday = () => purchaseStore.getPurchases().filter(item => item.status === 'completed' && item.date === date())
