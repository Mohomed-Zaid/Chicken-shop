import type { Sale, SaleItem } from '../../data/records'
import { requireSupabase, listRows, upsertRows } from './clientHelpers'

export const getSales = () => listRows('sales')
export const getSaleItems = () => listRows('sale_items')

export const fetchSalesFromSupabase = async (): Promise<Sale[]> => {
  try {
    const db = requireSupabase()
    let salesData: any[] | null = null
    const { data, error } = await db
      .from('sales')
      .select('*, sale_items(*)')
      .order('sold_at', { ascending: false })

    if (error || !data) {
      if (error) console.warn('Supabase sales query with items failed, trying fallback:', error)
      const fallback = await db
        .from('sales')
        .select('*')
        .order('sold_at', { ascending: false })
      if (!fallback.error && fallback.data) {
        salesData = fallback.data
      } else {
        return []
      }
    } else {
      salesData = data
    }

    return salesData.map(row => {
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
        paid_quantity?: number | string
        free_quantity?: number | string
        total_quantity?: number | string
        promotion_applied?: boolean
        promotion_type?: string
        promotion_buy_quantity?: number | string
        promotion_free_quantity?: number | string
        selling_mode?: string
        price_type?: string
        pack_pricing_applied?: boolean
        pack_breakdown?: any
      }>

      const items: SaleItem[] = rawItems.map(si => {
        const paidQty = si.paid_quantity != null ? Number(si.paid_quantity) : Number(si.quantity || 1)
        const freeQty = si.free_quantity != null ? Number(si.free_quantity) : 0
        const totalQty = si.total_quantity != null ? Number(si.total_quantity) : (paidQty + freeQty)
        let parsedBreakdown: any = undefined
        if (si.pack_breakdown) {
          if (Array.isArray(si.pack_breakdown)) {
            parsedBreakdown = si.pack_breakdown
          } else if (typeof si.pack_breakdown === 'string') {
            try { parsedBreakdown = JSON.parse(si.pack_breakdown) } catch {}
          }
        }
        return {
          productId: si.product_id || '',
          productName: si.product_name || 'Item',
          productType: (si.product_type as 'chicken' | 'grocery') || 'grocery',
          quantity: paidQty,
          weightGrams: si.weight_grams ? Number(si.weight_grams) : null,
          unitPrice: Number(si.unit_price || 0),
          pricePerKg: si.price_per_kg ? Number(si.price_per_kg) : null,
          costPrice: si.cost_price ? Number(si.cost_price) : null,
          total: Number(si.total || 0),
          paidQuantity: paidQty,
          freeQuantity: freeQty,
          totalQuantity: totalQty,
          promotionApplied: Boolean(si.promotion_applied || freeQty > 0),
          promotionType: si.promotion_type || null,
          promotionBuyQuantity: si.promotion_buy_quantity != null ? Number(si.promotion_buy_quantity) : null,
          promotionFreeQuantity: si.promotion_free_quantity != null ? Number(si.promotion_free_quantity) : null,
          sellingMode: (si.selling_mode as 'RETAIL' | 'WHOLESALE') || (row.selling_mode as 'RETAIL' | 'WHOLESALE') || 'RETAIL',
          priceType: (si.price_type as 'RETAIL' | 'WHOLESALE') || 'RETAIL',
          packPricingApplied: Boolean(si.pack_pricing_applied),
          packBreakdown: parsedBreakdown,
        }
      })

      const year = soldAtDate.getFullYear()
      const month = String(soldAtDate.getMonth() + 1).padStart(2, '0')
      const day = String(soldAtDate.getDate()).padStart(2, '0')
      const localDateStr = `${year}-${month}-${day}`

      return {
        id: row.id,
        invoiceNumber: row.invoice_number,
        date: localDateStr,
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
        customerId: row.customer_id || undefined,
        customerName: row.customer_name || 'Walk-in Customer',
        status: (row.status as 'completed' | 'cancelled') || 'completed',
        sellingMode: (row.selling_mode as 'RETAIL' | 'WHOLESALE') || 'RETAIL',
      }
    })
  } catch (err) {
    console.error('Failed to fetch sales from Supabase:', err)
    return []
  }
}


