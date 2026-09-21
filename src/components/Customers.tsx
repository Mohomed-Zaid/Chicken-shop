import { useState, useEffect, type FormEvent } from 'react'
import { formatMoney } from '../data/chicken'
import {
  customerStore,
  customerPaymentStore,
  getCustomerCreditSales,
  getCustomerPaymentsTotal,
  getCustomerOutstanding,
  getCustomerStatus,
  getCustomerCreditSalesList,
  type Customer,
  type CustomerPayment,
  type CustomerPaymentMethod,
  type CustomerStatus,
} from '../data/customers'
import { storageAdapter } from '../services/storageAdapter'
import { syncCustomerToSupabase, syncCustomerPaymentToSupabase } from '../services/supabase/customerService'
import { toLocalDateString } from '../data/records'

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>(() => customerStore.getCustomers())
  const [query, setQuery] = useState('')
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null)
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null)

  const reload = () => {
    const list = customerStore.getCustomers()
    setCustomers(list)
    if (detailCustomer) {
      setDetailCustomer(customerStore.getCustomerById(detailCustomer.id) || null)
    }
  }

  useEffect(() => {
    const handleUpdate = () => reload()
    window.addEventListener('customers_updated', handleUpdate)
    window.addEventListener('sales_updated', handleUpdate)
    return () => {
      window.removeEventListener('customers_updated', handleUpdate)
      window.removeEventListener('sales_updated', handleUpdate)
    }
  }, [detailCustomer])

  const visibleCustomers = customers.filter(c =>
    `${c.name} ${c.phone || ''} ${c.address || ''}`.toLowerCase().includes(query.toLowerCase())
  )

  const renderStatusBadge = (status: CustomerStatus) => {
    switch (status) {
      case 'DUE':
        return <span className="status-badge-due">DUE</span>
      case 'PARTIALLY PAID':
        return <span className="status-badge-partial">PARTIALLY PAID</span>
      case 'PAID':
        return <span className="status-badge-paid">PAID</span>
      case 'NO DUES':
      default:
        return <span className="status-badge-nodues">NO DUES</span>
    }
  }

  return (
    <section className="prices-page">
      <header className="page-header">
        <div>
          <small>CUSTOMER ACCOUNTS & CREDIT</small>
          <h1>Customers</h1>
          <p>Manage customer accounts, credit purchases and pay-later settlements.</p>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() =>
            setEditingCustomer({
              id: '',
              name: '',
              phone: '',
              address: '',
              creditLimit: 0,
              openingBalance: 0,
              active: true,
              createdAt: '',
              updatedAt: '',
            })
          }
        >
          + Add Customer
        </button>
      </header>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
        <input
          className="product-search"
          placeholder="Search customer by name, phone or address..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>

      <section className="price-table">
        <div className="price-row customer-table-head table-head">
          <span>Customer</span>
          <span>Phone</span>
          <span style={{ textAlign: 'right' }}>Credit Sales</span>
          <span style={{ textAlign: 'right' }}>Total Paid</span>
          <span style={{ textAlign: 'right' }}>Outstanding</span>
          <span style={{ textAlign: 'center' }}>Status</span>
          <span style={{ textAlign: 'right' }}>Actions</span>
        </div>

        {visibleCustomers.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
            <b>No customers found</b>
            <p style={{ fontSize: '13px', marginTop: '6px' }}>
              {query ? 'No customer matches your search filter.' : 'Click "+ Add Customer" to register your first customer.'}
            </p>
          </div>
        ) : (
          visibleCustomers.map(customer => {
            const outstanding = getCustomerOutstanding(customer.id)
            const creditSales = getCustomerCreditSales(customer.id)
            const totalPaid = getCustomerPaymentsTotal(customer.id)
            const status = getCustomerStatus(customer.id)

            return (
              <div className="price-row customer-table-row" key={customer.id}>
                <span>
                  <b>{customer.name}</b>
                  {customer.address && <small>{customer.address}</small>}
                </span>
                <span>{customer.phone || '—'}</span>
                <span style={{ textAlign: 'right' }}>{formatMoney(creditSales)}</span>
                <span style={{ textAlign: 'right', color: '#10b981' }}>{formatMoney(totalPaid)}</span>
                <span style={{ textAlign: 'right', fontWeight: 800, color: outstanding > 0 ? '#f3b625' : '#10b981' }}>
                  {formatMoney(outstanding)}
                </span>
                <span style={{ textAlign: 'center' }}>{renderStatusBadge(status)}</span>
                <span style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {outstanding > 0 && (
                    <button
                      type="button"
                      className="btn-customer-pay"
                      onClick={() => setPayingCustomer(customer)}
                      title={`Receive payment for ${customer.name}`}
                    >
                      PAY
                    </button>
                  )}
                  <button type="button" className="edit" onClick={() => setDetailCustomer(customer)}>
                    View
                  </button>
                  <button type="button" className="edit" onClick={() => setEditingCustomer(customer)}>
                    Edit
                  </button>
                </span>
              </div>
            )
          })
        )}
      </section>

      {/* CUSTOMER EDITOR MODAL */}
      {editingCustomer && (
        <CustomerEditorModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSaved={() => {
            setEditingCustomer(null)
            reload()
          }}
        />
      )}

      {/* CUSTOMER DETAILS & HISTORY MODAL */}
      {detailCustomer && (
        <CustomerDetailsModal
          customer={detailCustomer}
          onClose={() => setDetailCustomer(null)}
          onPay={() => {
            setPayingCustomer(detailCustomer)
          }}
        />
      )}

      {/* CUSTOMER PAYMENT MODAL */}
      {payingCustomer && (
        <CustomerPaymentModal
          customer={payingCustomer}
          outstanding={getCustomerOutstanding(payingCustomer.id)}
          onClose={() => setPayingCustomer(null)}
          onSuccess={() => {
            setPayingCustomer(null)
            reload()
          }}
        />
      )}
    </section>
  )
}

