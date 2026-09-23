import { useEffect, useState, useMemo, useRef, type FormEvent } from 'react'
import {
  calculateChickenPrice,
  formatMoney,
  findChickenByCode,
  parseWeightInGrams,
  formatWeightDisplay,
  type ChickenCartItem,
  type ChickenItem,
} from '../data/chicken'
import { groceryStore, findGroceryByCode, type GroceryProduct } from '../data/grocery'
import { salesStore, toLocalDateString, type PaymentMethod, type Sale, type SaleItem } from '../data/records'
import { movementStore } from '../data/purchases'
import { ReceiptPreview } from './Receipt'
import { storageAdapter } from '../services/storageAdapter'
import { completeSaleAtomically, fetchNextInvoiceNumber } from '../services/supabase/salesService'
import { useAuth } from '../context/AuthContext'
import { useSubscription } from '../context/SubscriptionContext'
import { ConnectionIndicator } from './PwaManager'
import { heldOrdersStore, generateHeldOrderId, type HeldOrder } from '../data/heldOrders'
import { calculatePromotion, isPromotionActive, formatPromotionBadge } from '../services/promotionService'
import { customerStore, getCustomerOutstanding, type Customer } from '../data/customers'
import { syncCustomerToSupabase } from '../services/supabase/customerService'
import {
  getProductSellingPrice,
  getProductRetailPrice,
  getProductWholesalePrice,
  type SellingMode,
  type PriceType,
} from '../services/pricingService'

type GroceryCartItem = {
  id: string
  kind: 'grocery'
  product: GroceryProduct
  quantity: number // Customer paid quantity
  unitPrice: number
  sellingMode: SellingMode
  priceType: PriceType
  paidQuantity: number
  freeQuantity: number
  totalQuantity: number
  promotionApplied: boolean
  total: number
}
type Cart = ChickenCartItem | GroceryCartItem

const quickWeights = [250, 500, 750, 1000, 1500, 2000]

