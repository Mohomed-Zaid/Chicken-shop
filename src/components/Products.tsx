import { useState, type FormEvent } from 'react'
import { categories, getNextGroceryCode, type GroceryProduct } from '../data/grocery'
import { formatMoney } from '../data/chicken'
import { storageAdapter } from '../services/storageAdapter'
import { saveProducts } from '../services/supabase/productService'

export function Products({
  items,
  onSave,
  onToggle,
}: {
  items: GroceryProduct[]
  onSave: (product: Omit<GroceryProduct, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => void
  onToggle: (id: string) => void
}) {
  const [edit, setEdit] = useState<GroceryProduct | undefined>()
  const [query, setQuery] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [syncError, setSyncError] = useState('')

  const handleSyncToCloud = async () => {
    setSyncing(true)
    setSyncMessage('')
    setSyncError('')
    try {
      await saveProducts(items)
      setSyncMessage(`Successfully synced ${items.length} products to cloud database!`)
      setTimeout(() => setSyncMessage(''), 4000)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  const list = items.filter(
    item =>
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      item.barcode.toLowerCase().includes(query.toLowerCase()) ||
      (item.code && item.code.toLowerCase().includes(query.toLowerCase()))
  )

  return (
    <section className="prices-page">
      <header className="page-header">
        <div>
          <small>CATALOG</small>
          <h1>Products</h1>
          <p>Manage grocery products, codes (100+), pricing, stock units, and barcodes.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {storageAdapter.isSupabase() && (
            <button
              type="button"
              className="secondary"
              onClick={handleSyncToCloud}
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : '☁️ Sync to Cloud'}
            </button>
          )}
          <button
            className="primary"
            onClick={() =>
              setEdit({
                id: '',
                code: getNextGroceryCode(items),
                name: '',
                category: 'Grocery',
                barcode: '',
                costPrice: 0,
                sellingPrice: 0,
                stockQuantity: 0,
                lowStockLevel: 0,
                unit: 'Piece',
                active: true,
                createdAt: '',
                updatedAt: '',
              })
            }
          >
            + Add Product
          </button>
        </div>
      </header>

      {syncMessage && <div className="pos-notice" style={{ margin: '0 0 16px 0' }}>{syncMessage}</div>}
      {syncError && <div className="validation" style={{ margin: '0 0 16px 0' }}>{syncError}</div>}

      <input
        className="product-search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search products by code (e.g. 100), name or barcode..."
      />

      <section className="price-table">
        <div className="price-row table-head">
          <span style={{ maxWidth: '85px', flex: '0 0 85px' }}>Code</span>
          <span>Product</span>
          <span>Price</span>
          <span>Stock</span>
          <span>Action</span>
        </div>
        {list.map(item => (
          <div className="price-row" key={item.id}>
            <span style={{ maxWidth: '85px', flex: '0 0 85px' }}>
              <span className="product-code-pill">#{item.code || '---'}</span>
            </span>
            <span>
              <b>{item.name}</b>
              <small>{item.barcode ? `Barcode: ${item.barcode}` : 'No barcode'} · {item.category}</small>
            </span>
            <span>
              <b>{formatMoney(item.sellingPrice)}</b>
            </span>
            <span className={item.stockQuantity <= item.lowStockLevel ? 'low-stock' : ''}>
              {item.stockQuantity} {item.stockQuantity <= item.lowStockLevel && 'LOW STOCK'}
            </span>
            <span>
              <button className="edit" onClick={() => setEdit(item)}>
                Edit
              </button>{' '}
              <button
                className={item.active ? 'status active' : 'status'}
                onClick={() => onToggle(item.id)}
              >
                {item.active ? 'Active' : 'Inactive'}
              </button>
            </span>
          </div>
        ))}
      </section>

      {edit && (
        <Editor
          item={edit}
          existing={items}
          close={() => setEdit(undefined)}
          save={onSave}
        />
      )}
    </section>
  )
}

function Editor({
  item,
  existing,
  close,
  save,
}: {
  item: GroceryProduct
  existing: GroceryProduct[]
  close: () => void
  save: (product: Omit<GroceryProduct, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => void
}) {
  const [product, setProduct] = useState(item)
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (
      !product.name.trim() ||
      product.sellingPrice < 0 ||
      product.costPrice < 0 ||
      product.stockQuantity < 0
    ) {
      return setError('Complete valid product details.')
    }

    const codeVal = (product.code || '').trim() || getNextGroceryCode(existing)
    const codeNum = parseInt(codeVal, 10)
    if (isNaN(codeNum) || codeNum < 100) {
      return setError('Grocery product code must be a number 100 or higher (1-99 is reserved for Chicken).')
    }
    if (existing.some(other => other.code === codeVal && other.id !== product.id)) {
      return setError(`Product code #${codeVal} is already assigned to another product.`)
    }

    if (
      product.barcode &&
      existing.some(other => other.barcode === product.barcode && other.id !== product.id)
    ) {
      return setError('Barcode already belongs to another product.')
    }

    save(
      {
        code: codeVal,
        name: product.name,
        category: product.category,
        barcode: product.barcode,
        costPrice: Number(product.costPrice),
        sellingPrice: Number(product.sellingPrice),
        stockQuantity: Number(product.stockQuantity),
        lowStockLevel: Number(product.lowStockLevel),
        unit: product.unit,
        active: product.active,
      },
      product.id || undefined
    )
    close()
  }

  const field = (key: keyof GroceryProduct, label: string, type = 'text') => (
    <label>
      {label}
      <input
        type={type}
        value={String(product[key] ?? '')}
        onChange={e =>
          setProduct({
            ...product,
            [key]: type === 'number' ? Number(e.target.value) : e.target.value,
          })
        }
      />
    </label>
  )

  return (
    <div className="shade">
      <form className="dialog product-editor" onSubmit={submit}>
        <header>
          <div>
            <small>{item.id ? 'EDIT PRODUCT' : 'ADD PRODUCT'}</small>
            <h2>Grocery product</h2>
          </div>
          <button type="button" onClick={close}>×</button>
        </header>
        <div className="editor-body product-fields">
          <label>
            PRODUCT CODE (NUMERIC 100+)
            <input
              type="number"
              min="100"
              step="1"
              value={product.code || ''}
              onChange={e => setProduct({ ...product, code: e.target.value })}
              placeholder="e.g. 100, 101, 102..."
              required
            />
          </label>
          {field('name', 'PRODUCT NAME')}
          <label>
            CATEGORY
            <select
              value={product.category}
              onChange={e => setProduct({ ...product, category: e.target.value })}
            >
              {categories.map(category => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          {field('barcode', 'BARCODE (OPTIONAL)')}
          {field('costPrice', 'COST PRICE', 'number')}
          {field('sellingPrice', 'SELLING PRICE', 'number')}
          {field('stockQuantity', 'STOCK QUANTITY', 'number')}
          {field('lowStockLevel', 'LOW STOCK LEVEL', 'number')}
          {field('unit', 'UNIT')}
          {error && <p className="validation">{error}</p>}
        </div>
        <footer>
          <button type="button" onClick={close}>Cancel</button>
          <button className="confirm" type="submit">Save Product</button>
        </footer>
      </form>
    </div>
  )
}
