import { useEffect, useState, useMemo, type FormEvent } from 'react'
import { calculateChickenPrice, formatMoney, type ChickenCartItem, type ChickenItem } from '../data/chicken'
import { groceryStore, type GroceryProduct } from '../data/grocery'
import { salesStore, type PaymentMethod, type Sale, type SaleItem } from '../data/records'
import { movementStore } from '../data/purchases'
import { ReceiptPreview } from './Receipt'
import { storageAdapter } from '../services/storageAdapter'
import { completeSaleAtomically } from '../services/supabase/salesService'
import { useAuth } from '../context/AuthContext'
import { useSubscription } from '../context/SubscriptionContext'
import { ConnectionIndicator } from './PwaManager'

type GroceryCartItem = { id: string; kind: 'grocery'; product: GroceryProduct; quantity: number; total: number }
type Cart = ChickenCartItem | GroceryCartItem

const quickWeights = [250, 500, 750, 1000, 1500, 2000]

const parseWeightInGrams = (value: string): number | null => {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed.endsWith('kg')) {
    const num = parseFloat(trimmed.replace('kg', '').trim())
    if (Number.isFinite(num) && num > 0) return Math.round(num * 1000)
    return null
  }
  if (trimmed.endsWith('g')) {
    const num = parseFloat(trimmed.replace('g', '').trim())
    if (Number.isFinite(num) && num > 0) return Math.round(num)
    return null
  }
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  if (trimmed.includes('.') && numeric < 50) {
    return Math.round(numeric * 1000)
  }
  return Math.round(numeric)
}

function PosLiveHeader() {
  const [now, setNow] = useState<Date>(() => new Date())
  const { profile } = useAuth()
  const { status, daysRemaining, isActive } = useSubscription()

  const isSuperAdmin = profile?.email?.trim().toLowerCase() === 'zaidn2848@gmail.com'

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(now)

  const hours12 = now.getHours() % 12 || 12
  const formattedTime = `${String(hours12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${now.getHours() >= 12 ? 'PM' : 'AM'}`

  return (
    <header className="pos-top-header">
      <div className="pos-header-brand">
        <span className="pos-brand-tag">POS</span>
        <span className="pos-brand-title">Chicken Kade & Grocery</span>
      </div>

      <div className="pos-header-center">
        <div className="pos-header-datetime">
          <span className="pos-live-dot" />
          <span className="pos-date">{formattedDate}</span>
          <span className="pos-time">{formattedTime}</span>
        </div>
      </div>

      <div className="pos-header-right">
        <ConnectionIndicator />
        <div className="pos-cashier-badge">
          <span className="cashier-label">Cashier:</span>
          <strong>{profile?.full_name || 'Cashier'}</strong>
        </div>
        <div className={`pos-status-indicator ${isActive ? 'active' : status}`}>
          <span className="status-dot" />
          <span>{isActive ? 'ACTIVE' : status.toUpperCase()}</span>
          {isSuperAdmin && isActive && (
            <small>({daysRemaining}d)</small>
          )}
        </div>
      </div>
    </header>
  )
}

