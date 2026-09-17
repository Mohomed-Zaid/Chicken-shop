import { chickenStore, type ChickenItem, type PriceHistoryEntry } from '../../data/chicken'
import { groceryStore, type GroceryProduct } from '../../data/grocery'
import { salesStore, type Sale, type SaleItem, type Expense } from '../../data/records'
import { purchaseStore, supplierPaymentStore, supplierStore, movementStore, type Purchase, type Supplier, type SupplierPayment, type StockMovement } from '../../data/purchases'
import { requireSupabase, upsertRows } from './clientHelpers'

export type MigrationReport = { tables: { table: string; count: number }[]; successCount: number; errorCount: number; errors: string[] }
const read = <T>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback } }
const timestamp = (date: string, time?: string) => { const parsed = new Date(`${date} ${time || '00:00:00'}`); return Number.isNaN(parsed.getTime()) ? new Date(`${date}T00:00:00`).toISOString() : parsed.toISOString() }
const result = (table: string, rows: unknown[]) => ({ table, count: rows.length })

export async function migrateLocalStorageToSupabase(): Promise<MigrationReport> {
  const cuts = chickenStore.loadItems(); const history = chickenStore.loadHistory(); const products = groceryStore.load(); const sales = salesStore.getSales(); const expenses = read<Expense[]>('expenses', []); const customers = read<Record<string, unknown>[]>('customers', []); const customerPayments = read<Record<string, unknown>[]>('customer-payments', []); const suppliers = supplierStore.getSuppliers(); const purchases = purchaseStore.getPurchases(); const supplierPayments = supplierPaymentStore.getSupplierPayments(); const movements = movementStore.getStockMovements(); const businessRaw = read<Record<string, unknown> | Record<string, unknown>[]>('business-settings', []); const business = Array.isArray(businessRaw) ? businessRaw : [businessRaw]
  const migrated: { table: string; count: number }[] = []
  try {
  await upsertRows('chicken_cuts', cuts.map((item: ChickenItem) => ({ id: item.id, code: item.code, name: item.name, price_per_kg: item.pricePerKg, active: item.active }))); migrated.push(result('chicken_cuts', cuts))
  await upsertRows('chicken_price_history', history.map((item: PriceHistoryEntry) => ({ id: item.id, chicken_cut_id: cuts.find(cut => cut.name === item.productName)?.id || null, old_price: item.oldPrice, new_price: item.newPrice, changed_at: item.changedAt || new Date().toISOString() }))); migrated.push(result('chicken_price_history', history))
  await upsertRows('products', products.map((item: GroceryProduct) => ({ id: item.id, name: item.name, category: item.category, barcode: item.barcode || null, cost_price: item.costPrice, selling_price: item.sellingPrice, stock_quantity: item.stockQuantity, low_stock_level: item.lowStockLevel, unit: item.unit, active: item.active, created_at: item.createdAt || undefined, updated_at: item.updatedAt || undefined }))); migrated.push(result('products', products))
  await upsertRows('customers', customers.map(customer => ({ ...customer, created_at: customer.created_at || undefined, updated_at: customer.updated_at || undefined }))); migrated.push(result('customers', customers))
  await upsertRows('suppliers', suppliers.map((item: Supplier) => ({ id: item.id, name: item.name, phone: item.phone || null, address: item.address || null, email: item.email || null, opening_balance: item.openingBalance, active: item.active, created_at: item.createdAt || undefined, updated_at: item.updatedAt || undefined }))); migrated.push(result('suppliers', suppliers))
  await upsertRows('business_settings', business.map(settings => ({ ...settings, business_name: settings.business_name || settings.businessName || settings.name || null }))); migrated.push(result('business_settings', business))
  await upsertRows('sales', sales.map((sale: Sale) => ({ id: sale.id, invoice_number: sale.invoiceNumber, sold_at: timestamp(sale.date, sale.time), cashier: sale.cashier, customer_name: sale.customerName, subtotal: sale.subtotal, discount: sale.discount, tax: sale.tax, service: sale.service, total: sale.total, payment_method: sale.paymentMethod, amount_received: sale.amountReceived, change: sale.change, status: sale.status, created_at: timestamp(sale.date, sale.time) }))); migrated.push(result('sales', sales))
  const saleItems = sales.flatMap((sale: Sale) => sale.items.map((item: SaleItem, index) => ({ id: `${sale.id}-item-${index}`, sale_id: sale.id, product_type: item.productType, product_id: item.productId, product_name: item.productName, quantity: item.quantity, weight_grams: item.weightGrams, unit_price: item.unitPrice, price_per_kg: item.pricePerKg, cost_price: item.costPrice, total: item.total })))
  await upsertRows('sale_items', saleItems); migrated.push(result('sale_items', saleItems))
  await upsertRows('expenses', expenses.map(expense => ({ id: expense.id, expense_date: expense.date, expense_time: expense.time, category: expense.category, description: expense.description, amount: expense.amount, payment_method: expense.paymentMethod, created_by: expense.createdBy }))); migrated.push(result('expenses', expenses))
  await upsertRows('customer_payments', customerPayments.map(payment => ({ ...payment, customer_id: payment.customer_id || payment.customerId, payment_date: payment.payment_date || payment.date, payment_time: payment.payment_time || payment.time }))); migrated.push(result('customer_payments', customerPayments))
  await upsertRows('purchases', purchases.map((purchase: Purchase) => ({ id: purchase.id, purchase_number: purchase.purchaseNumber, supplier_id: purchase.supplierId, supplier_name: purchase.supplierName, purchased_at: timestamp(purchase.date, purchase.time), subtotal: purchase.subtotal, discount: purchase.discount, total: purchase.total, payment_method: purchase.paymentMethod, amount_paid: purchase.amountPaid, balance_due: purchase.balanceDue, status: purchase.status, created_at: purchase.createdAt || timestamp(purchase.date, purchase.time) }))); migrated.push(result('purchases', purchases))
  const purchaseItems = purchases.flatMap((purchase: Purchase) => purchase.items.map((item, index) => ({ id: `${purchase.id}-item-${index}`, purchase_id: purchase.id, product_id: item.productId, product_name: item.productName, quantity: item.quantity, cost_price: item.costPrice, total: item.total })))
  await upsertRows('purchase_items', purchaseItems); migrated.push(result('purchase_items', purchaseItems))
  await upsertRows('supplier_payments', supplierPayments.map((payment: SupplierPayment) => ({ id: payment.id, supplier_id: payment.supplierId, payment_date: payment.date, payment_time: payment.time, amount: payment.amount, payment_method: payment.paymentMethod, notes: payment.notes }))); migrated.push(result('supplier_payments', supplierPayments))
  await upsertRows('stock_movements', movements.map((movement: StockMovement) => ({ id: movement.id, product_id: movement.productId, product_name: movement.productName, movement_type: movement.type, quantity: movement.quantity, reference_id: movement.referenceId, reference_number: movement.referenceNumber, movement_date: timestamp(movement.date, movement.time) }))); migrated.push(result('stock_movements', movements))
  const invoiceMax = sales.map(item => Number(item.invoiceNumber.match(/(\d+)$/)?.[1] || 0)).reduce((max, value) => Math.max(max, value), 0)
  const purchaseMax = purchases.map(item => Number(item.purchaseNumber.match(/(\d+)$/)?.[1] || 0)).reduce((max, value) => Math.max(max, value), 0)
  const db = requireSupabase(); const invoiceSync = await db.rpc('sync_invoice_number_sequence', { last_value: invoiceMax }); if (invoiceSync.error) throw new Error('Unable to synchronize invoice sequence.')
  const purchaseSync = await db.rpc('sync_purchase_number_sequence', { last_value: purchaseMax }); if (purchaseSync.error) throw new Error('Unable to synchronize purchase sequence.')
  return { tables: migrated, successCount: migrated.reduce((sum, item) => sum + item.count, 0), errorCount: 0, errors: [] }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed.'
    console.error('Local data migration failed.', error)
    return { tables: migrated, successCount: migrated.reduce((sum, item) => sum + item.count, 0), errorCount: 1, errors: [message] }
  }
}
