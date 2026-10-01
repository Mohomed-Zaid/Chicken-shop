import { listRows, upsertRows, requireSupabase } from './clientHelpers'
import type { Purchase } from '../../data/purchases'

export const getPurchases = () => listRows('purchases')
export const getPurchaseItems = () => listRows('purchase_items')
export const savePurchases = (rows: Record<string, unknown>[]) => upsertRows('purchases', rows)
export const savePurchaseItems = (rows: Record<string, unknown>[]) => upsertRows('purchase_items', rows)

export const savePurchaseToSupabase = async (purchase: Purchase) => {
  try {
    const purchaseRow: Record<string, unknown> = {
      id: purchase.id,
      purchase_number: purchase.purchaseNumber,
      supplier_id: purchase.supplierId,
      supplier_name: purchase.supplierName,
      purchased_at: new Date(`${purchase.date} ${purchase.time || '00:00:00'}`).toISOString(),
      subtotal: purchase.subtotal,
      discount: purchase.discount,
      total: purchase.total,
      payment_method: purchase.paymentMethod,
      amount_paid: purchase.amountPaid,
      balance_due: purchase.balanceDue,
      status: purchase.status,
      created_at: purchase.createdAt || new Date().toISOString()
    }
    const itemRows: Record<string, unknown>[] = purchase.items.map((item, index) => ({
      id: `${purchase.id}-item-${index}`,
      purchase_id: purchase.id,
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantity,
      cost_price: item.costPrice,
      total: item.total
    }))

    // 1. Ensure any chicken item exists in products table to satisfy FK references products(id)
    const chickenItems = purchase.items.filter(item => item.productType === 'chicken')
    if (chickenItems.length > 0) {
      await upsertRows(
        'products',
        chickenItems.map(item => ({
          id: item.productId,
          name: item.productName,
          category: 'Chicken',
          cost_price: item.costPrice,
          selling_price: item.costPrice,
          stock_quantity: 0,
          low_stock_level: 5,
          unit: item.unit || 'kg',
          active: true,
        }))
      ).catch(err => {
        console.warn('Non-fatal: could not sync chicken product definitions:', err)
      })
    }

    await savePurchases([purchaseRow])
    if (itemRows.length > 0) {
      await savePurchaseItems(itemRows)
    }

    // 2. Increment stock in Supabase for all received grocery products
    const groceryLines = purchase.items.filter(item => item.productType !== 'chicken')
    for (const item of groceryLines) {
      if (item.productId && item.quantity > 0) {
        try {
          const db = requireSupabase()
          const { error: rpcErr } = await db.rpc('receive_purchase_stock', {
            p_product_id: item.productId,
            p_quantity: item.quantity,
            p_reference_id: purchase.id,
            p_reference_number: purchase.purchaseNumber,
            p_reason: 'Completed purchase'
          })
          if (rpcErr) {
            await db.rpc('adjust_stock', {
              p_product_id: item.productId,
              p_delta: item.quantity,
              p_movement_type: 'purchase',
              p_reason: 'Completed purchase',
              p_notes: `Purchase ${purchase.purchaseNumber}`,
              p_reference_id: purchase.id,
              p_reference_number: purchase.purchaseNumber
            })
          }
        } catch (stockErr) {
          console.warn(`Could not sync purchase stock for ${item.productName}:`, stockErr)
        }
      }
    }
  } catch (err) {
    console.error('Failed to sync purchase to Supabase:', err)
  }
}
