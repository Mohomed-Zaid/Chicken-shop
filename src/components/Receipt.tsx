import { useEffect, useState, useCallback } from 'react'
import { formatMoney } from '../data/chicken'
import type { PaymentMethod, Sale } from '../data/records'
import { storageAdapter } from '../services/storageAdapter'
import { getBusinessSettings, type BusinessSettingsRow } from '../services/supabase/settingsService'
import { customerStore } from '../data/customers'

export type ReceiptSettings = {
  businessName: string
  address: string
  phone: string
  email: string
  footerMessage: string
  showCustomer: boolean
  showCashier: boolean
  showPaymentMethod: boolean
  autoPrintReceipt: boolean
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  businessName: 'CHICKEN KADE',
  address: '24 Kandy Road, Gelioya',
  phone: '0812311333',
  email: 'info@chickenkade.lk',
  footerMessage: 'Thank you for shopping with us! Please come again.\nමිලදී ගැනීම සඳහා ස්තූතියි! නැවත පැමිණෙන්න.',
  showCustomer: true,
  showCashier: true,
  showPaymentMethod: true,
  autoPrintReceipt: false,
}

const DEFAULT_SETTINGS = DEFAULT_RECEIPT_SETTINGS

function isStaleColombo(addr?: string | null): boolean {
  if (!addr) return false
  const lower = addr.toLowerCase()
  return lower.includes('colombo') || lower.includes('123 main street')
}

export function loadReceiptSettings(): ReceiptSettings {
  // 1. Try modern storageAdapter / Supabase cached row
  try {
    const cached = storageAdapter.readLocal<BusinessSettingsRow | null>('business_settings', null)
    if (cached) {
      const address = isStaleColombo(cached.address) ? DEFAULT_SETTINGS.address : (cached.address || DEFAULT_SETTINGS.address)
      const phone = (cached.phone && !cached.phone.includes('726 2600')) ? cached.phone : DEFAULT_SETTINGS.phone
      return {
        businessName: cached.business_name || DEFAULT_SETTINGS.businessName,
        address,
        phone,
        email: cached.email || DEFAULT_SETTINGS.email,
        footerMessage: cached.footer_message || DEFAULT_SETTINGS.footerMessage,
        showCustomer: cached.show_customer ?? true,
        showCashier: cached.show_cashier ?? true,
        showPaymentMethod: cached.show_payment_method ?? true,
        autoPrintReceipt: cached.auto_print_receipt ?? false,
      }
    }
  } catch {
    // fallback
  }

  // 2. Try legacy business-settings key
  try {
    const raw = localStorage.getItem('business-settings')
    if (raw) {
      const parsed = JSON.parse(raw)
      const address = isStaleColombo(parsed.address) ? DEFAULT_SETTINGS.address : (parsed.address || DEFAULT_SETTINGS.address)
      const phone = (parsed.phone && !parsed.phone.includes('726 2600')) ? parsed.phone : DEFAULT_SETTINGS.phone
      return {
        businessName: parsed.businessName || parsed.name || DEFAULT_SETTINGS.businessName,
        address,
        phone,
        email: parsed.email || DEFAULT_SETTINGS.email,
        footerMessage: parsed.footerMessage || DEFAULT_SETTINGS.footerMessage,
        showCustomer: parsed.showCustomer ?? true,
        showCashier: parsed.showCashier ?? true,
        showPaymentMethod: parsed.showPaymentMethod ?? true,
        autoPrintReceipt: parsed.autoPrintReceipt ?? false,
      }
    }
  } catch {
    // fallback
  }

  return DEFAULT_SETTINGS
}

export type ReceiptLanguage = 'en' | 'si' | 'bilingual'

