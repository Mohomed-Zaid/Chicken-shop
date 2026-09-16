import type { Sale, SaleItem } from '../../data/records'
import { requireSupabase, listRows, upsertRows } from './clientHelpers'

export const getSales = () => listRows('sales')
export const getSaleItems = () => listRows('sale_items')

export const saveSale = async (sale: Sale) => {
  const db = requireSupabase()
  const soldAt = new Date().toISOString()
  const { error } = await db
    .from('sales')
    .upsert({
      id: sale.id,
      invoice_number: sale.invoiceNumber,
      sold_at: soldAt,
      cashier: sale.cashier,
      customer_name: sale.customerName,
      subtotal: sale.subtotal,
      discount: sale.discount,
      tax: sale.tax,
      service: sale.service,
      total: sale.total,
      payment_method: sale.paymentMethod,
      amount_received: sale.amountReceived,
      change: sale.change,
      status: sale.status,
    })
    .select()
    .single()

  if (error) {
    console.error('Unable to save sale.', error)
    throw new Error(error.message || 'Unable to save sale.')
  }

  await upsertRows(
    'sale_items',
    sale.items.map((item: SaleItem, index) => ({
      id: `${sale.id}-item-${index}-${item.productId || 'item'}`,
      sale_id: sale.id,
      product_type: item.productType,
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantity,
      weight_grams: item.weightGrams,
      unit_price: item.unitPrice,
      price_per_kg: item.pricePerKg,
      cost_price: item.costPrice,
      total: item.total,
    }))
  )
  return sale
}

export const completeSaleAtomically = (sale: Sale) => {
  const db = requireSupabase()
  const soldAt = new Date().toISOString()
  return db.rpc('complete_sale', {
    sale_payload: {
      id: sale.id,
      invoice_number: sale.invoiceNumber,
      sold_at: soldAt,
      cashier: sale.cashier,
      customer_name: sale.customerName,
      subtotal: sale.subtotal,
      discount: sale.discount,
      tax: sale.tax,
      service: sale.service,
      total: sale.total,
      payment_method: sale.paymentMethod,
      amount_received: sale.amountReceived,
      change: sale.change,
      status: sale.status,
      items: sale.items.map((item, index) => ({
        id: `${sale.id}-item-${index}-${item.productId || 'item'}`,
        product_id: item.productId,
        product_name: item.productName,
        product_type: item.productType,
        quantity: item.quantity,
        weight_grams: item.weightGrams,
        unit_price: item.unitPrice,
        price_per_kg: item.pricePerKg,
        cost_price: item.costPrice,
        total: item.total,
      })),
    },
  })
}
