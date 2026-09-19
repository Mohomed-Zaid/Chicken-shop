import { useState, useEffect, useMemo } from 'react'
import { formatMoney } from '../data/chicken'
import { salesStore, toLocalDateString, type Sale, type PaymentMethod } from '../data/records'
import { fetchSalesFromSupabase } from '../services/supabase/salesService'
import { storageAdapter } from '../services/storageAdapter'
import { ReceiptPreview } from './Receipt'

export function Sales() {
  const [sales, setSales] = useState<Sale[]>(() => salesStore.getSales())
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'>('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<string>('all')
  const [selectedReceipt, setSelectedReceipt] = useState<Sale | null>(null)
  const [inspectSale, setInspectSale] = useState<Sale | null>(null)

  // Load sales from local storage and Supabase cloud
  const refreshSales = async () => {
    setLoading(true)
    try {
      // 1. Load local cache first
      const local = salesStore.getSales()
      setSales(local)

      // 2. Fetch cloud sales if Supabase is connected
      if (storageAdapter.isSupabase()) {
        const cloudSales = await fetchSalesFromSupabase().catch(() => [] as Sale[])
        if (cloudSales && cloudSales.length > 0) {
          const salesMap = new Map<string, Sale>()
          cloudSales.forEach(s => salesMap.set(s.id, s))
          local.forEach(s => {
            if (s && s.id && !salesMap.has(s.id)) salesMap.set(s.id, s)
          })
          const merged = Array.from(salesMap.values()).sort((a, b) => {
            const dateA = new Date(`${a.date} ${a.time || '00:00:00'}`).getTime()
            const dateB = new Date(`${b.date} ${b.time || '00:00:00'}`).getTime()
            return dateB - dateA
          })
          setSales(merged)
          localStorage.setItem('sales-transactions', JSON.stringify(merged))
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshSales()

    // Listen to real-time sales created in POS
    const handleSaleUpdate = () => {
      setSales(salesStore.getSales())
    }
    window.addEventListener('sales_updated', handleSaleUpdate)
    return () => window.removeEventListener('sales_updated', handleSaleUpdate)
  }, [])

  // Calculate Date Ranges
  const todayStr = toLocalDateString()
  const yesterdayStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return toLocalDateString(d)
  }, [])

  const weekStartStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return toLocalDateString(d)
  }, [])

  const monthStartStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return toLocalDateString(d)
  }, [])

  // Filtered Sales
  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      // 1. Date Filter
      if (dateFilter === 'today' && sale.date !== todayStr) return false
      if (dateFilter === 'yesterday' && sale.date !== yesterdayStr) return false
      if (dateFilter === 'week' && sale.date < weekStartStr) return false
      if (dateFilter === 'month' && sale.date < monthStartStr) return false
      if (dateFilter === 'custom') {
        if (customStart && sale.date < customStart) return false
        if (customEnd && sale.date > customEnd) return false
      }

      // 2. Payment Method Filter
      if (paymentFilter !== 'all' && sale.paymentMethod !== paymentFilter) return false

      // 3. Search Query (Invoice, Customer, Cashier, Item)
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matchInvoice = sale.invoiceNumber.toLowerCase().includes(q)
        const matchCustomer = (sale.customerName || '').toLowerCase().includes(q)
        const matchCashier = (sale.cashier || '').toLowerCase().includes(q)
        const matchItem = sale.items?.some(it => it.productName.toLowerCase().includes(q))
        if (!matchInvoice && !matchCustomer && !matchCashier && !matchItem) return false
      }

      return true
    })
  }, [sales, dateFilter, customStart, customEnd, paymentFilter, search, todayStr, yesterdayStr, weekStartStr, monthStartStr])

  // Summary Metrics for filtered view
  const metrics = useMemo(() => {
    const completed = filteredSales.filter(s => s.status !== 'cancelled')
    const totalRevenue = completed.reduce((sum, s) => sum + s.total, 0)
    const billCount = completed.length
    const avgBill = billCount > 0 ? totalRevenue / billCount : 0

    const cashTotal = completed.filter(s => s.paymentMethod === 'Cash').reduce((sum, s) => sum + s.total, 0)
    const cardTotal = completed.filter(s => s.paymentMethod === 'Card').reduce((sum, s) => sum + s.total, 0)
    const creditTotal = completed.filter(s => s.paymentMethod === 'Credit').reduce((sum, s) => sum + s.total, 0)

    // Chicken total weight sold in this range
    const chickenKg = completed
      .flatMap(s => s.items || [])
      .filter(it => it.productType === 'chicken')
      .reduce((sum, it) => sum + (it.weightGrams || 0) / 1000, 0)

    return { totalRevenue, billCount, avgBill, cashTotal, cardTotal, creditTotal, chickenKg }
  }, [filteredSales])

  const formatDisplayDate = (d: string) => {
    if (!d) return ''
    const parts = d.split('-')
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d
  }

  const paymentBadgeClass = (method: PaymentMethod) => {
    switch (method) {
      case 'Cash':
        return 'badge-cash'
      case 'Card':
        return 'badge-card'
      case 'Credit':
        return 'badge-credit'
      default:
        return 'badge-other'
    }
  }

  return (
    <section className="prices-page sales-page">
      {/* HEADER */}
      <header className="page-header">
        <div>
          <small>POINT OF SALE TRANSACTIONS</small>
          <h1>Sales Records &amp; Invoices</h1>
          <p>Browse sales history, inspect customer orders, and reprint 80mm thermal receipts.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="secondary"
            onClick={refreshSales}
            disabled={loading}
            title="Refresh sales list"
          >
            {loading ? '🔄 Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      </header>

      {/* KPI METRIC CARDS */}
      <div className="price-overview" style={{ marginBottom: '16px' }}>
        <div>
          <small>FILTERED REVENUE</small>
          <b style={{ color: '#10b981' }}>{formatMoney(metrics.totalRevenue)}</b>
        </div>
        <div>
          <small>BILLS COUNT</small>
          <b style={{ color: '#38bdf8' }}>{metrics.billCount}</b>
        </div>
        <div>
          <small>AVERAGE TICKET</small>
          <b style={{ color: '#f59e0b' }}>{formatMoney(metrics.avgBill)}</b>
        </div>
        <div>
          <small>CASH COLLECTED</small>
          <b style={{ color: '#4ade80' }}>{formatMoney(metrics.cashTotal)}</b>
        </div>
        <div>
          <small>CARD / CREDIT</small>
          <b style={{ color: '#a78bfa' }}>{formatMoney(metrics.cardTotal + metrics.creditTotal)}</b>
        </div>
        <div>
          <small>CHICKEN SOLD</small>
          <b style={{ color: '#fb923c' }}>{metrics.chickenKg.toFixed(2)} kg</b>
        </div>
      </div>

      {/* FILTERS TOOLBAR */}
      <div className="sales-filter-bar">
        {/* Search Input */}
        <div className="sales-search-wrap">
          <input
            className="product-search"
            placeholder="Search invoice (#INV-...), customer, cashier, or product..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Date Filter Tabs */}
        <div className="sales-date-tabs">
          {(['today', 'yesterday', 'week', 'month', 'all', 'custom'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              className={`filter-tab ${dateFilter === tab ? 'active' : ''}`}
              onClick={() => setDateFilter(tab)}
            >
              {tab === 'today'
                ? 'Today'
                : tab === 'yesterday'
                ? 'Yesterday'
                : tab === 'week'
                ? 'Last 7 Days'
                : tab === 'month'
                ? 'Last 30 Days'
                : tab === 'all'
                ? 'All Time'
                : '📅 Custom'}
            </button>
          ))}
        </div>

        {/* Payment Method Selector */}
        <select
          className="sales-select-filter"
          value={paymentFilter}
          onChange={e => setPaymentFilter(e.target.value)}
        >
          <option value="all">All Payment Methods</option>
          <option value="Cash">Cash (මුදල්)</option>
          <option value="Card">Card (කාඩ්පත්)</option>
          <option value="Credit">Credit (ණය)</option>
          <option value="Other">Other</option>
        </select>
      </div>

      {/* Custom Date Inputs (shown when custom is picked) */}
      {dateFilter === 'custom' && (
        <div className="sales-custom-date-row">
          <label>
            From Date:
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
            />
          </label>
          <label>
            To Date:
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
            />
          </label>
        </div>
      )}

      {/* SALES LIST TABLE */}
      <section className="price-table sales-table-container">
        <div className="price-row sales-row table-head">
          <span>Invoice &amp; Time</span>
          <span>Customer</span>
          <span>Items Summary</span>
          <span>Cashier</span>
          <span>Payment</span>
          <span>Total Amount</span>
          <span>Actions</span>
        </div>

        {filteredSales.length === 0 ? (
          <div className="empty-sales-notice">
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>🧾</div>
            <strong>No sales records found</strong>
            <p>Try clearing filters or completing a transaction in the POS workspace.</p>
          </div>
        ) : (
          filteredSales.map(sale => {
            const itemsCount = sale.items?.length || 0
            const itemsText = sale.items
              ?.map(i => `${i.productName}${i.weightGrams ? ` (${(i.weightGrams / 1000).toFixed(2)}kg)` : i.quantity > 1 ? ` ×${i.quantity}` : ''}`)
              .slice(0, 2)
              .join(', ')
            const hasMoreItems = itemsCount > 2 ? ` +${itemsCount - 2} more` : ''

            return (
              <div className="price-row sales-row" key={sale.id}>
                {/* Invoice Column */}
                <div className="sales-col-invoice">
                  <strong className="invoice-number-text">#{sale.invoiceNumber}</strong>
                  <small className="sale-date-time">
                    {formatDisplayDate(sale.date)} · {sale.time}
                  </small>
                </div>

                {/* Customer Column */}
                <div className="sales-col-customer">
                  <span>{sale.customerName || 'Walk-in Customer'}</span>
                </div>

                {/* Items Summary Column */}
                <div className="sales-col-items" title={sale.items?.map(i => i.productName).join(', ')}>
                  <span className="items-badge">{itemsCount} {itemsCount === 1 ? 'item' : 'items'}</span>
                  <small className="items-preview-text">{itemsText}{hasMoreItems}</small>
                </div>

                {/* Cashier Column */}
                <div className="sales-col-cashier">
                  <small>{sale.cashier || 'Admin'}</small>
                </div>

                {/* Payment Column */}
                <div className="sales-col-payment">
                  <span className={`payment-pill ${paymentBadgeClass(sale.paymentMethod)}`}>
                    {sale.paymentMethod}
                  </span>
                  {sale.paymentMethod === 'Cash' && sale.change > 0 && (
                    <small style={{ color: '#94a3b8', fontSize: '10px' }}>
                      Change: {formatMoney(sale.change)}
                    </small>
                  )}
                </div>

                {/* Total Column */}
                <div className="sales-col-total">
                  <strong className="sale-total-amount">{formatMoney(sale.total)}</strong>
                </div>

                {/* Actions Column */}
                <div className="sales-col-actions">
                  <button
                    type="button"
                    className="btn-action-receipt"
                    onClick={() => setSelectedReceipt(sale)}
                    title="Print / View 80mm Thermal Receipt"
                  >
                    🖨️ Receipt
                  </button>
                  <button
                    type="button"
                    className="btn-action-inspect"
                    onClick={() => setInspectSale(sale)}
                    title="View item breakdown"
                  >
                    👁️ Details
                  </button>
                </div>
              </div>
            )
          })
        )}
      </section>

      {/* INSPECT SALE DETAILS DIALOG */}
      {inspectSale && (
        <div className="shade" role="dialog" aria-modal="true">
          <div className="dialog sales-inspect-dialog">
            <header className="dialog-header">
              <div>
                <small>TRANSACTION DETAILS</small>
                <h2>Invoice #{inspectSale.invoiceNumber}</h2>
              </div>
              <button type="button" className="close-btn" onClick={() => setInspectSale(null)}>
                ✕
              </button>
            </header>

            <div className="inspect-meta-grid">
              <div>
                <small>DATE &amp; TIME</small>
                <strong>{formatDisplayDate(inspectSale.date)} at {inspectSale.time}</strong>
              </div>
              <div>
                <small>CASHIER</small>
                <strong>{inspectSale.cashier || 'Cashier'}</strong>
              </div>
              <div>
                <small>CUSTOMER</small>
                <strong>{inspectSale.customerName || 'Walk-in Customer'}</strong>
              </div>
              <div>
                <small>PAYMENT METHOD</small>
                <strong>{inspectSale.paymentMethod}</strong>
              </div>
            </div>

            <div className="inspect-items-table">
              <div className="inspect-items-head">
                <span>Item</span>
                <span>Qty / Weight</span>
                <span>Unit Rate</span>
                <span>Line Total</span>
              </div>
              {inspectSale.items?.map((it, idx) => (
                <div className="inspect-item-row" key={`${it.productId}-${idx}`}>
                  <span>
                    <b>{it.code ? `${it.code} - ` : ''}{it.productName}</b>
                    <small>{it.productType === 'chicken' ? 'Fresh Chicken' : 'Grocery'}</small>
                  </span>
                  <span>
                    {it.productType === 'chicken' && it.weightGrams
                      ? `${(it.weightGrams / 1000).toFixed(3)} kg`
                      : `${it.quantity} units`}
                  </span>
                  <span>
                    {it.productType === 'chicken' && it.pricePerKg
                      ? `${formatMoney(it.pricePerKg)}/kg`
                      : formatMoney(it.unitPrice)}
                  </span>
                  <span>
                    <strong>{formatMoney(it.total)}</strong>
                  </span>
                </div>
              ))}
            </div>

            <div className="inspect-totals-box">
              <div className="totals-row">
                <span>Subtotal:</span>
                <span>{formatMoney(inspectSale.subtotal)}</span>
              </div>
              {inspectSale.discount > 0 && (
                <div className="totals-row discount">
                  <span>Discount:</span>
                  <span>-{formatMoney(inspectSale.discount)}</span>
                </div>
              )}
              {inspectSale.tax > 0 && (
                <div className="totals-row">
                  <span>Tax:</span>
                  <span>{formatMoney(inspectSale.tax)}</span>
                </div>
              )}
              {inspectSale.service > 0 && (
                <div className="totals-row">
                  <span>Service Fee:</span>
                  <span>{formatMoney(inspectSale.service)}</span>
                </div>
              )}
              <div className="totals-row grand-total">
                <span>Net Total:</span>
                <strong>{formatMoney(inspectSale.total)}</strong>
              </div>

              {inspectSale.paymentMethod === 'Cash' && (
                <div className="cash-breakdown-row">
                  <span>Cash Tendered: <b>{formatMoney(inspectSale.amountReceived)}</b></span>
                  <span>Change Given: <b>{formatMoney(inspectSale.change)}</b></span>
                </div>
              )}
            </div>

            <footer className="inspect-dialog-footer">
              <button
                type="button"
                className="btn-print-receipt"
                onClick={() => {
                  const s = inspectSale
                  setInspectSale(null)
                  setSelectedReceipt(s)
                }}
              >
                🖨️ Open 80mm Receipt
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setInspectSale(null)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* 80MM THERMAL RECEIPT PREVIEW & REPRINT MODAL */}
      {selectedReceipt && (
        <ReceiptPreview
          sale={selectedReceipt}
          close={() => setSelectedReceipt(null)}
        />
      )}
    </section>
  )
}