export function getReceiptStrings(lang: ReceiptLanguage = 'si') {
  if (lang === 'si') {
    return {
      phonePrefix: '',
      invoiceNo: 'බිල්පත් අංකය :',
      date: 'දිනය / වේලාව :',
      sellingMode: 'විකුණුම් මාදිලිය :',
      wholesale: 'තොග විකිණුම්',
      wholesaleTag: 'තොග මිල',
      packTag: 'පැකේජ් මිල',
      packApplied: 'පැකේජ් මිල යොදන ලදී',
      cashier: 'අයකැමි :',
      customer: 'නම :',
      customerInfo: 'පාරිභෝගික තොරතුරු',
      customerPhone: 'දුරකථන :',
      item: 'විස්තරය',
      qtyPrice: 'ප්‍රමාණය × මිල',
      total: 'එකතුව',
      free: 'නොමිලේ',
      totalQty: 'අයිතම ගණන :',
      subtotal: 'උප එකතුව :',
      discount: 'වට්ටම :',
      tax: 'බදු :',
      grandTotal: 'මුළු මුදල :',
      paymentMethod: 'ගෙවීම් ක්‍රමය :',
      paymentCash: 'මුදල් (CASH) :',
      paymentCard: 'කාඩ්පත් (CARD) :',
      paymentCredit: 'ණය (CREDIT) :',
      paymentOther: 'වෙනත් :',
      amountReceived: 'ලැබුණු මුදල :',
      change: 'ඉතිරි මුදල :',
      customerCreditDetails: 'පාරිභෝගික ණය විස්තර :',
      outstandingDue: 'ගෙවිය යුතු මුදල :',
      previousDue: 'පෙර හිඟ මුදල',
      defaultFooterLine1: 'මිලදී ගැනීම සඳහා ස්තූතියි!',
      defaultFooterLine2: 'නැවත පැමිණෙන්න.',
    }
  }

  if (lang === 'bilingual') {
    return {
      phonePrefix: '',
      invoiceNo: 'BILL NO / බිල්පත් :',
      date: 'DateTime / දිනය :',
      sellingMode: 'Mode / මාදිලිය :',
      wholesale: 'WHOLESALE (තොග)',
      wholesaleTag: 'WHOLESALE (තොග)',
      packTag: 'PACK (පැකේජ්)',
      packApplied: 'Pack Pricing (පැකේජ් මිල)',
      cashier: 'Cashier / අයකැමි :',
      customer: 'Name / නම :',
      customerInfo: 'CUSTOMER INFORMATION / පාරිභෝගික තොරතුරු',
      customerPhone: 'Phone / දුරකථන :',
      item: 'DESCRIPTION / විස්තරය',
      qtyPrice: 'Qty × Rate',
      total: 'TOTAL / එකතුව',
      free: 'FREE / නොමිලේ',
      totalQty: 'Items Qty / අයිතම :',
      subtotal: 'SubTotal / උප එකතුව :',
      discount: 'Discount / වට්ටම :',
      tax: 'Tax / බදු :',
      grandTotal: 'Grand Total / මුළු මුදල :',
      paymentMethod: 'Payment / ගෙවීම් :',
      paymentCash: 'CASH / මුදල් :',
      paymentCard: 'CARD / කාඩ්පත් :',
      paymentCredit: 'CREDIT / ණය :',
      paymentOther: 'OTHER / වෙනත් :',
      amountReceived: 'Received / ලැබුණු :',
      change: 'Change / ඉතිරි :',
      customerCreditDetails: 'CUSTOMER CREDIT DETAILS / ණය විස්තර :',
      outstandingDue: 'Outstanding Due / හිඟ මුදල :',
      previousDue: 'Previous Due / පෙර හිඟය',
      defaultFooterLine1: 'Thank you. Please Visit Again.',
      defaultFooterLine2: 'මිලදී ගැනීම සඳහා ස්තූතියි!',
    }
  }

  // Default: English (Clean, universal POS receipt standard)
  return {
    phonePrefix: '',
    invoiceNo: 'BILL NO :',
    date: 'DateTime :',
    sellingMode: 'Selling Mode :',
    wholesale: 'WHOLESALE',
    wholesaleTag: 'WHOLESALE',
    packTag: 'PACK PRICE',
    packApplied: 'Pack Pricing Applied',
    cashier: 'Cashier :',
    customer: 'Name :',
    customerInfo: 'CUSTOMER INFORMATION',
    customerPhone: 'Phone :',
    item: 'DESCRIPTION',
    qtyPrice: 'Qty × Rate',
    total: 'TOTAL',
    free: 'FREE',
    totalQty: 'Items Qty :',
    subtotal: 'SubTotal :',
    discount: 'Discount :',
    tax: 'Tax :',
    grandTotal: 'Grand Total :',
    paymentMethod: 'Payment :',
    paymentCash: 'CASH :',
    paymentCard: 'CARD :',
    paymentCredit: 'CREDIT :',
    paymentOther: 'OTHER :',
    amountReceived: 'Received :',
    change: 'Change :',
    customerCreditDetails: 'CUSTOMER CREDIT DETAILS :',
    outstandingDue: 'Outstanding Due :',
    previousDue: 'Previous Due',
    defaultFooterLine1: 'Thank you. Please Visit Again.',
    defaultFooterLine2: '',
  }
}

