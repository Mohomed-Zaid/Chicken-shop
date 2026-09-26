import { sortGroceryProducts, type GroceryProduct, type ProductPackPrice } from '../../data/grocery'
import { listRows, upsertRows, deleteRow } from './clientHelpers'

export type ProductPackPriceRow = {
  id: string
  product_id: string
  selling_mode: 'RETAIL' | 'WHOLESALE'
  quantity: number
  pack_price: number
  active?: boolean
  created_at?: string
  updated_at?: string
}

export type ProductRow = {
  id: string
  name: string
  code?: string | null
  category: string | null
  barcode: string | null
  cost_price: number
  selling_price: number
  retail_price?: number | null
  wholesale_price?: number | null
  wholesale_enabled?: boolean | null
  wholesale_min_quantity?: number | null
  discount_price?: number | null
  stock_quantity: number
  low_stock_level: number
  unit: string | null
  active: boolean
  pack_pricing_enabled?: boolean | null
  promotion_enabled?: boolean | null
  promotion_type?: string | null
  promotion_buy_quantity?: number | null
  promotion_free_quantity?: number | null
  promotion_start_date?: string | null
  promotion_end_date?: string | null
  promotion_active?: boolean | null
  created_at?: string
  updated_at?: string
}

export const rowToProduct = (row: ProductRow, packPrices: ProductPackPrice[] = []): GroceryProduct => {
  const sellingPrice = Number(row.selling_price || 0)
  const retailPrice = row.retail_price !== undefined && row.retail_price !== null ? Number(row.retail_price) : sellingPrice
  return {
    id: row.id,
    code: row.code || '',
    name: row.name,
    category: row.category || 'Grocery',
    barcode: row.barcode || '',
    costPrice: Number(row.cost_price || 0),
    sellingPrice,
    retailPrice,
    wholesalePrice: row.wholesale_price !== undefined && row.wholesale_price !== null ? Number(row.wholesale_price) : null,
    wholesaleEnabled: Boolean(row.wholesale_enabled),
    wholesaleMinQuantity: row.wholesale_min_quantity !== undefined && row.wholesale_min_quantity !== null ? Number(row.wholesale_min_quantity) : null,
    discountPrice: row.discount_price !== undefined && row.discount_price !== null ? Number(row.discount_price) : null,
    stockQuantity: Number(row.stock_quantity || 0),
    lowStockLevel: Number(row.low_stock_level || 0),
    unit: row.unit || 'Piece',
    active: row.active ?? true,
    packPricingEnabled: Boolean(row.pack_pricing_enabled),
    packPrices,
    promotionEnabled: Boolean(row.promotion_enabled),
    promotionType: row.promotion_type || 'BUY_X_GET_Y_FREE',
    promotionBuyQuantity: row.promotion_buy_quantity != null ? Number(row.promotion_buy_quantity) : 2,
    promotionFreeQuantity: row.promotion_free_quantity != null ? Number(row.promotion_free_quantity) : 1,
    promotionStartDate: row.promotion_start_date || null,
    promotionEndDate: row.promotion_end_date || null,
    promotionActive: row.promotion_active ?? true,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  }
}

export const productToRow = (product: GroceryProduct): ProductRow => {
  const retailPrice = product.retailPrice !== undefined && product.retailPrice !== null ? product.retailPrice : product.sellingPrice
  const row: ProductRow = {
    id: product.id,
    name: product.name,
    category: product.category || null,
    barcode: product.barcode || null,
    cost_price: product.costPrice,
    selling_price: retailPrice,
    retail_price: retailPrice,
    wholesale_price: product.wholesalePrice ?? null,
    wholesale_enabled: Boolean(product.wholesaleEnabled),
    wholesale_min_quantity: product.wholesaleMinQuantity ?? null,
    stock_quantity: product.stockQuantity,
    low_stock_level: product.lowStockLevel,
    unit: product.unit || null,
    active: product.active,
    pack_pricing_enabled: Boolean(product.packPricingEnabled),
    promotion_enabled: Boolean(product.promotionEnabled),
    promotion_type: product.promotionType || 'BUY_X_GET_Y_FREE',
    promotion_buy_quantity: product.promotionBuyQuantity != null ? Number(product.promotionBuyQuantity) : 2,
    promotion_free_quantity: product.promotionFreeQuantity != null ? Number(product.promotionFreeQuantity) : 1,
    promotion_start_date: product.promotionStartDate || null,
    promotion_end_date: product.promotionEndDate || null,
    promotion_active: product.promotionActive ?? true,
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
  let packRows: ProductPackPriceRow[] = []
  try {
    packRows = await listRows<ProductPackPriceRow>('product_pack_prices')
  } catch {
    // If product_pack_prices table doesn't exist yet, gracefully proceed
  }

  const packMap = new Map<string, ProductPackPrice[]>()
  for (const pr of packRows) {
    if (!pr.product_id) continue
    const list = packMap.get(pr.product_id) || []
    list.push({
      id: pr.id,
      productId: pr.product_id,
      sellingMode: pr.selling_mode || 'RETAIL',
      quantity: Number(pr.quantity),
      packPrice: Number(pr.pack_price),
      active: pr.active ?? true,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    })
    packMap.set(pr.product_id, list)
  }

  return sortGroceryProducts(rows.map(row => rowToProduct(row, packMap.get(row.id) || [])))
}

export const saveProducts = async (products: GroceryProduct[]) => {
  await upsertRows('products', products.map(productToRow))

  // Upsert all pack rules for products that have them
  const allPackRows: ProductPackPriceRow[] = []
  for (const p of products) {
    if (p.packPrices && Array.isArray(p.packPrices)) {
      for (const pr of p.packPrices) {
        allPackRows.push({
          id: pr.id || `pack-${p.id}-${pr.sellingMode}-${pr.quantity}`,
          product_id: p.id,
          selling_mode: pr.sellingMode,
          quantity: pr.quantity,
          pack_price: pr.packPrice,
          active: pr.active ?? true,
          created_at: pr.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    }
  }

  if (allPackRows.length > 0) {
    try {
      await upsertRows('product_pack_prices', allPackRows)
    } catch (err) {
      console.warn('Could not sync pack prices to product_pack_prices table:', err)
    }
  }
}

export const deleteProduct = (id: string) => deleteRow('products', id)

