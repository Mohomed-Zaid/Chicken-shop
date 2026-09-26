import { useState, useEffect, type FormEvent } from 'react'
import { formatMoney, type ChickenItem, defaultChickenItems } from '../data/chicken'
import { groceryStore, type GroceryProduct } from '../data/grocery'
import {
  purchaseStore,
  supplierStore,
  type Purchase,
  type PurchaseItem,
  type PurchasePaymentMethod,
} from '../data/purchases'
import { BarcodeSvg, loadReceiptSettings } from './Receipt'
import { storageAdapter } from '../services/storageAdapter'
import { savePurchaseToSupabase } from '../services/supabase/purchaseService'

export interface PurchasesProps {
  chickenItems?: ChickenItem[]
  grocery?: GroceryProduct[]
  onStockChange?: (products: GroceryProduct[]) => void
}

export function Purchases({ chickenItems, grocery, onStockChange }: PurchasesProps) {
  const [items, setItems] = useState<Purchase[]>(() => purchaseStore.getPurchases())
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<{ purchase: Purchase; autoPrint?: boolean; isNew?: boolean } | null>(null)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Chicken' | 'Grocery'>('All')

  const refresh = () => setItems(purchaseStore.getPurchases())

  const totalPurchases = items.reduce((sum, item) => sum + item.total, 0)
  const totalPaid = items.reduce((sum, item) => sum + item.amountPaid, 0)
  const totalDue = items.reduce((sum, item) => sum + item.balanceDue, 0)

  // Total chicken weight purchased across all records
  const totalChickenKg = items
    .flatMap(item => item.items)
    .filter(line => line.productType === 'chicken')
    .reduce((sum, line) => sum + (line.quantity || 0), 0)

  const filteredItems = items.filter(item => {
    if (categoryFilter === 'Chicken') {
      const hasChicken = item.items.some(line => line.productType === 'chicken')
      if (!hasChicken) return false
    } else if (categoryFilter === 'Grocery') {
      const hasGrocery = item.items.some(line => line.productType !== 'chicken')
      if (!hasGrocery) return false
    }

    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      item.purchaseNumber.toLowerCase().includes(q) ||
      (item.supplierName && item.supplierName.toLowerCase().includes(q)) ||
      item.date.includes(q) ||
      item.items.some(line => line.productName.toLowerCase().includes(q))
    )
  })

  return (
    <section className="prices-page purchases-page">
      <header className="page-header">
        <div>
          <small>INVENTORY IN &amp; SUPPLIERS</small>
          <h1>Purchases &amp; Stock In</h1>
          <p>Record stock received for Fresh Chicken (by kg) and Grocery items, track payables and print invoices.</p>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          + New Purchase
        </button>
      </header>

      {/* SUMMARY STATS */}
      <div className="price-overview" style={{ marginBottom: '16px' }}>
        <div>
          <small>TOTAL PURCHASES</small>
          <b>{formatMoney(totalPurchases)}</b>
        </div>
        <div>
          <small>TOTAL CHICKEN PURCHASED</small>
          <b style={{ color: '#0284c7' }}>{totalChickenKg.toFixed(2)} kg</b>
        </div>
        <div>
          <small>TOTAL PAID</small>
          <b style={{ color: '#16a34a' }}>{formatMoney(totalPaid)}</b>
        </div>
        <div>
          <small>OUTSTANDING BALANCE</small>
          <b style={{ color: totalDue > 0 ? '#dc2626' : '#16a34a' }}>{formatMoney(totalDue)}</b>
        </div>
        <div>
          <small>ORDERS COUNT</small>
          <b>{items.length}</b>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input
          className="product-search"
          style={{ flex: 1, minWidth: '220px' }}
          placeholder="Search by purchase number (#PUR-...), supplier, item name, or date..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['All', 'Chicken', 'Grocery'] as const).map(cat => (
            <button
              key={cat}
              type="button"
              className={categoryFilter === cat ? 'primary' : 'edit'}
              style={{ padding: '6px 14px', fontSize: '13px' }}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === 'Chicken' ? '🐔 Chicken' : cat === 'Grocery' ? '🛒 Grocery' : 'All Items'}
            </button>
          ))}
        </div>
      </div>

      {/* PURCHASES TABLE */}
      <section className="price-table">
        <div className="price-row purchase-row table-head">
          <span>Purchase Number</span>
          <span>Date &amp; Time</span>
          <span>Supplier</span>
          <span>Type &amp; Items</span>
          <span>Total</span>
          <span>Payment / Due</span>
          <span>Status</span>
          <span>Actions</span>
        </div>

        {filteredItems.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: '#6b7280' }}>
            {query || categoryFilter !== 'All'
              ? 'No matching purchases found for the selected filter.'
              : 'No purchases recorded yet. Click "+ New Purchase" to record chicken or grocery stock.'}
          </div>
        ) : (
          filteredItems.map(item => {
            const hasChicken = item.items.some(line => line.productType === 'chicken')
            const hasGrocery = item.items.some(line => line.productType !== 'chicken')
            const chickenKg = item.items
              .filter(line => line.productType === 'chicken')
              .reduce((sum, line) => sum + (line.quantity || 0), 0)

            return (
              <div className="price-row purchase-row" key={item.id}>
                <span>
                  <strong>{item.purchaseNumber}</strong>
                </span>
                <span>
                  {item.date} <small style={{ color: '#6b7280' }}>{item.time}</small>
                </span>
                <span>{item.supplierName || 'Direct purchase'}</span>
                <span>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {hasChicken && (
                      <span
                        style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        🐔 {chickenKg.toFixed(2)} kg
                      </span>
                    )}
                    {hasGrocery && (
                      <span
                        style={{
                          background: '#fef3c7',
                          color: '#b45309',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        🛒 Grocery
                      </span>
                    )}
                    <small style={{ color: '#6b7280', marginLeft: '4px' }}>
                      ({item.items.length} {item.items.length === 1 ? 'item' : 'items'})
                    </small>
                  </div>
                </span>
                <span>
                  <strong>{formatMoney(item.total)}</strong>
                </span>
                <span>
                  {item.paymentMethod}
                  {item.balanceDue > 0 ? (
                    <small style={{ color: '#dc2626', fontWeight: 600, display: 'block' }}>
                      {formatMoney(item.balanceDue)} due
                    </small>
                  ) : (
                    <small style={{ color: '#16a34a', display: 'block' }}>Fully Paid</small>
                  )}
                </span>
                <span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: item.status === 'completed' ? '#dcfce7' : '#fee2e2',
                      color: item.status === 'completed' ? '#15803d' : '#b91c1c',
                    }}
                  >
                    {item.status.toUpperCase()}
                  </span>
                </span>
                <span>
                  <button
                    type="button"
                    className="edit"
                    onClick={() => setView({ purchase: item, autoPrint: false })}
                  >
                    View
                  </button>{' '}
                  <button
                    type="button"
                    className="edit"
                    onClick={() => setView({ purchase: item, autoPrint: true })}
                    title="Print purchase invoice"
                  >
                    🖨️ Print
                  </button>
                </span>
              </div>
            )
          })
        )}
      </section>

      {/* NEW PURCHASE MODAL */}
      {open && (
        <PurchaseEditor
          close={() => setOpen(false)}
          done={refresh}
          chickenItemsList={chickenItems && chickenItems.length > 0 ? chickenItems : defaultChickenItems}
          availableProducts={grocery && grocery.length > 0 ? grocery : groceryStore.load()}
          onStockChange={onStockChange}
          onCompleted={newPurchase => {
            setOpen(false)
            setView({ purchase: newPurchase, isNew: true, autoPrint: false })
          }}
        />
      )}

      {/* PURCHASE RECEIPT / DOCUMENT VIEW & PRINT MODAL */}
      {view && (
        <PurchaseDocument
          purchase={view.purchase}
          autoPrint={view.autoPrint}
          isNew={view.isNew}
          close={() => setView(null)}
          onNewPurchase={() => {
            setView(null)
            setOpen(true)
          }}
        />
      )}
    </section>
  )
}

