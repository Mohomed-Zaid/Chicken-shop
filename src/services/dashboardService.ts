import { expenseStore, salesStore, type Expense, type Sale } from '../data/records'
import { groceryStore } from '../data/grocery'
import { getSupplierOutstanding, supplierStore } from '../data/purchases'
import { getStockStatus, isLowStock, isOutOfStock, stockValue } from '../data/inventory'
import { formatMoney } from '../data/chicken'

export type DateRange = { start: string; end: string; label: string }
export type DashboardSnapshot = ReturnType<typeof getDashboardSnapshot>
const localDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const iso = (date: Date) => localDate(date)
const startOfToday = () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date }
export function getDateRange(filter: string, customStart?: string, customEnd?: string): DateRange {
  const today = startOfToday(); const end = iso(today); const start = new Date(today)
  if (filter === 'Yesterday') { start.setDate(start.getDate() - 1); return { start: iso(start), end: iso(start), label: 'Yesterday' } }
  if (filter === 'This Week' || filter === 'Last 7 Days') start.setDate(start.getDate() - 6)
  else if (filter === 'This Month') start.setDate(1)
  else if (filter === 'Last 30 Days') start.setDate(start.getDate() - 29)
  else if (filter === 'Custom Range' && customStart && customEnd) return { start: customStart, end: customEnd, label: 'Custom Range' }
  return { start: iso(start), end, label: filter === 'Today' ? 'Today' : filter }
}
const inRange = (date: string, range: DateRange) => date >= range.start && date <= range.end
const completed = () => salesStore.getSales().filter(sale => sale.status === 'completed')
const rangeSales = (range: DateRange) => completed().filter(sale => inRange(sale.date, range))
const rangeExpenses = (range: DateRange) => expenseStore.get().filter(expense => inRange(expense.date, range))
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
const percent = (part: number, total: number) => total ? `${Math.round((part / total) * 100)}%` : '0%'
const previousRange = (range: DateRange): DateRange => { const days = Math.max(1, Math.round((new Date(`${range.end}T00:00:00`).getTime() - new Date(`${range.start}T00:00:00`).getTime()) / 86400000) + 1); const end = new Date(`${range.start}T00:00:00`); end.setDate(end.getDate() - 1); const start = new Date(end); start.setDate(start.getDate() - days + 1); return { start: iso(start), end: iso(end), label: 'Previous period' } }

export function getProfitSummary(sales: Sale[], expenses: Expense[] = []) {
  const groceryRevenue = sum(sales.flatMap(sale => sale.items.filter(item => item.productType === 'grocery').map(item => item.total)))
  const groceryCost = sum(sales.flatMap(sale => sale.items.filter(item => item.productType === 'grocery').map(item => item.quantity * (item.costPrice || 0))))
  const chickenSales = sum(sales.flatMap(sale => sale.items.filter(item => item.productType === 'chicken').map(item => item.total)))
  const expenseTotal = sum(expenses.map(expense => expense.amount))
  return { groceryRevenue, groceryCost, groceryProfit: groceryRevenue - groceryCost, chickenSales, grossProfit: groceryRevenue - groceryCost, netResult: groceryRevenue - groceryCost - expenseTotal }
}
export function getDashboardSnapshot(range: DateRange = getDateRange('Today')) {
  const sales = rangeSales(range); const expenses = rangeExpenses(range); const products = groceryStore.load(); const activeProducts = products.filter(product => product.active); const salesTotal = sum(sales.map(sale => sale.total)); const expenseTotal = sum(expenses.map(expense => expense.amount)); const profit = getProfitSummary(sales, expenses); const paymentMethods = ['Cash', 'Card', 'Credit', 'Other'].map(method => { const amount = sum(sales.filter(sale => sale.paymentMethod === method).map(sale => sale.total)); return { method, amount, percentage: percent(amount, salesTotal) } })
  const categories = new Map<string, number>(); sales.forEach(sale => sale.items.filter(item => item.productType === 'grocery').forEach(item => { const product = products.find(entry => entry.id === item.productId); categories.set(product?.category || 'Other', (categories.get(product?.category || 'Other') || 0) + item.total) }))
  const expenseCategories = new Map<string, number>(); expenses.forEach(expense => expenseCategories.set(expense.category, (expenseCategories.get(expense.category) || 0) + expense.amount))
  const customerRaw = (() => { try { return JSON.parse(localStorage.getItem('customers') || '[]') as { opening_balance?: number; openingBalance?: number }[] } catch { return [] } })()
  const customerPayments = (() => { try { return JSON.parse(localStorage.getItem('customer-payments') || '[]') as { amount?: number }[] } catch { return [] } })()
  const creditSales = sum(completed().filter(sale => sale.paymentMethod === 'Credit').map(sale => sale.total))
  const topGrocery = new Map<string, { name: string; quantity: number; amount: number }>(); sales.forEach(sale => sale.items.filter(item => item.productType === 'grocery').forEach(item => { const current = topGrocery.get(item.productId) || { name: item.productName, quantity: 0, amount: 0 }; current.quantity += item.quantity; current.amount += item.total; topGrocery.set(item.productId, current) }))
  const chicken = new Map<string, { name: string; weight: number; amount: number }>(); sales.forEach(sale => sale.items.filter(item => item.productType === 'chicken').forEach(item => { const current = chicken.get(item.productId) || { name: item.productName, weight: 0, amount: 0 }; current.weight += item.weightGrams || 0; current.amount += item.total; chicken.set(item.productId, current) }))
  const trend = Array.from({ length: 7 }, (_, index) => { const day = new Date(); day.setDate(day.getDate() - (6 - index)); const date = iso(day); return { date, label: day.toLocaleDateString(undefined, { weekday: 'short' }), sales: sum(completed().filter(sale => sale.date === date).map(sale => sale.total)), expenses: sum(expenseStore.get().filter(expense => expense.date === date).map(expense => expense.amount)) } })
  const previous = rangeSales(previousRange(range)); const previousTotal = sum(previous.map(sale => sale.total)); const low = activeProducts.filter(isLowStock); const out = activeProducts.filter(isOutOfStock)
  return { range, sales, expenses, salesTotal, expenseTotal, bills: sales.length, averageBill: sales.length ? salesTotal / sales.length : 0, profit, inventoryValue: sum(activeProducts.map(stockValue)), low, out, paymentMethods, categories: Array.from(categories, ([name, amount]) => ({ name, amount })), expenseCategories: Array.from(expenseCategories, ([name, amount]) => ({ name, amount })), topGrocery: Array.from(topGrocery.values()).sort((a, b) => b.amount - a.amount).slice(0, 10), chicken: Array.from(chicken.values()).sort((a, b) => b.amount - a.amount), trend, receivables: sum(customerRaw.map(customer => customer.opening_balance ?? customer.openingBalance ?? 0)) + creditSales - sum(customerPayments.map(payment => payment.amount || 0)), payables: sum(supplierStore.getSuppliers().map(supplier => getSupplierOutstanding(supplier.id))), previousSales: previousTotal, comparison: previousTotal ? `${(((salesTotal - previousTotal) / previousTotal) * 100).toFixed(1)}% vs previous period` : 'No previous-period data', recentSales: sales.slice(0, 10), recentExpenses: expenses.slice(0, 8), recentMovements: [] as { productName: string; type: string; quantity: number; date: string; createdBy: string }[], statuses: activeProducts.map(product => ({ ...product, status: getStockStatus(product), value: stockValue(product) })) }
}
export const money = formatMoney
export type DashboardExpense = Expense
