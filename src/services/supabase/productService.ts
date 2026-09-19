import type { GroceryProduct } from '../../data/grocery'
import { listRows, upsertRows, deleteRow } from './clientHelpers'

export type ProductRow = {
  id: string
  name: string
  code?: string | null
  category: string | null
  barcode: string | null
  cost_price: number
  selling_price: number
  discount_price?: number | null
  stock_quantity: number
  low_stock_level: number
  unit: string | null
  active: boolean
  created_at?: string
  updated_at?: string
}

export const rowToProduct = (row: ProductRow): GroceryProduct => ({
  id: row.id,
  code: row.code || '',
  name: row.name,
  category: row.category || 'Grocery',
  barcode: row.barcode || '',
  costPrice: Number(row.cost_price || 0),
  sellingPrice: Number(row.selling_price || 0),
  discountPrice: row.discount_price !== undefined && row.discount_price !== null ? Number(row.discount_price) : null,
  stockQuantity: Number(row.stock_quantity || 0),
  lowStockLevel: Number(row.low_stock_level || 0),
  unit: row.unit || 'Piece',
  active: row.active ?? true,
  createdAt: row.created_at || new Date().toISOString(),
  updatedAt: row.updated_at || new Date().toISOString(),
})

export const productToRow = (product: GroceryProduct): ProductRow => {
  const row: ProductRow = {
    id: product.id,
    name: product.name,
    category: product.category || null,
    barcode: product.barcode || null,
    cost_price: product.costPrice,
    selling_price: product.sellingPrice,
    stock_quantity: product.stockQuantity,
    low_stock_level: product.lowStockLevel,
    unit: product.unit || null,
    active: product.active,
    created_at: product.createdAt || undefined,
    updated_at: product.updatedAt || undefined,
  }
  if (product.code) row.code = product.code
  if (product.discountPrice !== undefined) {
    row.discount_price = product.discountPrice
  }
  return row
}

export const getProducts = async (): Promise<GroceryProduct[]> => {
  const rows = await listRows<ProductRow>('products')
  return rows.map(rowToProduct)
}

export const saveProducts = (products: GroceryProduct[]) =>
  upsertRows('products', products.map(productToRow))

export const deleteProduct = (id: string) => deleteRow('products', id)