const paymentLabel = (method: PaymentMethod, t: ReturnType<typeof getReceiptStrings>) => {
  switch (method) {
    case 'Cash':
      return t.paymentCash
    case 'Card':
      return t.paymentCard
    case 'Credit':
      return t.paymentCredit
    default:
      return t.paymentOther
  }
}

const displayDate = (value: string) => {
  if (!value) return ''
  const clean = value.split('T')[0]
  const parts = clean.split('-')
  return parts.length === 3 ? `${parts[0]}/${parts[1]}/${parts[2]}` : clean
}

const weightLabel = (grams: number) => {
  return (grams / 1000).toFixed(3)
}

// Code 39 Barcode Patterns (retained for backward compatibility with Purchases)
const CODE39_MAP: Record<string, string> = {
  '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
  '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
  '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
  'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
  'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
  'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
  'O': '110101101001', 'P': '101101101001', 'Q': '101010110011', 'R': '110101011001',
  'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
  'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
  '-': '100101011011', '.': '110010101101', ' ': '100110101101', '$': '100100100101',
  '/': '100100101001', '+': '100101001001', '%': '101001001001', '*': '100101101101',
}

export function BarcodeSvg({ text }: { text: string }) {
  const clean = `*${text.toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '')}*`
  let bitString = ''
  for (const char of clean) {
    bitString += (CODE39_MAP[char] || '10101010101') + '0'
  }

  return (
    <div className="receipt-barcode-wrap" aria-label={`Barcode: ${text}`}>
      <svg
        viewBox={`0 0 ${bitString.length} 32`}
        preserveAspectRatio="none"
        className="receipt-barcode-svg"
      >
        {bitString.split('').map((bit, idx) =>
          bit === '1' ? (
            <rect
              key={idx}
              x={idx}
              y={0}
              width={1}
              height={32}
              fill="#000000"
              shapeRendering="crispEdges"
            />
          ) : null
        )}
      </svg>
      <div className="receipt-barcode-text">*{text}*</div>
    </div>
  )
}

