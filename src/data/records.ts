export type PaymentMethod = 'Cash' | 'Card' | 'Credit' | 'Other'
export type SaleStatus = 'completed' | 'cancelled'
export interface SaleItem {
  code?: string | null;
  productId: string;
  productName: string;
  productType: 'chicken' | 'grocery';
  quantity: number; // Customer paid quantity
  weightGrams: number | null;
  unitPrice: number;
  pricePerKg: number | null;
  costPrice: number | null;
  total: number;
  paidQuantity?: number;
  freeQuantity?: number;
  totalQuantity?: number;
  promotionApplied?: boolean;
  promotionType?: string | null;
  promotionBuyQuantity?: number | null;
  promotionFreeQuantity?: number | null;
}
export interface SaleTransaction { id: string; invoiceNumber: string; date: string; time: string; items: SaleItem[]; subtotal: number; discount: number; tax: number; service: number; total: number; paymentMethod: PaymentMethod; amountReceived: number; change: number; cashier: string; customerId?: string; customerName: string; status: SaleStatus }
export type Sale = SaleTransaction
const sk = 'sales-transactions', ik = 'sales-invoice-sequence'
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') as T } catch { return d } }
export const toLocalDateString = (d: Date = new Date()): string => {
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${y}-${m}-${day}`
}
const today = () => toLocalDateString()
const notifySale = (s?: Sale) => {
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('sales_updated', { detail: s }))
	}
}
export const salesStore = {
	get: () => read<Sale[]>(sk, []),
	getSales: () => read<Sale[]>(sk, []),
	saveSale: (s: Sale) => { localStorage.setItem(sk, JSON.stringify([s, ...salesStore.get().filter(x => x.id !== s.id)])); notifySale(s) },
	save: (s: Sale) => { localStorage.setItem(sk, JSON.stringify([s, ...salesStore.get().filter(x => x.id !== s.id)])); notifySale(s) },
	removeSale: (id: string) => { localStorage.setItem(sk, JSON.stringify(salesStore.get().filter(x => x.id !== id))); notifySale() },
	getSaleById: (id: string) => salesStore.get().find(x => x.id === id),
	getTodaySales: () => salesStore.get().filter(x => x.status === 'completed' && x.date === today()).reduce((a, x) => a + x.total, 0),
	getTodayBillCount: () => salesStore.get().filter(x => x.status === 'completed' && x.date === today()).length,
	getNextInvoice: () => { const n = Number(localStorage.getItem(ik) || '0') + 1; return `INV-${String(n).padStart(6, '0')}` },
	commitInvoice: () => { const n = Number(localStorage.getItem(ik) || '0') + 1; localStorage.setItem(ik, String(n)); return `INV-${String(n).padStart(6, '0')}` },
	getInvoiceCounter: () => Number(localStorage.getItem(ik) || '0'),
}
export interface Expense { id: string; date: string; time: string; category: string; description: string; amount: number; paymentMethod: string; createdBy: string }const ek = 'expenses'; export const expenseStore = { get: () => read<Expense[]>(ek, []), save: (e: Expense) => localStorage.setItem(ek, JSON.stringify([e, ...expenseStore.get()])), update: (e: Expense) => localStorage.setItem(ek, JSON.stringify(expenseStore.get().map(x => x.id === e.id ? e : x))), delete: (id: string) => localStorage.setItem(ek, JSON.stringify(expenseStore.get().filter(x => x.id !== id))) };
