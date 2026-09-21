import { salesStore } from '../../data/records'
import { inReportRange, type ReportDateRange } from './reportDateUtils'

export interface GroceryReportItem {
  name: string
  paidQuantity: number
  freeQuantity: number
  totalQuantity: number
  quantity: number // alias to paidQuantity for backward compatibility
  amount: number
}

export function getSalesReport(range: ReportDateRange) {
  const sales = salesStore
    .getSales()
    .filter(item => item.status === 'completed' && inReportRange(item.date, range))

  const total = sales.reduce((sum, item) => sum + item.total, 0)

  const paymentMethods = ['Cash', 'Card', 'Credit', 'Other'].map(method => {
    const amount = sales
      .filter(item => item.paymentMethod === method)
      .reduce((sum, item) => sum + item.total, 0)
    return { method, amount, percentage: total ? (amount / total) * 100 : 0 }
  })

  const chickenSales = sales
    .flatMap(item => item.items)
    .filter(item => item.productType === 'chicken')
    .reduce((sum, item) => sum + item.total, 0)

  const grocerySales = sales
    .flatMap(item => item.items)
    .filter(item => item.productType === 'grocery')
    .reduce((sum, item) => sum + item.total, 0)

  const groceryMap = sales
    .flatMap(item => item.items)
    .filter(item => item.productType === 'grocery')
    .reduce((map, item) => {
      const current: GroceryReportItem = map.get(item.productId) || {
        name: item.productName,
        paidQuantity: 0,
        freeQuantity: 0,
        totalQuantity: 0,
        quantity: 0,
        amount: 0,
      }

      const paid = item.paidQuantity != null ? item.paidQuantity : item.quantity
      const free = item.freeQuantity != null ? item.freeQuantity : 0
      const totalQty = item.totalQuantity != null ? item.totalQuantity : paid + free

      current.paidQuantity += paid
      current.freeQuantity += free
      current.totalQuantity += totalQty
      current.quantity += paid
      current.amount += item.total

      return map.set(item.productId, current)
    }, new Map<string, GroceryReportItem>())

  const chickenMap = sales
    .flatMap(item => item.items)
    .filter(item => item.productType === 'chicken')
    .reduce((map, item) => {
      const current = map.get(item.productId) || { name: item.productName, weight: 0, amount: 0 }
      current.weight += item.weightGrams || 0
      current.amount += item.total
      return map.set(item.productId, current)
    }, new Map<string, { name: string; weight: number; amount: number }>())

  const grocery = Array.from(groceryMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 10)
  const chicken = Array.from(chickenMap.values()).sort((a, b) => b.amount - a.amount)

  return {
    sales,
    total,
    count: sales.length,
    average: sales.length ? total / sales.length : 0,
    paymentMethods,
    chickenSales,
    grocerySales,
    grocery,
    chicken,
  }
}
