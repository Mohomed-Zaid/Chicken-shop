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

const paymentLabel = (method: PaymentMethod) => {
  switch (method) {
    case 'Cash':
      return 'මුදල්'
    case 'Card':
      return 'කාඩ්පත්'
    case 'Credit':
      return 'ණය'
    default:
      return 'වෙනත්'
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

export function Receipt({ sale }: { sale: Sale }) {
  const [bSettings, setBSettings] = useState<ReceiptSettings>(loadReceiptSettings)
  const [logoError, setLogoError] = useState(false)

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
        .catch(() => {})
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
            {bSettings.phone && <span>දුරකථන: <strong>{bSettings.phone}</strong></span>}
          </p>
        </header>

        {/* 2. INVOICE META */}
        <div className="thermal-meta-grid" style={{ marginTop: '6px' }}>
          <div className="thermal-meta-row invoice-row">
            <span className="meta-label">බිල්පත් අංකය:</span>
            <span className="meta-value bold-invoice">#{sale.invoiceNumber}</span>
          </div>
          <div className="thermal-meta-row">
            <span className="meta-label">දිනය:</span>
            <span className="meta-value">{displayDate(sale.date)} {sale.time}</span>
          </div>
          {bSettings.showCashier && sale.cashier && (
            <div className="thermal-meta-row">
              <span className="meta-label">අයකැමි:</span>
              <span className="meta-value">{sale.cashier}</span>
            </div>
          )}
          {bSettings.showCustomer && sale.customerName && sale.customerName !== 'Walk-in Customer' && (
            <div className="thermal-meta-row">
              <span className="meta-label">පාරිභෝගිකයා:</span>
              <span className="meta-value">{sale.customerName}</span>
            </div>
          )}
        </div>

        {/* 3. ITEMS TABLE */}
        <div className="thermal-items-container" style={{ marginTop: '8px' }}>
          <div className="thermal-items-header">
            <span className="col-desc">අයිතමය</span>
            <span className="col-calc">ප්‍රමාණය × මිල</span>
            <span className="col-total">එකතුව</span>
          </div>

          <div className="thermal-items-list">
            {sale.items.map((item, index) => {
              const displayName = item.code ? `${item.code} - ${item.productName}` : item.productName
              const calcText =
                item.productType === 'chicken'
                  ? `${weightLabel(item.weightGrams || 0)} × ${formatMoney(item.pricePerKg || 0)}`
                  : `${item.quantity} × ${formatMoney(item.unitPrice)}`

              return (
                <div className="thermal-item-row" key={`${item.productId}-${index}`}>
                  <div className="item-name-line">{displayName}</div>
                  <div className="item-sub-line">
                    <span className="item-rate">{calcText}</span>
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
                <span>උප එකතුව:</span>
                <span>{formatMoney(sale.subtotal)}</span>
              </div>
              <div className="thermal-summary-row discount-row">
                <span>වට්ටම:</span>
                <span>-{formatMoney(sale.discount)}</span>
              </div>
            </>
          )}

          {hasTax && (
            <div className="thermal-summary-row">
              <span>බදු:</span>
              <span>{formatMoney(sale.tax)}</span>
            </div>
          )}

          {/* NET GRAND TOTAL */}
          <div className="thermal-grand-total">
            <div className="grand-total-label">
              <span>මුළු මුදල</span>
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
              <span>ගෙවීම් ක්‍රමය:</span>
              <strong>{paymentLabel(sale.paymentMethod)}</strong>
            </div>

            {sale.paymentMethod === 'Cash' && (
              <>
                <div className="thermal-summary-row">
                  <span>ලැබුණු මුදල:</span>
                  <span>{formatMoney(sale.amountReceived || sale.total)}</span>
                </div>
                {sale.change > 0 && (
                  <div className="thermal-summary-row change-row">
                    <span>ඉතිරි මුදල:</span>
                    <strong className="change-amount">{formatMoney(sale.change)}</strong>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 6. CLEAN FOOTER */}
        <footer className="thermal-footer" style={{ marginTop: '10px' }}>
          <p className="footer-line">මිලදී ගැනීම සඳහා ස්තූතියි!</p>
          <p className="footer-line" style={{ marginTop: '2px' }}>නැවත පැමිණෙන්න.</p>
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
}: {
  sale: Sale
  close: () => void
  newSale?: () => void
  autoPrint?: boolean
}) {

  // Automatically print the invoice immediately after sale completion
  useEffect(() => {
    const t = setTimeout(() => {
      window.print()
    }, 150)
    return () => clearTimeout(t)
  }, [])

  // Automatically start new sale / reset once printing is completed
  useEffect(() => {
    const handleAfterPrint = () => {
      if (newSale) {
        newSale()
      } else {
        close()
      }
    }
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [newSale, close])

  // Keyboard shortcut: F5 or P to print, Enter or Space to start new sale, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P' || e.key === 'F5') {
        e.preventDefault()
        e.stopPropagation()
        window.print()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'Enter' || e.key === ' ') {
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
        <div className="receipt-modal-card receipt-preview">
          {/* MODAL SUCCESS BANNER (SCREEN ONLY) */}
          <div className="receipt-success-banner">
            <div className="success-icon-badge">✓</div>
            <div className="success-text">
              <h2>Receipt Preview</h2>
              <span>
                Invoice: <strong>#{sale.invoiceNumber}</strong> · Net Total: <strong>{formatMoney(sale.total)}</strong>
              </span>
            </div>
            <div className="thermal-80mm-badge">
              🖨️ 80mm Thermal
            </div>
          </div>

          {/* RECEIPT PAPER PREVIEW CONTAINER */}
          <div className="receipt-preview-scroll">
            <div className="receipt-paper-roll">
              <Receipt sale={sale} />
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
        <Receipt sale={sale} />
      </div>
    </>
  )
}
