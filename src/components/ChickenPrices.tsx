import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { formatMoney, normalizeChickenCode, type ChickenItem, type PriceHistoryEntry } from '../data/chicken'

type EditorProps = {
  item?: ChickenItem
  existingItems: ChickenItem[]
  onClose: () => void
  onSave: (code: string, name: string, price: number, wholesalePrice?: number | null) => void
}

function ItemEditor({ item, existingItems, onClose, onSave }: EditorProps) {
  const [code, setCode] = useState(item?.code ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [price, setPrice] = useState(item ? String(item.pricePerKg) : '')
  const [wholesalePrice, setWholesalePrice] = useState(item && item.wholesalePricePerKg ? String(item.wholesalePricePerKg) : '')
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normCode = normalizeChickenCode(code)
    if (!normCode) return setError('Enter a chicken code (e.g. 001, 1).')

    // Validate uniqueness
    const duplicate = existingItems.some(
      other => other.id !== item?.id && normalizeChickenCode(other.code) === normCode
    )
    if (duplicate) {
      return setError('Chicken code already exists.')
    }

    const trimmedName = name.trim() || item?.name || ''
    if (!trimmedName) return setError('Enter a chicken cut name.')

    const value = Number(price)
    if (!Number.isFinite(value) || value <= 0 || !/^\d+(\.\d+)?$/.test(price.trim())) {
      return setError('Enter a valid retail price greater than 0.')
    }

    const wsVal = wholesalePrice.trim() ? Number(wholesalePrice) : null
    if (wsVal !== null && (!Number.isFinite(wsVal) || wsVal <= 0)) {
      return setError('Wholesale price must be greater than 0 if provided.')
    }

    onSave(normCode, trimmedName, value, wsVal)
  }

  return (
    <div className="shade">
      <form className="dialog price-editor" onSubmit={submit}>
        <header>
          <div>
            <small>{item ? 'EDIT CHICKEN ITEM' : 'ADD CHICKEN ITEM'}</small>
            <h2>{item ? 'Update cut & daily price' : 'New chicken cut'}</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="editor-body">
          <label>
            CHICKEN CODE
            <input
              autoFocus={!item}
              value={code}
              onChange={e => {
                setCode(e.target.value.toUpperCase())
                setError('')
              }}
              placeholder="e.g. 001, 002"
            />
          </label>
          <label>
            CHICKEN CUT NAME
            <input
              value={name}
              onChange={e => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="e.g. Fresh Chicken, Breast"
            />
          </label>
          <label>
            RETAIL PRICE PER KG (RS.)
            <input
              autoFocus={Boolean(item)}
              value={price}
              onChange={e => {
                setPrice(e.target.value)
                setError('')
              }}
              inputMode="decimal"
              placeholder="e.g. 1000"
              required
            />
          </label>
          <label>
            WHOLESALE PRICE PER KG (OPTIONAL RS.)
            <input
              value={wholesalePrice}
              onChange={e => {
                setWholesalePrice(e.target.value)
                setError('')
              }}
              inputMode="decimal"
              placeholder="e.g. 920"
            />
          </label>
          {wholesalePrice && Number(wholesalePrice) > 0 && Number(price) > 0 && Number(wholesalePrice) >= Number(price) && (
            <p style={{ color: '#facc15', fontSize: '12px', marginTop: '2px' }}>
              ⚠️ Wholesale price is not lower than retail price.
            </p>
          )}
          {error && <p className="validation">{error}</p>}
        </div>
        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="confirm" type="submit">
            {item ? 'Save Cut' : 'Save Item'}
          </button>
        </footer>
      </form>
    </div>
  )
}

export function DailyChickenPrices({
  items,
  history,
  onUpdatePrice,
  onAdd,
  onToggle,
}: {
  items: ChickenItem[]
  history: PriceHistoryEntry[]
  onUpdatePrice: (id: string, code: string, name: string, price: number, wholesalePrice?: number | null) => void
  onAdd: (code: string, name: string, price: number, wholesalePrice?: number | null) => void
  onToggle: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<ChickenItem | undefined>()
  const [adding, setAdding] = useState(false)
  const active = items.filter(item => item.active).length
  const updated = useMemo(() => history[0]?.changedAt, [history])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(item => {
      const code = (item.code || '').toLowerCase()
      const name = (item.name || '').toLowerCase()
      const cut = (item.cut || '').toLowerCase()
      return code.includes(q) || name.includes(q) || cut.includes(q)
    })
  }, [items, query])

  return (
    <section className="prices-page">
      <header className="page-header">
        <div>
          <small>PRICE MANAGEMENT</small>
          <h1>Daily Chicken Prices</h1>
          <p>Update today’s retail and wholesale rate per KG. Cashiers will see saved prices immediately.</p>
        </div>
        <button className="primary" onClick={() => setAdding(true)}>
          + Add Chicken Item
        </button>
      </header>

      <section className="price-overview">
        <div>
          <small>TODAY'S CHICKEN PRICES</small>
          <b>{active} active items</b>
        </div>
        <div>
          <small>LAST UPDATED</small>
          <b>
            {updated
              ? new Date(updated).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' })
              : 'No changes today'}
          </b>
        </div>
        <button className="update-price" onClick={() => setEditing(items[0])}>
          + Update Price
        </button>
      </section>

      {/* SEARCH BAR */}
      <div style={{ position: 'relative', margin: '14px 0' }}>
        <input
          className="product-search"
          placeholder="Search chicken cuts by code (e.g. 001, CH001) or cut name..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#8da2b5',
              cursor: 'pointer',
              fontSize: '18px',
              lineHeight: 1,
            }}
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <section className="price-table">
        <div className="price-row table-head">
          <span style={{ maxWidth: '85px', flex: '0 0 85px' }}>Code</span>
          <span>Chicken Cut</span>
          <span>Retail / KG</span>
          <span>Wholesale / KG</span>
          <span style={{ maxWidth: '100px', flex: '0 0 100px' }}>Status</span>
          <span style={{ maxWidth: '90px', flex: '0 0 90px' }}>Action</span>
        </div>
        {filteredItems.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
            <b>No chicken cuts found</b>
            <p style={{ fontSize: '13px', marginTop: '6px' }}>
              {query ? `No chicken cuts match "${query}".` : 'No chicken items available.'}
            </p>
            {query && (
              <button
                type="button"
                className="edit"
                style={{ marginTop: '8px' }}
                onClick={() => setQuery('')}
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          filteredItems.map(item => (
            <div className="price-row" key={item.id}>
              <span style={{ maxWidth: '85px', flex: '0 0 85px' }}>
                <b className="font-mono">{item.code || '—'}</b>
              </span>
              <span>
                <b>{item.name}</b>
                <small>{item.cut || item.name} cut</small>
              </span>
              <span>
                <b>{formatMoney(item.pricePerKg)}</b>
              </span>
              <span>
                {item.wholesalePricePerKg && item.wholesalePricePerKg > 0 ? (
                  <b style={{ color: '#38bdf8' }}>{formatMoney(item.wholesalePricePerKg)}</b>
                ) : (
                  <span style={{ color: '#64748b' }}>—</span>
                )}
              </span>
              <span style={{ maxWidth: '100px', flex: '0 0 100px' }}>
                <button
                  className={item.active ? 'status active' : 'status'}
                  onClick={() => onToggle(item.id)}
                >
                  {item.active ? 'Active' : 'Inactive'}
                </button>
              </span>
              <span style={{ maxWidth: '90px', flex: '0 0 90px' }}>
                <button className="edit" onClick={() => setEditing(item)}>
                  Edit
                </button>
              </span>
            </div>
          ))
        )}
      </section>

      <section className="history">
        <div>
          <h2>Price History</h2>
          <small>Recent local price changes</small>
        </div>
        {history.length === 0 ? (
          <p>No price changes have been recorded yet.</p>
        ) : (
          <div>
            {history.slice(0, 6).map(entry => (
              <article key={entry.id}>
                <b>{entry.productName}</b>
                <span>
                  {formatMoney(entry.oldPrice)} → {formatMoney(entry.newPrice)}
                </span>
                <small>
                  {new Date(entry.changedAt).toLocaleString('en-LK', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <ItemEditor
          item={editing}
          existingItems={items}
          onClose={() => setEditing(undefined)}
          onSave={(code, name, price, wholesalePrice) => {
            onUpdatePrice(editing.id, code, name, price, wholesalePrice)
            setEditing(undefined)
          }}
        />
      )}

      {adding && (
        <ItemEditor
          existingItems={items}
          onClose={() => setAdding(false)}
          onSave={(code, name, price, wholesalePrice) => {
            onAdd(code, name, price, wholesalePrice)
            setAdding(false)
          }}
        />
      )}
    </section>
  )
}

