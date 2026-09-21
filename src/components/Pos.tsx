import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Page } from '../App'
import type { UserProfile } from '../services/authService'
import { ConnectionIndicator, InstallAppButton } from './PwaManager'
import { customerStore, getCustomerOutstanding, type Customer } from '../data/customers'
import { CustomerPaymentModal } from './Customers'
import { formatMoney } from '../data/chicken'

function CustomersIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function CreditCardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

export function Navigation({ active, onNavigate, profile, onLogout, isAdmin }: { active: Page; onNavigate: (page: Page) => void; profile: UserProfile | null; onLogout: () => Promise<void>; isAdmin: boolean }) {
  const pages: [Page, React.ReactNode][] = isAdmin
    ? [
        ['Dashboard', '▦'],
        ['POS', '⊞'],
        ['Sales', '🧾'],
        ['Inventory', '▥'],
        ['Products', '◫'],
        ['Purchases', '⇩'],
        ['Suppliers', '♙'],
        ['Customers', <CustomersIcon key="cust-icon" />],
        ['Daily Chicken Prices', '◉'],
        ['Expenses', '◒'],
        ['Reports', '▤'],
        ['Users', '♙'],
        ['Settings', '⚙'],
      ]
    : [
        ['Dashboard', '▦'],
        ['POS', '⊞'],
        ['Sales', '🧾'],
        ['Customers', <CustomersIcon key="cust-icon" />],
        ['Reports', '▤'],
      ]

  const [customers, setCustomers] = useState<Customer[]>(() => customerStore.getCustomers())
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null)
  const [isDuesExpanded, setIsDuesExpanded] = useState(true)

  const reloadCustomers = useCallback(() => {
    setCustomers(customerStore.getCustomers())
  }, [])

  useEffect(() => {
    window.addEventListener('customers_updated', reloadCustomers)
    window.addEventListener('sales_updated', reloadCustomers)
    window.addEventListener('storage', reloadCustomers)
    return () => {
      window.removeEventListener('customers_updated', reloadCustomers)
      window.removeEventListener('sales_updated', reloadCustomers)
      window.removeEventListener('storage', reloadCustomers)
    }
  }, [reloadCustomers])

  const dueCustomers = useMemo(() => {
    return customers
      .filter(c => c.active !== false)
      .map(c => ({
        customer: c,
        outstanding: getCustomerOutstanding(c.id),
      }))
      .filter(item => item.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
  }, [customers])

  const totalDues = useMemo(() => {
    return dueCustomers.reduce((sum, item) => sum + item.outstanding, 0)
  }, [dueCustomers])

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/logo2.jpeg" alt="Logo" style={{ height: '32px', borderRadius: '4px' }} />
        <span>Chicken Kade <small>POS</small></span>
      </div>
      <div style={{ padding: '0 12px 14px' }}>
        <ConnectionIndicator />
      </div>
      <nav>
        {pages.map(([page, icon]) => (
          <button className={active === page ? 'nav active' : 'nav'} onClick={() => onNavigate(page)} key={page}>
            <i>{icon}</i>
            <span>{page}</span>
          </button>
        ))}
      </nav>

      {/* CUSTOMER DUES SECTION */}
      <div className="sidebar-dues-section">
        <div
          className="sidebar-dues-header"
          onClick={() => setIsDuesExpanded(prev => !prev)}
          title={isDuesExpanded ? 'Collapse Customer Dues' : 'Expand Customer Dues'}
        >
          <div className="sidebar-dues-title">
            <span className="sidebar-dues-icon">
              <CreditCardIcon />
            </span>
            <span>Customer Dues</span>
            {dueCustomers.length > 0 && (
              <span className="sidebar-dues-badge">{dueCustomers.length}</span>
            )}
          </div>
          <div className="sidebar-dues-header-right">
            {dueCustomers.length > 0 && (
              <span className="sidebar-dues-total">{formatMoney(totalDues)}</span>
            )}
            <span className="sidebar-dues-toggle">{isDuesExpanded ? '▾' : '▸'}</span>
          </div>
        </div>

        {isDuesExpanded && (
          <div className="sidebar-dues-content">
            {dueCustomers.length === 0 ? (
              <div className="sidebar-dues-empty">
                <span className="sidebar-dues-empty-icon">✓</span>
                <small>No pending customer dues</small>
                <button
                  type="button"
                  className="sidebar-view-all-btn"
                  onClick={() => onNavigate('Customers')}
                >
                  Manage Customers
                </button>
              </div>
            ) : (
              <div className="sidebar-dues-list">
                {dueCustomers.map(({ customer, outstanding }) => (
                  <div
                    key={customer.id}
                    className="sidebar-due-card"
                    onClick={() => setPayingCustomer(customer)}
                    title={`Click to receive payment for ${customer.name} (Due: ${formatMoney(outstanding)})`}
                  >
                    <div className="sidebar-due-info">
                      <strong className="sidebar-due-name">{customer.name}</strong>
                      {customer.phone && <small className="sidebar-due-phone">{customer.phone}</small>}
                      <span className="sidebar-due-amount">{formatMoney(outstanding)}</span>
                    </div>
                    <button
                      type="button"
                      className="sidebar-due-pay-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPayingCustomer(customer)
                      }}
                      title={`Receive payment for ${customer.name}`}
                    >
                      PAY
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="sidebar-view-all-link"
                  onClick={() => onNavigate('Customers')}
                >
                  View All Customers →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 12px 0' }}>
        <InstallAppButton />
      </div>
      <footer>
        <em /> Signed in as<br />
        <b>{profile?.full_name}</b>
        <small>{profile?.role?.toUpperCase()}</small>
        <button className="logout" onClick={() => void onLogout()}>Sign Out</button>
      </footer>

      {/* QUICK CUSTOMER PAYMENT MODAL */}
      {payingCustomer && (
        <CustomerPaymentModal
          customer={payingCustomer}
          outstanding={getCustomerOutstanding(payingCustomer.id)}
          onClose={() => setPayingCustomer(null)}
          onSuccess={() => {
            setPayingCustomer(null)
            reloadCustomers()
          }}
        />
      )}
    </aside>
  )
}

export function PlaceholderPage({ title, description }: { title: string; description: string }) { return <section className="placeholder"><h1>{title}</h1><p>{description}</p></section> }
