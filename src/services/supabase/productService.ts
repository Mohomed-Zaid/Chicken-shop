import type { GroceryProduct } from '../../data/grocery'
import { listRows, upsertRows } from './clientHelpers'
export type ProductRow = { id: string; name: string; category: string | null; barcode: string | null; cost_price: number; selling_price: number; stock_quantity: number; low_stock_level: number; unit: string | null; active: boolean; created_at?: string; updated_at?: string }
export const getProducts = () => listRows<ProductRow>('products')
export const saveProducts = (products: GroceryProduct[]) => upsertRows('products', products.map(product => ({ id: product.id, name: product.name, category: product.category, barcode: product.barcode || null, cost_price: product.costPrice, selling_price: product.sellingPrice, stock_quantity: product.stockQuantity, low_stock_level: product.lowStockLevel, unit: product.unit, active: product.active, created_at: product.createdAt || undefined, updated_at: product.updatedAt || undefined })))
