import { useState, type FormEvent } from 'react'
import { categories, getNextGroceryCode, type GroceryProduct } from '../data/grocery'
import { formatMoney } from '../data/chicken'
import { storageAdapter } from '../services/storageAdapter'
import { saveProducts } from '../services/supabase/productService'

export function Products({
  items,
  onSave,
  onToggle,
  onDelete,
}: {
  items: GroceryProduct[]
  onSave: (product: Omit<GroceryProduct, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => void
  onToggle: (id: string) => void
  onDelete?: (id: string) => void
}) {
  const [edit, setEdit] = useState<GroceryProduct | undefined>()
  const [deletingProduct, setDeletingProduct] = useState<GroceryProduct | null>(null)
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
              {item.discountPrice && item.discountPrice > 0 && item.discountPrice < item.sellingPrice ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ textDecoration: 'line-through', color: '#8b9aa7', fontSize: '11px' }}>
                    {formatMoney(item.sellingPrice)}
                  </span>
                  <b style={{ color: '#4ade80' }}>
                    {formatMoney(item.discountPrice)}
                  </b>
                  <small style={{ color: '#22c55e', fontSize: '10px', fontWeight: 700 }}>
                    Save {formatMoney(item.sellingPrice - item.discountPrice)}
                  </small>
                </div>
              ) : (
                <b>{formatMoney(item.sellingPrice)}</b>
              )}
            </span>
            <span className={item.stockQuantity <= item.lowStockLevel ? 'low-stock' : ''}>
              {item.stockQuantity} {item.stockQuantity <= item.lowStockLevel && 'LOW STOCK'}
            </span>
            <span style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="edit" onClick={() => setEdit(item)} title="Edit product details">
                Edit
              </button>
              <button
                className={item.active ? 'status active' : 'status'}
                onClick={() => onToggle(item.id)}
                title={item.active ? 'Click to set Inactive' : 'Click to set Active'}
              >
                {item.active ? 'Active' : 'Inactive'}
              </button>
              <button
                type="button"
                className="btn-delete-product"
                onClick={() => setDeletingProduct(item)}
                title={`Delete ${item.name}`}
              >
                Delete
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
          onDeleteRequest={productToDelete => setDeletingProduct(productToDelete)}
        />
      )}

      {deletingProduct && (
        <div className="shade">
          <div className="dialog custom-dialog" style={{ maxWidth: '440px' }}>
            <header>
              <div>
                <small style={{ color: '#ef4444', fontWeight: 800 }}>DELETE PRODUCT</small>
                <h2>Confirm Deletion</h2>
                <p>Are you sure you want to delete this product?</p>
              </div>
              <button type="button" onClick={() => setDeletingProduct(null)}>×</button>
            </header>
            <div className="editor-body">
              <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc', marginBottom: '4px' }}>
                  {deletingProduct.name}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Code: <strong style={{ color: '#facc15' }}>#{deletingProduct.code || '---'}</strong> · Category: <strong>{deletingProduct.category}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                  Stock: <strong>{deletingProduct.stockQuantity} {deletingProduct.unit}</strong> · Selling: <strong>{formatMoney(deletingProduct.sellingPrice)}</strong>
                </div>
              </div>
              <p style={{ color: '#f87171', fontSize: '12px', marginTop: '12px', lineHeight: 1.4 }}>
                ⚠️ This product will be permanently removed from the catalog and inventory. This action cannot be undone.
              </p>
            </div>
            <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setDeletingProduct(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-delete-product"
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  if (onDelete && deletingProduct.id) {
                    onDelete(deletingProduct.id)
                  }
                  if (edit && edit.id === deletingProduct.id) {
                    setEdit(undefined)
                  }
                  setDeletingProduct(null)
                }}
              >
                🗑️ Delete Product
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}

function Editor({
  item,
  existing,
  close,
  save,
  onDeleteRequest,
}: {
  item: GroceryProduct
  existing: GroceryProduct[]
  close: () => void
  save: (product: Omit<GroceryProduct, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => void
  onDeleteRequest?: (item: GroceryProduct) => void
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

    const discNum =
      product.discountPrice !== undefined && product.discountPrice !== null && String(product.discountPrice).trim() !== ''
        ? Number(product.discountPrice)
        : null

    if (discNum !== null && (isNaN(discNum) || discNum < 0)) {
      return setError('Discount price must be a valid positive number.')
    }
    if (discNum !== null && discNum >= Number(product.sellingPrice)) {
      return setError('Discount price must be less than the regular selling price.')
    }

    save(
      {
        code: codeVal,
        name: product.name,
        category: product.category,
        barcode: product.barcode,
        costPrice: Number(product.costPrice),
        sellingPrice: Number(product.sellingPrice),
        discountPrice: discNum,
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
          {field('costPrice', 'COST PRICE (RS.)', 'number')}
          {field('sellingPrice', 'SELLING PRICE (REGULAR RS.)', 'number')}
          <label>
            DISCOUNT PRICE (OPTIONAL RS.)
            <input
              type="number"
              min="0"
              step="0.01"
              value={product.discountPrice ?? ''}
              onChange={e =>
                setProduct({
                  ...product,
                  discountPrice: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder="e.g. 800 (leave blank if no discount)"
            />
            {product.discountPrice !== null && product.discountPrice !== undefined && product.discountPrice > 0 && Number(product.sellingPrice) > 0 && (
              <small style={{ color: Number(product.discountPrice) < Number(product.sellingPrice) ? '#4ade80' : '#f87171', display: 'block', marginTop: '3px', fontWeight: 600 }}>
                {Number(product.discountPrice) < Number(product.sellingPrice)
                  ? `Savings: ${formatMoney(Number(product.sellingPrice) - Number(product.discountPrice))} (${Math.round(((Number(product.sellingPrice) - Number(product.discountPrice)) / Number(product.sellingPrice)) * 100)}% OFF)`
                  : '⚠️ Discount price should be less than regular selling price.'}
              </small>
            )}
          </label>
          {field('stockQuantity', 'STOCK QUANTITY', 'number')}
          {field('lowStockLevel', 'LOW STOCK LEVEL', 'number')}
          {field('unit', 'UNIT')}
          {error && <p className="validation">{error}</p>}
        </div>
        <footer style={{ display: 'flex', justifyContent: item.id ? 'space-between' : 'flex-end', alignItems: 'center', gap: '8px' }}>
          {item.id ? (
            <button
              type="button"
              className="btn-delete-product"
              onClick={() => {
                close()
                onDeleteRequest?.(item)
              }}
              title="Delete this product"
            >
              🗑️ Delete Product
            </button>
          ) : <div />}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={close}>Cancel</button>
            <button className="confirm" type="submit">Save Product</button>
          </div>
        </footer>
      </form>
    </div>
  )
}