function PaymentModal({
  total,
  onCancel,
  onComplete,
}: {
  total: number
  onCancel: () => void
  onComplete: (method: PaymentMethod, received: number) => void
}) {
  const [method, setMethod] = useState<PaymentMethod>('Cash')
  const [received, setReceived] = useState(String(total))
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)

  const parsedReceived = Number(received) || 0
  const change = Math.max(0, parsedReceived - total)

  const quickDenominations = useMemo(() => {
    const list = [total]
    if (total < 500) list.push(500)
    if (total < 1000) list.push(1000)
    if (total < 2000) list.push(2000)
    if (total < 5000) list.push(5000)
    return Array.from(new Set(list)).sort((a, b) => a - b)
  }, [total])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (processing) return
    const amount = method === 'Cash' ? Number(received) : total
    if (method === 'Cash' && amount < total) return setError('Amount received cannot be less than total.')
    if (!Number.isFinite(amount)) return setError('Enter a valid amount.')
    setProcessing(true)
    setError('')
    onComplete(method, amount)
  }

  return (
    <div className="shade">
      <form className="dialog pos-payment-modal" onSubmit={submit}>
        <header>
          <div>
            <small>CHECKOUT & BILLING</small>
            <h2>Complete Payment</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={processing}>×</button>
        </header>

        <div className="editor-body">
          <div className="payment-total-banner">
            <span>TOTAL AMOUNT DUE</span>
            <b className="due-amount">{formatMoney(total)}</b>
          </div>

          <div className="payment-method-selector">
            <label>PAYMENT METHOD</label>
            <div className="method-button-group">
              <button
                type="button"
                className={`method-btn ${method === 'Cash' ? 'active' : ''}`}
                onClick={() => {
                  setMethod('Cash')
                  setError('')
                }}
                disabled={processing}
              >
                <span>💵 Cash</span>
              </button>
              <button
                type="button"
                className={`method-btn ${method === 'Card' ? 'active' : ''}`}
                onClick={() => {
                  setMethod('Card')
                  setReceived(String(total))
                  setError('')
                }}
                disabled={processing}
              >
                <span>💳 Card</span>
              </button>
              <button
                type="button"
                className={`method-btn ${method === 'Other' ? 'active' : ''}`}
                onClick={() => {
                  setMethod('Other')
                  setReceived(String(total))
                  setError('')
                }}
                disabled={processing}
              >
                <span>📝 Other</span>
              </button>
            </div>
          </div>

          {method === 'Cash' && (
            <div className="cash-input-section">
              <label>
                AMOUNT RECEIVED (RS.)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={received}
                  onChange={event => {
                    setReceived(event.target.value)
                    setError('')
                  }}
                  autoFocus
                  disabled={processing}
                />
              </label>

              <div className="quick-cash-chips">
                {quickDenominations.map(amt => (
                  <button
                    type="button"
                    key={amt}
                    className={`cash-chip ${Number(received) === amt ? 'selected' : ''}`}
                    onClick={() => {
                      setReceived(String(amt))
                      setError('')
                    }}
                  >
                    {amt === total ? `Exact (${formatMoney(amt)})` : formatMoney(amt)}
                  </button>
                ))}
              </div>

              <div className="change-return-box">
                <span>CHANGE TO RETURN</span>
                <b className={`change-amount ${change > 0 ? 'positive' : ''}`}>
                  {formatMoney(change)}
                </b>
              </div>
            </div>
          )}

          {error && <p className="validation">{error}</p>}
          {processing && <p className="pos-notice">Processing transaction with server...</p>}
        </div>

        <footer>
          <button type="button" onClick={onCancel} disabled={processing}>
            Cancel
          </button>
          <button className="confirm btn-complete-sale" disabled={processing}>
            {processing ? 'Processing...' : `Complete Sale · ${formatMoney(total)}`}
          </button>
        </footer>
      </form>
    </div>
  )
}

function SaleSuccess({ sale, onNewSale, onClose }: { sale: Sale; onNewSale: () => void; onClose: () => void }) {
  return <ReceiptPreview sale={sale} close={onClose} newSale={onNewSale} />
}

