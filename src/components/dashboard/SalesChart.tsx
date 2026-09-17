import { useState, useMemo, useEffect } from 'react'
import { formatMoney } from '../../data/chicken'
import { salesStore, expenseStore, toLocalDateString } from '../../data/records'

type Timeframe = 'today' | '7days' | '14days' | '30days'

interface ChartPoint {
  id: string
  label: string
  subLabel: string
  sales: number
  chickenSales: number
  grocerySales: number
  expenses: number
  bills: number
  isCurrent: boolean
}

interface Props {
  isAdmin?: boolean
}

const parseSaleHour = (timeStr: string): number => {
  if (!timeStr) return 0
  const match = timeStr.match(/(\d+):(\d+)(?::(\d+))?\s*(AM|PM)?/i)
  if (match) {
    let h = parseInt(match[1], 10)
    const isPM = match[4] && match[4].toUpperCase() === 'PM'
    const isAM = match[4] && match[4].toUpperCase() === 'AM'
    if (isPM && h < 12) h += 12
    if (isAM && h === 12) h = 0
    return Math.min(Math.max(h, 0), 23)
  }
  return 0
}

export function SalesChart({ isAdmin = true }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>('7days')
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [dataVersion, setDataVersion] = useState(0)

  // Listen to live sales updates from POS
  useEffect(() => {
    const handleUpdate = () => setDataVersion(v => v + 1)
    window.addEventListener('sales_updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('sales_updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  const { points, totalSales, peakSales, peakLabel, avgSales, totalBills } = useMemo(() => {
    // Reference dataVersion to recompute on live sales updates
    void dataVersion

    const allSales = salesStore.getSales().filter(s => s.status === 'completed')
    const allExpenses = expenseStore.get()
    const now = new Date()
    const todayStr = toLocalDateString(now)
    const currentHour = now.getHours()

    const pointsList: ChartPoint[] = []

    if (timeframe === 'today') {
      // 24-hour breakdown for Today (from 06:00 to 22:00 or full range)
      const startHour = 6
      const endHour = 22
      const todaySales = allSales.filter(s => s.date === todayStr)
      const todayExpenses = allExpenses.filter(e => e.date === todayStr)

      for (let h = startHour; h <= endHour; h++) {
        const hourSales = todaySales.filter(s => parseSaleHour(s.time) === h)
        const hourSalesTotal = hourSales.reduce((sum, s) => sum + s.total, 0)
        const chickenTotal = hourSales
          .flatMap(s => s.items)
          .filter(i => i.productType === 'chicken')
          .reduce((sum, i) => sum + i.total, 0)
        const groceryTotal = hourSales
          .flatMap(s => s.items)
          .filter(i => i.productType === 'grocery')
          .reduce((sum, i) => sum + i.total, 0)

        const display12 = h % 12 || 12
        const ampm = h >= 12 ? 'PM' : 'AM'
        const label = `${display12} ${ampm}`

        pointsList.push({
          id: `hour-${h}`,
          label,
          subLabel: `${String(h).padStart(2, '0')}:00 - ${String(h).padStart(2, '0')}:59`,
          sales: hourSalesTotal,
          chickenSales: chickenTotal,
          grocerySales: groceryTotal,
          expenses: h === 12 ? todayExpenses.reduce((sum, e) => sum + e.amount, 0) : 0,
          bills: hourSales.length,
          isCurrent: h === currentHour,
        })
      }
    } else {
      // Daily breakdown: 7, 14, or 30 days
      const daysCount = timeframe === '7days' ? 7 : timeframe === '14days' ? 14 : 30

      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = toLocalDateString(d)
        const isToday = dateStr === todayStr

        const daySales = allSales.filter(s => s.date === dateStr)
        const dayExpenses = allExpenses.filter(e => e.date === dateStr)

        const salesTotal = daySales.reduce((sum, s) => sum + s.total, 0)
        const chickenTotal = daySales
          .flatMap(s => s.items)
          .filter(it => it.productType === 'chicken')
          .reduce((sum, it) => sum + it.total, 0)
        const groceryTotal = daySales
          .flatMap(s => s.items)
          .filter(it => it.productType === 'grocery')
          .reduce((sum, it) => sum + it.total, 0)
        const expensesTotal = dayExpenses.reduce((sum, e) => sum + e.amount, 0)

        const weekday = d.toLocaleDateString(undefined, { weekday: daysCount <= 14 ? 'short' : 'narrow' })
        const monthDay = `${d.getDate()}/${d.getMonth() + 1}`

        pointsList.push({
          id: `day-${dateStr}`,
          label: daysCount <= 7 ? weekday : `${weekday} ${monthDay}`,
          subLabel: dateStr,
          sales: salesTotal,
          chickenSales: chickenTotal,
          grocerySales: groceryTotal,
          expenses: expensesTotal,
          bills: daySales.length,
          isCurrent: isToday,
        })
      }
    }

    const totalRev = pointsList.reduce((sum, p) => sum + p.sales, 0)
    let peak = 0
    let peakLbl = 'N/A'
    for (const p of pointsList) {
      if (p.sales > peak) {
        peak = p.sales
        peakLbl = p.label
      }
    }

    const activePeriods = pointsList.filter(p => p.sales > 0).length || 1
    const avg = totalRev / (timeframe === 'today' ? activePeriods : pointsList.length)
    const billsTotal = pointsList.reduce((sum, p) => sum + p.bills, 0)

    return {
      points: pointsList,
      totalSales: totalRev,
      peakSales: peak,
      peakLabel: peakLbl,
      avgSales: avg,
      totalBills: billsTotal,
    }
  }, [timeframe, dataVersion])

  // Chart dimensions & scaling
  const chartHeight = 190
  const maxVal = Math.max(...points.map(p => Math.max(p.sales, isAdmin ? p.expenses : 0)), 100)
  // Round up max for nice axis ticks
  const niceMax = Math.ceil(maxVal / 100) * 100

  return (
    <section className="bi-panel dashboard-chart-card">
      <header className="chart-card-header">
        <div className="chart-title-area">
          <div className="chart-icon-badge">📊</div>
          <div>
            <h2>Sales Analytics & Trend</h2>
            <span>Real-time revenue performance</span>
          </div>
        </div>

        <div className="chart-timeframe-buttons">
          <button
            type="button"
            className={`chart-btn ${timeframe === 'today' ? 'active' : ''}`}
            onClick={() => setTimeframe('today')}
          >
            Today (Hourly)
          </button>
          <button
            type="button"
            className={`chart-btn ${timeframe === '7days' ? 'active' : ''}`}
            onClick={() => setTimeframe('7days')}
          >
            7 Days
          </button>
          <button
            type="button"
            className={`chart-btn ${timeframe === '14days' ? 'active' : ''}`}
            onClick={() => setTimeframe('14days')}
          >
            14 Days
          </button>
          <button
            type="button"
            className={`chart-btn ${timeframe === '30days' ? 'active' : ''}`}
            onClick={() => setTimeframe('30days')}
          >
            30 Days
          </button>
        </div>
      </header>

      {/* KPI Stats Strip */}
      <div className="chart-kpi-strip">
        <div className="chart-kpi-item">
          <small>TOTAL REVENUE</small>
          <strong>{formatMoney(totalSales)}</strong>
        </div>
        <div className="chart-kpi-item">
          <small>PEAK {timeframe === 'today' ? 'HOUR' : 'DAY'}</small>
          <strong>{peakSales > 0 ? formatMoney(peakSales) : 'Rs. 0.00'}</strong>
          {peakSales > 0 && <span>({peakLabel})</span>}
        </div>
        <div className="chart-kpi-item">
          <small>{timeframe === 'today' ? 'HOURLY AVG' : 'DAILY AVG'}</small>
          <strong>{formatMoney(avgSales)}</strong>
        </div>
        <div className="chart-kpi-item">
          <small>COMPLETED BILLS</small>
          <strong>{totalBills} bills</strong>
        </div>
      </div>

      {/* Interactive Bar Chart */}
      <div className="chart-svg-container" onMouseLeave={() => setHoveredIdx(null)}>
        {/* Y-axis Guides */}
        <div className="chart-y-axis">
          <span>{formatMoney(niceMax)}</span>
          <span>{formatMoney(niceMax * 0.5)}</span>
          <span>Rs. 0</span>
        </div>

        {/* Bars area */}
        <div className="chart-bars-wrap">
          <div className="chart-grid-line top" />
          <div className="chart-grid-line middle" />
          <div className="chart-grid-line bottom" />

          <div className="chart-bars-flow">
            {points.map((pt, idx) => {
              const salesHeight = Math.max((pt.sales / niceMax) * chartHeight, pt.sales > 0 ? 6 : 0)
              const expensesHeight = isAdmin ? Math.max((pt.expenses / niceMax) * chartHeight, pt.expenses > 0 ? 6 : 0) : 0
              const isHovered = hoveredIdx === idx

              return (
                <div
                  key={pt.id}
                  className={`chart-col ${pt.isCurrent ? 'current-col' : ''} ${isHovered ? 'hovered' : ''}`}
                  onMouseEnter={() => setHoveredIdx(idx)}
                >
                  {/* Tooltip on hover */}
                  {isHovered && (
                    <div className="chart-tooltip-bubble">
                      <div className="tooltip-head">
                        <b>{pt.subLabel || pt.label}</b>
                        {pt.isCurrent && <span className="tooltip-badge">CURRENT</span>}
                      </div>
                      <div className="tooltip-row sales-row">
                        <span>Total Sales:</span>
                        <strong>{formatMoney(pt.sales)}</strong>
                      </div>
                      {pt.sales > 0 && (
                        <>
                          <div className="tooltip-subrow">
                            <span>🍗 Chicken:</span>
                            <b>{formatMoney(pt.chickenSales)}</b>
                          </div>
                          <div className="tooltip-subrow">
                            <span>🛒 Grocery:</span>
                            <b>{formatMoney(pt.grocerySales)}</b>
                          </div>
                          <div className="tooltip-subrow">
                            <span>🧾 Bills:</span>
                            <b>{pt.bills} completed</b>
                          </div>
                        </>
                      )}
                      {isAdmin && pt.expenses > 0 && (
                        <div className="tooltip-row expense-row">
                          <span>Expenses:</span>
                          <strong>{formatMoney(pt.expenses)}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="chart-bar-pair" style={{ height: `${chartHeight}px` }}>
                    {/* Sales bar */}
                    <div
                      className="bar bar-sales"
                      style={{ height: `${salesHeight}px` }}
                      title={`Sales: ${formatMoney(pt.sales)}`}
                    >
                      {pt.sales > 0 && points.length <= 14 && (
                        <span className="bar-val-badge">{pt.sales >= 1000 ? `${(pt.sales / 1000).toFixed(0)}k` : pt.sales}</span>
                      )}
                    </div>

                    {/* Expenses bar (if admin) */}
                    {isAdmin && pt.expenses > 0 && (
                      <div
                        className="bar bar-expenses"
                        style={{ height: `${expensesHeight}px` }}
                        title={`Expenses: ${formatMoney(pt.expenses)}`}
                      />
                    )}
                  </div>

                  <span className={`chart-col-label ${pt.isCurrent ? 'current-label' : ''}`}>
                    {pt.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Chart Legend */}
      <footer className="chart-card-footer">
        <div className="chart-legend-item">
          <span className="legend-indicator legend-sales" />
          <span>Sales Revenue</span>
        </div>
        {isAdmin && (
          <div className="chart-legend-item">
            <span className="legend-indicator legend-expenses" />
            <span>Operating Expenses</span>
          </div>
        )}
        <div className="chart-legend-item">
          <span className="legend-indicator legend-today" />
          <span>Current {timeframe === 'today' ? 'Hour' : 'Day'}</span>
        </div>
      </footer>
    </section>
  )
}