function PurchaseEditor({
  close,
  done,
  chickenItemsList,
  availableProducts,
  onStockChange,
  onCompleted,
}: {
  close: () => void
  done: () => void
  chickenItemsList: ChickenItem[]
  availableProducts: GroceryProduct[]
  onStockChange?: (products: GroceryProduct[]) => void
  onCompleted: (purchase: Purchase) => void
}) {
  const [itemType, setItemType] = useState<'chicken' | 'grocery'>('chicken')
  const [chickenItems] = useState<ChickenItem[]>(chickenItemsList)
  const [products] = useState<GroceryProduct[]>(availableProducts)

  const [supplierId, setSupplierId] = useState('')
  const [selectedChickenId, setSelectedChickenId] = useState('whole')
  const [customChickenName, setCustomChickenName] = useState('')
  const [selectedGroceryId, setSelectedGroceryId] = useState('')

  const [quantity, setQuantity] = useState('10')
  const [cost, setCost] = useState('')
  const [lines, setLines] = useState<PurchaseItem[]>([])
  const [method, setMethod] = useState<PurchasePaymentMethod>('Cash')
  const [paid, setPaid] = useState('')
  const [error, setError] = useState('')

  // Pre-fill default cost price for selected chicken cut or grocery
  useEffect(() => {
    if (itemType === 'chicken') {
      const match = chickenItems.find(c => c.id === selectedChickenId)
      if (match && !cost) {
        setCost(String(match.pricePerKg ? Math.round(match.pricePerKg * 0.8) : 750))
      }
    }
  }, [selectedChickenId, itemType])

  const handleSelectGrocery = (productId: string) => {
    setSelectedGroceryId(productId)
    const product = products.find(item => item.id === productId)
    if (product) {
      setCost(String(product.costPrice || ''))
    }
  }

  const handleSelectChicken = (chickenId: string) => {
    setSelectedChickenId(chickenId)
    const match = chickenItems.find(c => c.id === chickenId)
    if (match) {
      setCost(String(match.pricePerKg ? Math.round(match.pricePerKg * 0.8) : 750))
    }
  }

  const addLine = () => {
    const qty = Number(quantity)
    const price = Number(cost)

    if (isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
      return setError('Please enter a valid quantity/weight (> 0) and cost price (>= 0).')
    }

    if (itemType === 'chicken') {
      let productId = selectedChickenId
      let productName = ''

      if (selectedChickenId === 'custom') {
        if (!customChickenName.trim()) {
          return setError('Please enter a name for the custom chicken cut / live birds.')
        }
        productName = customChickenName.trim()
        productId = `chicken-custom-${Date.now()}`
      } else {
        const item = chickenItems.find(c => c.id === selectedChickenId)
        if (!item) return setError('Please select a chicken cut.')
        productName = item.name
      }

      const existingIndex = lines.findIndex(l => l.productId === productId)
      if (existingIndex >= 0) {
        const updated = [...lines]
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: qty,
          costPrice: price,
          total: qty * price,
        }
        setLines(updated)
      } else {
        setLines([
          ...lines,
          {
            productId,
            productName,
            productType: 'chicken',
            quantity: qty,
            unit: 'kg',
            costPrice: price,
            total: qty * price,
          },
        ])
      }

      setQuantity('10')
      setError('')
    } else {
      // Grocery
      const product = products.find(item => item.id === selectedGroceryId)
      if (!product) return setError('Please select a grocery product.')

      const existingIndex = lines.findIndex(l => l.productId === product.id)
      if (existingIndex >= 0) {
        const updated = [...lines]
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: qty,
          costPrice: price,
          total: qty * price,
        }
        setLines(updated)
      } else {
        setLines([
          ...lines,
          {
            productId: product.id,
            productName: product.name,
            productType: 'grocery',
            quantity: qty,
            unit: product.unit || 'Piece',
            costPrice: price,
            total: qty * price,
          },
        ])
      }

      setSelectedGroceryId('')
      setQuantity('1')
      setCost('')
      setError('')
    }
  }

  const removeLine = (index: number) => {
    setLines(lines.filter((_, idx) => idx !== index))
  }

  const total = lines.reduce((sum, item) => sum + item.total, 0)
  const chickenLinesWeight = lines
    .filter(line => line.productType === 'chicken')
    .reduce((sum, line) => sum + line.quantity, 0)

  const save = (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(paid || 0)
    const supplier = supplierStore.getSupplierById(supplierId)

    if (!lines.length) return setError('Add at least one chicken or grocery item to the purchase.')
    if (total <= 0) return setError('Purchase total must be greater than zero.')
    if (isNaN(amount) || amount < 0 || amount > total) {
      return setError('Amount paid must be between zero and the purchase total.')
    }
    if (method === 'Credit' && !supplier) {
      return setError('A supplier account is required for credit purchases.')
    }

    try {
      const result = purchaseStore.saveCompleted(
        {
          supplierId: supplier?.id || null,
          supplierName: supplier?.name || '',
          items: lines,
          subtotal: total,
          discount: 0,
          total,
          paymentMethod: method,
          amountPaid: amount,
          balanceDue: Math.max(0, total - amount),
        },
        products
      )

      // Save grocery stock locally and trigger App state + Supabase sync
      groceryStore.save(result.products)
      onStockChange?.(result.products)

      // If Supabase mode is active, sync purchase & items
      if (storageAdapter.isSupabase()) {
        savePurchaseToSupabase(result.purchase).catch(console.error)
      }

      done()
      onCompleted(result.purchase)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save purchase.')
    }
  }

  return (
    <div className="shade" role="dialog" aria-modal="true">
      <form className="dialog purchase-editor" onSubmit={save}>
        <header>
          <div>
            <small>INVENTORY STOCK IN</small>
            <h2>New Purchase Order</h2>
          </div>
          <button type="button" onClick={close} title="Close">
            ×
          </button>
        </header>

        <div className="editor-body">
          {/* SUPPLIER FIELD */}
          <div className="purchase-field-group">
            <label htmlFor="purchase-supplier">Supplier / Poultry Farm</label>
            <select
              id="purchase-supplier"
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
            >
              <option value="">Direct purchase (Farm Direct / Cash)</option>
              {supplierStore
                .getSuppliers()
                .filter(item => item.active)
                .map(item => (
                  <option value={item.id} key={item.id}>
                    {item.name} {item.phone ? `(${item.phone})` : ''}
                  </option>
                ))}
            </select>
          </div>

          {/* ITEM TYPE TOGGLE: CHICKEN VS GROCERY */}
          <div style={{ marginBottom: '14px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px', letterSpacing: '0.5px' }}>
              ITEM CATEGORY:
            </span>
            <div className="purchase-type-selector">
              <button
                type="button"
                className={`purchase-type-tab ${itemType === 'chicken' ? 'active' : ''}`}
                onClick={() => {
                  setItemType('chicken')
                  setQuantity('10')
                  setError('')
                }}
              >
                <span>🐔 Chicken (Live / Cuts in KG)</span>
              </button>
              <button
                type="button"
                className={`purchase-type-tab ${itemType === 'grocery' ? 'active' : ''}`}
                onClick={() => {
                  setItemType('grocery')
                  setQuantity('1')
                  setCost('')
                  setError('')
                }}
              >
                <span>🛒 Grocery Products</span>
              </button>
            </div>
          </div>

          {/* ADD ITEM CARD */}
          <div className={`purchase-add-box ${itemType === 'chicken' ? 'chicken-mode' : ''}`}>
            {itemType === 'chicken' ? (
              <div>
                <div className="purchase-add-grid">
                  <div className="purchase-field-group" style={{ margin: 0 }}>
                    <label htmlFor="chicken-cut-select">Chicken Cut / Item</label>
                    <select
                      id="chicken-cut-select"
                      value={selectedChickenId}
                      onChange={e => handleSelectChicken(e.target.value)}
                    >
                      {chickenItems
                        .filter(item => item.active)
                        .map(item => (
                          <option value={item.id} key={item.id}>
                            #{item.code} - {item.name}
                          </option>
                        ))}
                      <option value="custom">+ Other / Custom Live Birds...</option>
                    </select>
                  </div>

                  <div className="purchase-field-group" style={{ margin: 0 }}>
                    <label htmlFor="chicken-weight-input">Weight (KG)</label>
                    <input
                      id="chicken-weight-input"
                      type="number"
                      min="0.01"
                      step="any"
                      value={quantity}
                      onChange={e => setQuantity(e.target.value)}
                      placeholder="e.g. 50"
                    />
                  </div>

                  <div className="purchase-field-group" style={{ margin: 0 }}>
                    <label htmlFor="chicken-cost-input">Cost / KG (Rs.)</label>
                    <input
                      id="chicken-cost-input"
                      type="number"
                      min="0"
                      step="any"
                      value={cost}
                      onChange={e => setCost(e.target.value)}
                      placeholder="Rs./kg"
                    />
                  </div>
                </div>

                {selectedChickenId === 'custom' && (
                  <div className="purchase-field-group" style={{ marginTop: '10px', marginBottom: 0 }}>
                    <label htmlFor="custom-chicken-name">Custom Chicken Cut / Live Birds Description:</label>
                    <input
                      id="custom-chicken-name"
                      type="text"
                      placeholder="e.g. Live Broiler Birds (100 birds), Whole Dressed Chicken, etc."
                      value={customChickenName}
                      onChange={e => setCustomChickenName(e.target.value)}
                    />
                  </div>
                )}

                {/* Quick weight helper chips */}
                <div className="purchase-quick-chips">
                  <small style={{ color: '#0369a1', fontWeight: 700 }}>Quick weight:</small>
                  {['5', '10', '25', '50', '100'].map(val => (
                    <button
                      key={val}
                      type="button"
                      className="purchase-quick-chip"
                      onClick={() => setQuantity(val)}
                    >
                      +{val} kg
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="btn-add-line-action"
                  style={{ background: '#0284c7' }}
                  onClick={addLine}
                >
                  + Add Chicken to Order
                </button>
              </div>
            ) : (
              <div>
                <div className="purchase-add-grid">
                  <div className="purchase-field-group" style={{ margin: 0 }}>
                    <label htmlFor="grocery-product-select">Grocery Product</label>
                    <select
                      id="grocery-product-select"
                      value={selectedGroceryId}
                      onChange={e => handleSelectGrocery(e.target.value)}
                    >
                      <option value="">Select product...</option>
                      {products
                        .filter(item => item.active)
                        .map(item => (
                          <option value={item.id} key={item.id}>
                            #{item.code} - {item.name} · Stock: {item.stockQuantity} {item.unit || ''}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="purchase-field-group" style={{ margin: 0 }}>
                    <label htmlFor="grocery-qty-input">Quantity</label>
                    <input
                      id="grocery-qty-input"
                      type="number"
                      min="0.01"
                      step="any"
                      value={quantity}
                      onChange={e => setQuantity(e.target.value)}
                      placeholder="Qty"
                    />
                  </div>

                  <div className="purchase-field-group" style={{ margin: 0 }}>
                    <label htmlFor="grocery-cost-input">Cost Price (Rs.)</label>
                    <input
                      id="grocery-cost-input"
                      type="number"
                      min="0"
                      step="any"
                      value={cost}
                      onChange={e => setCost(e.target.value)}
                      placeholder="Cost"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-add-line-action"
                  onClick={addLine}
                >
                  + Add Grocery to Order
                </button>
              </div>
            )}
          </div>

          {/* ADDED LINES LIST */}
          <div className="purchase-items-list-wrap">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', letterSpacing: '0.5px' }}>
                PURCHASE ORDER ITEMS ({lines.length}):
              </span>
              {chickenLinesWeight > 0 && (
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0284c7' }}>
                  🐔 Total Chicken: {chickenLinesWeight.toFixed(2)} kg
                </span>
              )}
            </div>

            {lines.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px dashed #cbd5e1',
                  color: '#94a3b8',
                  fontSize: '13px',
                }}
              >
                No items added to order yet. Select Chicken or Grocery above and click Add.
              </div>
            ) : (
              <div>
                {lines.map((line, idx) => (
                  <div className="purchase-item-row-card" key={`${line.productId}-${idx}`}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '15px' }}>
                          {line.productType === 'chicken' ? '🐔' : '🛒'}
                        </span>
                        <strong style={{ fontSize: '14px', color: '#1e293b' }}>{line.productName}</strong>
                        {line.productType === 'chicken' && (
                          <span
                            style={{
                              background: '#e0f2fe',
                              color: '#0369a1',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                            }}
                          >
                            Chicken Meat
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                        {line.quantity} {line.unit || (line.productType === 'chicken' ? 'kg' : 'Piece')} ×{' '}
                        {formatMoney(line.costPrice)}
                        {line.productType === 'chicken' ? '/kg' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <b style={{ fontSize: '16px', color: '#0f172a' }}>{formatMoney(line.total)}</b>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        style={{
                          background: '#fee2e2',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          fontWeight: 700,
                        }}
                        title="Remove line"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TOTAL BANNER */}
          <div className="purchase-total-card">
            <div>
              <div className="total-label">TOTAL PURCHASE COST</div>
              {chickenLinesWeight > 0 && (
                <div style={{ fontSize: '12px', color: '#93c5fd', marginTop: '2px' }}>
                  Includes {chickenLinesWeight.toFixed(2)} kg fresh chicken
                </div>
              )}
            </div>
            <div className="total-value">{formatMoney(total)}</div>
          </div>

          {/* PAYMENT METHOD SELECTOR */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '8px', letterSpacing: '0.5px' }}>
              PAYMENT METHOD:
            </label>
            <div className="purchase-methods-grid">
              {(['Cash', 'Card', 'Credit', 'Other'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  className={`purchase-method-chip ${method === m ? 'active' : ''}`}
                  onClick={() => setMethod(m)}
                >
                  <span>
                    {m === 'Cash' ? '💵 Cash' : m === 'Card' ? '💳 Card' : m === 'Credit' ? '📋 Credit' : '📝 Other'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* AMOUNT PAID & BALANCE */}
          <div className="purchase-field-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label htmlFor="amount-paid-input" style={{ margin: 0 }}>
                Amount Paid (Rs.)
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="purchase-quick-chip"
                  onClick={() => setPaid(String(total))}
                >
                  Pay Full ({formatMoney(total)})
                </button>
                <button
                  type="button"
                  className="purchase-quick-chip"
                  onClick={() => setPaid('0')}
                >
                  Pay Zero (Credit)
                </button>
              </div>
            </div>
            <input
              id="amount-paid-input"
              type="number"
              min="0"
              max={total}
              step="any"
              value={paid}
              onChange={e => setPaid(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: total - Number(paid || 0) > 0 ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${total - Number(paid || 0) > 0 ? '#fecaca' : '#bbf7d0'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: total - Number(paid || 0) > 0 ? '#991b1b' : '#166534' }}>
              {total - Number(paid || 0) > 0 ? 'Outstanding Balance Due to Supplier:' : 'Payment Status: Fully Paid'}
            </span>
            <strong style={{ fontSize: '15px', color: total - Number(paid || 0) > 0 ? '#dc2626' : '#16a34a' }}>
              {formatMoney(Math.max(0, total - Number(paid || 0)))}
            </strong>
          </div>

          {error && (
            <p
              className="validation"
              style={{ color: '#dc2626', background: '#fef2f2', padding: '10px', borderRadius: '6px', border: '1px solid #fecaca', fontSize: '13px' }}
            >
              ⚠️ {error}
            </p>
          )}
        </div>

        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="confirm">
            Complete Purchase &amp; Stock In
          </button>
        </footer>
      </form>
    </div>
  )
}

export function PurchaseReceiptContent({
  purchase,
  settings,
  chickenTotalKg,
}: {
  purchase: Purchase
  settings: ReturnType<typeof loadReceiptSettings>
  chickenTotalKg: number
}) {
  return (
    <section className="receipt thermal-80mm">
      {/* HEADER */}
      <header className="thermal-header">
        <img
          src="/logo2.jpeg"
          alt="Shop Logo"
          className="thermal-logo"
          style={{ maxHeight: '44px', margin: '0 auto 4px', display: 'block' }}
        />
        <h1 className="thermal-business-name">{settings.businessName}</h1>
        <p className="thermal-address">{settings.address}</p>
        <p className="thermal-contact">දු.අ. / Tel: {settings.phone}</p>
        <p className="thermal-receipt-title" style={{ marginTop: '4px', fontWeight: 800 }}>
          PURCHASE INVOICE / තොග මිලදී ගැනීම් පත්‍රිකාව
        </p>
      </header>

      <div className="thermal-divider-dashed" />

      {/* METADATA */}
      <div className="thermal-meta-block">
        <div className="thermal-meta-row">
          <span className="meta-label">මිලදී ගැනුම් අංකය / Purchase #:</span>
          <strong className="meta-value bold-invoice">#{purchase.purchaseNumber}</strong>
        </div>
        <div className="thermal-meta-row">
          <span className="meta-label">දිනය / Date:</span>
          <span className="meta-value">{purchase.date}</span>
        </div>
        <div className="thermal-meta-row">
          <span className="meta-label">වේලාව / Time:</span>
          <span className="meta-value">{purchase.time}</span>
        </div>
        <div className="thermal-meta-row">
          <span className="meta-label">සැපයුම්කරු / Supplier:</span>
          <span className="meta-value">{purchase.supplierName || 'Direct purchase'}</span>
        </div>
        <div className="thermal-meta-row">
          <span className="meta-label">තත්ත්වය / Status:</span>
          <span className="meta-value" style={{ textTransform: 'uppercase', fontWeight: 700 }}>
            {purchase.status}
          </span>
        </div>
      </div>

      <div className="thermal-divider-dashed" />

      {/* ITEMS TABLE */}
      <div className="thermal-items-container">
        <div className="thermal-items-header">
          <span className="col-desc">විස්තරය (ITEM)</span>
          <span className="col-calc">ප්‍රමාණය / මිල (QTY×COST)</span>
          <span className="col-total">එකතුව (TOTAL)</span>
        </div>

        <div className="thermal-items-list">
          {purchase.items.map((item, index) => {
            const isChicken = item.productType === 'chicken'
            const qtyDisplay = isChicken
              ? `${item.quantity} kg × ${formatMoney(item.costPrice)}/kg`
              : `${item.quantity} ${item.unit || 'pc'} × ${formatMoney(item.costPrice)}`

            return (
              <div className="thermal-item-row" key={`${item.productId}-${index}`}>
                <div className="item-name-line">
                  {isChicken ? '🐔 ' : '🛒 '}
                  {item.productName}
                </div>
                <div className="item-sub-line">
                  <span className="item-rate">{qtyDisplay}</span>
                  <span className="item-total">{formatMoney(item.total)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="thermal-divider-dashed" />

      {/* FINANCIAL SUMMARY */}
      <div className="thermal-summary-block">
        <div className="thermal-summary-row counts-row">
          <span>මුළු අයිතම / Total Items:</span>
          <strong>{purchase.items.length} lines</strong>
        </div>

        {chickenTotalKg > 0 && (
          <div className="thermal-summary-row" style={{ color: '#0369a1' }}>
            <span>මුළු කුකුළු මස් / Total Chicken:</span>
            <strong>{chickenTotalKg.toFixed(2)} kg</strong>
          </div>
        )}

        <div className="thermal-summary-row">
          <span>උප එකතුව / Subtotal:</span>
          <span>{formatMoney(purchase.subtotal)}</span>
        </div>

        {purchase.discount > 0 && (
          <div className="thermal-summary-row discount-row">
            <span>වට්ටම / Discount:</span>
            <span>-{formatMoney(purchase.discount)}</span>
          </div>
        )}

        <div className="thermal-summary-row thermal-grand-total">
          <span>මුළු එකතුව / GRAND TOTAL:</span>
          <span>{formatMoney(purchase.total)}</span>
        </div>

        <div className="thermal-summary-row">
          <span>ගෙවීම් ක්‍රමය / Payment:</span>
          <span>{purchase.paymentMethod}</span>
        </div>

        <div className="thermal-summary-row">
          <span>ගෙවූ මුදල / Amount Paid:</span>
          <span>{formatMoney(purchase.amountPaid)}</span>
        </div>

        <div className="thermal-summary-row">
          <span>හිඟ මුදල / Balance Due:</span>
          <strong>{formatMoney(purchase.balanceDue)}</strong>
        </div>
      </div>

      <div className="thermal-divider-dashed" />

      {/* BARCODE */}
      <div className="thermal-barcode-section">
        <BarcodeSvg text={purchase.purchaseNumber} />
      </div>

      {/* FOOTER */}
      <footer className="thermal-footer">
        <p className="footer-system-note">
          *** තොග භාරගැනීමේ සනාථනය ***<br />
          Inventory Stock-in &amp; Goods Received Note<br />
          Chicken Kade Inventory Management
        </p>
      </footer>

      {/* THERMAL PAPER CUTTER CLEARANCE FEED SPACE (12mm) */}
      <div className="receipt-cut-space" />
    </section>
  )
}

function PurchaseDocument({
  purchase,
  autoPrint,
  isNew,
  close,
  onNewPurchase,
}: {
  purchase: Purchase
  autoPrint?: boolean
  isNew?: boolean
  close: () => void
  onNewPurchase?: () => void
}) {
  const settings = loadReceiptSettings()

  // Auto-print receipt if requested
  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        window.print()
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [autoPrint])

  // Keyboard shortcut: P to print, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        window.print()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close])

  const chickenTotalKg = purchase.items
    .filter(i => i.productType === 'chicken')
    .reduce((sum, i) => sum + (i.quantity || 0), 0)

  return (
    <>
      {/* SCREEN-ONLY MODAL (COMPLETELY OMITTED FROM PRINT) */}
      <div className="shade receipt-modal-shade no-print" role="dialog" aria-modal="true">
        <div className="receipt-modal-card receipt-preview">
          {/* MODAL SUCCESS BANNER (SCREEN ONLY) */}
          {isNew && (
            <div className="no-print receipt-success-banner">
              <div className="success-icon-badge">✓</div>
              <div className="success-text">
                <h2>Purchase Completed Successfully!</h2>
                <span>
                  Order: <strong>#{purchase.purchaseNumber}</strong> · Total: <strong>{formatMoney(purchase.total)}</strong>
                  {chickenTotalKg > 0 && ` · Chicken: ${chickenTotalKg.toFixed(2)} kg`}
                </span>
              </div>
              <div className="thermal-80mm-badge">🖨️ 80mm Thermal Ready</div>
            </div>
          )}

          {/* RECEIPT PAPER ROLL PREVIEW */}
          <div className="receipt-preview-scroll">
            <div className="receipt-paper-roll">
              <PurchaseReceiptContent purchase={purchase} settings={settings} chickenTotalKg={chickenTotalKg} />
            </div>
          </div>

          {/* ACTION BUTTONS (SCREEN ONLY) */}
          <div className="no-print receipt-modal-actions">
            <button
              type="button"
              className="btn-print-receipt"
              onClick={() => window.print()}
              title="Print thermal purchase receipt (Shortcut: P)"
            >
              🖨️ Print Purchase Receipt (80mm)
            </button>

            {onNewPurchase && (
              <button
                type="button"
                className="confirm btn-new-sale"
                onClick={onNewPurchase}
                title="Create another purchase"
              >
                ➕ New Purchase
              </button>
            )}

            <button
              type="button"
              className="btn-close-receipt"
              onClick={close}
              title="Close preview (Shortcut: Esc)"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* DEDICATED CLEAN PRINT CONTAINER (PRINTS ONLY ON WHITE THERMAL PAPER WITH ZERO BORDERS) */}
      <div className="thermal-print-only">
        <PurchaseReceiptContent purchase={purchase} settings={settings} chickenTotalKg={chickenTotalKg} />
      </div>
    </>
  )
}
