import { requireSupabase, listRows } from './clientHelpers'

export async function adjustStock(productId: string, delta: number, movementType: string, reason: string, notes: string) {
  const { data, error } = await requireSupabase().rpc('adjust_stock', { p_product_id: productId, p_delta: delta, p_movement_type: movementType, p_reason: reason, p_notes: notes })
  if (error) throw new Error(error.message.includes('Insufficient stock') ? error.message : 'Stock change was not permitted.')
  return data as { product_id: string; previous_stock: number; new_stock: number }
}
export const getInventoryProducts = () => listRows<Record<string, unknown>>('products')
export const getInventoryMovements = () => listRows<Record<string, unknown>>('stock_movements')