export const fetchNextInvoiceNumber = async (): Promise<string> => {
  let maxExistingNum = 0

  // 1. Check local sequence and local records
  const localSeq = Number(localStorage.getItem('sales-invoice-sequence') || '0')
  if (localSeq > maxExistingNum) {
    maxExistingNum = localSeq
  }

  try {
    const rawLocalSales = localStorage.getItem('sales-transactions')
    if (rawLocalSales) {
      const parsed = JSON.parse(rawLocalSales) as Array<{ invoiceNumber?: string }>
      for (const s of parsed) {
        if (s.invoiceNumber) {
          const digits = s.invoiceNumber.replace(/\D/g, '')
          if (digits) {
            const val = parseInt(digits, 10)
            if (!isNaN(val) && val > maxExistingNum) {
              maxExistingNum = val
            }
          }
        }
      }
    }
  } catch {
    // Ignore local parse error
  }

  try {
    const db = requireSupabase()

    // 2. Query the highest existing invoice numbers in Supabase database
    const { data: latestSales } = await db
      .from('sales')
      .select('invoice_number')
      .order('sold_at', { ascending: false })
      .limit(100)

    if (latestSales && latestSales.length > 0) {
      for (const row of latestSales) {
        if (row.invoice_number) {
          const digits = row.invoice_number.replace(/\D/g, '')
          if (digits) {
            const val = parseInt(digits, 10)
            if (!isNaN(val) && val > maxExistingNum) {
              maxExistingNum = val
            }
          }
        }
      }
    }

    // 3. Try database sequence RPC
    const rpcRes = await db.rpc('next_invoice_number')
    if (!rpcRes.error && rpcRes.data) {
      const inv = String(rpcRes.data)
      const digits = inv.replace(/\D/g, '')
      const rpcVal = digits ? parseInt(digits, 10) : 0

      // Only use the RPC invoice if it is strictly greater than all known existing invoices
      if (rpcVal > maxExistingNum) {
        localStorage.setItem('sales-invoice-sequence', String(rpcVal))
        return inv
      }
    }

    // If RPC was <= maxExistingNum (sequence behind), advance past highest existing invoice
    const nextNum = maxExistingNum + 1
    localStorage.setItem('sales-invoice-sequence', String(nextNum))

    // Attempt to sync database sequence to prevent future lag
    try {
      await db.rpc('sync_invoice_number_sequence', { last_value: nextNum })
    } catch {
      // Ignore RPC error if not defined
    }

    return `INV-${String(nextNum).padStart(6, '0')}`
  } catch {
    // Fallback if network/db error
    const nextNum = maxExistingNum + 1
    localStorage.setItem('sales-invoice-sequence', String(nextNum))
    return `INV-${String(nextNum).padStart(6, '0')}`
  }
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
      customer_id: sale.customerId || null,
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
      selling_mode: sale.sellingMode || 'RETAIL',
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
      paid_quantity: item.paidQuantity ?? item.quantity,
      free_quantity: item.freeQuantity ?? 0,
      total_quantity: item.totalQuantity ?? (item.quantity + (item.freeQuantity || 0)),
      promotion_applied: Boolean(item.promotionApplied),
      promotion_type: item.promotionType || null,
      promotion_buy_quantity: item.promotionBuyQuantity ?? null,
      promotion_free_quantity: item.promotionFreeQuantity ?? null,
      selling_mode: item.sellingMode || sale.sellingMode || 'RETAIL',
      price_type: item.priceType || 'RETAIL',
      pack_pricing_applied: Boolean(item.packPricingApplied),
      pack_breakdown: item.packBreakdown ? item.packBreakdown : null,
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
      customer_id: currentSale.customerId || null,
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
      selling_mode: currentSale.sellingMode || 'RETAIL',
      items: currentSale.items.map((item, index) => ({
        id: `${currentSale.id}-item-${index}-${item.productId || 'item'}`,
        product_id: item.productId,
        product_name: item.productName,
        product_type: item.productType,
        quantity: item.quantity,
        paid_quantity: item.paidQuantity ?? item.quantity,
        free_quantity: item.freeQuantity ?? 0,
        total_quantity: item.totalQuantity ?? (item.quantity + (item.freeQuantity || 0)),
        promotion_applied: Boolean(item.promotionApplied),
        promotion_type: item.promotionType || null,
        promotion_buy_quantity: item.promotionBuyQuantity ?? null,
        promotion_free_quantity: item.promotionFreeQuantity ?? null,
        weight_grams: item.weightGrams,
        unit_price: item.unitPrice,
        price_per_kg: item.pricePerKg,
        cost_price: item.costPrice,
        total: item.total,
        selling_mode: item.sellingMode || currentSale.sellingMode || 'RETAIL',
        price_type: item.priceType || 'RETAIL',
        pack_pricing_applied: Boolean(item.packPricingApplied),
        pack_breakdown: item.packBreakdown ? item.packBreakdown : null,
      })),
    }

    const res = await db.rpc('complete_sale', { sale_payload: payload })
    if (!res.error) {
      // In case database generated or formatted the invoice_number:
      const returnedPayload = res.data as { invoice_number?: string } | null
      const actualInvoice = returnedPayload?.invoice_number || currentSale.invoiceNumber
      const updatedSale = { ...currentSale, invoiceNumber: actualInvoice }

      // Sync local sequence counter with successfully saved invoice
      const match = actualInvoice?.match(/(\d+)$/)
      if (match) {
        const num = parseInt(match[1], 10)
        const currentLocal = Number(localStorage.getItem('sales-invoice-sequence') || '0')
        if (num >= currentLocal) {
          localStorage.setItem('sales-invoice-sequence', String(num))
        }
      }
      return { data: res.data, error: null, finalSale: updatedSale }
    }

    // If duplicate key on invoice_number constraint occurs, find the highest existing number and jump above it
    const errorString = `${res.error.message || ''} ${res.error.details || ''} ${res.error.hint || ''} ${res.error.code || ''}`
    if (
      res.error.code === '23505' ||
      errorString.includes('sales_invoice_number_key') ||
      errorString.includes('duplicate key') ||
      errorString.includes('unique constraint')
    ) {
      let maxDbNum = 0
      try {
        const { data: dbSales } = await db
          .from('sales')
          .select('invoice_number')
          .order('sold_at', { ascending: false })
          .limit(100)
        if (dbSales) {
          for (const s of dbSales) {
            const digits = (s.invoice_number || '').replace(/\D/g, '')
            if (digits) {
              const val = parseInt(digits, 10)
              if (val > maxDbNum) maxDbNum = val
            }
          }
        }
      } catch {
        // Continue
      }

      const currentSeq = Number(localStorage.getItem('sales-invoice-sequence') || '0')
      const targetSeq = Math.max(maxDbNum, currentSeq) + 1 + attempt
      localStorage.setItem('sales-invoice-sequence', String(targetSeq))

      try {
        await db.rpc('sync_invoice_number_sequence', { last_value: targetSeq })
      } catch {
        // Continue
      }

      const nextInv = `INV-${String(targetSeq).padStart(6, '0')}`
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

export const deleteSaleFromSupabase = async (saleId: string): Promise<boolean> => {
  try {
    const db = requireSupabase()
    // 1. Delete associated sale items first if any
    await db.from('sale_items').delete().eq('sale_id', saleId)
    // 2. Delete parent sale row
    const { error } = await db.from('sales').delete().eq('id', saleId)
    if (error) {
      console.warn('Supabase delete sale error:', error)
      return false
    }
    return true
  } catch (err) {
    console.warn('Supabase delete sale exception:', err)
    return false
  }
}


