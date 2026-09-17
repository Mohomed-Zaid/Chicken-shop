import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { formatMoney, normalizeChickenCode, type ChickenItem, type PriceHistoryEntry } from '../data/chicken'

type EditorProps = {
  item?: ChickenItem
  existingItems: ChickenItem[]
  onClose: () => void
  onSave: (code: string, name: string, price: number) => void
}

function ItemEditor({ item, existingItems, onClose, onSave }: EditorProps) {
  const [code, setCode] = useState(item?.code ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [price, setPrice] = useState(item ? String(item.pricePerKg) : '')
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normCode = normalizeChickenCode(code)
    if (!normCode) return setError('Enter a chicken code (e.g. CH001).')

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
      return setError('Enter a valid price greater than 0.')
    }

    onSave(normCode, trimmedName, value)
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
            PRICE PER KG (RS.)
            <input
              autoFocus={Boolean(item)}
              value={price}
              onChange={e => {
                setPrice(e.target.value)
                setError('')
              }}
              inputMode="decimal"
              placeholder="e.g. 1200"
            />
          </label>
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
  onUpdatePrice: (id: string, code: string, name: string, price: number) => void
  onAdd: (code: string, name: string, price: number) => void
  onToggle: (id: string) => void
}) {
  const [editing, setEditing] = useState<ChickenItem | undefined>()
  const [adding, setAdding] = useState(false)
  const active = items.filter(item => item.active).length
  const updated = useMemo(() => history[0]?.changedAt, [history])

  return (
    <section className="prices-page">
      <header className="page-header">
        <div>
          <small>PRICE MANAGEMENT</small>
          <h1>Daily Chicken Prices</h1>
          <p>Update today’s rate per KG and cut codes. Cashiers will see saved prices immediately.</p>
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

      <section className="price-table">
        <div className="price-row table-head">
          <span>Code</span>
          <span>Chicken Cut</span>
          <span>Price / KG</span>
          <span>Status</span>
          <span>Action</span>
        </div>
        {items.map(item => (
          <div className="price-row" key={item.id}>
            <span>
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
              <button
                className={item.active ? 'status active' : 'status'}
                onClick={() => onToggle(item.id)}
              >
                {item.active ? 'Active' : 'Inactive'}
              </button>
            </span>
            <span>
              <button className="edit" onClick={() => setEditing(item)}>
                Edit
              </button>
            </span>
          </div>
        ))}
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
          onSave={(code, name, price) => {
            onUpdatePrice(editing.id, code, name, price)
            setEditing(undefined)
          }}
        />
      )}

      {adding && (
        <ItemEditor
          existingItems={items}
          onClose={() => setAdding(false)}
          onSave={(code, name, price) => {
            onAdd(code, name, price)
            setAdding(false)
          }}
        />
      )}
    </section>
  )
}