export function PosPayment({
  chickenItems,
  groceryItems,
  onStockChange,
}: {
  chickenItems: ChickenItem[]
  groceryItems: GroceryProduct[]
  onStockChange: (items: GroceryProduct[]) => void
}) {
  const { profile } = useAuth()
  const [tab, setTab] = useState<'Chicken' | 'Grocery'>('Chicken')
  const [groceryCategory, setGroceryCategory] = useState<string>('All')
  const [selected, setSelected] = useState<ChickenItem | null>(null)
  const [grams, setGrams] = useState('')
  const [cart, setCart] = useState<Cart[]>([])
  const [scan, setScan] = useState('')
  const [search, setSearch] = useState('')
  const [chickenSearch, setChickenSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [payment, setPayment] = useState(false)
  const [completed, setCompleted] = useState<Sale | null>(null)

  // Extract unique grocery categories
  const categories = useMemo(() => {
    const set = new Set<string>()
    groceryItems.forEach(item => {
      if (item.category) set.add(item.category)
    })
    return ['All', ...Array.from(set).sort()]
  }, [groceryItems])

  useEffect(() => {
    if (!selected) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(null)
        setGrams('')
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [selected])

  const addChicken = (weightGrams: number) => {
    if (!selected) return
    const parsedWeight = Number(weightGrams)
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      setNotice('Please enter a valid weight.')
      return
    }

    const total = calculateChickenPrice(parsedWeight, selected.pricePerKg)
    setCart(current => [
      ...current,
      {
        id: `c-${Date.now()}-${Math.random()}`,
        kind: 'chicken',
        chicken: selected,
        productType: 'chicken',
        productId: selected.id,
        productName: selected.name,
        weightGrams: parsedWeight,
        pricePerKg: selected.pricePerKg,
        unitPrice: total,
        total,
      },
    ])

    setSelected(null)
    setGrams('')
    setNotice('')
  }

  const addGrocery = (product: GroceryProduct) => {
    if (product.stockQuantity <= 0) return setNotice(`Out of stock: ${product.name}.`)
    const found = cart.find(item => item.kind === 'grocery' && item.product.id === product.id) as
      | GroceryCartItem
      | undefined
    if (found && found.quantity >= product.stockQuantity)
      return setNotice(`Insufficient stock for ${product.name}. Available: ${product.stockQuantity}`)

    setCart(current =>
      found
        ? current.map(item =>
            item.id === found.id
              ? { ...found, quantity: found.quantity + 1, total: (found.quantity + 1) * product.sellingPrice }
              : item
          )
        : [
            ...current,
            {
              id: `g-${product.id}`,
              kind: 'grocery',
              product,
              quantity: 1,
              total: product.sellingPrice,
            },
          ]
    )
    setNotice('')
  }

  const updateGroceryQty = (productId: string, delta: number) => {
    setCart(current => {
      const item = current.find(i => i.kind === 'grocery' && i.product.id === productId) as GroceryCartItem | undefined
      if (!item) return current
      const nextQty = item.quantity + delta
      if (nextQty <= 0) {
        return current.filter(i => i.id !== item.id)
      }
      if (nextQty > item.product.stockQuantity) {
        setNotice(`Maximum available stock reached for ${item.product.name}.`)
        return current
      }
      return current.map(i =>
        i.id === item.id ? { ...item, quantity: nextQty, total: nextQty * item.product.sellingPrice } : i
      )
    })
  }

  const removeFromCart = (id: string) => {
    setCart(current => current.filter(item => item.id !== id))
    setNotice('')
  }

  const submitScan = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = scan.trim().toLowerCase()
    if (!trimmed) return

    const chickenMatch = chickenItems.find(
      item => item.active && (item.name.toLowerCase().includes(trimmed) || item.cut.toLowerCase().includes(trimmed))
    )
    if (chickenMatch) {
      setSelected(chickenMatch)
      setGrams('')
      setScan('')
      setNotice('')
      return
    }

    const product = groceryItems.find(item => item.active && item.barcode === scan.trim())
    if (product) {
      addGrocery(product)
      setScan('')
    } else {
      setNotice(`Product not found with barcode / name: "${scan.trim()}".`)
    }
  }

  const completeSale = async (paymentMethod: PaymentMethod, amountReceived: number) => {
    try {
      const groceryCart = cart.filter((item): item is GroceryCartItem => item.kind === 'grocery')
      for (const item of groceryCart) {
        const current = groceryItems.find(product => product.id === item.product.id)
        if (!current || item.quantity > current.stockQuantity)
          throw new Error(`Insufficient stock for ${item.product.name}.`)
      }

      const nextGrocery = groceryItems.map(product => {
        const sold = groceryCart.find(item => item.product.id === product.id)?.quantity || 0
        return sold ? { ...product, stockQuantity: product.stockQuantity - sold, updatedAt: new Date().toISOString() } : product
      })

      const items: SaleItem[] = cart.map(item =>
        item.kind === 'chicken'
          ? {
              productId: item.productId,
              productName: item.productName,
              productType: 'chicken',
              quantity: 1,
              weightGrams: item.weightGrams,
              unitPrice: item.unitPrice,
              pricePerKg: item.pricePerKg,
              costPrice: null,
              total: item.total,
            }
          : {
              productId: item.product.id,
              productName: item.product.name,
              productType: 'grocery',
              quantity: item.quantity,
              weightGrams: null,
              unitPrice: item.product.sellingPrice,
              pricePerKg: null,
              costPrice: item.product.costPrice,
              total: item.total,
            }
      )

      const total = cart.reduce((sum, item) => sum + item.total, 0)
      const sale: Sale = {
        id: `sale-${Date.now()}-${Math.random()}`,
        invoiceNumber: salesStore.getNextInvoice(),
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toLocaleTimeString(),
        items,
        subtotal: total,
        discount: 0,
        tax: 0,
        service: 0,
        total,
        paymentMethod,
        amountReceived,
        change: Math.max(0, amountReceived - total),
        cashier: profile?.full_name || 'Cashier',
        customerName: 'Walk-in Customer',
        status: 'completed',
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Unable to connect to the server. Please check your internet connection and try again.')
      }

      if (storageAdapter.isSupabase()) {
        try {
          const { error } = await completeSaleAtomically(sale)
          if (error) {
            console.error('completeSale error:', error)
            if (error.message?.includes('Subscription expired') || error.message?.includes('inactive')) {
              throw new Error('Subscription has expired. Please renew your subscription to complete sales.')
            }
            if (error.message?.includes('Insufficient stock')) {
              throw new Error(error.message)
            }
            if (error.message?.includes('Active account required')) {
              throw new Error('Active cashier/admin account required. Please ensure you are signed in.')
            }
            if (
              error.message?.includes('Failed to fetch') ||
              error.message?.includes('NetworkError') ||
              error.message?.includes('Network request failed')
            ) {
              throw new Error('Unable to connect to the server. Please check your internet connection and try again.')
            }
            throw new Error(error.message || 'Sale could not be saved.')
          }
        } catch (err: unknown) {
          if (err instanceof TypeError && err.message?.includes('Failed to fetch')) {
            throw new Error('Unable to connect to the server. Please check your internet connection and try again.')
          }
          throw err
        }
      } else {
        salesStore.saveSale(sale)
      }

      if (!storageAdapter.isSupabase()) {
        try {
          groceryStore.save(nextGrocery)
        } catch (error) {
          salesStore.removeSale(sale.id)
          throw error
        }
        groceryCart.forEach(item =>
          movementStore.addSale(item.product.id, item.product.name, item.quantity, sale.id, sale.invoiceNumber)
        )
        localStorage.setItem(
          'sales-invoice-sequence',
          String(Number(localStorage.getItem('sales-invoice-sequence') || '0') + 1)
        )
        onStockChange(nextGrocery)
      }

      setCart([])
      setPayment(false)
      setCompleted(sale)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Sale could not be completed. No changes were made.')
      setPayment(false)
    }
  }

  const total = cart.reduce((sum, item) => sum + item.total, 0)
  const products = groceryItems.filter(
    product =>
      product.active &&
      (groceryCategory === 'All' || product.category === groceryCategory) &&
      (product.name.toLowerCase().includes(search.toLowerCase()) || product.barcode.includes(search))
  )
  const chickenResults = chickenItems.filter(
    item =>
      item.active &&
      (item.name.toLowerCase().includes(chickenSearch.toLowerCase()) ||
        item.cut.toLowerCase().includes(chickenSearch.toLowerCase()))
  )

  const selectedWeight = parseWeightInGrams(grams)
  const customEstimated = selected && selectedWeight ? calculateChickenPrice(selectedWeight, selected.pricePerKg) : 0

  const reset = () => {
    setCompleted(null)
    setNotice('')
  }

  return (
    <section className="pos-workspace">
      {/* Top Header */}
      <PosLiveHeader />

      <div className="pos-main-container">
        {/* LEFT COLUMN: CURRENT BILL / CART */}
        <section className="pos-cart-panel">
          <header className="pos-bill-header">
            <div className="bill-header-info">
              <small>CURRENT BILL</small>
              <h2>Invoice #{salesStore.getNextInvoice()}</h2>
            </div>
            <button
              type="button"
              className="btn-new-bill"
              onClick={() => {
                if (cart.length && !window.confirm('Clear current bill?')) return
                setCart([])
                setNotice('')
              }}
              title="Start New Bill"
            >
              + New Bill
            </button>
          </header>

          {/* Barcode Search Box */}
          <form className="pos-search-bar" onSubmit={submitScan}>
            <span className="search-icon">🔍</span>
            <input
              value={scan}
              onChange={event => setScan(event.target.value)}
              placeholder="Scan barcode or type item / cut..."
              autoFocus
            />
            {scan && (
              <button type="button" className="btn-clear-search" onClick={() => setScan('')}>
                ×
              </button>
            )}
            <kbd className="kbd-enter">Enter</kbd>
          </form>

          {notice && <div className="pos-notice">{notice}</div>}

          {/* Cart Table */}
          <div className="pos-cart-table-wrapper">
            <div className="pos-cart-header">
              <span className="col-item">ITEM DESCRIPTION</span>
              <span className="col-unit">UNIT/WT</span>
              <span className="col-rate">RATE</span>
              <span className="col-qty">QTY</span>
              <span className="col-total">TOTAL</span>
              <span className="col-action" />
            </div>

            {cart.length ? (
              <div className="pos-cart-body">
                {cart.map(item => (
                  <div className="pos-cart-row" key={item.id}>
                    <div className="col-item">
                      <b>{item.kind === 'chicken' ? item.productName : item.product.name}</b>
                      {item.kind === 'chicken' && (
                        <span className="tag-chicken-weight">
                          {item.weightGrams >= 1000
                            ? `${(item.weightGrams / 1000).toFixed(2).replace(/\.00$/, '')} kg`
                            : `${item.weightGrams}g`}
                        </span>
                      )}
                    </div>

                    <div className="col-unit">
                      {item.kind === 'chicken' ? `${item.weightGrams}g` : item.product.unit || 'Pkt'}
                    </div>

                    <div className="col-rate">
                      {item.kind === 'chicken'
                        ? `${formatMoney(item.pricePerKg)}/kg`
                        : formatMoney(item.product.sellingPrice)}
                    </div>

                    <div className="col-qty">
                      {item.kind === 'grocery' ? (
                        <div className="qty-control-inline">
                          <button
                            type="button"
                            className="btn-qty"
                            onClick={() => updateGroceryQty(item.product.id, -1)}
                          >
                            -
                          </button>
                          <span>{item.quantity}</span>
                          <button
                            type="button"
                            className="btn-qty"
                            onClick={() => updateGroceryQty(item.product.id, 1)}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <span>1</span>
                      )}
                    </div>

                    <div className="col-total">
                      <b>{formatMoney(item.total)}</b>
                    </div>

                    <div className="col-action">
                      <button
                        type="button"
                        className="btn-remove-row"
                        onClick={() => removeFromCart(item.id)}
                        title="Remove item"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pos-empty-cart">
                <div className="empty-cart-icon">🛒</div>
                <b>No items added yet</b>
                <span>Scan a barcode or tap any cut/product on the right to start billing.</span>
              </div>
            )}
          </div>

          {/* Financial Summary & Pay Button */}
          <div className="pos-bill-footer">
            <div className="pos-summary-table">
              <div className="summary-row">
                <span>Subtotal:</span>
                <b>{formatMoney(total)}</b>
              </div>
              <div className="summary-row">
                <span>Discount:</span>
                <span>Rs. 0.00</span>
              </div>
              <div className="summary-row grand-total-row">
                <span className="total-label">TOTAL AMOUNT</span>
                <b className="total-value">{formatMoney(total)}</b>
              </div>
            </div>

            <button
              type="button"
              className="pos-btn-pay"
              disabled={!cart.length}
              onClick={() => setPayment(true)}
            >
              <span className="pay-icon">💳</span>
              <span className="pay-text">PAY NOW</span>
              <b className="pay-amount">{formatMoney(total)}</b>
            </button>
          </div>
        </section>

        {/* RIGHT COLUMN: CATALOG (CHICKEN / GROCERY) */}
        <section className="pos-catalog-panel">
          <div className="catalog-tabs-bar">
            <button
              type="button"
              className={`catalog-tab-btn ${tab === 'Chicken' ? 'active' : ''}`}
              onClick={() => setTab('Chicken')}
            >
              🍗 FRESH CHICKEN CUTS
            </button>
            <button
              type="button"
              className={`catalog-tab-btn ${tab === 'Grocery' ? 'active' : ''}`}
              onClick={() => setTab('Grocery')}
            >
              🛒 GROCERY PRODUCTS
            </button>
          </div>

          <div className="catalog-content-area">
            {tab === 'Chicken' ? (
              <div className="chicken-catalog-view">
                <div className="catalog-toolbar">
                  <div className="catalog-subheading">
                    <b>Quick Chicken Sale</b>
                    <small>Tap a cut, then select preset or custom weight</small>
                  </div>
                  <input
                    className="catalog-search-input"
                    value={chickenSearch}
                    onChange={e => setChickenSearch(e.target.value)}
                    placeholder="Filter cuts (wings, breast, legs...)"
                  />
                </div>

                <div className="chicken-cards-grid">
                  {chickenResults.length ? (
                    chickenResults.map(item => (
                      <button
                        type="button"
                        className="chicken-card-btn"
                        onClick={() => {
                          setSelected(item)
                          setGrams('')
                        }}
                        key={item.id}
                      >
                        <span className="cut-name">{item.name}</span>
                        <b className="cut-price">{formatMoney(item.pricePerKg)} / KG</b>
                        <span className="cut-badge">{item.cut} Cut</span>
                      </button>
                    ))
                  ) : (
                    <div className="catalog-empty-state">
                      <b>No chicken cut found</b>
                      <span>Try searching for another cut</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grocery-catalog-view">
                <div className="catalog-toolbar">
                  {/* Category Pills */}
                  <div className="grocery-category-scroll">
                    {categories.map(cat => (
                      <button
                        type="button"
                        key={cat}
                        className={`cat-chip-btn ${groceryCategory === cat ? 'active' : ''}`}
                        onClick={() => setGroceryCategory(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <input
                    className="catalog-search-input"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search product name or barcode..."
                  />
                </div>

                <div className="grocery-cards-grid">
                  {products.length ? (
                    products.map(product => {
                      const isLow = product.stockQuantity <= product.lowStockLevel && product.stockQuantity > 0
                      const isOut = product.stockQuantity <= 0
                      return (
                        <button
                          type="button"
                          className={`grocery-card-btn ${isOut ? 'out-of-stock' : ''}`}
                          onClick={() => addGrocery(product)}
                          key={product.id}
                          disabled={isOut}
                        >
                          <div className="card-top">
                            <span className="product-title">{product.name}</span>
                            <span className="product-category-tag">{product.category}</span>
                          </div>

                          <div className="card-bottom">
                            <b className="product-price">{formatMoney(product.sellingPrice)}</b>
                            <div className="product-stock-tag">
                              {isOut ? (
                                <span className="stock-pill out">OUT OF STOCK</span>
                              ) : isLow ? (
                                <span className="stock-pill low">LOW ({product.stockQuantity})</span>
                              ) : (
                                <span className="stock-pill ok">Stock: {product.stockQuantity}</span>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <div className="catalog-empty-state">
                      <b>No grocery products found</b>
                      <span>Try another search or category filter</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* WEIGHT SELECTION MODAL */}
      {selected && (
        <div className="shade">
          <form
            className="dialog custom-dialog weight-modal-dialog"
            onSubmit={event => {
              event.preventDefault()
              const parsed = parseWeightInGrams(grams)
              if (!parsed) {
                setNotice('Please enter a valid weight.')
                return
              }
              addChicken(parsed)
            }}
          >
            <header>
              <div>
                <small>SELECT WEIGHT</small>
                <h2>{selected.name}</h2>
                <p>
                  Rate: <strong>{formatMoney(selected.pricePerKg)} / KG</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null)
                  setGrams('')
                }}
              >
                ×
              </button>
            </header>

            <div className="editor-body">
              <div className="quick-weights-section">
                <label style={{ marginBottom: '8px', display: 'block' }}>QUICK WEIGHT PRESETS</label>
                <div className="quick-weight-chips">
                  {quickWeights.map(w => {
                    const calcPrice = calculateChickenPrice(w, selected.pricePerKg)
                    const isChosen = selectedWeight === w
                    return (
                      <button
                        type="button"
                        key={w}
                        className={`quick-weight-btn ${isChosen ? 'active' : ''}`}
                        onClick={() => setGrams(String(w))}
                      >
                        <span>{w >= 1000 ? `${(w / 1000).toFixed(1).replace(/\.0$/, '')} KG` : `${w}g`}</span>
                        <small>{formatMoney(calcPrice)}</small>
                      </button>
                    )
                  })}
                </div>
              </div>

              <label style={{ marginTop: '16px' }}>
                ENTER CUSTOM WEIGHT (GRAMS OR KG)
                <input
                  autoFocus
                  value={grams}
                  onChange={event => setGrams(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      const parsed = parseWeightInGrams(grams)
                      if (!parsed) {
                        setNotice('Please enter a valid weight.')
                        return
                      }
                      addChicken(parsed)
                    }
                    if (event.key === 'Escape') {
                      setSelected(null)
                      setGrams('')
                    }
                  }}
                  inputMode="decimal"
                  placeholder="e.g. 500, 750, 1200 or 1.5"
                />
                <span style={{ fontSize: '11px', color: '#8b9aa7', marginTop: '4px', display: 'block' }}>
                  Type in grams (e.g. <code>500</code> for 500g) or kilograms (e.g. <code>1.5</code> for 1.5kg)
                </span>
              </label>

              <div className="price-preview-card">
                <div className="preview-row">
                  <span>Selected Cut:</span>
                  <b>{selected.name}</b>
                </div>
                <div className="preview-row">
                  <span>Weight:</span>
                  <b>
                    {selectedWeight
                      ? selectedWeight >= 1000
                        ? `${(selectedWeight / 1000).toFixed(3).replace(/\.?0+$/, '')} kg (${selectedWeight}g)`
                        : `${selectedWeight}g`
                      : '—'}
                  </b>
                </div>
                <div className="preview-row">
                  <span>Rate:</span>
                  <b>{formatMoney(selected.pricePerKg)} / kg</b>
                </div>
                <div className="preview-total-row">
                  <span>Total Price:</span>
                  <b className="calculated-total">
                    {selectedWeight ? formatMoney(customEstimated) : 'Rs. 0.00'}
                  </b>
                </div>
              </div>

              {!selectedWeight && grams.trim().length > 0 && (
                <p className="validation">Please enter a valid positive weight.</p>
              )}
            </div>

            <footer>
              <button
                type="button"
                onClick={() => {
                  setSelected(null)
                  setGrams('')
                }}
              >
                Cancel
              </button>
              <button className="confirm btn-add-cut" type="submit" disabled={!selectedWeight}>
                {selectedWeight ? `ADD TO BILL · ${formatMoney(customEstimated)}` : 'ADD TO BILL'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {payment && (
        <PaymentModal total={total} onCancel={() => setPayment(false)} onComplete={completeSale} />
      )}

      {/* SALE SUCCESS / RECEIPT PREVIEW */}
      {completed && <SaleSuccess sale={completed} onNewSale={reset} onClose={() => setCompleted(null)} />}
    </section>
  )
}
