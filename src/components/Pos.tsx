import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Page } from '../App'
import type { UserProfile } from '../services/authService'
import { ConnectionIndicator, InstallAppButton } from './PwaManager'
import { customerStore, getCustomerOutstanding, type Customer } from '../data/customers'
import { CustomerPaymentModal } from './Customers'
import { formatMoney } from '../data/chicken'

const IconBase = ({ children }: { children: React.ReactNode }) => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
  >
    {children}
  </svg>
)

const DashboardIcon = () => (
  <IconBase>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </IconBase>
)

const PosIcon = () => (
  <IconBase>
    <circle cx="8" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
  </IconBase>
)

const SalesIcon = () => (
  <IconBase>
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
    <path d="M14 8H8" />
    <path d="M16 12H8" />
    <path d="M13 16H8" />
  </IconBase>
)

const InventoryIcon = () => (
  <IconBase>
    <path d="m7.5 4.27 9 5.15" />
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </IconBase>
)

const ProductsIcon = () => (
  <IconBase>
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </IconBase>
)

const PurchasesIcon = () => (
  <IconBase>
    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
    <path d="M15 18H9" />
    <path d="M19 18h2a1 1 0 0 0 1-1v-5l-3-4h-5v10Z" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </IconBase>
)

const SuppliersIcon = () => (
  <IconBase>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </IconBase>
)

const CustomersIcon = () => (
  <IconBase>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </IconBase>
)

const ChickenPriceIcon = () => (
  <IconBase>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
    <path d="M7 12h2" />
    <path d="M15 12h2" />
  </IconBase>
)

const ExpensesIcon = () => (
  <IconBase>
    <rect width="20" height="14" x="2" y="5" rx="2" />
    <line x1="2" x2="22" y1="10" y2="10" />
  </IconBase>
)

const ReportsIcon = () => (
  <IconBase>
    <line x1="18" x2="18" y1="20" y2="10" />
    <line x1="12" x2="12" y1="20" y2="4" />
    <line x1="6" x2="6" y1="20" y2="14" />
  </IconBase>
)

const UsersIcon = () => (
  <IconBase>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </IconBase>
)

const SettingsIcon = () => (
  <IconBase>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </IconBase>
)

function CreditCardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

