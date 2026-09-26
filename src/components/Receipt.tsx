import { useEffect, useState } from 'react'
import { formatMoney } from '../data/chicken'
import type { PaymentMethod, Sale } from '../data/records'
import { storageAdapter } from '../services/storageAdapter'
import { getBusinessSettings, type BusinessSettingsRow } from '../services/supabase/settingsService'

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
  businessName: 'Chicken Kade & Grocery',
  address: '123 Main Street, Colombo, Sri Lanka',
  phone: '+94 77 726 2600',
  email: 'info@chickenkade.lk',
  footerMessage: 'Thank you for shopping with us! Please come again.\nමිලදී ගැනීම සඳහා ස්තූතියි! නැවත පැමිණෙන්න.',
  showCustomer: true,
  showCashier: true,
  showPaymentMethod: true,
  autoPrintReceipt: false,
}

const DEFAULT_SETTINGS = DEFAULT_RECEIPT_SETTINGS

export function loadReceiptSettings(): ReceiptSettings {
  // 1. Try modern storageAdapter / Supabase cached row
  try {
    const cached = storageAdapter.readLocal<BusinessSettingsRow | null>('business_settings', null)
    if (cached) {
      return {
        businessName: cached.business_name || DEFAULT_SETTINGS.businessName,
        address: cached.address || DEFAULT_SETTINGS.address,
        phone: cached.phone || DEFAULT_SETTINGS.phone,
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
      return {
        businessName: parsed.businessName || parsed.name || DEFAULT_SETTINGS.businessName,
        address: parsed.address || DEFAULT_SETTINGS.address,
        phone: parsed.phone || DEFAULT_SETTINGS.phone,
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
      phonePrefix: 'දුරකථන: ',
      invoiceNo: 'බිල්පත් අංකය:',
      date: 'දිනය:',
      sellingMode: 'විකුණුම් මාදිලිය:',
      wholesale: 'තොග විකිණුම් (WHOLESALE)',
      wholesaleTag: 'තොග මිල (WHOLESALE)',
      packTag: 'පැකේජ් මිල (PACK)',
      packApplied: 'පැකේජ් මිල යොදන ලදී (Pack Pricing)',
      cashier: 'අයකැමි:',
      customer: 'පාරිභෝගිකයා:',
      item: 'අයිතමය',
      qtyPrice: 'ප්‍රමාණය × මිල',
      total: 'එකතුව',
      free: 'නොමිලේ',
      totalQty: 'මුළු ප්‍රමාණය:',
      subtotal: 'උප එකතුව:',
      discount: 'වට්ටම:',
      tax: 'බදු:',
      grandTotal: 'මුළු මුදල',
      paymentMethod: 'ගෙවීම් ක්‍රමය:',
      paymentCash: 'මුදල්',
      paymentCard: 'කාඩ්පත්',
      paymentCredit: 'ණය',
      paymentOther: 'වෙනත්',
      amountReceived: 'ලැබුණු මුදල:',
      change: 'ඉතිරි මුදල:',
      defaultFooterLine1: 'මිලදී ගැනීම සඳහා ස්තූතියි!',
      defaultFooterLine2: 'නැවත පැමිණෙන්න.',
    }
  }

  if (lang === 'bilingual') {
    return {
      phonePrefix: 'Tel / දුරකථන: ',
      invoiceNo: 'Invoice # / බිල්පත් අංකය:',
      date: 'Date / දිනය:',
      sellingMode: 'Mode / මාදිලිය:',
      wholesale: 'WHOLESALE (තොග)',
      wholesaleTag: 'WHOLESALE (තොග)',
      packTag: 'PACK (පැකේජ්)',
      packApplied: 'Pack Pricing (පැකේජ් මිල)',
      cashier: 'Cashier / අයකැමි:',
      customer: 'Customer / පාරිභෝගික:',
      item: 'Item / අයිතමය',
      qtyPrice: 'Qty × Rate',
      total: 'Total / එකතුව',
      free: 'FREE / නොමිලේ',
      totalQty: 'Total Qty / මුළු ප්‍රමාණය:',
      subtotal: 'Subtotal / උප එකතුව:',
      discount: 'Discount / වට්ටම:',
      tax: 'Tax / බදු:',
      grandTotal: 'TOTAL / මුළු මුදල',
      paymentMethod: 'Payment / ගෙවීම්:',
      paymentCash: 'Cash (මුදල්)',
      paymentCard: 'Card (කාඩ්පත්)',
      paymentCredit: 'Credit (ණය)',
      paymentOther: 'Other (වෙනත්)',
      amountReceived: 'Received / ලැබුණු මුදල:',
      change: 'Change / ඉතිරි මුදල:',
      defaultFooterLine1: 'Thank you for shopping with us! · ස්තූතියි!',
      defaultFooterLine2: 'Please come again · නැවත පැමිණෙන්න.',
    }
  }

  // Default: English (Clean, universal POS receipt standard)
  return {
    phonePrefix: 'Tel: ',
    invoiceNo: 'Invoice #:',
    date: 'Date:',
    sellingMode: 'Selling Mode:',
    wholesale: 'WHOLESALE',
    wholesaleTag: 'WHOLESALE',
    packTag: 'PACK PRICE',
    packApplied: 'Pack Pricing Applied',
    cashier: 'Cashier:',
    customer: 'Customer:',
    item: 'Item',
    qtyPrice: 'Qty × Rate',
    total: 'Total',
    free: 'FREE',
    totalQty: 'Total Qty:',
    subtotal: 'Subtotal:',
    discount: 'Discount:',
    tax: 'Tax:',
    grandTotal: 'TOTAL AMOUNT',
    paymentMethod: 'Payment Method:',
    paymentCash: 'Cash',
    paymentCard: 'Card',
    paymentCredit: 'Credit',
    paymentOther: 'Other',
    amountReceived: 'Cash Tendered:',
    change: 'Change Due:',
    defaultFooterLine1: 'Thank you for shopping with us!',
    defaultFooterLine2: 'Please come again.',
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
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : clean
}

const weightLabel = (grams: number) => {
  if (grams >= 1000) {
    const kg = grams / 1000
    return `${kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(3)}kg`
  }
  return `${grams}g`
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
          setBSettings(prev => ({
            ...prev,
            businessName: row.business_name || prev.businessName,
            address: row.address || prev.address,
            phone: row.phone || prev.phone,
            email: row.email || prev.email,
            footerMessage: row.footer_message || prev.footerMessage,
            showCustomer: row.show_customer ?? prev.showCustomer,
            showCashier: row.show_cashier ?? prev.showCashier,
            showPaymentMethod: row.show_payment_method ?? prev.showPaymentMethod,
            autoPrintReceipt: row.auto_print_receipt ?? prev.autoPrintReceipt,
          }))
        })
        .catch(() => { })
    }
    return () => {
      mounted = false
    }
  }, [])

  const hasDiscount = sale.discount > 0
  const hasTax = sale.tax > 0

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
          <p className="thermal-business-info">
            {bSettings.address && <span>{bSettings.address}</span>}
            {bSettings.phone && <span>{t.phonePrefix}<strong>{bSettings.phone}</strong></span>}
          </p>
        </header>

        {/* 2. INVOICE META */}
        <div className="thermal-meta-grid" style={{ marginTop: '6px' }}>
          <div className="thermal-meta-row invoice-row">
            <span className="meta-label">{t.invoiceNo}</span>
            <span className="meta-value bold-invoice">#{sale.invoiceNumber}</span>
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
            <div className="thermal-meta-row">
              <span className="meta-label">{t.customer}</span>
              <span className="meta-value">{sale.customerName}</span>
            </div>
          )}
        </div>

        {/* 3. ITEMS TABLE */}
        <div className="thermal-items-container" style={{ marginTop: '8px' }}>
          <div className="thermal-items-header">
            <span className="col-desc">{t.item}</span>
            <span className="col-calc">{t.qtyPrice}</span>
            <span className="col-total">{t.total}</span>
          </div>

          <div className="thermal-items-list">
            {sale.items.map((item, index) => {
              const displayName = item.code ? `${item.code} - ${item.productName}` : item.productName
              const calcText =
                item.productType === 'chicken'
                  ? `${weightLabel(item.weightGrams || 0)} × ${formatMoney(item.pricePerKg || 0)}`
                  : `${item.paidQuantity ?? item.quantity} × ${formatMoney(item.unitPrice)}`

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
                        <span style={{ marginLeft: '6px', fontWeight: 700 }}>
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

        {/* 4. FINANCIAL SUMMARY */}
        <div className="thermal-summary-block" style={{ marginTop: '8px' }}>
          {hasDiscount && (
            <>
              <div className="thermal-summary-row">
                <span>{t.subtotal}</span>
                <span>{formatMoney(sale.subtotal)}</span>
              </div>
              <div className="thermal-summary-row discount-row">
                <span>{t.discount}</span>
                <span>-{formatMoney(sale.discount)}</span>
              </div>
            </>
          )}

          {hasTax && (
            <div className="thermal-summary-row">
              <span>{t.tax}</span>
              <span>{formatMoney(sale.tax)}</span>
            </div>
          )}

          {/* NET GRAND TOTAL */}
          <div className="thermal-grand-total">
            <div className="grand-total-label">
              <span>{t.grandTotal}</span>
            </div>
            <div className="grand-total-value">
              {formatMoney(sale.total)}
            </div>
          </div>
        </div>

        {/* 5. PAYMENT BREAKDOWN */}
        {bSettings.showPaymentMethod && (
          <div className="thermal-payment-block" style={{ marginTop: '6px' }}>
            <div className="thermal-summary-row">
              <span>{t.paymentMethod}</span>
              <strong>{paymentLabel(sale.paymentMethod, t)}</strong>
            </div>

            {sale.paymentMethod === 'Cash' && (
              <>
                <div className="thermal-summary-row">
                  <span>{t.amountReceived}</span>
                  <span>{formatMoney(sale.amountReceived || sale.total)}</span>
                </div>
                {sale.change > 0 && (
                  <div className="thermal-summary-row change-row">
                    <span>{t.change}</span>
                    <strong className="change-amount">{formatMoney(sale.change)}</strong>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 6. CLEAN FOOTER */}
        <footer className="thermal-footer" style={{ marginTop: '10px' }}>
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
            <>
              <p className="footer-line">{t.defaultFooterLine1}</p>
              <p className="footer-line" style={{ marginTop: '2px' }}>{t.defaultFooterLine2}</p>
            </>
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

  // Only trigger browser print if autoPrint is explicitly true!
  useEffect(() => {
    if (autoPrint) {
      const t = setTimeout(() => {
        window.print()
      }, 300)
      return () => clearTimeout(t)
    }
  }, [autoPrint])

  // Reset or advance sale once print dialog closes if autoPrint was active
  useEffect(() => {
    if (!autoPrint) return
    const handleAfterPrint = () => {
      if (newSale) {
        newSale()
      } else {
        close()
      }
    }
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [newSale, close, autoPrint])

  // Keyboard shortcut: F5 or P to print, Enter to start new sale, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P' || e.key === 'F5') {
        e.preventDefault()
        e.stopPropagation()
        window.print()
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
  }, [close, newSale])

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
            <div className="receipt-paper-roll">
              <Receipt sale={sale} language={lang} />
            </div>
          </div>

          {/* ACTION BUTTONS (SCREEN ONLY) */}
          <div className="receipt-modal-actions">
            <button
              type="button"
              className="btn-print-receipt"
              onClick={() => window.print()}
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
      <div className="thermal-print-only">
        <Receipt sale={sale} language={lang} />
      </div>
    </>
  )
}