/**
 * Customer Editor (Create & Edit)
 */
function CustomerEditorModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(customer.name)
  const [phone, setPhone] = useState(customer.phone)
  const [address, setAddress] = useState(customer.address || '')
  const [openingBalance, setOpeningBalance] = useState(String(customer.openingBalance || 0))
  const [creditLimit, setCreditLimit] = useState(String(customer.creditLimit || 0))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Customer name is required.')

    const parsedOpening = parseFloat(openingBalance) || 0
    if (parsedOpening < 0) return setError('Opening balance cannot be negative.')

    const parsedLimit = parseFloat(creditLimit) || 0
    if (parsedLimit < 0) return setError('Credit limit cannot be negative.')

    setSaving(true)
    setError('')

    const isEdit = Boolean(customer.id)
    const record: Customer = {
      id: customer.id || `customer-${Date.now()}`,
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      openingBalance: parsedOpening,
      creditLimit: parsedLimit,
      active: customer.active ?? true,
      createdAt: customer.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (isEdit) {
      customerStore.updateCustomer(record)
    } else {
      customerStore.saveCustomer(record)
    }

    if (storageAdapter.isSupabase()) {
      try {
        await syncCustomerToSupabase(record)
      } catch (err) {
        console.error('Failed to sync customer to Supabase:', err)
      }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="shade">
      <form className="dialog custom-dialog" onSubmit={handleSubmit} style={{ maxWidth: '480px' }}>
        <header>
          <div>
            <small>{customer.id ? 'EDIT CUSTOMER' : 'NEW CUSTOMER'}</small>
            <h2>{customer.id ? customer.name : 'Add Customer'}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving}>
            ×
          </button>
        </header>

        <div className="editor-body product-fields">
          <label>
            CUSTOMER NAME *
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Kamal Perera"
              required
            />
          </label>

          <label>
            PHONE NUMBER
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 0771234567"
            />
          </label>

          <label>
            ADDRESS
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="e.g. Kandy Road, Kadawatha"
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label>
              OPENING BALANCE (RS.)
              <input
                type="number"
                min="0"
                step="any"
                value={openingBalance}
                onChange={e => setOpeningBalance(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <label>
              CREDIT LIMIT (RS.)
              <input
                type="number"
                min="0"
                step="any"
                value={creditLimit}
                onChange={e => setCreditLimit(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>

          {error && <p className="validation">{error}</p>}
        </div>

        <footer>
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="confirm" disabled={saving}>
            {saving ? 'Saving...' : customer.id ? 'Update Customer' : 'Save Customer'}
          </button>
        </footer>
      </form>
    </div>
  )
}

/**
 * Customer Payment Modal
 */
export function CustomerPaymentModal({
  customer,
  outstanding,
  onClose,
  onSuccess,
}: {
  customer: Customer
  outstanding: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState(String(outstanding))
  const [method, setMethod] = useState<CustomerPaymentMethod>('Cash')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const parsedAmount = parseFloat(amount)

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Payment must be greater than zero.')
      return
    }

    if (parsedAmount > outstanding) {
      setError('Payment cannot be greater than outstanding amount.')
      return
    }

    setSubmitting(true)

    const paymentNumber = customerPaymentStore.getNextPaymentNumber()
    const now = new Date()
    const dateStr = toLocalDateString(now)
    const timeStr = now.toLocaleTimeString()

    const paymentRecord: CustomerPayment = {
      id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      paymentNumber,
      customerId: customer.id,
      customerName: customer.name,
      date: dateStr,
      time: timeStr,
      amount: parsedAmount,
      paymentMethod: method,
      notes: notes.trim(),
      createdAt: now.toISOString(),
    }

    customerPaymentStore.saveCustomerPayment(paymentRecord)

    if (storageAdapter.isSupabase()) {
      try {
        await syncCustomerPaymentToSupabase(paymentRecord)
      } catch (err) {
        console.error('Failed to sync customer payment to Supabase:', err)
      }
    }

    setSubmitting(false)
    onSuccess()
  }

  return (
    <div className="shade">
      <form className="dialog custom-dialog" onSubmit={handleSubmit} style={{ maxWidth: '440px' }}>
        <header>
          <div>
            <small>CUSTOMER PAYMENT</small>
            <h2>Receive Payment</h2>
          </div>
          <button type="button" onClick={onClose} disabled={submitting}>
            ×
          </button>
        </header>

        <div className="editor-body">
          <div className="customer-pay-banner">
            <div>
              <span className="pay-banner-label">CUSTOMER</span>
              <strong className="pay-banner-name">{customer.name}</strong>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="pay-banner-label">CURRENT OUTSTANDING</span>
              <strong className="pay-banner-amount">{formatMoney(outstanding)}</strong>
            </div>
          </div>

          <label style={{ marginTop: '16px' }}>
            PAYMENT AMOUNT (RS.) *
            <input
              autoFocus
              type="number"
              step="any"
              min="1"
              max={outstanding}
              value={amount}
              onFocus={e => e.target.select()}
              onChange={e => {
                setAmount(e.target.value)
                setError('')
              }}
              required
              style={{ fontSize: '18px', fontWeight: 800, padding: '10px 12px' }}
            />
            <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
              Supports partial payments or full settlement. Max: {formatMoney(outstanding)}
            </span>
          </label>

          <label style={{ marginTop: '14px' }}>
            PAYMENT METHOD
            <div className="method-button-group" style={{ marginTop: '6px' }}>
              <button
                type="button"
                className={`method-btn ${method === 'Cash' ? 'active' : ''}`}
                onClick={() => setMethod('Cash')}
              >
                <span>💵 Cash</span>
              </button>
              <button
                type="button"
                className={`method-btn ${method === 'Card' ? 'active' : ''}`}
                onClick={() => setMethod('Card')}
              >
                <span>💳 Card</span>
              </button>
              <button
                type="button"
                className={`method-btn ${method === 'Other' ? 'active' : ''}`}
                onClick={() => setMethod('Other')}
              >
                <span>📝 Other</span>
              </button>
            </div>
          </label>

          <label style={{ marginTop: '14px' }}>
            NOTES / REFERENCE (OPTIONAL)
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Bank slip, check number, or remarks"
            />
          </label>

          {error && <p className="validation" style={{ marginTop: '12px' }}>{error}</p>}
        </div>

        <footer>
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="confirm btn-customer-pay-confirm" disabled={submitting}>
            {submitting ? 'Recording...' : `Confirm Payment · ${formatMoney(parseFloat(amount) || 0)}`}
          </button>
        </footer>
      </form>
    </div>
  )
}

/**
 * Customer Details Modal with Payment and Credit Sales History
 */
function CustomerDetailsModal({
  customer,
  onClose,
  onPay,
}: {
  customer: Customer
  onClose: () => void
  onPay: () => void
}) {
  const [activeTab, setActiveTab] = useState<'payments' | 'sales'>('payments')
  const outstanding = getCustomerOutstanding(customer.id)
  const creditSales = getCustomerCreditSales(customer.id)
  const totalPaid = getCustomerPaymentsTotal(customer.id)
  const status = getCustomerStatus(customer.id)
  const payments = customerPaymentStore.getPaymentsByCustomerId(customer.id)
  const creditSalesList = getCustomerCreditSalesList(customer.id)

  return (
    <div className="shade">
      <div className="dialog customer-dialog-large" style={{ maxWidth: '780px', width: '95%' }}>
        <header>
          <div>
            <small>CUSTOMER PROFILE & LEDGER</small>
            <h2>{customer.name}</h2>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              {customer.phone || 'No phone'} · {customer.address || 'No address registered'}
            </p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="editor-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Summary Metric Cards */}
          <div className="customer-summary-grid">
            <div className="customer-metric-card">
              <small>CREDIT SALES</small>
              <b style={{ color: '#ffffff' }}>{formatMoney(creditSales)}</b>
            </div>
            <div className="customer-metric-card">
              <small>PAYMENTS RECEIVED</small>
              <b style={{ color: '#10b981' }}>{formatMoney(totalPaid)}</b>
            </div>
            <div className="customer-metric-card highlight">
              <small>OUTSTANDING</small>
              <b style={{ color: outstanding > 0 ? '#f3b625' : '#10b981' }}>
                {formatMoney(outstanding)}
              </b>
            </div>
            <div className="customer-metric-card">
              <small>ACCOUNT STATUS</small>
              <div style={{ marginTop: '4px' }}>
                {status === 'DUE' && <span className="status-badge-due">DUE</span>}
                {status === 'PARTIALLY PAID' && <span className="status-badge-partial">PARTIALLY PAID</span>}
                {status === 'PAID' && <span className="status-badge-paid">PAID</span>}
                {status === 'NO DUES' && <span className="status-badge-nodues">NO DUES</span>}
              </div>
            </div>
          </div>

          {outstanding > 0 && (
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="primary btn-customer-pay"
                style={{ padding: '8px 24px', fontSize: '14px', fontWeight: 800 }}
                onClick={() => {
                  onClose()
                  onPay()
                }}
              >
                💵 Record Payment ({formatMoney(outstanding)})
              </button>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="customer-ledger-tabs" style={{ marginTop: '20px' }}>
            <button
              type="button"
              className={`ledger-tab ${activeTab === 'payments' ? 'active' : ''}`}
              onClick={() => setActiveTab('payments')}
            >
              💳 Payment History ({payments.length})
            </button>
            <button
              type="button"
              className={`ledger-tab ${activeTab === 'sales' ? 'active' : ''}`}
              onClick={() => setActiveTab('sales')}
            >
              📋 Credit Sales History ({creditSalesList.length})
            </button>
          </div>

          {/* TAB 1: PAYMENT HISTORY */}
          {activeTab === 'payments' && (
            <div style={{ marginTop: '12px' }}>
              {payments.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                  No payment records yet for this customer.
                </div>
              ) : (
                <div className="ledger-table-wrap">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Payment #</th>
                        <th>Method</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id}>
                          <td>
                            {p.date} <span style={{ color: '#94a3b8', fontSize: '11px' }}>{p.time}</span>
                          </td>
                          <td>
                            <strong style={{ color: '#f3b625' }}>{p.paymentNumber}</strong>
                          </td>
                          <td>
                            <span className="payment-method-tag">{p.paymentMethod}</span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                            {formatMoney(p.amount)}
                          </td>
                          <td>{p.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CREDIT SALES HISTORY */}
          {activeTab === 'sales' && (
            <div style={{ marginTop: '12px' }}>
              {creditSalesList.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                  No credit sales recorded for this customer.
                </div>
              ) : (
                <div className="ledger-table-wrap">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Invoice #</th>
                        <th>Items</th>
                        <th>Cashier</th>
                        <th style={{ textAlign: 'right' }}>Total (Credit)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creditSalesList.map(s => (
                        <tr key={s.id}>
                          <td>
                            {s.date} <span style={{ color: '#94a3b8', fontSize: '11px' }}>{s.time}</span>
                          </td>
                          <td>
                            <strong style={{ color: '#38bdf8' }}>{s.invoiceNumber}</strong>
                          </td>
                          <td>
                            {s.items.map(i => `${i.productName} × ${i.quantity}`).join(', ')}
                          </td>
                          <td>{s.cashier}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#f3b625' }}>
                            {formatMoney(s.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <footer>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