export function Navigation({ active, onNavigate, profile, onLogout, isAdmin }: { active: Page; onNavigate: (page: Page) => void; profile: UserProfile | null; onLogout: () => Promise<void>; isAdmin: boolean }) {
  const pages: [Page, React.ReactNode][] = isAdmin
    ? [
        ['Dashboard', <DashboardIcon key="dash" />],
        ['POS', <PosIcon key="pos" />],
        ['Sales', <SalesIcon key="sales" />],
        ['Inventory', <InventoryIcon key="inv" />],
        ['Products', <ProductsIcon key="prod" />],
        ['Purchases', <PurchasesIcon key="purch" />],
        ['Suppliers', <SuppliersIcon key="supp" />],
        ['Customers', <CustomersIcon key="cust" />],
        ['Daily Chicken Prices', <ChickenPriceIcon key="chick" />],
        ['Expenses', <ExpensesIcon key="exp" />],
        ['Reports', <ReportsIcon key="rep" />],
        ['Users', <UsersIcon key="users" />],
        ['Settings', <SettingsIcon key="sett" />],
      ]
    : [
        ['Dashboard', <DashboardIcon key="dash" />],
        ['POS', <PosIcon key="pos" />],
        ['Sales', <SalesIcon key="sales" />],
        ['Customers', <CustomersIcon key="cust" />],
        ['Reports', <ReportsIcon key="rep" />],
      ]

  const [customers, setCustomers] = useState<Customer[]>(() => customerStore.getCustomers())
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null)
  const [isDuesExpanded, setIsDuesExpanded] = useState(false) // Default collapsed to save vertical space
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem('sidebar_collapsed', String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  // Keyboard shortcut Ctrl+B or Alt+S to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key.toLowerCase() === 'b') || (e.altKey && e.key.toLowerCase() === 's')) {
        e.preventDefault()
        toggleCollapsed()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <div
          className="brand-left"
          onClick={() => onNavigate('Dashboard')}
          title="Go to Dashboard"
        >
          <img
            src="/logo2.jpeg"
            alt="Logo"
            className="brand-logo-img"
          />
          {!collapsed && (
            <div className="brand-text">
              <strong className="brand-name">Chicken Kade</strong>
              <span className="brand-pos-badge">POS SYSTEM</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand Sidebar (Ctrl+B)" : "Collapse Sidebar (Ctrl+B)"}
          aria-label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: collapsed ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <div style={{ padding: collapsed ? '0 4px 10px' : '0 10px 12px' }}>
        <ConnectionIndicator />
      </div>

      <nav>
        {pages.map(([page, icon]) => (
          <button
            className={active === page ? 'nav active' : 'nav'}
            onClick={() => onNavigate(page)}
            key={page}
            title={`${page}${active === page ? ' (Active)' : ''}`}
            data-tooltip={page}
          >
            <i>{icon}</i>
            {!collapsed && <span>{page}</span>}
          </button>
        ))}
      </nav>

      {/* CUSTOMER DUES SECTION */}
      {collapsed ? (
        <div
          className="sidebar-dues-collapsed-btn"
          onClick={() => onNavigate('Customers')}
          title={`Customer Dues: ${dueCustomers.length} pending (${formatMoney(totalDues)}) - Click to manage`}
          data-tooltip={`Dues: ${formatMoney(totalDues)}`}
        >
          <CreditCardIcon />
          {dueCustomers.length > 0 && (
            <span className="sidebar-dues-badge-mini">{dueCustomers.length}</span>
          )}
        </div>
      ) : (
        <div className="sidebar-dues-section">
          <div
            className="sidebar-dues-header"
            onClick={() => setIsDuesExpanded(prev => !prev)}
            title={isDuesExpanded ? 'Collapse Customer Dues' : 'Expand Customer Dues'}
          >
            <div className="sidebar-dues-title">
              <CreditCardIcon />
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
                </div>
              ) : (
                <div className="sidebar-dues-list">
                  {dueCustomers.slice(0, 5).map(({ customer, outstanding }) => (
                    <div
                      key={customer.id}
                      className="sidebar-due-card"
                      onClick={() => setPayingCustomer(customer)}
                      title={`Click to receive payment for ${customer.name} (Due: ${formatMoney(outstanding)})`}
                    >
                      <div className="sidebar-due-info">
                        <strong className="sidebar-due-name">{customer.name}</strong>
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
                    View All Customers ({dueCustomers.length}) →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!collapsed && (
        <div style={{ padding: '8px 10px 0' }}>
          <InstallAppButton />
        </div>
      )}

      {collapsed ? (
        <footer className="sidebar-footer-collapsed">
          <div
            className="sidebar-user-avatar"
            title={`${profile?.full_name || 'Cashier'} (${profile?.role?.toUpperCase() || 'USER'})`}
            data-tooltip={`${profile?.full_name || 'User'} (${profile?.role?.toUpperCase() || 'USER'})`}
          >
            {(profile?.full_name || 'U').charAt(0).toUpperCase()}
            <span className="sidebar-status-dot" />
          </div>
          <button
            type="button"
            className="sidebar-logout-icon-btn"
            onClick={() => void onLogout()}
            title="Sign Out"
            data-tooltip="Sign Out"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </footer>
      ) : (
        <footer className="sidebar-footer-expanded">
          <div className="sidebar-user-card">
            <div className="sidebar-user-avatar">
              {(profile?.full_name || 'U').charAt(0).toUpperCase()}
              <span className="sidebar-status-dot" />
            </div>
            <div className="sidebar-user-info">
              <strong className="sidebar-user-name">{profile?.full_name || 'Cashier'}</strong>
              <span className="sidebar-user-role">{profile?.role?.toUpperCase() || 'USER'}</span>
            </div>
            <button
              type="button"
              className="sidebar-logout-btn"
              onClick={() => void onLogout()}
              title="Sign Out"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </footer>
      )}

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
