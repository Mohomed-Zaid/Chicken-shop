import type { Sale, SaleItem } from '../../data/records'
import { requireSupabase, listRows, upsertRows } from './clientHelpers'

export const getSales = () => listRows('sales')
export const getSaleItems = () => listRows('sale_items')

export const fetchSalesFromSupabase = async (): Promise<Sale[]> => {
  try {
    const db = requireSupabase()
    const { data, error } = await db
      .from('sales')
      .select('*, sale_items(*)')
      .order('sold_at', { ascending: false })

    if (error || !data) return []

    return data.map(row => {
      const soldAtDate = row.sold_at ? new Date(row.sold_at) : new Date()
      const rawItems = (row.sale_items || []) as Array<{
        id?: string
        product_id?: string
        product_name?: string
        product_type?: string
        quantity?: number | string
        weight_grams?: number | string
        unit_price?: number | string
        price_per_kg?: number | string
        cost_price?: number | string
        total?: number | string
      }>

      const items: SaleItem[] = rawItems.map(si => ({
        productId: si.product_id || '',
        productName: si.product_name || 'Item',
        productType: (si.product_type as 'chicken' | 'grocery') || 'grocery',
        quantity: Number(si.quantity || 1),
        weightGrams: si.weight_grams ? Number(si.weight_grams) : null,
        unitPrice: Number(si.unit_price || 0),
        pricePerKg: si.price_per_kg ? Number(si.price_per_kg) : null,
        costPrice: si.cost_price ? Number(si.cost_price) : null,
        total: Number(si.total || 0),
      }))

      return {
        id: row.id,
        invoiceNumber: row.invoice_number,
        date: row.sold_at ? row.sold_at.slice(0, 10) : soldAtDate.toISOString().slice(0, 10),
        time: soldAtDate.toLocaleTimeString(),
        items,
        subtotal: Number(row.subtotal || 0),
        discount: Number(row.discount || 0),
        tax: Number(row.tax || 0),
        service: Number(row.service || 0),
        total: Number(row.total || 0),
        paymentMethod: row.payment_method || 'Cash',
        amountReceived: Number(row.amount_received || 0),
        change: Number(row.change || 0),
        cashier: row.cashier || 'Cashier',
        customerName: row.customer_name || 'Walk-in Customer',
        status: (row.status as 'completed' | 'cancelled') || 'completed',
      }
    })
  } catch (err) {
    console.error('Failed to fetch sales from Supabase:', err)
    return []
  }
}


export const fetchNextInvoiceNumber = async (): Promise<string> => {
  const localSeq = Number(localStorage.getItem('sales-invoice-sequence') || '0')
  try {
    const db = requireSupabase()
    
    // 1. Try atomic database sequence RPC first
    const rpcRes = await db.rpc('next_invoice_number')
    if (!rpcRes.error && rpcRes.data) {
      const inv = String(rpcRes.data)
      const match = inv.match(/(\d+)$/)
      if (match) {
        localStorage.setItem('sales-invoice-sequence', match[1])
      }
      return inv
    }
  } catch {
    // Continue to fallback
  }

  const nextLocal = localSeq + 1
  localStorage.setItem('sales-invoice-sequence', String(nextLocal))
  return `INV-${String(nextLocal).padStart(6, '0')}`
}

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

export const completeSaleAtomically = async (
  sale: Sale
): Promise<{ data: unknown; error: Error | null; finalSale?: Sale }> => {
  const db = requireSupabase()
  let currentSale = { ...sale }

  for (let attempt = 0; attempt < 5; attempt++) {
    const soldAt = new Date().toISOString()
    const payload = {
      id: currentSale.id,
      invoice_number: currentSale.invoiceNumber,
      sold_at: soldAt,
      cashier: currentSale.cashier,
      customer_name: currentSale.customerName,
      subtotal: currentSale.subtotal,
      discount: currentSale.discount,
      tax: currentSale.tax,
      service: currentSale.service,
      total: currentSale.total,
      payment_method: currentSale.paymentMethod,
      amount_received: currentSale.amountReceived,
      change: currentSale.change,
      status: currentSale.status,
      items: currentSale.items.map((item, index) => ({
        id: `${currentSale.id}-item-${index}-${item.productId || 'item'}`,
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
    }

    const res = await db.rpc('complete_sale', { sale_payload: payload })
    if (!res.error) {
      // Sync local sequence counter with successfully saved invoice
      const match = currentSale.invoiceNumber?.match(/(\d+)$/)
      if (match) {
        const num = parseInt(match[1], 10)
        const currentLocal = Number(localStorage.getItem('sales-invoice-sequence') || '0')
        if (num >= currentLocal) {
          localStorage.setItem('sales-invoice-sequence', String(num))
        }
      }
      return { data: res.data, error: null, finalSale: currentSale }
    }

    // If duplicate key on invoice_number constraint occurs, generate fresh next invoice number and retry
    const errorString = `${res.error.message || ''} ${res.error.details || ''} ${res.error.hint || ''} ${res.error.code || ''}`
    if (
      res.error.code === '23505' ||
      errorString.includes('sales_invoice_number_key') ||
      errorString.includes('duplicate key') ||
      errorString.includes('unique constraint')
    ) {
      // Advance local counter by 1 before re-querying to avoid re-collision
      const currentSeq = Number(localStorage.getItem('sales-invoice-sequence') || '0')
      localStorage.setItem('sales-invoice-sequence', String(currentSeq + 1))

      const nextInv = await fetchNextInvoiceNumber()
      currentSale = {
        ...currentSale,
        id: `sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        invoiceNumber: nextInv,
      }
      continue
    }

    return { data: null, error: new Error(res.error.message || 'Sale could not be saved.') }
  }

  return {
    data: null,
    error: new Error('Unable to assign a unique invoice number. Please try again.'),
  }
}