function CartItemQtyInput({
  quantity,
  maxStock,
  onChangeQty,
  onEnter,
}: {
  quantity: number
  maxStock: number
  onChangeQty: (newQty: number) => boolean
  onEnter?: () => void
}) {
  const [val, setVal] = useState(String(quantity))

  useEffect(() => {
    setVal(String(quantity))
  }, [quantity])

  const commit = (inputStr: string) => {
    const parsed = parseInt(inputStr, 10)
    if (Number.isFinite(parsed) && parsed >= 1) {
      const ok = onChangeQty(parsed)
      if (!ok) {
        setVal(String(quantity))
      }
    } else {
      setVal(String(quantity))
    }
  }

  return (
    <input
      type="number"
      min={1}
      max={maxStock}
      className="input-qty-inline"
      value={val}
      aria-label="Quantity"
      onFocus={e => e.target.select()}
      onChange={e => {
        const next = e.target.value
        setVal(next)
        const parsed = parseInt(next, 10)
        if (Number.isFinite(parsed) && parsed >= 1) {
          onChangeQty(parsed)
        }
      }}
      onBlur={() => commit(val)}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(val)
          onEnter?.()
        }
      }}
      onKeyUp={e => e.stopPropagation()}
    />
  )
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
  selectedCustomer,
  onSelectCustomer,
  onCancel,
  onComplete,
  sellingMode = 'RETAIL',
}: {
  total: number
  selectedCustomer: Customer | null
  onSelectCustomer: (c: Customer | null) => void
  onCancel: () => void
  onComplete: (method: PaymentMethod, received: number, customer?: Customer | null) => void
  sellingMode?: SellingMode
}) {
  const [method, setMethod] = useState<PaymentMethod>('Cash')
  const [cashReceivedStr, setCashReceivedStr] = useState<string>(() => String(total))
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [customerList, setCustomerList] = useState<Customer[]>(() =>
    customerStore.getCustomers().filter(c => c.active)
  )
  const cashInputRef = useRef<HTMLInputElement>(null)

  const cashReceivedNum = parseFloat(cashReceivedStr) || 0
  const cashChange = cashReceivedNum >= total ? cashReceivedNum - total : 0

  const reloadCustomers = () => {
    setCustomerList(customerStore.getCustomers().filter(c => c.active))
  }

  const currentOutstanding = selectedCustomer ? getCustomerOutstanding(selectedCustomer.id) : 0

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickName.trim()) return
    const newCust: Customer = {
      id: `customer-${Date.now()}`,
      name: quickName.trim(),
      phone: quickPhone.trim(),
      openingBalance: 0,
      creditLimit: 0,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    customerStore.saveCustomer(newCust)
    if (storageAdapter.isSupabase()) {
      try {
        await syncCustomerToSupabase(newCust)
      } catch (err) {
        console.error(err)
      }
    }
    reloadCustomers()
    onSelectCustomer(newCust)
    setShowQuickAdd(false)
    setQuickName('')
    setQuickPhone('')
    setError('')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (processing) return

    if (method === 'Cash') {
      const received = parseFloat(cashReceivedStr)
      if (!Number.isFinite(received) || received < total) {
        setError(`Amount received (${formatMoney(received || 0)}) cannot be less than total (${formatMoney(total)}).`)
        cashInputRef.current?.focus()
        cashInputRef.current?.select()
        return
      }
      setProcessing(true)
      setError('')
      onComplete('Cash', received, selectedCustomer)
      return
    }

    if (method === 'Credit') {
      if (!selectedCustomer) {
        setError('Only registered customers can buy on credit. Please select a customer.')
        return
      }
      setProcessing(true)
      setError('')
      onComplete('Credit', 0, selectedCustomer)
      return
    }

    setProcessing(true)
    setError('')
    onComplete(method, total, selectedCustomer)
  }

  // Keyboard shortcuts inside Payment Modal (Escape to cancel, O or Alt+O for Other, C for Cash, etc.)
  useEffect(() => {
    const handleModalKey = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase()
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select'

      if (e.key === 'Escape' && !processing) {
        e.preventDefault()
        onCancel()
        return
      }

      if (e.altKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault()
        setMethod('Other')
        setError('')
        return
      }

      if (!isInput && !processing) {
        if (e.key === 'o' || e.key === 'O' || e.key === '4') {
          e.preventDefault()
          setMethod('Other')
          setError('')
        } else if (e.key === 'c' || e.key === 'C' || e.key === '1') {
          e.preventDefault()
          setMethod('Cash')
          setError('')
          setTimeout(() => {
            cashInputRef.current?.focus()
            cashInputRef.current?.select()
          }, 50)
        } else if (e.key === 'd' || e.key === 'D' || e.key === '2') {
          e.preventDefault()
          setMethod('Card')
          setError('')
        } else if (e.key === 'r' || e.key === 'R' || e.key === '3') {
          e.preventDefault()
          setMethod('Credit')
          setError('')
        }
      }
    }
    window.addEventListener('keydown', handleModalKey)
    return () => window.removeEventListener('keydown', handleModalKey)
  }, [processing, onCancel])

  return (
    <div className="shade">
      <form className="dialog pos-payment-modal" onSubmit={submit} style={{ maxWidth: '520px' }}>
        <header>
          <div>
            <small>CHECKOUT & BILLING</small>
            <h2>Complete Payment</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={processing}>×</button>
        </header>

        <div className="editor-body">
          {sellingMode === 'WHOLESALE' && (
            <div
              style={{
                background: 'linear-gradient(90deg, #0369a1, #0284c7)',
                color: '#ffffff',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
                letterSpacing: '0.4px',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '15px' }}>📦</span>
                <span>WHOLESALE INVOICE CHECKOUT</span>
              </span>
              <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.25)', padding: '2px 6px', borderRadius: '4px' }}>
                Trade Rates
              </span>
            </div>
          )}

          <div className="payment-total-banner">
            <span>TOTAL AMOUNT DUE</span>
            <b className="due-amount">{formatMoney(total)}</b>
          </div>

          <div className="payment-method-selector">
            <label>PAYMENT METHOD</label>
            <div className="method-button-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                className={`method-btn ${method === 'Cash' ? 'active' : ''}`}
                onClick={() => {
                  setMethod('Cash')
                  setError('')
                  setTimeout(() => {
                    cashInputRef.current?.focus()
                    cashInputRef.current?.select()
                  }, 50)
                }}
                disabled={processing}
                style={{ minHeight: '44px' }}
              >
                <span>💵 Cash (1 / C)</span>
              </button>
              <button
                type="button"
                className={`method-btn ${method === 'Card' ? 'active' : ''}`}
                onClick={() => {
                  setMethod('Card')
                  setError('')
                }}
                disabled={processing}
                style={{ minHeight: '44px' }}
              >
                <span>💳 Card (2 / D)</span>
              </button>
              <button
                type="button"
                className={`method-btn ${method === 'Credit' ? 'active' : ''}`}
                onClick={() => {
                  setMethod('Credit')
                  setError('')
                }}
                disabled={processing}
                style={{
                  minHeight: '44px',
                  border: method === 'Credit' ? '2px solid #f3b625' : '1px solid #364858',
                  background: method === 'Credit' ? '#27384a' : '#1b2733',
                }}
              >
                <span style={{ color: method === 'Credit' ? '#f3b625' : '#ffffff', fontWeight: 800 }}>
                  🏷️ CREDIT / PAY LATER (3)
                </span>
              </button>
              <button
                type="button"
                className={`method-btn ${method === 'Other' ? 'active' : ''}`}
                onClick={() => {
                  setMethod('Other')
                  setError('')
                }}
                disabled={processing}
                style={{ minHeight: '44px' }}
              >
                <span>📝 Other (4 / O)</span>
              </button>
            </div>
          </div>

          {method === 'Cash' && (
            <div style={{ marginTop: '14px', background: '#0f172a', padding: '14px 16px', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', alignItems: 'center' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                    AMOUNT RECEIVED (RS.)
                  </label>
                  <input
                    ref={cashInputRef}
                    type="number"
                    step="any"
                    min={0}
                    autoFocus
                    value={cashReceivedStr}
                    onChange={e => {
                      setCashReceivedStr(e.target.value)
                      setError('')
                    }}
                    onFocus={e => e.target.select()}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '20px',
                      fontWeight: 800,
                      color: '#ffffff',
                      background: '#1e293b',
                      border: '2px solid #38bdf8',
                      borderRadius: '6px',
                    }}
                    placeholder="Enter cash..."
                  />
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                    CHANGE
                  </span>
                  <div
                    style={{
                      padding: '10px 12px',
                      fontSize: '20px',
                      fontWeight: 800,
                      color: cashReceivedNum >= total ? '#10b981' : '#f87171',
                      background: '#1e293b',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {cashReceivedNum >= total ? formatMoney(cashChange) : 'Short'}
                  </div>
                </div>
              </div>

              {/* Fast Cash Preset Buttons */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setCashReceivedStr(String(total))}
                  style={{ flex: 1, minHeight: '38px', fontSize: '12px', fontWeight: 700, background: '#1e293b', border: '1px solid #475569', color: '#f8fafc', borderRadius: '5px', cursor: 'pointer' }}
                >
                  Exact ({formatMoney(total)})
                </button>
                {[500, 1000, 2000, 5000].map(amt => {
                  if (amt < total && amt * 2 < total) return null
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCashReceivedStr(String(amt))}
                      style={{ minHeight: '38px', padding: '0 12px', fontSize: '12px', fontWeight: 700, background: '#1e293b', border: '1px solid #0284c7', color: '#38bdf8', borderRadius: '5px', cursor: 'pointer' }}
                    >
                      Rs.{amt}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {method === 'Credit' && (
            <div style={{ marginTop: '14px', background: 'rgba(243, 182, 37, 0.08)', border: '1px solid rgba(243, 182, 37, 0.25)', borderRadius: '8px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ color: '#f3b625', fontWeight: 800, fontSize: '11px', letterSpacing: '0.5px', margin: 0 }}>
                  CREDIT ACCOUNT (CUSTOMER) *
                </label>
                {!showQuickAdd && (
                  <button
                    type="button"
                    onClick={() => setShowQuickAdd(true)}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    + Add New Customer
                  </button>
                )}
              </div>

              {!showQuickAdd ? (
                <div style={{ marginTop: '8px' }}>
                  <select
                    value={selectedCustomer?.id || ''}
                    onChange={e => {
                      const found = customerList.find(c => c.id === e.target.value) || null
                      onSelectCustomer(found)
                      setError('')
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#111a24',
                      color: '#ffffff',
                      border: '1px solid #364858',
                      borderRadius: '5px',
                      fontSize: '13px',
                    }}
                  >
                    <option value="">-- Choose Registered Customer --</option>
                    {customerList.map(c => {
                      const due = getCustomerOutstanding(c.id)
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ''} {due > 0 ? `· Current Due: ${formatMoney(due)}` : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
              ) : (
                <div style={{ marginTop: '8px', background: '#162330', padding: '10px', borderRadius: '6px', border: '1px solid #364858' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <input
                      placeholder="Customer Name *"
                      value={quickName}
                      onChange={e => setQuickName(e.target.value)}
                      autoFocus
                    />
                    <input
                      placeholder="Phone"
                      value={quickPhone}
                      onChange={e => setQuickPhone(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                    <button type="button" onClick={() => setShowQuickAdd(false)} style={{ fontSize: '11px', padding: '4px 8px' }}>
                      Cancel
                    </button>
                    <button type="button" className="confirm" onClick={handleQuickAdd} style={{ fontSize: '11px', padding: '4px 10px' }}>
                      Save & Select
                    </button>
                  </div>
                </div>
              )}

              {selectedCustomer ? (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(243, 182, 37, 0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '3px' }}>
                    <span style={{ color: '#94a3b8' }}>Current Outstanding:</span>
                    <b>{formatMoney(currentOutstanding)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '3px' }}>
                    <span style={{ color: '#94a3b8' }}>This Bill (Pay Later):</span>
                    <b style={{ color: '#f3b625' }}>+{formatMoney(total)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', borderTop: '1px dashed #364858', paddingTop: '4px' }}>
                    <span style={{ color: '#ffffff', fontWeight: 700 }}>New Total Outstanding:</span>
                    <b style={{ color: '#f3b625', fontSize: '16px' }}>{formatMoney(currentOutstanding + total)}</b>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
                    ℹ️ Customer does not pay anything today. Amount will be recorded as <strong>DUE</strong> under <strong>{selectedCustomer.name}</strong>.
                  </p>
                </div>
              ) : (
                <div style={{ marginTop: '8px', color: '#fca5a5', fontSize: '12px', fontWeight: 600 }}>
                  ⚠️ Only registered customers can buy on credit. The cashier must select a customer.
                </div>
              )}
            </div>
          )}

          {error && <p className="validation" style={{ marginTop: '10px' }}>{error}</p>}
          {processing && <p className="pos-notice">Processing transaction with server...</p>}
        </div>

        <footer>
          <button type="button" onClick={onCancel} disabled={processing}>
            Cancel
          </button>
          <button
            className="confirm btn-complete-sale"
            disabled={processing || (method === 'Credit' && !selectedCustomer)}
          >
            {processing
              ? 'Processing...'
              : method === 'Credit'
                ? `🏷️ Confirm Credit Sale (Pay Later) · ${formatMoney(total)}`
                : `🖨️ Complete Sale & Print · ${formatMoney(total)}`}
          </button>
        </footer>
      </form>
    </div>
  )
}

function PosCustomerPickerModal({
  selectedCustomer,
  onSelectCustomer,
  onClose,
}: {
  selectedCustomer: Customer | null
  onSelectCustomer: (c: Customer | null) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const customers = customerStore.getCustomers().filter(c => c.active)

  const filtered = customers.filter(c =>
    `${c.name} ${c.phone || ''} ${c.address || ''}`.toLowerCase().includes(query.toLowerCase())
  )

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const newCust: Customer = {
      id: `customer-${Date.now()}`,
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      openingBalance: 0,
      creditLimit: 0,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    customerStore.saveCustomer(newCust)
    if (storageAdapter.isSupabase()) {
      try {
        await syncCustomerToSupabase(newCust)
      } catch (err) {
        console.error(err)
      }
    }
    onSelectCustomer(newCust)
    onClose()
  }

  return (
    <div className="shade">
      <div className="dialog custom-dialog" style={{ maxWidth: '480px' }}>
        <header>
          <div>
            <small>CUSTOMER SELECTION</small>
            <h2>{showAdd ? 'New Customer' : 'Select Customer'}</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="editor-body">
          {!showAdd ? (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  autoFocus
                  placeholder="Search by name or phone..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="primary"
                  style={{ whiteSpace: 'nowrap', fontSize: '12px', padding: '6px 12px' }}
                  onClick={() => setShowAdd(true)}
                >
                  + Add New
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
                {/* Walk-in Customer Option */}
                <button
                  type="button"
                  onClick={() => {
                    onSelectCustomer(null)
                    onClose()
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: !selectedCustomer ? '#1e3a5f' : '#14202b',
                    border: '1px solid #2d3f52',
                    borderRadius: '6px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <b>👤 Walk-in Customer</b>
                    <small style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                      Standard cash/card sales (No credit)
                    </small>
                  </div>
                  {!selectedCustomer && <span style={{ color: '#38bdf8', fontWeight: 800 }}>✓ Selected</span>}
                </button>

                {filtered.map(c => {
                  const isSelected = selectedCustomer?.id === c.id
                  const due = getCustomerOutstanding(c.id)
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => {
                        onSelectCustomer(c)
                        onClose()
                      }}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: isSelected ? '#1e3a5f' : '#14202b',
                        border: '1px solid #2d3f52',
                        borderRadius: '6px',
                        color: '#ffffff',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div>
                        <b>{c.name}</b>
                        <small style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                          {c.phone || 'No phone'} {c.address ? `· ${c.address}` : ''}
                        </small>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {due > 0 ? (
                          <span style={{ color: '#f3b625', fontWeight: 800, fontSize: '12px' }}>
                            Due: {formatMoney(due)}
                          </span>
                        ) : (
                          <span style={{ color: '#10b981', fontSize: '11px' }}>No dues</span>
                        )}
                        {isSelected && (
                          <div style={{ color: '#38bdf8', fontWeight: 800, fontSize: '11px' }}>✓ Selected</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <form onSubmit={handleCreate}>
              <label>
                CUSTOMER NAME *
                <input
                  autoFocus
                  placeholder="e.g. Kamal"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </label>
              <label style={{ marginTop: '10px' }}>
                PHONE NUMBER
                <input
                  placeholder="e.g. 0771234567"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </label>
              <label style={{ marginTop: '10px' }}>
                ADDRESS
                <input
                  placeholder="e.g. Kadawatha"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                <button type="button" onClick={() => setShowAdd(false)}>Back</button>
                <button type="submit" className="confirm">Save & Select</button>
              </div>
            </form>
          )}
        </div>

        <footer>
          <button type="button" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  )
}

function SaleSuccess({
  sale,
  onNewSale,
  onClose,
  autoPrint = false,
}: {
  sale: Sale
  onNewSale: () => void
  onClose: () => void
  autoPrint?: boolean
}) {
  return <ReceiptPreview sale={sale} close={onClose} newSale={onNewSale} autoPrint={autoPrint} />
}

function formatHoldTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    const hours12 = d.getHours() % 12 || 12
    const mins = String(d.getMinutes()).padStart(2, '0')
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
    const timeStr = `${hours12}:${mins} ${ampm}`
    const diffMs = Date.now() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    let relative = 'Just now'
    if (diffMins === 1) relative = '1m ago'
    else if (diffMins > 1 && diffMins < 60) relative = `${diffMins}m ago`
    else if (diffMins >= 60) relative = `${Math.floor(diffMins / 60)}h ago`
    return `${timeStr} (${relative})`
  } catch {
    return 'Recently'
  }
}

function HoldConfirmModal({
  cart,
  total,
  nextHoldNumber,
  onCancel,
  onConfirm,
}: {
  cart: Cart[]
  total: number
  nextHoldNumber: number
  onCancel: () => void
  onConfirm: (customNote: string) => void
}) {
  const [note, setNote] = useState('')
  const itemCount = cart.reduce((sum, item) => sum + (item.kind === 'grocery' ? item.quantity : 1), 0)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onConfirm(note)
  }

  return (
    <div className="shade">
      <form className="dialog custom-dialog hold-modal-dialog" onSubmit={handleSubmit}>
        <header>
          <div>
            <small>PARK BILL · HOLD #{nextHoldNumber}</small>
            <h2>Hold Current Bill</h2>
            <p>
              Current Bill: <strong>{itemCount} items</strong> · <strong style={{ color: '#f3b625' }}>{formatMoney(total)}</strong>
            </p>
          </div>
          <button type="button" onClick={onCancel} title="Close">
            ×
          </button>
        </header>

        <div className="editor-body">
          <label>
            CUSTOMER NAME / NOTE (OPTIONAL)
            <input
              autoFocus
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={`e.g. Blue shirt customer, or press Enter for "Hold #${nextHoldNumber}"`}
            />
            <span style={{ fontSize: '11px', color: '#8b9aa7', marginTop: '4px', display: 'block' }}>
              Press <strong>Enter</strong> or click Confirm to park this bill. You can resume it anytime.
            </span>
          </label>

          <div className="hold-items-preview">
            <label style={{ fontSize: '11px', color: '#8b9aa7', marginBottom: '6px', display: 'block' }}>
              ITEMS IN THIS BILL ({cart.length}):
            </label>
            <div className="hold-items-list">
              {cart.map(item => (
                <div className="hold-item-line" key={item.id}>
                  <span>
                    {item.kind === 'chicken' ? item.productName : item.product.name}
                    <small style={{ color: '#8b9aa7', marginLeft: '6px' }}>
                      {item.kind === 'chicken'
                        ? item.weightGrams >= 1000
                          ? `${(item.weightGrams / 1000).toFixed(2).replace(/\.00$/, '')} kg`
                          : `${item.weightGrams}g`
                        : item.freeQuantity && item.freeQuantity > 0
                        ? `(${item.paidQuantity} Paid + ${item.freeQuantity} Free = ${item.totalQuantity})`
                        : `×${item.quantity} ${item.product.unit || ''}`}
                    </small>
                  </span>
                  <b>{formatMoney(item.total)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="confirm btn-confirm-hold">
            ⏸️ Confirm Hold
          </button>
        </footer>
      </form>
    </div>
  )
}

function RecallHeldOrdersModal({
  heldOrders,
  onClose,
  onResume,
  onDelete,
  onClearAll,
}: {
  heldOrders: HeldOrder[]
  onClose: () => void
  onResume: (order: HeldOrder) => void
  onDelete: (id: string) => void
  onClearAll: () => void
}) {
  return (
    <div className="shade">
      <div className="dialog custom-dialog held-orders-dialog">
        <header>
          <div>
            <small>RECALL BILLS</small>
            <h2>Orders on Hold ({heldOrders.length})</h2>
            <p>Select any held order to resume billing and complete payment</p>
          </div>
          <button type="button" onClick={onClose} title="Close">
            ×
          </button>
        </header>

        <div className="editor-body held-orders-body">
          {heldOrders.length ? (
            <div className="held-orders-list">
              {heldOrders.map(order => (
                <div className="held-order-card" key={order.id}>
                  <div className="held-order-top">
                    <div className="held-order-title-group">
                      <span className="held-order-ref-badge">⏸️ {order.reference}</span>
                      <span className="held-order-time">{formatHoldTime(order.createdAt)}</span>
                      {order.cashier && (
                        <span className="held-order-cashier">· {order.cashier}</span>
                      )}
                    </div>
                    <b className="held-order-total">{formatMoney(order.total)}</b>
                  </div>

                  {order.note && order.note !== order.reference && (
                    <div className="held-order-note">
                      <span>Note:</span> {order.note}
                    </div>
                  )}

                  <div className="held-order-items-snippet">
                    {order.items.map((item, idx) => (
                      <span className="held-item-chip" key={idx}>
                        {item.kind === 'chicken' ? item.productName : item.product.name}{' '}
                        <small>
                          {item.kind === 'chicken'
                            ? item.weightGrams >= 1000
                              ? `${(item.weightGrams / 1000).toFixed(2).replace(/\.00$/, '')}kg`
                              : `${item.weightGrams}g`
                            : `×${item.quantity}`}
                        </small>
                      </span>
                    ))}
                  </div>

                  <div className="held-order-footer">
                    <button
                      type="button"
                      className="btn-held-delete"
                      onClick={() => {
                        if (window.confirm(`Discard held order "${order.reference}"?`)) {
                          onDelete(order.id)
                        }
                      }}
                      title="Discard this held order"
                    >
                      🗑️ Discard
                    </button>
                    <button
                      type="button"
                      className="btn-held-resume"
                      onClick={() => onResume(order)}
                    >
                      ▶ Resume Bill
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pos-empty-cart">
              <div className="empty-cart-icon">📋</div>
              <b>No orders on hold</b>
              <span>Use the "Hold Bill" button in the cart panel whenever you need to temporarily park an order.</span>
            </div>
          )}
        </div>

        <footer>
          {heldOrders.length > 0 && (
            <button
              type="button"
              className="btn-danger-subtle"
              onClick={() => {
                if (window.confirm('Are you sure you want to discard ALL held orders?')) {
                  onClearAll()
                }
              }}
            >
              Clear All Held
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}

function CollisionModal({
  pendingOrder,
  onHoldCurrentAndResume,
  onDiscardCurrentAndResume,
  onCancel,
}: {
  pendingOrder: HeldOrder
  onHoldCurrentAndResume: () => void
  onDiscardCurrentAndResume: () => void
  onCancel: () => void
}) {
  return (
    <div className="shade">
      <div className="dialog custom-dialog collision-dialog">
        <header>
          <div>
            <small>ACTIVE BILL DETECTED</small>
            <h2>Current Bill Is Not Empty</h2>
            <p>You have items in your current bill. How would you like to proceed?</p>
          </div>
          <button type="button" onClick={onCancel} title="Close">
            ×
          </button>
        </header>

        <div className="editor-body">
          <div className="collision-info-box">
            <p>
              You want to resume <strong>"{pendingOrder.reference}"</strong> ({pendingOrder.items.length} items · {formatMoney(pendingOrder.total)}).
            </p>
            <p style={{ color: '#9bb1c4', fontSize: '12px', marginTop: '8px' }}>
              Choose whether to park your current bill or discard it so you don't lose items:
            </p>
          </div>
        </div>

        <footer className="collision-footer">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-collision-discard"
            onClick={onDiscardCurrentAndResume}
          >
            Discard Current & Resume
          </button>
          <button
            type="button"
            className="confirm btn-collision-hold"
            onClick={onHoldCurrentAndResume}
          >
            ⏸️ Hold Current & Resume
          </button>
        </footer>
      </div>
    </div>
  )
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
  const [sellingMode, setSellingMode] = useState<SellingMode>('RETAIL')
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
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>(() => heldOrdersStore.get())
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false)
  const [isRecallModalOpen, setIsRecallModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)
  const [collisionOrder, setCollisionOrder] = useState<HeldOrder | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [autoPrintAfterSale, setAutoPrintAfterSale] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const scanInputRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const barcodeBufferRef = useRef<string>('')
  const lastKeyTimeRef = useRef<number>(0)

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  type SearchSuggestion =
    | { kind: 'chicken'; item: ChickenItem }
    | { kind: 'grocery'; item: GroceryProduct }

  // Live suggestions across chicken cuts and grocery items
  const suggestions = useMemo<SearchSuggestion[]>(() => {
    const clean = scan.trim().toLowerCase()
    if (!clean) return []

    const chickenMatches: SearchSuggestion[] = chickenItems
      .filter(
        item =>
          item.active &&
          (item.name.toLowerCase().includes(clean) ||
            item.cut.toLowerCase().includes(clean) ||
            (item.code && item.code.toLowerCase().includes(clean)))
      )
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(clean) || a.cut.toLowerCase().startsWith(clean)
        const bStarts = b.name.toLowerCase().startsWith(clean) || b.cut.toLowerCase().startsWith(clean)
        if (aStarts && !bStarts) return -1
        if (!aStarts && bStarts) return 1
        return a.name.localeCompare(b.name)
      })
      .map(item => ({ kind: 'chicken', item }))

    const groceryMatches: SearchSuggestion[] = groceryItems
      .filter(
        item =>
          item.active &&
          (item.name.toLowerCase().includes(clean) ||
            item.barcode.toLowerCase().includes(clean) ||
            (item.code && item.code.toLowerCase().includes(clean)) ||
            (item.category && item.category.toLowerCase().includes(clean)))
      )
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(clean)
        const bStarts = b.name.toLowerCase().startsWith(clean)
        if (aStarts && !bStarts) return -1
        if (!aStarts && bStarts) return 1
        return a.name.localeCompare(b.name)
      })
      .map(item => ({ kind: 'grocery', item }))

    return [...chickenMatches, ...groceryMatches].slice(0, 10)
  }, [scan, chickenItems, groceryItems])

  // Synchronize held orders across tabs and triggers
  useEffect(() => {
    const refreshHeld = () => setHeldOrders(heldOrdersStore.get())
    window.addEventListener('held_orders_updated', refreshHeld)
    window.addEventListener('storage', refreshHeld)
    return () => {
      window.removeEventListener('held_orders_updated', refreshHeld)
      window.removeEventListener('storage', refreshHeld)
    }
  }, [])



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

  const addChicken = (weightGrams: number, forcePriceType?: PriceType) => {
    if (!selected) return
    const parsedWeight = Number(weightGrams)
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      setNotice('Please enter a valid weight.')
      return
    }

    const isWholesale =
      forcePriceType === 'WHOLESALE' ||
      (forcePriceType !== 'RETAIL' &&
        sellingMode === 'WHOLESALE' &&
        selected.wholesalePricePerKg !== undefined &&
        selected.wholesalePricePerKg !== null &&
        selected.wholesalePricePerKg > 0)
    const effectivePricePerKg = isWholesale ? selected.wholesalePricePerKg! : selected.pricePerKg
    const priceType: PriceType = isWholesale ? 'WHOLESALE' : 'RETAIL'
    const total = calculateChickenPrice(parsedWeight, effectivePricePerKg)

    setCart(current => [
      ...current,
      {
        id: `c-${Date.now()}-${Math.random()}`,
        kind: 'chicken',
        chicken: selected,
        productType: 'chicken',
        productId: selected.id,
        productName: selected.name,
        code: selected.code,
        weightGrams: parsedWeight,
        pricePerKg: effectivePricePerKg,
        unitPrice: total,
        total,
        sellingMode: isWholesale ? 'WHOLESALE' : 'RETAIL',
        priceType,
      },
    ])

    setSelected(null)
    setGrams('')
    setNotice('')
  }

  const resolveItemPricing = (
    product: GroceryProduct,
    quantity: number,
    mode: SellingMode,
    forcePriceType?: PriceType
  ) => {
    if (forcePriceType === 'RETAIL') {
      const unitPrice = getProductRetailPrice(product)
      const promo = calculatePromotion(quantity, product)
      return {
        unitPrice,
        sellingMode: mode,
        priceType: 'RETAIL' as const,
        total: promo.paidQuantity * unitPrice,
        promo,
      }
    }

    if (forcePriceType === 'WHOLESALE') {
      const unitPrice =
        product.wholesalePrice && Number(product.wholesalePrice) > 0
          ? Number(product.wholesalePrice)
          : getProductRetailPrice(product)
      return {
        unitPrice,
        sellingMode: mode,
        priceType: 'WHOLESALE' as const,
        total: quantity * unitPrice,
        promo: { paidQuantity: quantity, freeQuantity: 0, totalQuantity: quantity, promotionApplied: false },
      }
    }

    const pricing = getProductSellingPrice(product, quantity, mode)
    if (pricing.priceType === 'WHOLESALE') {
      return {
        unitPrice: pricing.unitPrice,
        sellingMode: mode,
        priceType: 'WHOLESALE' as const,
        total: quantity * pricing.unitPrice,
        promo: { paidQuantity: quantity, freeQuantity: 0, totalQuantity: quantity, promotionApplied: false },
      }
    } else {
      const promo = calculatePromotion(quantity, product)
      return {
        unitPrice: pricing.unitPrice,
        sellingMode: mode,
        priceType: 'RETAIL' as const,
        total: promo.paidQuantity * pricing.unitPrice,
        promo,
      }
    }
  }

  const handleSwitchSellingMode = (newMode: SellingMode) => {
    setSellingMode(newMode)
    setCart(current =>
      current.map(item => {
        if (item.kind === 'chicken') {
          const isWs =
            newMode === 'WHOLESALE' &&
            item.chicken?.wholesalePricePerKg !== undefined &&
            item.chicken.wholesalePricePerKg !== null &&
            item.chicken.wholesalePricePerKg > 0
          const effPricePerKg = isWs
            ? item.chicken.wholesalePricePerKg!
            : (item.chicken?.pricePerKg || item.pricePerKg)
          const pType: PriceType = isWs ? 'WHOLESALE' : 'RETAIL'
          const cTotal = calculateChickenPrice(item.weightGrams, effPricePerKg)
          return {
            ...item,
            pricePerKg: effPricePerKg,
            unitPrice: cTotal,
            total: cTotal,
            sellingMode: newMode,
            priceType: pType,
          }
        }
        const { unitPrice, priceType, total: itemTotal, promo } = resolveItemPricing(
          item.product,
          item.quantity,
          newMode
        )
        return {
          ...item,
          unitPrice,
          sellingMode: newMode,
          priceType,
          paidQuantity: promo.paidQuantity,
          freeQuantity: promo.freeQuantity,
          totalQuantity: promo.totalQuantity,
          promotionApplied: promo.promotionApplied,
          total: itemTotal,
        }
      })
    )
    setNotice(`Switched to ${newMode === 'WHOLESALE' ? '📦 Wholesale' : '🛍️ Retail'} Mode`)
    setTimeout(() => setNotice(''), 2000)
  }

  const addGrocery = (
    product: GroceryProduct,
    forcePriceType?: PriceType,
    overrideQty?: number
  ) => {
    if (product.stockQuantity <= 0) return setNotice(`Out of stock: ${product.name}.`)
    const found = cart.find(item => item.kind === 'grocery' && item.product.id === product.id) as
      | GroceryCartItem
      | undefined

    const nextPaid = overrideQty !== undefined ? overrideQty : (found ? found.quantity + 1 : 1)

    const { unitPrice, priceType, total: itemTotal, promo } = resolveItemPricing(
      product,
      nextPaid,
      sellingMode,
      forcePriceType
    )

    const reqTotal = promo.totalQuantity
    if (reqTotal > product.stockQuantity) {
      if (promo.promotionApplied) {
        return setNotice(`Insufficient stock for promotion. Available: ${product.stockQuantity}, Required: ${reqTotal}`)
      }
      return setNotice(`Insufficient stock for ${product.name}. Available: ${product.stockQuantity}`)
    }

    setCart(current =>
      found
        ? current.map(item =>
          item.id === found.id
            ? {
              ...found,
              quantity: nextPaid,
              unitPrice,
              sellingMode,
              priceType,
              paidQuantity: promo.paidQuantity,
              freeQuantity: promo.freeQuantity,
              totalQuantity: promo.totalQuantity,
              promotionApplied: promo.promotionApplied,
              total: itemTotal,
            }
            : item
        )
        : [
          ...current,
          {
            id: `g-${product.id}`,
            kind: 'grocery',
            product,
            quantity: nextPaid,
            unitPrice,
            sellingMode,
            priceType,
            paidQuantity: promo.paidQuantity,
            freeQuantity: promo.freeQuantity,
            totalQuantity: promo.totalQuantity,
            promotionApplied: promo.promotionApplied,
            total: itemTotal,
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

      const { unitPrice, priceType, total: itemTotal, promo } = resolveItemPricing(
        item.product,
        nextQty,
        item.sellingMode || sellingMode
      )

      const reqTotal = promo.totalQuantity
      if (reqTotal > item.product.stockQuantity) {
        if (promo.promotionApplied) {
          setNotice(`Insufficient stock for promotion. Available: ${item.product.stockQuantity}, Required: ${reqTotal}`)
        } else {
          setNotice(`Maximum available stock reached for ${item.product.name}.`)
        }
        return current
      }

      return current.map(i =>
        i.id === item.id
          ? {
            ...item,
            quantity: nextQty,
            unitPrice,
            priceType,
            paidQuantity: promo.paidQuantity,
            freeQuantity: promo.freeQuantity,
            totalQuantity: promo.totalQuantity,
            promotionApplied: promo.promotionApplied,
            total: itemTotal,
          }
          : i
      )
    })
  }

  const setGroceryDirectQty = (productId: string, directQty: number): boolean => {
    let accepted = false
    setCart(current => {
      const item = current.find(i => i.kind === 'grocery' && i.product.id === productId) as GroceryCartItem | undefined
      if (!item) return current
      if (directQty <= 0) {
        return current
      }

      const { unitPrice, priceType, total: itemTotal, promo } = resolveItemPricing(
        item.product,
        directQty,
        item.sellingMode || sellingMode
      )

      const reqTotal = promo.totalQuantity
      if (reqTotal > item.product.stockQuantity) {
        if (promo.promotionApplied) {
          setNotice(`Insufficient stock for promotion. Available: ${item.product.stockQuantity}, Required: ${reqTotal}`)
        } else {
          setNotice(`Maximum available stock reached for ${item.product.name}. Available: ${item.product.stockQuantity}`)
        }
        return current
      }
      setNotice('')
      accepted = true

      return current.map(i =>
        i.id === item.id
          ? {
            ...item,
            quantity: directQty,
            unitPrice,
            priceType,
            paidQuantity: promo.paidQuantity,
            freeQuantity: promo.freeQuantity,
            totalQuantity: promo.totalQuantity,
            promotionApplied: promo.promotionApplied,
            total: itemTotal,
          }
          : i
      )
    })
    return accepted
  }

  const toggleItemPriceType = (productId: string) => {
    setCart(current => {
      const item = current.find(i => i.kind === 'grocery' && i.product.id === productId) as GroceryCartItem | undefined
      if (!item || !item.product.wholesaleEnabled) return current
      const nextType: PriceType = item.priceType === 'WHOLESALE' ? 'RETAIL' : 'WHOLESALE'
      const { unitPrice, priceType, total: itemTotal, promo } = resolveItemPricing(
        item.product,
        item.quantity,
        item.sellingMode || sellingMode,
        nextType
      )
      setNotice(`Item set to ${nextType === 'WHOLESALE' ? '📦 Wholesale' : '🛍️ Retail'} price`)
      setTimeout(() => setNotice(''), 2000)
      return current.map(i =>
        i.id === item.id
          ? {
            ...item,
            unitPrice,
            priceType,
            paidQuantity: promo.paidQuantity,
            freeQuantity: promo.freeQuantity,
            totalQuantity: promo.totalQuantity,
            promotionApplied: promo.promotionApplied,
            total: itemTotal,
          }
          : i
      )
    })
  }

  const toggleChickenPriceType = (cartItemId: string) => {
    setCart(current => {
      return current.map(i => {
        if (i.id !== cartItemId || i.kind !== 'chicken') return i
        if (!i.chicken?.wholesalePricePerKg || i.chicken.wholesalePricePerKg <= 0) return i
        const nextType: PriceType = i.priceType === 'WHOLESALE' ? 'RETAIL' : 'WHOLESALE'
        const effRate = nextType === 'WHOLESALE' ? i.chicken.wholesalePricePerKg : i.chicken.pricePerKg
        const newTotal = calculateChickenPrice(i.weightGrams, effRate)
        setNotice(`Chicken set to ${nextType === 'WHOLESALE' ? '📦 Wholesale' : '🛍️ Retail'} rate`)
        setTimeout(() => setNotice(''), 2000)
        return {
          ...i,
          pricePerKg: effRate,
          unitPrice: newTotal,
          total: newTotal,
          priceType: nextType,
          sellingMode: nextType === 'WHOLESALE' ? 'WHOLESALE' : (sellingMode || 'RETAIL'),
        }
      })
    })
  }

  const removeFromCart = (id: string) => {
    setCart(current => current.filter(item => item.id !== id))
    setNotice('')
  }

  const processBarcodeOrCode = (rawInput: string): boolean => {
    const rawTrimmed = rawInput.trim()
    if (!rawTrimmed) return false

    // Clean control characters (\r, \n) often sent by hardware barcode scanners
    const cleanStr = rawTrimmed.replace(/[\r\n\t]/g, '').trim()
    if (!cleanStr) return false

    // 1. EXACT BARCODE MATCH FIRST (Highest Priority for barcode scanners)
    const productByBarcode = groceryItems.find(
      item => item.active && item.barcode && item.barcode.trim().toLowerCase() === cleanStr.toLowerCase()
    )
    if (productByBarcode) {
      addGrocery(productByBarcode)
      setScan('')
      barcodeBufferRef.current = ''
      setNotice('')
      return true
    }

    // Match if barcode had leading zeros (e.g. scanner sends "0479..." or db has "0479...")
    const cleanNoZero = cleanStr.replace(/^0+/, '')
    if (cleanNoZero) {
      const productByBarcodeNoZero = groceryItems.find(
        item =>
          item.active &&
          item.barcode &&
          item.barcode.trim().replace(/^0+/, '') === cleanNoZero
      )
      if (productByBarcodeNoZero) {
        addGrocery(productByBarcodeNoZero)
        setScan('')
        barcodeBufferRef.current = ''
        setNotice('')
        return true
      }
    }

    // 2. CHICKEN CUT CODE MATCH (1-99 or starting with CH)
    const num = /^\d+$/.test(cleanStr) ? Number(cleanStr) : null
    if ((num !== null && num >= 1 && num < 100) || /^ch/i.test(cleanStr)) {
      const chickenCodeMatch = findChickenByCode(cleanStr, chickenItems)
      if (chickenCodeMatch) {
        if (!chickenCodeMatch.active) {
          setNotice(`Chicken #${chickenCodeMatch.code} (${chickenCodeMatch.name}) is inactive in Daily Chicken Prices.`)
          return false
        }
        setSelected(chickenCodeMatch)
        setGrams('')
        setScan('')
        barcodeBufferRef.current = ''
        setNotice('')
        return true
      }
    }

    // 3. GROCERY CODE MATCH (PLU code 100, 101, etc.)
    if (num !== null && num >= 100) {
      const groceryMatch = findGroceryByCode(cleanStr, groceryItems)
      if (groceryMatch) {
        if (!groceryMatch.active) {
          setNotice(`Grocery #${groceryMatch.code} (${groceryMatch.name}) is inactive.`)
          return false
        }
        addGrocery(groceryMatch)
        setScan('')
        barcodeBufferRef.current = ''
        setNotice('')
        return true
      }
    }

    // 4. Fallback chicken alphanumeric code
    const chickenFallback = findChickenByCode(cleanStr, chickenItems)
    if (chickenFallback) {
      if (!chickenFallback.active) {
        setNotice(`Chicken #${chickenFallback.code} (${chickenFallback.name}) is inactive in Daily Chicken Prices.`)
        return false
      }
      setSelected(chickenFallback)
      setGrams('')
      setScan('')
      barcodeBufferRef.current = ''
      setNotice('')
      return true
    }

    // 5. Search chicken by name/cut
    const lowerClean = cleanStr.toLowerCase()
    const chickenNameMatch = chickenItems.find(
      item => item.active && (item.name.toLowerCase() === lowerClean || item.cut.toLowerCase() === lowerClean)
    )
    if (chickenNameMatch) {
      setSelected(chickenNameMatch)
      setGrams('')
      setScan('')
      barcodeBufferRef.current = ''
      setNotice('')
      return true
    }

    // 6. Search grocery by exact name
    const productByName = groceryItems.find(
      item => item.active && item.name.toLowerCase() === lowerClean
    )
    if (productByName) {
      addGrocery(productByName)
      setScan('')
      barcodeBufferRef.current = ''
      setNotice('')
      return true
    }

    // 7. Not found feedback
    if (num !== null) {
      if (num < 100) {
        setNotice(`Chicken cut #${num} not found.`)
      } else {
        setNotice(`Grocery product #${num} not found.`)
      }
    } else {
      setNotice(`Product not found with code / barcode: "${cleanStr}".`)
    }
    return false
  }

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    if (suggestion.kind === 'chicken') {
      setSelected(suggestion.item)
      setGrams('')
      setScan('')
      setShowSuggestions(false)
      setHighlightedIndex(-1)
      barcodeBufferRef.current = ''
      setNotice('')
    } else {
      addGrocery(suggestion.item)
      setScan('')
      setShowSuggestions(false)
      setHighlightedIndex(-1)
      barcodeBufferRef.current = ''
      setNotice('')
      scanInputRef.current?.focus()
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex(prev => (prev + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter') {
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          e.preventDefault()
          handleSelectSuggestion(suggestions[highlightedIndex])
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowSuggestions(false)
        return
      }
    }
  }

  const handleScanChange = (val: string) => {
    setScan(val)
    if (val.trim()) {
      setShowSuggestions(true)
      setHighlightedIndex(0)
    } else {
      setShowSuggestions(false)
      setHighlightedIndex(-1)
    }
    const trimmed = val.trim()
    if (!trimmed) return

    // Fast check: if the typed/scanned string matches ANY active grocery barcode exactly, add immediately!
    const exactBarcodeMatch = groceryItems.find(
      item => item.active && item.barcode && item.barcode.trim().toLowerCase() === trimmed.toLowerCase()
    )
    if (exactBarcodeMatch) {
      addGrocery(exactBarcodeMatch)
      setScan('')
      setShowSuggestions(false)
      barcodeBufferRef.current = ''
      setNotice('')
      return
    }

    // Fast check for CH chicken cuts
    if (/^CH\d+/i.test(trimmed)) {
      const match = findChickenByCode(trimmed, chickenItems)
      if (match && match.active) {
        setSelected(match)
        setGrams('')
        setScan('')
        setShowSuggestions(false)
        barcodeBufferRef.current = ''
        setNotice('')
      }
    }
  }

  const submitScan = (event?: FormEvent) => {
    if (event) event.preventDefault()
    if (!scan.trim()) return
    const processed = processBarcodeOrCode(scan)
    if (!processed && suggestions.length > 0) {
      handleSelectSuggestion(suggestions[0])
    }
  }

  const completeSale = async (
    paymentMethod: PaymentMethod,
    amountReceived: number,
    customer?: Customer | null
  ) => {
    try {
      const groceryCart = cart.filter((item): item is GroceryCartItem => item.kind === 'grocery')
      for (const item of groceryCart) {
        const current = groceryItems.find(product => product.id === item.product.id)
        const reqTotal = item.totalQuantity || item.quantity
        if (!current || reqTotal > current.stockQuantity) {
          if (item.freeQuantity && item.freeQuantity > 0) {
            throw new Error(`Insufficient stock for promotion. Available: ${current ? current.stockQuantity : 0}, Required: ${reqTotal}`)
          }
          throw new Error(`Insufficient stock for ${item.product.name}.`)
        }
      }

      const nextGrocery = groceryItems.map(product => {
        const cartItem = groceryCart.find(item => item.product.id === product.id)
        const sold = cartItem ? (cartItem.totalQuantity || cartItem.quantity) : 0
        return sold ? { ...product, stockQuantity: product.stockQuantity - sold, updatedAt: new Date().toISOString() } : product
      })

      const items: SaleItem[] = cart.map(item =>
        item.kind === 'chicken'
          ? {
            code: item.code || item.chicken?.code || null,
            productId: item.chicken?.id || item.productId,
            productName: item.chicken?.name || item.productName,
            productType: 'chicken',
            quantity: 1,
            weightGrams: item.weightGrams,
            unitPrice: item.unitPrice,
            pricePerKg: item.pricePerKg,
            costPrice: null,
            total: item.total,
            sellingMode: item.sellingMode || sellingMode,
            priceType: item.priceType || (item.sellingMode === 'WHOLESALE' || sellingMode === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL'),
          }
          : {
            code: item.product.code || null,
            productId: item.product.id,
            productName: item.product.name,
            productType: 'grocery',
            quantity: item.quantity,
            weightGrams: null,
            unitPrice: item.unitPrice,
            pricePerKg: null,
            costPrice: item.product.costPrice,
            total: item.total,
            paidQuantity: item.paidQuantity ?? item.quantity,
            freeQuantity: item.freeQuantity ?? 0,
            totalQuantity: item.totalQuantity ?? (item.quantity + (item.freeQuantity || 0)),
            promotionApplied: Boolean(item.promotionApplied),
            promotionType: item.promotionApplied ? (item.product.promotionType || 'BUY_X_GET_Y_FREE') : null,
            promotionBuyQuantity: item.promotionApplied ? (item.product.promotionBuyQuantity ?? null) : null,
            promotionFreeQuantity: item.promotionApplied ? (item.product.promotionFreeQuantity ?? null) : null,
            sellingMode: item.sellingMode || sellingMode,
            priceType: item.priceType || 'RETAIL',
          }
      )

      const regularSubtotal = cart.reduce((sum, item) => {
        if (item.kind === 'chicken') return sum + item.total
        const itemPrice = (item.priceType === 'WHOLESALE' || item.sellingMode === 'WHOLESALE')
          ? item.unitPrice
          : (item.product.retailPrice !== undefined && item.product.retailPrice !== null ? item.product.retailPrice : item.product.sellingPrice)
        return sum + (itemPrice * item.quantity)
      }, 0)
      const total = cart.reduce((sum, item) => sum + item.total, 0)
      const discount = Math.max(0, regularSubtotal - total)
      let initialInvoice = salesStore.getNextInvoice()
      if (storageAdapter.isSupabase()) {
        try {
          initialInvoice = await fetchNextInvoiceNumber()
        } catch {
          // fallback
        }
      }

      const currentCust = customer !== undefined ? customer : selectedCustomer
      const isCredit = paymentMethod === 'Credit'
      const finalReceived = isCredit ? 0 : amountReceived
      const finalChange = isCredit ? 0 : Math.max(0, amountReceived - total)
      const custId = currentCust?.id || undefined
      const custName = currentCust?.name || 'Walk-in Customer'

      let sale: Sale = {
        id: `sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        invoiceNumber: initialInvoice,
        date: toLocalDateString(),
        time: new Date().toLocaleTimeString(),
        items,
        subtotal: regularSubtotal,
        discount,
        tax: 0,
        service: 0,
        total,
        paymentMethod,
        amountReceived: finalReceived,
        change: finalChange,
        cashier: profile?.full_name || 'Cashier',
        customerId: custId,
        customerName: custName,
        status: 'completed',
        sellingMode: sellingMode,
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Unable to connect to the server. Please check your internet connection and try again.')
      }

      if (storageAdapter.isSupabase()) {
        try {
          const { error, finalSale } = await completeSaleAtomically(sale)
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
          if (finalSale) {
            sale = finalSale
          }
        } catch (err: unknown) {
          if (err instanceof TypeError && err.message?.includes('Failed to fetch')) {
            throw new Error('Unable to connect to the server. Please check your internet connection and try again.')
          }
          throw err
        }
      }

      salesStore.saveSale(sale)

      if (!storageAdapter.isSupabase()) {
        try {
          groceryStore.save(nextGrocery)
        } catch (error) {
          salesStore.removeSale(sale.id)
          throw error
        }
        groceryCart.forEach(item =>
          movementStore.addSale(item.product.id, item.product.name, item.totalQuantity || item.quantity, sale.id, sale.invoiceNumber)
        )
        localStorage.setItem(
          'sales-invoice-sequence',
          String(Number(localStorage.getItem('sales-invoice-sequence') || '0') + 1)
        )
      } else {
        groceryStore.save(nextGrocery)
      }

      onStockChange(nextGrocery)

      setCart([])
      setPayment(false)
      setSelectedCustomer(null)
      setCompleted(sale)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Sale could not be completed. No changes were made.')
      setPayment(false)
    }
  }

  const regularSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      if (item.kind === 'chicken') return sum + item.total
      const itemPrice = (item.priceType === 'WHOLESALE' || item.sellingMode === 'WHOLESALE')
        ? item.unitPrice
        : (item.product.retailPrice !== undefined && item.product.retailPrice !== null ? item.product.retailPrice : item.product.sellingPrice)
      return sum + (itemPrice * item.quantity)
    }, 0)
  }, [cart])

  const total = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.total, 0)
  }, [cart])

  const totalDiscount = Math.max(0, regularSubtotal - total)

  const handleDirectPrintSale = async () => {
    if (!cart.length || isSubmitting) return
    setIsSubmitting(true)
    setAutoPrintAfterSale(true)
    try {
      await completeSale('Cash', total)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Keyboard shortcuts:
  // F5, F2, F9: Direct Print & Complete Sale
  // F4: Hold Current Bill
  // Auto-focus search bar on load and whenever dialogs/modals close
  useEffect(() => {
    if (!isHoldModalOpen && !isRecallModalOpen && !isCustomerModalOpen && !selected && !payment && !completed && !collisionOrder) {
      const activeEl = document.activeElement as HTMLElement | null
      const activeTag = activeEl?.tagName?.toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea') {
        return
      }
      scanInputRef.current?.focus()
    }
  }, [isHoldModalOpen, isRecallModalOpen, isCustomerModalOpen, selected, payment, completed, collisionOrder])

  // Refocus search bar when user clicks anywhere in POS workspace (unless clicking buttons/inputs/modals)
  useEffect(() => {
    const handleWorkspaceClick = (e: MouseEvent) => {
      if (isHoldModalOpen || isRecallModalOpen || isCustomerModalOpen || selected || payment || completed || collisionOrder) {
        return
      }
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName?.toLowerCase()
      if (
        ['input', 'textarea', 'select', 'button', 'a'].includes(tag) ||
        target.closest('button, input, textarea, select, a, dialog, .dialog, .shade')
      ) {
        return
      }
      scanInputRef.current?.focus()
    }
    window.addEventListener('click', handleWorkspaceClick)
    return () => window.removeEventListener('click', handleWorkspaceClick)
  }, [isHoldModalOpen, isRecallModalOpen, isCustomerModalOpen, selected, payment, completed, collisionOrder])

  // Global Keyboard shortcuts & Hardware Barcode Scanner Wedge Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key: Close current modal immediately
      if (e.key === 'Escape') {
        if (completed) {
          setCompleted(null)
          return
        }
        if (payment) {
          setPayment(false)
          return
        }
        if (selected) {
          setSelected(null)
          setGrams('')
          return
        }
        if (isHoldModalOpen) {
          setIsHoldModalOpen(false)
          return
        }
        if (isRecallModalOpen) {
          setIsRecallModalOpen(false)
          return
        }
        if (isCustomerModalOpen) {
          setIsCustomerModalOpen(false)
          return
        }
        if (collisionOrder) {
          setCollisionOrder(null)
          return
        }
      }

      // F1: Switch to Retail Mode
      if (e.key === 'F1') {
        e.preventDefault()
        e.stopPropagation()
        handleSwitchSellingMode('RETAIL')
        return
      }

      // F2: Switch to Wholesale Mode
      if (e.key === 'F2') {
        e.preventDefault()
        e.stopPropagation()
        handleSwitchSellingMode('WHOLESALE')
        return
      }

      // F4: Focus Barcode / Search input
      if (e.key === 'F4') {
        e.preventDefault()
        e.stopPropagation()
        scanInputRef.current?.focus()
        scanInputRef.current?.select()
        return
      }

      // F9: Open Payment
      if (e.key === 'F9') {
        e.preventDefault()
        e.stopPropagation()
        if (completed) {
          window.print()
          return
        }
        if (cart.length > 0 && !isSubmitting) {
          setPayment(true)
        } else if (!cart.length) {
          setNotice('⚠️ Cart is empty. Please add products before payment.')
        }
        return
      }

      // F5: Direct Quick Print (Exact Cash)
      if (e.key === 'F5') {
        e.preventDefault()
        e.stopPropagation()
        if (completed) {
          window.print()
          return
        }
        if (cart.length > 0 && !isSubmitting && !isHoldModalOpen && !isRecallModalOpen && !isCustomerModalOpen && !selected && !payment) {
          handleDirectPrintSale()
        } else if (!cart.length && !completed) {
          setNotice('⚠️ Cart is empty. Please add products before printing.')
        }
        return
      }

      // Alt+H to Hold or Recall
      if (e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault()
        if (cart.length) {
          setIsHoldModalOpen(true)
        } else {
          setIsRecallModalOpen(true)
        }
        return
      }

      // If any modal is open, do not intercept typing/scanning
      if (isHoldModalOpen || isRecallModalOpen || isCustomerModalOpen || selected || payment || completed || collisionOrder) {
        return
      }

      // Check active element
      const activeEl = document.activeElement as HTMLElement | null
      const activeTag = activeEl?.tagName?.toLowerCase()
      const isOtherInput = (activeTag === 'input' && activeEl !== scanInputRef.current) || activeTag === 'textarea'

      // Allow normal typing inside catalog search inputs
      if (isOtherInput) {
        return
      }

      // Enter key: Barcode scanner finish or manual enter
      if (e.key === 'Enter') {
        const buffered = barcodeBufferRef.current.trim()
        if (buffered.length >= 2) {
          e.preventDefault()
          e.stopPropagation()
          barcodeBufferRef.current = ''
          setScan('')
          processBarcodeOrCode(buffered)
          scanInputRef.current?.focus()
          return
        }
        if (scan.trim()) {
          e.preventDefault()
          e.stopPropagation()
          const code = scan.trim()
          setScan('')
          barcodeBufferRef.current = ''
          processBarcodeOrCode(code)
          scanInputRef.current?.focus()
          return
        }
        return
      }

      // Printable single character (scanner keystroke or user typing)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const now = Date.now()
        const elapsed = now - lastKeyTimeRef.current
        lastKeyTimeRef.current = now

        // Hardware scanners output characters typically in < 50ms intervals
        if (elapsed > 200) {
          barcodeBufferRef.current = e.key
        } else {
          barcodeBufferRef.current += e.key
        }

        // Even if the search bar was not clicked/focused, focus it and capture the character
        if (document.activeElement !== scanInputRef.current) {
          scanInputRef.current?.focus()
          setScan(prev => {
            const nextVal = prev + e.key
            // Immediate check for exact barcode match
            const trimmed = nextVal.trim()
            const match = groceryItems.find(
              item => item.active && item.barcode && item.barcode.trim().toLowerCase() === trimmed.toLowerCase()
            )
            if (match) {
              setTimeout(() => {
                addGrocery(match)
                setScan('')
                barcodeBufferRef.current = ''
                setNotice('')
              }, 10)
            }
            return nextVal
          })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    cart,
    completed,
    isSubmitting,
    isHoldModalOpen,
    isRecallModalOpen,
    selected,
    payment,
    collisionOrder,
    total,
    scan,
    groceryItems,
    chickenItems,
  ])

  const handleHoldBill = (note: string) => {
    if (!cart.length) return
    const nextNum = heldOrdersStore.getNextHoldNumber()
    const reference = note.trim() || `Hold #${nextNum}`
    const order: HeldOrder = {
      id: generateHeldOrderId(),
      reference,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
      items: [...cart],
      itemCount: cart.reduce((sum, item) => sum + (item.kind === 'grocery' ? item.quantity : 1), 0),
      total,
      cashier: profile?.full_name || 'Cashier',
      sellingMode,
    }
    heldOrdersStore.save(order)
    setCart([])
    setIsHoldModalOpen(false)
    setNotice(`Bill held as "${reference}". Ready for next customer.`)
  }

  const handleResumeOrder = (order: HeldOrder) => {
    if (cart.length > 0) {
      setCollisionOrder(order)
      return
    }
    executeResume(order)
  }

  const executeResume = (order: HeldOrder) => {
    const hydratedItems: Cart[] = order.items.map(item => {
      if (item.kind === 'chicken') return item
      const promo = item.priceType === 'WHOLESALE'
        ? { paidQuantity: item.quantity, freeQuantity: 0, totalQuantity: item.quantity, promotionApplied: false }
        : calculatePromotion(item.quantity, item.product)
      const uPrice = item.unitPrice ?? ((item.priceType === 'WHOLESALE' ? getProductWholesalePrice(item.product) : null) ?? getProductRetailPrice(item.product))
      return {
        ...item,
        unitPrice: uPrice,
        sellingMode: item.sellingMode || order.sellingMode || 'RETAIL',
        priceType: item.priceType || 'RETAIL',
        paidQuantity: item.paidQuantity ?? promo.paidQuantity,
        freeQuantity: item.freeQuantity ?? promo.freeQuantity,
        totalQuantity: item.totalQuantity ?? promo.totalQuantity,
        promotionApplied: item.promotionApplied ?? promo.promotionApplied,
      }
    })
    setCart(hydratedItems)
    if (order.sellingMode) {
      setSellingMode(order.sellingMode)
    }
    heldOrdersStore.remove(order.id)
    setIsRecallModalOpen(false)
    setCollisionOrder(null)
    setNotice(`Resumed "${order.reference}" (${order.items.length} items · ${formatMoney(order.total)})`)
  }

  const handleHoldCurrentAndResume = (orderToResume: HeldOrder) => {
    const nextNum = heldOrdersStore.getNextHoldNumber()
    const autoRef = `Hold #${nextNum}`
    const currentHeld: HeldOrder = {
      id: generateHeldOrderId(),
      reference: autoRef,
      createdAt: new Date().toISOString(),
      items: [...cart],
      itemCount: cart.reduce((sum, item) => sum + (item.kind === 'grocery' ? item.quantity : 1), 0),
      total,
      cashier: profile?.full_name || 'Cashier',
      sellingMode,
    }
    heldOrdersStore.save(currentHeld)
    executeResume(orderToResume)
  }

  const handleDiscardCurrentAndResume = (orderToResume: HeldOrder) => {
    executeResume(orderToResume)
  }

  const products = groceryItems.filter(
    product =>
      product.active &&
      (groceryCategory === 'All' || product.category === groceryCategory) &&
      (product.name.toLowerCase().includes(search.toLowerCase()) ||
        product.barcode.includes(search) ||
        (product.code && product.code.includes(search)))
  )
  const chickenResults = chickenItems.filter(
    item =>
      item.active &&
      (item.name.toLowerCase().includes(chickenSearch.toLowerCase()) ||
        item.cut.toLowerCase().includes(chickenSearch.toLowerCase()) ||
        (item.code && item.code.includes(chickenSearch)))
  )

  const selectedWeight = parseWeightInGrams(grams)
  const selectedEffectiveRate = selected
    ? (sellingMode === 'WHOLESALE' && selected.wholesalePricePerKg !== undefined && selected.wholesalePricePerKg !== null && selected.wholesalePricePerKg > 0
        ? selected.wholesalePricePerKg
        : selected.pricePerKg)
    : 0
  const customEstimated = selected && selectedWeight ? calculateChickenPrice(selectedWeight, selectedEffectiveRate) : 0

  const reset = () => {
    setCompleted(null)
    setSelectedCustomer(null)
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
              <h2 style={{ whiteSpace: 'nowrap' }}>Invoice #{salesStore.getNextInvoice()}</h2>
            </div>
            <div className="bill-header-actions">
              <button
                type="button"
                className={`pos-customer-select-btn ${selectedCustomer ? 'has-customer' : ''}`}
                onClick={() => setIsCustomerModalOpen(true)}
                title="Select customer for credit or billing"
              >
                <span>👤 {selectedCustomer ? selectedCustomer.name : 'Walk-in'}</span>
                {selectedCustomer && getCustomerOutstanding(selectedCustomer.id) > 0 && (
                  <span style={{ fontSize: '10px', color: '#f3b625', fontWeight: 800 }}>
                    ({formatMoney(getCustomerOutstanding(selectedCustomer.id))})
                  </span>
                )}
                <small>▾</small>
              </button>
              {selectedCustomer && (
                <button
                  type="button"
                  className="btn-qty"
                  style={{ width: '22px', height: '26px', fontSize: '12px' }}
                  onClick={() => setSelectedCustomer(null)}
                  title="Reset to Walk-in Customer"
                >
                  ×
                </button>
              )}
              <button
                type="button"
                className={`btn-held-list ${heldOrders.length > 0 ? 'has-held' : ''}`}
                onClick={() => setIsRecallModalOpen(true)}
                title="View held bills"
              >
                📋 Held <span className="held-count-badge">{heldOrders.length}</span>
              </button>
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
                + New
              </button>
            </div>
          </header>

          {/* Barcode / Chicken Code Search Box with Live Dropdown */}
          <div className="pos-search-wrapper" ref={searchContainerRef}>
            <form className="pos-search-bar" onSubmit={submitScan}>
              <span className="search-icon">🔍</span>
              <input
                ref={scanInputRef}
                value={scan}
                onChange={event => handleScanChange(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => {
                  if (scan.trim().length >= 1) setShowSuggestions(true)
                }}
                placeholder="Scan barcode or search wings, chicken, grocery..."
                autoFocus
              />
              {scan && (
                <button
                  type="button"
                  className="btn-clear-search"
                  onClick={() => {
                    setScan('')
                    setShowSuggestions(false)
                    barcodeBufferRef.current = ''
                    scanInputRef.current?.focus()
                  }}
                  title="Clear search"
                >
                  ×
                </button>
              )}
              <kbd className="kbd-enter">Enter</kbd>
            </form>

            {/* LIVE AUTOCOMPLETE DROPDOWN */}
            {showSuggestions && scan.trim().length >= 1 && (
              <div className="pos-search-dropdown">
                <div className="pos-dropdown-header">
                  <span>
                    Suggestions for <strong>"{scan}"</strong> ({suggestions.length})
                  </span>
                  <small>↑↓ to navigate · Enter or Click to select</small>
                </div>

                {suggestions.length > 0 ? (
                  <div className="pos-dropdown-list">
                    {suggestions.map((s, idx) => {
                      const isHighlighted = highlightedIndex === idx
                      if (s.kind === 'chicken') {
                        const item = s.item
                        return (
                          <button
                            type="button"
                            key={`s-c-${item.id}`}
                            className={`pos-dropdown-item ${isHighlighted ? 'highlighted' : ''}`}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            onClick={() => handleSelectSuggestion(s)}
                          >
                            <div className="pos-dropdown-item-left">
                              <span className="pos-dropdown-badge chicken">🍗 CHICKEN</span>
                              <div className="pos-dropdown-item-info">
                                <span className="pos-dropdown-item-name">{item.name}</span>
                                <span className="pos-dropdown-item-sub">
                                  Cut #{item.code || 'CH--'} · {item.cut || item.name}
                                </span>
                              </div>
                            </div>
                            <div className="pos-dropdown-item-right">
                              {sellingMode === 'WHOLESALE' &&
                              item.wholesalePricePerKg &&
                              item.wholesalePricePerKg > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ background: '#0284c7', color: '#fff', fontSize: '9px', padding: '1px 5px', borderRadius: '3px', fontWeight: 800 }}>
                                      WHOLESALE
                                    </span>
                                    <span className="pos-dropdown-price" style={{ color: '#38bdf8' }}>
                                      {formatMoney(item.wholesalePricePerKg)}/kg
                                    </span>
                                  </div>
                                  <del style={{ fontSize: '10px', color: '#94a3b8' }}>
                                    {formatMoney(item.pricePerKg)}/kg
                                  </del>
                                </div>
                              ) : (
                                <span className="pos-dropdown-price">{formatMoney(item.pricePerKg)}/kg</span>
                              )}
                              <span className="pos-dropdown-action-hint">Choose weight →</span>
                            </div>
                          </button>
                        )
                      } else {
                        const item = s.item
                        const isOut = item.stockQuantity <= 0
                        const isLow = item.stockQuantity <= item.lowStockLevel && !isOut
                        const isDiscounted = Boolean(
                          item.discountPrice &&
                          item.discountPrice > 0 &&
                          item.discountPrice < item.sellingPrice
                        )

                        return (
                          <button
                            type="button"
                            key={`s-g-${item.id}`}
                            className={`pos-dropdown-item ${isHighlighted ? 'highlighted' : ''}`}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            onClick={() => handleSelectSuggestion(s)}
                            disabled={isOut}
                          >
                            <div className="pos-dropdown-item-left">
                              <span className="pos-dropdown-badge grocery">🛒 GROCERY</span>
                              <div className="pos-dropdown-item-info">
                                <span className="pos-dropdown-item-name">{item.name}</span>
                                <span className="pos-dropdown-item-sub">
                                  #{item.code} · {item.category} {item.barcode ? `· ${item.barcode}` : ''}
                                </span>
                              </div>
                            </div>
                            <div className="pos-dropdown-item-right">
                              {sellingMode === 'WHOLESALE' &&
                              item.wholesaleEnabled &&
                              item.wholesalePrice !== null &&
                              item.wholesalePrice !== undefined &&
                              Number(item.wholesalePrice) > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ background: '#0284c7', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '3px', fontWeight: 800 }}>
                                      WHOLESALE
                                    </span>
                                    <span className="pos-dropdown-price" style={{ color: '#38bdf8' }}>
                                      {formatMoney(Number(item.wholesalePrice))}
                                    </span>
                                  </div>
                                  <small style={{ color: '#94a3b8', fontSize: '11px' }}>
                                    Min: {item.wholesaleMinQuantity || 1} {item.unit || 'pcs'}
                                  </small>
                                </div>
                              ) : isDiscounted ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <del style={{ fontSize: '11px', color: '#94a3b8' }}>
                                    {formatMoney(item.retailPrice ?? item.sellingPrice)}
                                  </del>
                                  <span className="pos-dropdown-price" style={{ color: '#10b981' }}>
                                    {formatMoney(item.discountPrice!)}
                                  </span>
                                </div>
                              ) : (
                                <span className="pos-dropdown-price">{formatMoney(item.retailPrice ?? item.sellingPrice)}</span>
                              )}
                              <span className={`pos-dropdown-stock ${isOut ? 'out' : isLow ? 'low' : ''}`}>
                                {isOut ? 'OUT OF STOCK' : `Stock: ${item.stockQuantity} ${item.unit || 'pcs'}`}
                              </span>
                            </div>
                          </button>
                        )
                      }
                    })}
                  </div>
                ) : (
                  <div className="pos-dropdown-empty">
                    <span>No chicken cuts or products matching "{scan}"</span>
                  </div>
                )}
              </div>
            )}
          </div>

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
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                        <b>{item.kind === 'chicken' ? item.productName : item.product.name}</b>
                        {item.kind === 'chicken' && (
                          item.chicken?.wholesalePricePerKg && item.chicken.wholesalePricePerKg > 0 ? (
                            item.priceType === 'WHOLESALE' ? (
                              <button
                                type="button"
                                onClick={() => toggleChickenPriceType(item.id)}
                                className="pos-wholesale-cart-pill"
                                style={{
                                  background: '#0284c7',
                                  color: '#ffffff',
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  cursor: 'pointer',
                                  letterSpacing: '0.5px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                                title="Click to switch chicken to Retail Price"
                              >
                                <span>📦 WHOLESALE</span>
                                <span style={{ fontSize: '9px', opacity: 0.8 }}>▾</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleChickenPriceType(item.id)}
                                style={{
                                  background: '#1e293b',
                                  color: '#94a3b8',
                                  border: '1px solid #475569',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                                title="Click to switch chicken to Wholesale Price"
                              >
                                <span>🛍️ RETAIL</span>
                                <span style={{ fontSize: '9px', opacity: 0.8 }}>▾</span>
                              </button>
                            )
                          ) : item.priceType === 'WHOLESALE' || item.sellingMode === 'WHOLESALE' ? (
                            <span
                              className="pos-wholesale-cart-pill"
                              style={{
                                background: '#0284c7',
                                color: '#ffffff',
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                letterSpacing: '0.5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                              }}
                            >
                              📦 WHOLESALE
                            </span>
                          ) : null
                        )}
                        {item.kind === 'grocery' && item.product.wholesaleEnabled && (
                          item.priceType === 'WHOLESALE' ? (
                            <button
                              type="button"
                              onClick={() => toggleItemPriceType(item.product.id)}
                              className="pos-wholesale-cart-pill"
                              style={{
                                background: '#0284c7',
                                color: '#ffffff',
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: 'none',
                                cursor: 'pointer',
                                letterSpacing: '0.5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                              title="Click to switch to Retail Price"
                            >
                              <span>📦 WHOLESALE</span>
                              <span style={{ fontSize: '9px', opacity: 0.8 }}>▾</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleItemPriceType(item.product.id)}
                              style={{
                                background: '#1e293b',
                                color: '#94a3b8',
                                border: '1px solid #475569',
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                              title="Click to switch to Wholesale Price"
                            >
                              <span>🛍️ RETAIL</span>
                              <span style={{ fontSize: '9px', opacity: 0.8 }}>▾</span>
                            </button>
                          )
                        )}
                      </div>
                      {item.kind === 'grocery' &&
                        (item.sellingMode === 'WHOLESALE' || sellingMode === 'WHOLESALE') &&
                        item.product.wholesaleEnabled &&
                        item.product.wholesalePrice &&
                        Number(item.product.wholesalePrice) > 0 &&
                        item.quantity < (item.product.wholesaleMinQuantity || 1) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700 }}>
                              ⚠️ Wholesale min: {item.product.wholesaleMinQuantity || 1} (Using retail {formatMoney(item.unitPrice)})
                            </span>
                            <button
                              type="button"
                              onClick={() => setGroceryDirectQty(item.product.id, item.product.wholesaleMinQuantity || 1)}
                              style={{
                                background: '#0369a1',
                                border: '1px solid #38bdf8',
                                color: '#ffffff',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                              title="Increase quantity to wholesale minimum"
                            >
                              ⚡ Set to Min: {item.product.wholesaleMinQuantity || 1} ({formatMoney(Number(item.product.wholesalePrice))})
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleItemPriceType(item.product.id)}
                              style={{
                                background: '#1e293b',
                                border: '1px solid #475569',
                                color: '#cbd5e1',
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                              title="Force Wholesale price despite quantity"
                            >
                              Force Wholesale Price
                            </button>
                          </div>
                        )}
                      {item.kind === 'chicken' && (
                        <span className="tag-chicken-weight">
                          {item.weightGrams >= 1000
                            ? `${(item.weightGrams / 1000).toFixed(2).replace(/\.00$/, '')} kg`
                            : `${item.weightGrams}g`}
                        </span>
                      )}
                      {item.kind === 'grocery' && item.freeQuantity && item.freeQuantity > 0 ? (
                        <span className="pos-promo-cart-badge">
                          🎁 {item.paidQuantity} Paid + {item.freeQuantity} Free = {item.totalQuantity}
                        </span>
                      ) : null}
                    </div>

                    <div className="col-unit">
                      {item.kind === 'chicken'
                        ? item.weightGrams >= 1000
                          ? `${(item.weightGrams / 1000).toFixed(2).replace(/\.00$/, '')} kg`
                          : `${item.weightGrams}g`
                        : item.product.unit || 'Pkt'}
                    </div>

                    <div className="col-rate">
                      {item.kind === 'chicken' ? (
                        `${formatMoney(item.pricePerKg)}/kg`
                      ) : item.priceType === 'WHOLESALE' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
                          <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                            {formatMoney(item.unitPrice)}
                          </span>
                          <small style={{ color: '#94a3b8', fontSize: '10px' }}>Wholesale</small>
                        </div>
                      ) : item.product.discountPrice &&
                        item.product.discountPrice > 0 &&
                        item.product.discountPrice < (item.product.retailPrice ?? item.product.sellingPrice) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
                          <del style={{ color: '#94a3b8', fontSize: '11px', textDecoration: 'line-through' }}>
                            {formatMoney(item.product.retailPrice ?? item.product.sellingPrice)}
                          </del>
                          <span style={{ color: '#10b981', fontWeight: 700 }}>
                            {formatMoney(item.product.discountPrice)}
                          </span>
                        </div>
                      ) : (
                        formatMoney(item.unitPrice)
                      )}
                    </div>

                    <div className="col-qty">
                      {item.kind === 'grocery' ? (
                        <div className="qty-control-inline">
                          <button
                            type="button"
                            className="btn-qty"
                            onClick={() => updateGroceryQty(item.product.id, -1)}
                            title="Decrease quantity"
                          >
                            -
                          </button>
                          <CartItemQtyInput
                            quantity={item.quantity}
                            maxStock={item.product.stockQuantity}
                            onChangeQty={newQty => setGroceryDirectQty(item.product.id, newQty)}
                            onEnter={() => {
                              scanInputRef.current?.focus()
                              scanInputRef.current?.select()
                            }}
                          />
                          <button
                            type="button"
                            className="btn-qty"
                            onClick={() => updateGroceryQty(item.product.id, 1)}
                            title="Increase quantity"
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
                <b>{formatMoney(regularSubtotal)}</b>
              </div>
              <div className="summary-row">
                <span>Discount:</span>
                <span style={{ color: totalDiscount > 0 ? '#10b981' : undefined, fontWeight: totalDiscount > 0 ? 600 : undefined }}>
                  {totalDiscount > 0 ? `-${formatMoney(totalDiscount)}` : 'Rs. 0.00'}
                </span>
              </div>
              <div className="summary-row grand-total-row">
                <span className="total-label">TOTAL AMOUNT</span>
                <b className="total-value">{formatMoney(total)}</b>
              </div>
            </div>

            <div className="pos-checkout-actions-container">
              {/* PRIMARY PAY BUTTON - FULL WIDTH, PROMINENT & HIGH-VISIBILITY */}
              <button
                type="button"
                className="pos-btn-pay-main"
                disabled={!cart.length || isSubmitting}
                onClick={() => setPayment(true)}
                title="Complete Sale & Open Payment (Shortcut: F9)"
              >
                <div className="pay-main-left">
                  <span className="pay-main-icon">💳</span>
                  <span className="pay-main-title">PAY NOW</span>
                  <kbd className="pay-main-kbd">F9</kbd>
                </div>
                <div className="pay-main-right">
                  <b className="pay-main-amount">{formatMoney(total)}</b>
                  <span className="pay-main-arrow">➔</span>
                </div>
              </button>

              {/* SECONDARY UTILITY ACTIONS ROW */}
              <div className="pos-secondary-actions-row">
                <button
                  type="button"
                  className="pos-btn-secondary pos-btn-hold-bill"
                  disabled={!cart.length || isSubmitting}
                  onClick={() => setIsHoldModalOpen(true)}
                  title="Hold Current Bill (Shortcut: Alt+H or F4)"
                >
                  <span className="sec-icon">⏸️</span>
                  <span className="sec-label">Hold Bill</span>
                  <kbd className="sec-kbd">Alt+H</kbd>
                </button>

                <button
                  type="button"
                  className="pos-btn-secondary pos-btn-quick-print"
                  disabled={!cart.length || isSubmitting}
                  onClick={handleDirectPrintSale}
                  title="Exact Cash & Direct Print (Shortcut: F5)"
                >
                  <span className="sec-icon">🖨️</span>
                  <span className="sec-label">Quick Print</span>
                  <kbd className="sec-kbd">F5</kbd>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: CATALOG (CHICKEN / GROCERY) */}
        <section className="pos-catalog-panel">
          {sellingMode === 'WHOLESALE' && (
            <div
              style={{
                background: 'linear-gradient(90deg, #0369a1, #0284c7)',
                color: '#ffffff',
                padding: '10px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 800,
                letterSpacing: '0.6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
                boxShadow: '0 2px 10px rgba(2, 132, 199, 0.4)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>📦</span>
                <span>WHOLESALE SELLING MODE ACTIVE (Bulk Pricing Automatically Applied)</span>
              </div>
              <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px' }}>
                Press [F1] for Retail
              </span>
            </div>
          )}

          <div className="catalog-tabs-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`catalog-tab-btn ${tab === 'Chicken' ? 'active' : ''}`}
                onClick={() => setTab('Chicken')}
                style={{ minHeight: '44px' }}
              >
                🍗 FRESH CHICKEN CUTS
              </button>
              <button
                type="button"
                className={`catalog-tab-btn ${tab === 'Grocery' ? 'active' : ''}`}
                onClick={() => setTab('Grocery')}
                style={{ minHeight: '44px' }}
              >
                🛒 GROCERY PRODUCTS
              </button>
            </div>

            {/* SELLING MODE SELECTOR */}
            <div
              className="pos-selling-mode-selector"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: '#0f172a',
                padding: '4px',
                borderRadius: '8px',
                border: '1px solid #334155',
                gap: '4px',
              }}
              title="Selling Mode: Switch between Retail (F1) and Wholesale (F2)"
            >
              <button
                type="button"
                className={`pos-mode-btn ${sellingMode === 'RETAIL' ? 'active' : ''}`}
                onClick={() => handleSwitchSellingMode('RETAIL')}
                style={{
                  minHeight: '44px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  background: sellingMode === 'RETAIL' ? '#2563eb' : 'transparent',
                  color: sellingMode === 'RETAIL' ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.15s ease',
                  boxShadow: sellingMode === 'RETAIL' ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>🛍️ RETAIL</span>
                <kbd style={{ fontSize: '10px', background: 'rgba(255,255,255,0.2)', padding: '2px 4px', borderRadius: '3px' }}>F1</kbd>
              </button>
              <button
                type="button"
                className={`pos-mode-btn ${sellingMode === 'WHOLESALE' ? 'active' : ''}`}
                onClick={() => handleSwitchSellingMode('WHOLESALE')}
                style={{
                  minHeight: '44px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  background: sellingMode === 'WHOLESALE' ? '#0284c7' : 'transparent',
                  color: sellingMode === 'WHOLESALE' ? '#ffffff' : '#94a3b8',
                  boxShadow: sellingMode === 'WHOLESALE' ? '0 0 12px rgba(2, 132, 199, 0.5)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>📦 WHOLESALE</span>
                <kbd style={{ fontSize: '10px', background: 'rgba(255,255,255,0.2)', padding: '2px 4px', borderRadius: '3px' }}>F2</kbd>
              </button>
            </div>
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
                        <div className="card-top">
                          <span className="cut-code-badge">{item.code || 'CH---'}</span>
                          <span className="cut-name">{item.name}</span>
                        </div>
                        {sellingMode === 'WHOLESALE' && item.wholesalePricePerKg && item.wholesalePricePerKg > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ background: '#0284c7', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', fontWeight: 800 }}>
                                WHOLESALE
                              </span>
                              <del style={{ color: '#94a3b8', fontSize: '11px' }}>{formatMoney(item.pricePerKg)}</del>
                            </div>
                            <b className="cut-price" style={{ color: '#38bdf8' }}>{formatMoney(item.wholesalePricePerKg)} / KG</b>
                          </div>
                        ) : (
                          <b className="cut-price">{formatMoney(item.pricePerKg)} / KG</b>
                        )}
                        <span className="cut-badge">{item.cut || item.name} Cut</span>
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
                            <span className="product-code-badge">#{product.code}</span>
                            <span className="product-title">{product.name}</span>
                            <span className="product-category-tag">{product.category}</span>
                            {isPromotionActive(product) && (
                              <div className="pos-btn-promo-tag">
                                🎁 {formatPromotionBadge(product)}
                              </div>
                            )}
                          </div>

                          <div className="card-bottom">
                            {sellingMode === 'WHOLESALE' &&
                            product.wholesaleEnabled &&
                            product.wholesalePrice !== null &&
                            product.wholesalePrice !== undefined &&
                            Number(product.wholesalePrice) > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ background: '#0284c7', color: '#ffffff', fontSize: '10px', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                                    WHOLESALE
                                  </span>
                                  <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                                    Min: {product.wholesaleMinQuantity || 1}
                                  </span>
                                </div>
                                <b className="product-price" style={{ color: '#38bdf8' }}>
                                  {formatMoney(Number(product.wholesalePrice))}
                                </b>
                              </div>
                            ) : product.discountPrice &&
                              product.discountPrice > 0 &&
                              product.discountPrice < (product.retailPrice ?? product.sellingPrice) ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <del style={{ color: '#94a3b8', fontSize: '11px', textDecoration: 'line-through' }}>
                                    {formatMoney(product.retailPrice ?? product.sellingPrice)}
                                  </del>
                                  <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '10px', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                    SAVE {formatMoney((product.retailPrice ?? product.sellingPrice) - product.discountPrice)}
                                  </span>
                                </div>
                                <b className="product-price" style={{ color: '#10b981' }}>
                                  {formatMoney(product.discountPrice)}
                                </b>
                              </div>
                            ) : (
                              <b className="product-price">{formatMoney(product.retailPrice ?? product.sellingPrice)}</b>
                            )}
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
                <small>SELECT WEIGHT · <strong style={{ color: '#f3b625' }}>{selected.code}</strong></small>
                <h2>{selected.name}</h2>
                <p>
                  {sellingMode === 'WHOLESALE' && selected.wholesalePricePerKg && selected.wholesalePricePerKg > 0 ? (
                    <span>
                      Wholesale Rate: <strong style={{ color: '#38bdf8' }}>{formatMoney(selected.wholesalePricePerKg)} / KG</strong>
                      <del style={{ color: '#94a3b8', marginLeft: '8px', fontSize: '12px' }}>{formatMoney(selected.pricePerKg)}</del>
                    </span>
                  ) : (
                    <span>Rate: <strong>{formatMoney(selected.pricePerKg)} / KG</strong></span>
                  )}
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
                <label style={{ marginBottom: '8px', display: 'block', fontWeight: 700 }}>
                  QUICK WEIGHT PRESETS (TAP TO ADD IMMEDIATELY)
                </label>
                <div className="quick-weight-chips" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {quickWeights.map(w => {
                    const effRate = sellingMode === 'WHOLESALE' && selected.wholesalePricePerKg && selected.wholesalePricePerKg > 0
                      ? selected.wholesalePricePerKg
                      : selected.pricePerKg
                    const calcPrice = calculateChickenPrice(w, effRate)
                    return (
                      <button
                        type="button"
                        key={w}
                        className="quick-weight-btn"
                        style={{ minHeight: '56px', padding: '8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => addChicken(w)}
                        title={`Immediately add ${w >= 1000 ? `${w / 1000}kg` : `${w}g`} of ${selected.name}`}
                      >
                        <span style={{ fontSize: '16px', fontWeight: 800 }}>{w >= 1000 ? `${(w / 1000).toFixed(1).replace(/\.0$/, '')} KG` : `${w}g`}</span>
                        <small style={{ color: sellingMode === 'WHOLESALE' && selected.wholesalePricePerKg ? '#38bdf8' : '#f3b625', fontWeight: 700, fontSize: '13px' }}>
                          {formatMoney(calcPrice)}
                        </small>
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
                  placeholder="e.g. .250 for 250g, 1 for 1kg, 1.5 for 1.5kg"
                />
                <span style={{ fontSize: '11px', color: '#8b9aa7', marginTop: '4px', display: 'block' }}>
                  Type: <code>.250</code> = 250g, <code>1</code> = 1kg, <code>1.5</code> = 1.5kg (or grams e.g. <code>500</code>)
                </span>
              </label>

              <div className="price-preview-card">
                <div className="preview-row">
                  <span>Selected Cut:</span>
                  <b>{selected.name}</b>
                </div>
                <div className="preview-row">
                  <span>Weight:</span>
                  <b>{selectedWeight ? formatWeightDisplay(selectedWeight) : '—'}</b>
                </div>
                <div className="preview-row">
                  <span>Rate:</span>
                  <b>{formatMoney(selectedEffectiveRate)} / kg</b>
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
        <PaymentModal
          total={total}
          selectedCustomer={selectedCustomer}
          onSelectCustomer={setSelectedCustomer}
          onCancel={() => setPayment(false)}
          onComplete={completeSale}
          sellingMode={sellingMode}
        />
      )}

      {/* CUSTOMER SELECTOR MODAL */}
      {isCustomerModalOpen && (
        <PosCustomerPickerModal
          selectedCustomer={selectedCustomer}
          onSelectCustomer={setSelectedCustomer}
          onClose={() => setIsCustomerModalOpen(false)}
        />
      )}

      {/* HOLD CONFIRM MODAL */}
      {isHoldModalOpen && (
        <HoldConfirmModal
          cart={cart}
          total={total}
          nextHoldNumber={heldOrdersStore.peekNextHoldNumber()}
          onCancel={() => setIsHoldModalOpen(false)}
          onConfirm={handleHoldBill}
        />
      )}

      {/* RECALL HELD ORDERS MODAL */}
      {isRecallModalOpen && (
        <RecallHeldOrdersModal
          heldOrders={heldOrders}
          onClose={() => setIsRecallModalOpen(false)}
          onResume={handleResumeOrder}
          onDelete={id => heldOrdersStore.remove(id)}
          onClearAll={() => heldOrdersStore.clear()}
        />
      )}

      {/* COLLISION RESOLUTION MODAL */}
      {collisionOrder && (
        <CollisionModal
          pendingOrder={collisionOrder}
          onHoldCurrentAndResume={() => handleHoldCurrentAndResume(collisionOrder)}
          onDiscardCurrentAndResume={() => handleDiscardCurrentAndResume(collisionOrder)}
          onCancel={() => setCollisionOrder(null)}
        />
      )}

      {/* SALE SUCCESS / RECEIPT PREVIEW */}
      {completed && (
        <SaleSuccess
          sale={completed}
          onNewSale={() => {
            reset()
            setAutoPrintAfterSale(false)
          }}
          onClose={() => {
            setCompleted(null)
            setAutoPrintAfterSale(false)
          }}
          autoPrint={autoPrintAfterSale}
        />
      )}
    </section>
  )
}