export function Receipt({ sale, language }: { sale: Sale; language?: ReceiptLanguage }) {
  const [bSettings, setBSettings] = useState<ReceiptSettings>(loadReceiptSettings)
  const [logoError, setLogoError] = useState(false)
  const activeLang: ReceiptLanguage = language || (localStorage.getItem('receipt_language') as ReceiptLanguage) || 'si'
  const t = getReceiptStrings(activeLang)

  useEffect(() => {
    let mounted = true
    if (storageAdapter.isSupabase()) {
      getBusinessSettings()
        .then(rows => {
          if (!mounted || !rows || rows.length === 0) return
          const row = rows[0]
          const finalAddress = isStaleColombo(row.address) ? DEFAULT_SETTINGS.address : (row.address || DEFAULT_SETTINGS.address)
          const finalPhone = (row.phone && !row.phone.includes('726 2600')) ? row.phone : DEFAULT_SETTINGS.phone
          const next = {
            businessName: row.business_name || DEFAULT_SETTINGS.businessName,
            address: finalAddress,
            phone: finalPhone,
            email: row.email || DEFAULT_SETTINGS.email,
            footerMessage: row.footer_message || DEFAULT_SETTINGS.footerMessage,
            showCustomer: row.show_customer ?? true,
            showCashier: row.show_cashier ?? true,
            showPaymentMethod: row.show_payment_method ?? true,
            autoPrintReceipt: row.auto_print_receipt ?? false,
          }
          storageAdapter.writeLocal('business_settings', { ...row, address: finalAddress, phone: finalPhone })
          try {
            localStorage.setItem('business-settings', JSON.stringify({
              businessName: next.businessName,
              address: next.address,
              phone: next.phone,
              email: next.email,
              footerMessage: next.footerMessage,
              autoPrintReceipt: next.autoPrintReceipt,
              showCustomer: next.showCustomer,
              showCashier: next.showCashier,
              showPaymentMethod: next.showPaymentMethod,
            }))
          } catch {}
          setBSettings(next)
        })
        .catch(() => { })
    }
    return () => {
      mounted = false
    }
  }, [])

  const hasDiscount = sale.discount > 0
  const hasTax = sale.tax > 0

  // Lookup customer details (e.g. phone) if customer attached
  const customerObj = sale.customerId ? customerStore.getCustomerById(sale.customerId) : null
  const customerPhone = customerObj?.phone || ''

  // Total items quantity count
  const totalItemQty = sale.items.reduce((acc, item) => {
    if (item.productType === 'chicken') {
      return acc + 1
    }
    return acc + (item.paidQuantity ?? item.quantity ?? 1)
  }, 0)

  return (
    <div className="receipt-80mm-container">
      <section className="receipt thermal-80mm">
        {/* 1. STORE HEADER */}
        <header className="thermal-header">
          {!logoError && (
            <img
              src="/logo2.jpeg"
              alt="Logo"
              className="thermal-logo"
              onError={() => setLogoError(true)}
            />
          )}
          <h1 className="thermal-business-name">{bSettings.businessName}</h1>
          <div className="thermal-business-info">
            {bSettings.address && <div>{bSettings.address}</div>}
            {bSettings.phone && <div>{bSettings.phone}</div>}
          </div>
        </header>

        <div className="thermal-divider-dashed" />

        {/* 2. INVOICE META */}
        <div className="thermal-meta-grid">
          <div className="thermal-meta-row invoice-row">
            <span className="meta-label">{t.invoiceNo}</span>
            <span className="meta-value bold-invoice">{sale.invoiceNumber}</span>
          </div>
          <div className="thermal-meta-row">
            <span className="meta-label">{t.date}</span>
            <span className="meta-value">{displayDate(sale.date)} {sale.time}</span>
          </div>
          {sale.sellingMode === 'WHOLESALE' && (
            <div className="thermal-meta-row">
              <span className="meta-label">{t.sellingMode}</span>
              <span className="meta-value bold-invoice">{t.wholesale}</span>
            </div>
          )}
          {bSettings.showCashier && sale.cashier && (
            <div className="thermal-meta-row">
              <span className="meta-label">{t.cashier}</span>
              <span className="meta-value">{sale.cashier}</span>
            </div>
          )}
          {bSettings.showCustomer && sale.customerName && sale.customerName !== 'Walk-in Customer' && (
            <div className="thermal-customer-box">
              <div className="thermal-customer-title">
                {t.customerInfo}
              </div>
              <div className="thermal-meta-row">
                <span className="meta-label">{t.customer}</span>
                <span className="meta-value">{sale.customerName}</span>
              </div>
              {customerPhone && (
                <div className="thermal-meta-row">
                  <span className="meta-label">{t.customerPhone}</span>
                  <span className="meta-value">{customerPhone}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="thermal-divider-dashed" />

        {/* 3. ITEMS TABLE */}
        <div className="thermal-items-container">
          <div className="thermal-items-header">
            <span className="col-desc">{t.item}</span>
            <span className="col-total">{t.total}</span>
          </div>

          <div className="thermal-items-list">
            {sale.items.map((item, index) => {
              const displayName = (item.productName || '').replace(/^\d+\s*-\s*/, '').trim() || item.productName
              const calcText =
                item.productType === 'chicken'
                  ? `${weightLabel(item.weightGrams || 0)} x (${formatMoney(item.pricePerKg || 0)})`
                  : `${item.paidQuantity ?? item.quantity} x (${formatMoney(item.unitPrice)})`

              const hasFree = Boolean(item.freeQuantity && item.freeQuantity > 0)

              return (
                <div className="thermal-item-row" key={`${item.productId}-${index}`}>
                  <div className="item-name-line">
                    <span>{displayName}</span>
                  </div>
                  <div className="item-sub-line">
                    <span className="item-rate">
                      {calcText}
                      {hasFree && (
                        <span style={{ marginLeft: '4px', fontWeight: 600 }}>
                          (+{item.freeQuantity} {t.free})
                        </span>
                      )}
                    </span>
                    <span className="item-total">{formatMoney(item.total)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="thermal-divider-dashed" />

        {/* 4. FINANCIAL SUMMARY */}
        <div className="thermal-summary-block">
          <div className="thermal-summary-row">
            <span>{t.subtotal}</span>
            <span>{formatMoney(sale.subtotal)}</span>
          </div>
          {hasDiscount && (
            <div className="thermal-summary-row discount-row">
              <span>{t.discount}</span>
              <span>-{formatMoney(sale.discount)}</span>
            </div>
          )}

          {hasTax && (
            <div className="thermal-summary-row">
              <span>{t.tax}</span>
              <span>{formatMoney(sale.tax)}</span>
            </div>
          )}

          {/* NET GRAND TOTAL */}
          <div className="thermal-grand-total">
            <span className="grand-total-label">{t.grandTotal}</span>
            <span className="grand-total-value">{formatMoney(sale.total)}</span>
          </div>

          <div className="thermal-summary-row">
            <span>{t.totalQty}</span>
            <span>{totalItemQty.toFixed(2)}</span>
          </div>

          {bSettings.showPaymentMethod && (
            <div className="thermal-summary-row">
              <span>{paymentLabel(sale.paymentMethod, t)}</span>
              <span>{formatMoney(sale.total)}</span>
            </div>
          )}

          {sale.paymentMethod === 'Cash' && sale.amountReceived > 0 && (
            <>
              <div className="thermal-summary-row">
                <span>{t.amountReceived}</span>
                <span>{formatMoney(sale.amountReceived)}</span>
              </div>
              {sale.change > 0 && (
                <div className="thermal-summary-row change-row">
                  <span>{t.change}</span>
                  <strong>{formatMoney(sale.change)}</strong>
                </div>
              )}
            </>
          )}
        </div>

        {/* 5. CUSTOMER CREDIT DETAILS IF CREDIT SALE */}
        {sale.paymentMethod === 'Credit' && (
          <>
            <div className="thermal-divider-dashed" />
            <div className="thermal-credit-details">
              <div className="thermal-credit-title">
                {t.customerCreditDetails}
              </div>
              <div className="thermal-summary-row">
                <span>{t.outstandingDue}</span>
                <span>{formatMoney(sale.total)}</span>
              </div>
              <div className="thermal-previous-due-block">
                <div className="previous-due-label">{t.previousDue}</div>
                <div className="previous-due-val">0.00</div>
              </div>
            </div>
          </>
        )}

        <div className="thermal-divider-dashed" />

        {/* 6. CLEAN FOOTER */}
        <footer className="thermal-footer">
          {activeLang === 'si' ? (
            <>
              <p className="footer-line">{t.defaultFooterLine1}</p>
              <p className="footer-line" style={{ marginTop: '2px' }}>{t.defaultFooterLine2}</p>
            </>
          ) : activeLang === 'bilingual' ? (
            <>
              <p className="footer-line">{t.defaultFooterLine1}</p>
              <p className="footer-line" style={{ marginTop: '2px' }}>{t.defaultFooterLine2}</p>
            </>
          ) : bSettings.footerMessage ? (
            bSettings.footerMessage.split('\n').map((line, idx) => (
              <p className="footer-line" key={idx} style={idx > 0 ? { marginTop: '2px' } : undefined}>
                {line}
              </p>
            ))
          ) : (
            <p className="footer-line">{t.defaultFooterLine1}</p>
          )}
        </footer>

        {/* 7. THERMAL PAPER CUTTER CLEARANCE FEED SPACE (12mm) */}
        <div className="receipt-cut-space" />
      </section>
    </div>
  )
}

export function ReceiptPreview({
  sale,
  close,
  newSale,
  autoPrint = false,
}: {
  sale: Sale
  close: () => void
  newSale?: () => void
  autoPrint?: boolean
}) {
  const [lang, setLang] = useState<ReceiptLanguage>(() => {
    const saved = localStorage.getItem('receipt_language') as ReceiptLanguage | null
    if (saved === 'si' || saved === 'bilingual') return saved
    // Default to Sinhala
    try {
      localStorage.setItem('receipt_language', 'si')
    } catch {}
    return 'si'
  })

  const handleLangChange = (nextLang: ReceiptLanguage) => {
    setLang(nextLang)
    try {
      localStorage.setItem('receipt_language', nextLang)
    } catch {}
  }

  const executePrint = useCallback(() => {
    // 1. Try dedicated isolated iframe printing (ensures only receipt is sent, no parent web UI interference)
    const printArea = document.getElementById('receipt-preview-area') || document.getElementById('receipt-printable-area')
    if (printArea) {
      try {
        let iframe = document.getElementById('receipt-print-iframe') as HTMLIFrameElement | null
        if (!iframe) {
          iframe = document.createElement('iframe')
          iframe.id = 'receipt-print-iframe'
          iframe.style.position = 'fixed'
          iframe.style.right = '0'
          iframe.style.bottom = '0'
          iframe.style.width = '0'
          iframe.style.height = '0'
          iframe.style.border = '0'
          iframe.style.opacity = '0'
          iframe.style.pointerEvents = 'none'
          document.body.appendChild(iframe)
        }

        const doc = iframe.contentWindow?.document
        if (doc) {
          doc.open()
          doc.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8" />
                <title>Receipt</title>
                <style>
                  @page { size: auto; margin: 0; }
                  * { box-sizing: border-box; margin: 0; padding: 0; color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                  body { margin: 0 auto; padding: 2mm 3mm; width: 100%; max-width: 80mm; font-family: 'Noto Sans Sinhala', 'Iskoola Pota', 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 1.3; }
                  .thermal-divider-dashed { border: none; border-top: 1px dashed #444444; margin: 6px 0; width: 100%; display: block; }
                  .thermal-business-name { font-size: 16px; font-weight: 600; text-align: center; text-transform: uppercase; margin-bottom: 2px; }
                  .thermal-business-info { font-size: 11px; font-weight: 400; text-align: center; line-height: 1.25; }
                  .thermal-meta-grid { font-size: 12px; font-weight: 400; display: flex; flex-direction: column; gap: 2px; }
                  .thermal-meta-row { display: flex; justify-content: space-between; align-items: baseline; }
                  .thermal-meta-row.invoice-row .meta-label { font-weight: 600; font-size: 12px; }
                  .thermal-meta-row.invoice-row .meta-value.bold-invoice { font-size: 15px; font-weight: 600; }
                  .thermal-customer-box { margin-top: 4px; display: flex; flex-direction: column; gap: 2px; }
                  .thermal-customer-title { font-size: 12px; font-weight: 600; text-transform: uppercase; }
                  .thermal-items-header { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; text-transform: uppercase; border-top: 1px dashed #444444; border-bottom: 1px dashed #444444; padding: 3px 0; margin: 3px 0 4px; }
                  .thermal-items-list { display: flex; flex-direction: column; gap: 4px; }
                  .thermal-item-row { display: flex; flex-direction: column; gap: 1px; }
                  .thermal-item-row .item-name-line { font-size: 13px; font-weight: 400; line-height: 1.25; }
                  .thermal-item-row .item-sub-line { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; }
                  .thermal-item-row .item-rate { font-size: 12px; font-weight: 400; }
                  .thermal-item-row .item-total { font-size: 13px; font-weight: 500; text-align: right; font-variant-numeric: tabular-nums; }
                  .thermal-summary-block { display: flex; flex-direction: column; gap: 2.5px; font-size: 12px; font-weight: 400; }
                  .thermal-summary-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; font-weight: 400; }
                  .thermal-grand-total { display: flex; justify-content: space-between; align-items: baseline; font-weight: 600; font-size: 13px; margin: 1px 0; padding: 1px 0; }
                  .grand-total-label { font-size: 13px; font-weight: 600; }
                  .grand-total-value { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
                  .thermal-credit-details { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
                  .thermal-credit-title { font-size: 13px; font-weight: 600; text-transform: uppercase; }
                  .thermal-previous-due-block { text-align: center; margin: 4px 0 2px; font-size: 12px; line-height: 1.3; }
                  .thermal-footer { text-align: center; font-size: 11px; font-weight: 400; margin-top: 4px; line-height: 1.3; }
                  .receipt-cut-space { height: 12mm; }
                </style>
              </head>
              <body>
                ${printArea.innerHTML}
              </body>
            </html>
          `)
          doc.close()

          setTimeout(() => {
            try {
              iframe?.contentWindow?.focus()
              iframe?.contentWindow?.print()
            } catch {
              window.focus()
              window.print()
            }
          }, 150)
          return
        }
      } catch (e) {
        console.warn('Iframe print failed, falling back to window.print:', e)
      }
    }

    // 2. Fallback directly to window.print()
    try {
      window.focus()
      window.print()
    } catch (err) {
      console.error('Print trigger failed:', err)
    }
  }, [])

  // Auto trigger browser print if autoPrint is true, keeping modal mounted
  useEffect(() => {
    if (autoPrint) {
      const t = setTimeout(() => {
        executePrint()
      }, 200)
      return () => clearTimeout(t)
    }
  }, [autoPrint, executePrint])

  // Keyboard shortcut: F5 or P to print, Enter to start new sale, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P' || e.key === 'F5') {
        e.preventDefault()
        e.stopPropagation()
        executePrint()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (newSale) newSale()
        else close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close, newSale, executePrint])

  return (
    <>
      {/* SCREEN-ONLY MODAL (COMPLETELY OMITTED FROM PRINT) */}
      <div className="shade receipt-modal-shade no-print" role="dialog" aria-modal="true">
        <div className="receipt-modal-card">
          {/* MODAL SUCCESS BANNER (SCREEN ONLY) */}
          <div className="receipt-success-banner">
            <div className="success-icon-badge">✓</div>
            <div className="success-text">
              <h2>Receipt Preview</h2>
              <span>
                Invoice: <strong>#{sale.invoiceNumber}</strong> · Net Total: <strong>{formatMoney(sale.total)}</strong>
              </span>
            </div>

            {/* QUICK LANGUAGE SELECTOR */}
            <div className="receipt-lang-selector" title="Select receipt language">
              <button
                type="button"
                className={`lang-pill ${lang === 'en' ? 'active' : ''}`}
                onClick={() => handleLangChange('en')}
              >
                EN
              </button>
              <button
                type="button"
                className={`lang-pill ${lang === 'si' ? 'active' : ''}`}
                onClick={() => handleLangChange('si')}
              >
                සිංහල
              </button>
              <button
                type="button"
                className={`lang-pill ${lang === 'bilingual' ? 'active' : ''}`}
                onClick={() => handleLangChange('bilingual')}
              >
                EN+සිං
              </button>
            </div>

            <button
              type="button"
              className="receipt-modal-close-x"
              onClick={close}
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>

          {/* RECEIPT PAPER PREVIEW CONTAINER */}
          <div className="receipt-preview-scroll">
            <div className="receipt-paper-roll" id="receipt-preview-area">
              <Receipt sale={sale} language={lang} />
            </div>
          </div>

          {/* ACTION BUTTONS (SCREEN ONLY) */}
          <div className="receipt-modal-actions">
            <button
              type="button"
              className="btn-print-receipt"
              onClick={executePrint}
              title="Print thermal receipt (Shortcut: F5 or P)"
            >
              🖨️ Print Receipt (F5)
            </button>

            {newSale && (
              <button
                type="button"
                className="confirm btn-new-sale"
                onClick={newSale}
                title="Start a new transaction (Shortcut: Enter)"
              >
                ➕ New Sale (Enter)
              </button>
            )}

            <button
              type="button"
              className="btn-close-receipt"
              onClick={close}
              title="Close preview (Shortcut: Esc)"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* DEDICATED CLEAN PRINT CONTAINER (PRINTS ONLY ON WHITE THERMAL PAPER WITH ZERO BORDERS) */}
      <div className="thermal-print-only" id="receipt-printable-area">
        <Receipt sale={sale} language={lang} />
      </div>
    </>
  )
}

