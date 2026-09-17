import { useCallback, useEffect, useState } from 'react'
import { formatMoney } from '../data/chicken'
import { getDashboardSnapshot, getDateRange, type DashboardSnapshot } from '../services/dashboardService'
import { storageAdapter } from '../services/storageAdapter'
import { fetchSalesFromSupabase } from '../services/supabase/salesService'
import { LiveDateTime } from './dashboard/LiveDateTime'
import { SalesChart } from './dashboard/SalesChart'

type Props = { onInventory?: () => void; isAdmin?: boolean }

const filters = ['Today', 'Yesterday', 'This Week', 'This Month', 'Last 7 Days', 'Last 30 Days']

const Card = ({ label, value, detail, onClick }: { label: string; value: string; detail?: string; onClick?: () => void }) => (
  <button className="bi-card" onClick={onClick}>
    <small>{label}</small>
    <b>{value}</b>
    {detail && <span>{detail}</span>}
  </button>
)

export function Dashboard({ onInventory, isAdmin = true }: Props) {
  const [filter, setFilter] = useState('Today')
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (storageAdapter.isSupabase()) {
        const cloudSales = await fetchSalesFromSupabase()
        if (cloudSales && cloudSales.length > 0) {
          const rawLocal = localStorage.getItem('sales-transactions')
          let localSales: any[] = []
          try {
            localSales = rawLocal ? JSON.parse(rawLocal) : []
          } catch {
            localSales = []
          }
          const salesMap = new Map<string, any>()
          cloudSales.forEach(s => salesMap.set(s.id, s))
          localSales.forEach(s => {
            if (s && s.id && !salesMap.has(s.id)) {
              salesMap.set(s.id, s)
            }
          })
          const merged = Array.from(salesMap.values()).sort((a, b) => {
            const dateA = new Date(`${a.date} ${a.time || '00:00:00'}`).getTime()
            const dateB = new Date(`${b.date} ${b.time || '00:00:00'}`).getTime()
            return dateB - dateA
          })
          localStorage.setItem('sales-transactions', JSON.stringify(merged))
        }
      }
      setSnapshot(getDashboardSnapshot(getDateRange(filter)))
    } catch {
      setError('Unable to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const handleUpdate = () => {
      setSnapshot(getDashboardSnapshot(getDateRange(filter)))
    }
    window.addEventListener('sales_updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('sales_updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [filter])

  if (loading) {
    return (
      <section className="prices-page dashboard-page">
        <div className="dashboard-loading">Loading dashboard...</div>
      </section>
    )
  }

  if (error || !snapshot) {
    return (
      <section className="prices-page dashboard-page">
        <div className="dashboard-error">
          <b>{error || 'Unable to load dashboard data.'}</b>
          <button className="primary" onClick={load}>Retry</button>
        </div>
      </section>
    )
  }

  return (
    <section className="prices-page dashboard-page">
      <header className="page-header">
        <div>
          <small>{isAdmin ? 'OWNER DASHBOARD' : 'OPERATIONS OVERVIEW'}</small>
          <h1>Dashboard</h1>
          <p>{snapshot.range.start} to {snapshot.range.end}</p>
        </div>
        <div className="dashboard-toolbar">
          <select value={filter} onChange={event => setFilter(event.target.value)}>
            {filters.map(item => <option key={item}>{item}</option>)}
          </select>
          <button className="edit" onClick={load}>Refresh</button>
        </div>
      </header>

      {/* Live Date & Time Section */}
      <LiveDateTime />

      <div className="dashboard-filter-note">
        <span>{snapshot.range.label}</span>
        <span>{snapshot.comparison}</span>
      </div>

      <div className="bi-grid">
        <Card
          label={filter === 'Today' ? "TODAY'S SALES" : 'SALES FOR SELECTED PERIOD'}
          value={formatMoney(snapshot.salesTotal)}
          detail={snapshot.comparison}
        />
        <Card
          label={filter === 'Today' ? "TODAY'S EXPENSES" : 'OPERATING EXPENSES'}
          value={formatMoney(snapshot.expenseTotal)}
        />
        <Card
          label="GROSS PROFIT"
          value={isAdmin ? formatMoney(snapshot.profit.grossProfit) : 'Restricted'}
          detail={isAdmin ? 'Grocery revenue less historical COGS' : 'Admin only'}
        />
        <Card
          label="COMPLETED BILLS"
          value={String(snapshot.bills)}
          detail={`Average ${formatMoney(snapshot.averageBill)}`}
        />
        <Card
          label="CUSTOMER RECEIVABLES"
          value={isAdmin ? formatMoney(snapshot.receivables) : 'Restricted'}
        />
        <Card
          label="SUPPLIER PAYABLES"
          value={isAdmin ? formatMoney(snapshot.payables) : 'Restricted'}
        />
        <Card
          label="INVENTORY VALUE"
          value={isAdmin ? formatMoney(snapshot.inventoryValue) : 'Restricted'}
          onClick={onInventory}
        />
        <Card
          label="LOW STOCK PRODUCTS"
          value={String(snapshot.low.length)}
          onClick={onInventory}
        />
      </div>

      {/* Modern Interactive Sales Analytics Chart */}
      <SalesChart isAdmin={isAdmin} />

      {isAdmin ? (
        <>
          <div className="dashboard-columns">
            <section className="bi-panel">
              <header>
                <h2>Payment Breakdown</h2>
                <span>Completed sales</span>
              </header>
              {snapshot.paymentMethods.map(item => (
                <div className="metric-line" key={item.method}>
                  <span>{item.method}</span>
                  <b>{formatMoney(item.amount)}</b>
                  <small>{item.percentage}</small>
                </div>
              ))}
            </section>
          </div>

          <div className="dashboard-columns">
            <section className="bi-panel">
              <header>
                <h2>Top Selling Grocery</h2>
                <span>Top 10</span>
              </header>
              {snapshot.topGrocery.length ? (
                snapshot.topGrocery.map(item => (
                  <div className="metric-line" key={item.name}>
                    <span>{item.name}</span>
                    <small>{item.quantity} sold</small>
                    <b>{formatMoney(item.amount)}</b>
                  </div>
                ))
              ) : (
                <p className="empty-report">No grocery sales in this period.</p>
              )}
            </section>

            <section className="bi-panel">
              <header>
                <h2>Chicken Sales</h2>
                <span>Profit unavailable without chicken cost</span>
              </header>
              {snapshot.chicken.length ? (
                snapshot.chicken.map(item => (
                  <div className="metric-line" key={item.name}>
                    <span>{item.name}</span>
                    <small>{(item.weight / 1000).toFixed(2)} kg</small>
                    <b>{formatMoney(item.amount)}</b>
                  </div>
                ))
              ) : (
                <p className="empty-report">No chicken sales in this period.</p>
              )}
            </section>
          </div>

          <div className="dashboard-columns">
            <section className="bi-panel">
              <header>
                <h2>Recent Sales</h2>
                <span>{snapshot.sales.length} completed</span>
              </header>
              {snapshot.recentSales.slice(0, 6).map(sale => (
                <div className="metric-line" key={sale.id}>
                  <span>
                    {sale.invoiceNumber}
                    <small>{sale.customerName} · {sale.cashier}</small>
                  </span>
                  <small>{sale.paymentMethod}</small>
                  <b>{formatMoney(sale.total)}</b>
                </div>
              ))}
            </section>

            <section className="bi-panel">
              <header>
                <h2>Expense Breakdown</h2>
                <span>{snapshot.expenses.length} records</span>
              </header>
              {snapshot.categories.length ? (
                snapshot.categories.map(item => (
                  <div className="metric-line" key={item.name}>
                    <span>{item.name}</span>
                    <b>{formatMoney(item.amount)}</b>
                  </div>
                ))
              ) : (
                <p className="empty-report">No expense records in this period.</p>
              )}
            </section>
          </div>
        </>
      ) : (
        <section className="bi-panel cashier-panel">
          <header>
            <h2>Low Stock Alerts</h2>
            <button className="edit" onClick={onInventory}>View All</button>
          </header>
          {snapshot.low.slice(0, 5).map(item => (
            <div className="metric-line" key={item.id}>
              <span>{item.name}</span>
              <small>{item.stockQuantity} remaining / minimum {item.lowStockLevel}</small>
            </div>
          ))}
          {!snapshot.low.length && <p className="empty-report">No low-stock products.</p>}
        </section>
      )}

      <div className="dashboard-footer">
        <span>Net business result: {isAdmin ? formatMoney(snapshot.profit.netResult) : 'Restricted'}</span>
        <span>Updated just now</span>
      </div>
    </section>
  )
}
