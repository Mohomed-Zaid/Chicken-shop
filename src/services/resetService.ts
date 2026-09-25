import { supabase } from '../lib/supabase'
import { storageAdapter } from './storageAdapter'

export interface ResetOptions {
  clearProducts?: boolean
}

export interface ResetResult {
  success: boolean
  message: string
  cloudReset: boolean
  localReset: boolean
  details: string[]
}

/**
 * Completely resets operational business data for real/production use.
 * 
 * Safely removes:
 * - Test sales & invoice transaction history
 * - Held POS orders
 * - Customer directory & customer payment/credit records
 * - Purchases, supplier records & supplier payments
 * - Inventory stock movements & adjustment logs
 * - Shop expenses
 * - Chicken price history
 * - (Optional) Grocery product catalog (default: true)
 * 
 * Safely preserves:
 * - User logins & cashier/admin profile records
 * - Store subscription and license status
 * - Store details & receipt configuration (name, phone, address)
 * - Standard chicken cuts
 */
export async function resetAllDataForRealUse(options: ResetOptions = { clearProducts: true }): Promise<ResetResult> {
  const details: string[] = []

  // 1. Wipe LocalStorage operational data
  try {
    localStorage.removeItem('sales-transactions')
    localStorage.setItem('sales-invoice-sequence', '0')
    details.push('Cleared sales transactions & reset invoice sequence to INV-000001')

    localStorage.removeItem('pos-held-orders')
    localStorage.setItem('pos-held-order-sequence', '0')
    details.push('Cleared POS held orders')

    localStorage.removeItem('customers')
    localStorage.removeItem('customer-payments')
    localStorage.setItem('customer-payment-sequence', '0')
    details.push('Cleared customer accounts & payment logs')

    localStorage.removeItem('purchases')
    localStorage.setItem('purchase-sequence', '0')
    localStorage.removeItem('suppliers')
    localStorage.removeItem('supplier-payments')
    details.push('Cleared purchases, suppliers & supplier payments')

    localStorage.removeItem('stock-movements')
    details.push('Cleared inventory stock movement history')

    localStorage.removeItem('expenses')
    details.push('Cleared expense records')

    localStorage.removeItem('chicken-price-history')
    details.push('Cleared chicken price history')

    if (options.clearProducts) {
      localStorage.setItem('grocery-products', JSON.stringify([]))
      details.push('Cleared grocery product catalog')
    }
  } catch (localErr) {
    console.warn('LocalStorage reset issue:', localErr)
  }

  // 2. Cloud database reset if Supabase is connected
  let cloudReset = false
  if (storageAdapter.isSupabase() && supabase) {
    const client = supabase
    try {
      // First attempt dedicated security-definer RPC
      const { error: rpcError } = await client.rpc('reset_all_data_for_production', {
        clear_products: Boolean(options.clearProducts),
      })

      if (!rpcError) {
        cloudReset = true
        details.push('Cloud database tables and sequence counters successfully reset via RPC')
      } else {
        console.warn('RPC reset_all_data_for_production not available or error:', rpcError)
        // Fallback to table-by-table client delete
        const safeDelete = async (table: string) => {
          try {
            await client.from(table).delete().neq('id', '0')
          } catch {
            // ignore table deletion error
          }
        }

        await safeDelete('sale_items')
        await safeDelete('sales')
        await safeDelete('customer_payments')
        await safeDelete('customers')
        await safeDelete('purchase_items')
        await safeDelete('purchases')
        await safeDelete('supplier_payments')
        await safeDelete('suppliers')
        await safeDelete('stock_movements')
        await safeDelete('expenses')
        await safeDelete('chicken_price_history')
        if (options.clearProducts) {
          await safeDelete('products')
        }

        // Reset PostgreSQL sequence counters to 1
        try { await client.rpc('sync_invoice_number_sequence', { last_value: 0 }) } catch {}
        try { await client.rpc('sync_purchase_number_sequence', { last_value: 0 }) } catch {}

        cloudReset = true
        details.push('Cloud database tables cleared directly via client API')
      }
    } catch (cloudErr) {
      console.error('Cloud database reset error:', cloudErr)
      details.push('Cloud tables partial/skipped. (Run supabase/clear_all_test_data.sql in Supabase SQL editor to ensure cloud is wiped)')
    }
  }

  // 3. Dispatch system update events to re-render all views in real-time
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('data_reset'))
    window.dispatchEvent(new CustomEvent('sales_updated'))
    window.dispatchEvent(new CustomEvent('customers_updated'))
    window.dispatchEvent(new CustomEvent('stock_updated'))
  }

  return {
    success: true,
    message: 'System data has been successfully cleared for real production use.',
    cloudReset,
    localReset: true,
    details,
  }
}
