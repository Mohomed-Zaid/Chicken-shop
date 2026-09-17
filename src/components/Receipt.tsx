import { formatMoney } from '../data/chicken'
import type { PaymentMethod, Sale } from '../data/records'

type BusinessSettings = {
  businessName?: string
  name?: string
  address?: string
  phone?: string
  email?: string
  footerMessage?: string
}

const settings = (): BusinessSettings => {
  try {
    const parsed = JSON.parse(localStorage.getItem('business-settings') || '{}') as BusinessSettings
    return { ...parsed, phone: parsed.phone || '+94777262600' }
  } catch {
    return { phone: '+94777262600' }
  }
}

const paymentLabel = (method: PaymentMethod) =>
  ({ Cash: 'මුදල් (Cash)', Card: 'කාඩ්පත (Card)', Credit: 'ණය (Credit)', Other: 'වෙනත් (Other)' }[method])

const displayDate = (value: string) => {
  const parts = value.split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value
}

const weight = (grams: number) =>
  grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000}kg` : `${grams}g`

export function Receipt({ sale }: { sale: Sale }) {
  const business = settings()
  const name = business.businessName || business.name || 'Chicken Kade & Grocery'
  const phone = business.phone || '+94777262600'

  return (
    <section className="receipt sinhala-receipt">
      <header>
        <img
          src="/logo2.jpeg"
          alt="Logo"
          style={{ maxHeight: '55px', marginBottom: '6px', display: 'block', margin: '0 auto' }}
        />
        <b>{name}</b>
        <small>
          {business.address || 'ලිපිනය'}<br />
          දුරකථන: {phone}{business.email ? ` · ${business.email}` : ''}
        </small>
      </header>

      <p>
        බිල්පත් අංකය: <b>{sale.invoiceNumber}</b><br />
        දිනය: {displayDate(sale.date)}<br />
        වේලාව: {sale.time}
      </p>
      <p>
        පාරිභෝගිකයා: <b>{sale.customerName}</b><br />
        අයකැමි: <b>{sale.cashier}</b>
      </p>

      <div className="receipt-items">
        <div className="receipt-labels">
          <span>අයිතමය (Item)</span>
          <span>ප්‍රමාණය / මිල</span>
          <strong>මුළු මුදල</strong>
        </div>
        {sale.items.map((item, index) => (
          <article key={`${item.productId}-${index}`}>
            <b>{item.code ? `${item.code} - ${item.productName}` : item.productName}</b>
            <span>
              {item.productType === 'chicken'
                ? `${weight(item.weightGrams || 0)} × ${formatMoney(item.pricePerKg || 0)}/kg`
                : `${item.quantity} × ${formatMoney(item.unitPrice)}`}
            </span>
            <strong>{formatMoney(item.total)}</strong>
          </article>
        ))}
      </div>

      <p>
        උප එකතුව: <b>{formatMoney(sale.subtotal)}</b><br />
        වට්ටම: <b>{formatMoney(sale.discount)}</b><br />
        බදු: <b>{formatMoney(sale.tax)}</b><br />
        සේවා ගාස්තුව: <b>{formatMoney(sale.service)}</b>
      </p>

      <p className="receipt-total">
        මුළු මුදල: <b>{formatMoney(sale.total)}</b>
      </p>

      <p>
        ගෙවීම් ක්‍රමය: <b>{paymentLabel(sale.paymentMethod)}</b>
        {sale.paymentMethod === 'Cash' && (
          <>
            <br />
            ලැබුණු මුදල: <b>{formatMoney(sale.amountReceived)}</b>
            <br />
            ඉතිරි මුදල: <b>{formatMoney(sale.change)}</b>
          </>
        )}
      </p>

      <footer>{business.footerMessage || 'මිලදී ගැනීම සඳහා ස්තූතියි! නැවත පැමිණෙන්න.'}</footer>
    </section>
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
}) {
  return (
    <div className="shade">
      <div className="receipt-modal-card receipt-preview">
        <div className="no-print receipt-success-banner">
          <div className="success-icon-badge">✓</div>
          <div className="success-text">
            <h2>Sale Completed Successfully</h2>
            <span>Invoice: <strong>{sale.invoiceNumber}</strong> · Total: <strong>{formatMoney(sale.total)}</strong></span>
          </div>
        </div>

        <div className="receipt-preview-scroll">
          <Receipt sale={sale} />
        </div>

        <div className="no-print receipt-modal-actions">
          <button type="button" className="btn-print-receipt" onClick={() => window.print()}>
            🖨️ Print Receipt
          </button>
          {newSale && (
            <button type="button" className="confirm btn-new-sale" onClick={newSale}>
              ➕ New Sale
            </button>
          )}
          <button type="button" className="btn-close-receipt" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
