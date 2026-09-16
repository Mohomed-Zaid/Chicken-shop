import { purchaseStore } from '../../data/purchases'
import { inReportRange, type ReportDateRange } from './reportDateUtils'
export function getPurchaseReport(range: ReportDateRange) { const purchases = purchaseStore.getPurchases().filter(item => item.status === 'completed' && inReportRange(item.date, range)); return { purchases, total: purchases.reduce((sum, item) => sum + item.total, 0), paid: purchases.reduce((sum, item) => sum + item.amountPaid, 0), outstanding: purchases.reduce((sum, item) => sum + item.balanceDue, 0), count: purchases.length } }
