import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatMoney } from '../data/chicken'
import { getExpenseReport } from '../services/reports/expenseReportService'
import { getPurchaseReport } from '../services/reports/purchaseReportService'
import { getSalesReport } from '../services/reports/salesReportService'
import { getProfitLossReport } from '../services/reports/profitLossReportService'
import { getReportRange, reportFilters, type ReportDateRange } from '../services/reports/reportDateUtils'
import { downloadExpensePdf, downloadPurchasePdf, downloadProfitLossPdf, downloadSalesPdf } from '../services/reports/reportPdfService'
import { storageAdapter } from '../services/storageAdapter'
import { fetchSalesFromSupabase } from '../services/supabase/salesService'

type ReportName = 'Expense Report' | 'Purchase Report' | 'Sales Report' | 'Profit & Loss Report'
const ReportCard = ({ label, value }: { label: string; value: string }) => <div className="report-summary-card"><small>{label}</small><b>{value}</b></div>
export function Reports({ isAdmin }: { isAdmin: boolean }) {
  const available: ReportName[] = isAdmin ? ['Expense Report', 'Purchase Report', 'Sales Report', 'Profit & Loss Report'] : ['Sales Report']
  const [active, setActive] = useState<ReportName>(available[0])
  const [filter, setFilter] = useState('Today')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [generated, setGenerated] = useState<ReportDateRange>(() => getReportRange('Today'))
  const [refreshKey, setRefreshKey] = useState(0)

  const syncSales = useCallback(async () => {
    if (storageAdapter.isSupabase()) {
      try {
        const cloudSales = await fetchSalesFromSupabase()
        if (cloudSales && cloudSales.length > 0) {
          const rawLocal = localStorage.getItem('sales-transactions')
          let localSales: any[] = []
          try { localSales = rawLocal ? JSON.parse(rawLocal) : [] } catch { localSales = [] }
          const salesMap = new Map<string, any>()
          cloudSales.forEach(s => salesMap.set(s.id, s))
          localSales.forEach(s => {
            if (s && s.id && !salesMap.has(s.id)) salesMap.set(s.id, s)
          })
          const merged = Array.from(salesMap.values()).sort((a, b) => {
            const dateA = new Date(`${a.date} ${a.time || '00:00:00'}`).getTime()
            const dateB = new Date(`${b.date} ${b.time || '00:00:00'}`).getTime()
            return dateB - dateA
          })
          localStorage.setItem('sales-transactions', JSON.stringify(merged))
          setRefreshKey(k => k + 1)
        }
      } catch (err) {
        console.error(err)
      }
    }
  }, [])

  useEffect(() => {
    syncSales()
  }, [syncSales])

  useEffect(() => {
    const onSalesChange = () => setRefreshKey(k => k + 1)
    window.addEventListener('sales_updated', onSalesChange)
    window.addEventListener('storage', onSalesChange)
    return () => {
      window.removeEventListener('sales_updated', onSalesChange)
      window.removeEventListener('storage', onSalesChange)
    }
  }, [])

  const range = useMemo(() => generated, [generated, refreshKey])
  
  const generate = async () => {
    await syncSales()
    setGenerated(getReportRange(filter, start, end))
    setRefreshKey(k => k + 1)
  }

  const print = () => window.print()
  return (
    <section className="prices-page reports-page">
      <header className="page-header">
        <div>
          <small>BUSINESS REPORTS</small>
          <h1>Reports</h1>
          <p>Professional reports for completed business records.</p>
        </div>
        <div className="report-tabs">
          {available.map(item => (
            <button className={active === item ? 'chosen' : ''} onClick={() => setActive(item)} key={item}>
              {item}
            </button>
          ))}
        </div>
      </header>
      <div className="report-filters">
        <select value={filter} onChange={event => setFilter(event.target.value)}>
          {reportFilters.map(item => (
            <option key={item}>{item}</option>
          ))}
        </select>
        {filter === 'Custom Date Range' && (
          <>
            <input type="date" value={start} onChange={event => setStart(event.target.value)} />
            <input type="date" value={end} onChange={event => setEnd(event.target.value)} />
          </>
        )}
        <button className="primary" onClick={generate}>Generate Report</button>
        <button className="edit" onClick={print}>Print</button>
      </div>
      <div className="report-print-area">
        <div className="report-period">
          <span>From: {range.start}</span>
          <span>To: {range.end}</span>
          <span>Generated: {new Date().toLocaleString()}</span>
        </div>
        {active === 'Expense Report' && <ExpenseSection range={range} onPdf={() => downloadExpensePdf(getExpenseReport(range), range)} />}
        {active === 'Purchase Report' && <PurchaseSection range={range} onPdf={() => downloadPurchasePdf(getPurchaseReport(range), range)} />}
        {active === 'Sales Report' && <SalesSection range={range} onPdf={() => downloadSalesPdf(getSalesReport(range), range)} />}
        {active === 'Profit & Loss Report' && <ProfitLossSection range={range} onPdf={() => downloadProfitLossPdf(getProfitLossReport(range), range)} />}
      </div>
    </section>
  )
}
function ReportHeader({ title, onPdf }: { title: string; onPdf: () => void }) { return <header className="report-document-header"><div><small>CHICKEN KADE</small><h2>{title}</h2></div><button className="edit no-print" onClick={onPdf}>Download PDF</button></header> }
function Empty() { return <p className="empty-report">No data found for the selected period.</p> }
function ExpenseSection({ range, onPdf }: { range: ReportDateRange; onPdf: () => void }) { const report = getExpenseReport(range); return <><ReportHeader title="EXPENSE REPORT" onPdf={onPdf} /><div className="report-summary-grid"><ReportCard label="TOTAL EXPENSES" value={formatMoney(report.total)} /><ReportCard label="NUMBER OF EXPENSES" value={String(report.count)} /><ReportCard label="AVERAGE EXPENSE" value={formatMoney(report.average)} /><ReportCard label="LARGEST EXPENSE" value={formatMoney(report.largest)} /></div><h3>Expense by Category</h3><ReportTable head={['Category', 'Amount', 'Percentage']} rows={report.categories.map(item => [item.category, formatMoney(item.amount), `${item.percentage.toFixed(1)}%`])} /><h3>Expense Details</h3><ReportTable head={['Date', 'Category', 'Description', 'Payment', 'Amount']} rows={report.expenses.map(item => [item.date, item.category, item.description, item.paymentMethod, formatMoney(item.amount)])} empty={!report.expenses.length} footer={['', '', '', 'Total Expenses', formatMoney(report.total)]} /></> }
function PurchaseSection({ range, onPdf }: { range: ReportDateRange; onPdf: () => void }) { const report = getPurchaseReport(range); return <><ReportHeader title="PURCHASE REPORT" onPdf={onPdf} /><div className="report-summary-grid"><ReportCard label="TOTAL PURCHASES" value={formatMoney(report.total)} /><ReportCard label="NUMBER OF PURCHASES" value={String(report.count)} /><ReportCard label="TOTAL PAID" value={formatMoney(report.paid)} /><ReportCard label="OUTSTANDING" value={formatMoney(report.outstanding)} /></div><ReportTable head={['Purchase No.', 'Date', 'Supplier', 'Payment', 'Total', 'Paid', 'Balance']} rows={report.purchases.map(item => [item.purchaseNumber, item.date, item.supplierName || '-', item.paymentMethod, formatMoney(item.total), formatMoney(item.amountPaid), formatMoney(item.balanceDue)])} empty={!report.purchases.length} footer={['', '', '', 'Totals', formatMoney(report.total), formatMoney(report.paid), formatMoney(report.outstanding)]} /></> }
function SalesSection({ range, onPdf }: { range: ReportDateRange; onPdf: () => void }) { const report = getSalesReport(range); return <><ReportHeader title="SALES REPORT" onPdf={onPdf} /><div className="report-summary-grid"><ReportCard label="TOTAL SALES" value={formatMoney(report.total)} /><ReportCard label="NUMBER OF BILLS" value={String(report.count)} /><ReportCard label="AVERAGE BILL" value={formatMoney(report.average)} />{report.paymentMethods.slice(0, 2).map(item => <ReportCard key={item.method} label={`${item.method.toUpperCase()} SALES`} value={formatMoney(item.amount)} />)}</div><h3>Payment Method Summary</h3><ReportTable head={['Method', 'Amount', 'Percentage']} rows={report.paymentMethods.map(item => [item.method, formatMoney(item.amount), `${item.percentage.toFixed(1)}%`])} /><div className="report-split"><ReportTable head={['Sales Type', 'Amount']} rows={[['Chicken Sales', formatMoney(report.chickenSales)], ['Grocery Sales', formatMoney(report.grocerySales)]]} /><ReportTable head={['Product', 'Quantity', 'Sales Amount']} rows={report.grocery.map(item => [item.name, String(item.quantity), formatMoney(item.amount)])} /></div><h3>Completed Sales</h3><ReportTable head={['Invoice', 'Date', 'Time', 'Customer', 'Cashier', 'Payment', 'Total']} rows={report.sales.map(item => [item.invoiceNumber, item.date, item.time, item.customerName, item.cashier, item.paymentMethod, formatMoney(item.total)])} empty={!report.sales.length} /></> }
function ProfitLossSection({ range, onPdf }: { range: ReportDateRange; onPdf: () => void }) { const report = getProfitLossReport(range); return <><ReportHeader title="PROFIT & LOSS REPORT" onPdf={onPdf} /><div className="pnl-statement"><h2>PROFIT & LOSS STATEMENT</h2><p>For: {range.start} - {range.end}</p>{[['Sales Revenue', formatMoney(report.salesRevenue)], ['Grocery Sales', formatMoney(report.groceryRevenue)], ['Chicken Sales Revenue', formatMoney(report.chickenSales)], ['Grocery COGS', formatMoney(report.groceryCogs)], ['Chicken COGS', 'Not Available'], ['Gross Profit', formatMoney(report.grossProfit)], ['Operating Expenses', formatMoney(report.operatingExpenses)], [report.net >= 0 ? 'Net Profit' : 'Net Loss', formatMoney(Math.abs(report.net))], ['Gross Margin', `${report.grossMargin.toFixed(2)}%`], ['Net Margin', `${report.netMargin.toFixed(2)}%`]].map(([label, value]) => <div className={label === 'Gross Profit' || label === 'Net Profit' || label === 'Net Loss' ? 'pnl-total' : ''} key={label}><span>{label}</span><b>{value}</b></div>)}</div></> }
function ReportTable({ head, rows, empty = false, footer }: { head: string[]; rows: string[][]; empty?: boolean; footer?: string[] }) { return <section className="report-table-wrap"><table className="report-table"><thead><tr>{head.map(item => <th key={item}>{item}</th>)}</tr></thead><tbody>{empty ? <tr><td colSpan={head.length}><Empty /></td></tr> : rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody>{footer && <tfoot><tr>{footer.map((cell, index) => <td key={`${cell}-${index}`}>{cell}</td>)}</tr></tfoot>}</table></section> }
