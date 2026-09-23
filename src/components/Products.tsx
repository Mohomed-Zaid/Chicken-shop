import { useState, type FormEvent } from 'react'
import { categories, getNextGroceryCode, type GroceryProduct } from '../data/grocery'
import { formatMoney } from '../data/chicken'
import { storageAdapter } from '../services/storageAdapter'
import { saveProducts } from '../services/supabase/productService'
import { isPromotionActive, getPromotionStatus } from '../services/promotionService'

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
  const [pricingFilter, setPricingFilter] = useState<'ALL' | 'WHOLESALE' | 'RETAIL_ONLY'>('ALL')
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

  const wholesaleCount = items.filter(i => i.wholesaleEnabled && i.wholesalePrice && Number(i.wholesalePrice) > 0).length
  const retailOnlyCount = items.length - wholesaleCount

  const list = items.filter(item => {
    const matchesQuery =
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      item.barcode.toLowerCase().includes(query.toLowerCase()) ||
      (item.code && item.code.toLowerCase().includes(query.toLowerCase()))
    if (!matchesQuery) return false

    if (pricingFilter === 'WHOLESALE') {
      return Boolean(item.wholesaleEnabled && item.wholesalePrice && Number(item.wholesalePrice) > 0)
    }
    if (pricingFilter === 'RETAIL_ONLY') {
      return !Boolean(item.wholesaleEnabled && item.wholesalePrice && Number(item.wholesalePrice) > 0)
    }
    return true
  })

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
                retailPrice: 0,
                wholesaleEnabled: false,
                wholesalePrice: null,
                wholesaleMinQuantity: null,
                stockQuantity: 0,
                lowStockLevel: 0,
                unit: 'Piece',
                active: true,
                promotionEnabled: false,
                promotionType: 'BUY_X_GET_Y_FREE',
                promotionBuyQuantity: 2,
                promotionFreeQuantity: 1,
                promotionStartDate: null,
                promotionEndDate: null,
                promotionActive: true,
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

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          className="product-search"
          style={{ flex: 1, minWidth: '240px', margin: 0 }}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search products by code (e.g. 100), name or barcode..."
        />
        <div className="report-tabs" style={{ margin: 0 }}>
          <button
            type="button"
            className={pricingFilter === 'ALL' ? 'chosen' : ''}
            onClick={() => setPricingFilter('ALL')}
            style={{ padding: '8px 14px', fontSize: '13px' }}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            className={pricingFilter === 'WHOLESALE' ? 'chosen' : ''}
            onClick={() => setPricingFilter('WHOLESALE')}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              color: pricingFilter === 'WHOLESALE' ? '#fff' : '#38bdf8',
              borderColor: pricingFilter === 'WHOLESALE' ? '#0284c7' : '#0369a1',
            }}
          >
            📦 Wholesale ({wholesaleCount})
          </button>
          <button
            type="button"
            className={pricingFilter === 'RETAIL_ONLY' ? 'chosen' : ''}
            onClick={() => setPricingFilter('RETAIL_ONLY')}
            style={{ padding: '8px 14px', fontSize: '13px' }}
          >
            🛍️ Retail Only ({retailOnlyCount})
          </button>
        </div>
      </div>

      <section className="price-table">
        <div className="price-row table-head">
          <span style={{ maxWidth: '85px', flex: '0 0 85px' }}>Code</span>
          <span>Product</span>
          <span>Retail</span>
          <span>Wholesale</span>
          <span style={{ maxWidth: '95px', flex: '0 0 95px' }}>Min Qty</span>
          <span>Stock</span>
          <span>Action</span>
        </div>
        {list.map(item => {
          const effectiveRetail = item.retailPrice !== undefined && item.retailPrice !== null ? item.retailPrice : item.sellingPrice
          return (
            <div className="price-row" key={item.id}>
              <span style={{ maxWidth: '85px', flex: '0 0 85px' }}>
                <span className="product-code-pill">#{item.code || '---'}</span>
              </span>
              <span>
                <b>{item.name}</b>
                <small>{item.barcode ? `Barcode: ${item.barcode}` : 'No barcode'} · {item.category}</small>
                {item.promotionEnabled && (
                  <div style={{ marginTop: '4px' }}>
                    {isPromotionActive(item) ? (
                      <span className="product-promo-badge active">
                        🎁 BUY {item.promotionBuyQuantity || 2} GET {item.promotionFreeQuantity || 1} FREE
                      </span>
                    ) : (
                      <span className="product-promo-badge inactive">
                        ⏸️ {getPromotionStatus(item).toUpperCase()}: BUY {item.promotionBuyQuantity || 2} GET {item.promotionFreeQuantity || 1} FREE
                      </span>
                    )}
                  </div>
                )}
              </span>
              <span>
                {item.discountPrice && item.discountPrice > 0 && item.discountPrice < effectiveRetail ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span style={{ textDecoration: 'line-through', color: '#8b9aa7', fontSize: '11px' }}>
                      {formatMoney(effectiveRetail)}
                    </span>
                    <b style={{ color: '#4ade80' }}>
                      {formatMoney(item.discountPrice)}
                    </b>
                    <small style={{ color: '#22c55e', fontSize: '10px', fontWeight: 700 }}>
                      Save {formatMoney(effectiveRetail - item.discountPrice)}
                    </small>
                  </div>
                ) : (
                  <b>{formatMoney(effectiveRetail)}</b>
                )}
              </span>
              <span>
                {item.wholesaleEnabled && item.wholesalePrice !== null && item.wholesalePrice !== undefined && Number(item.wholesalePrice) > 0 ? (
                  <b style={{ color: '#38bdf8' }}>{formatMoney(Number(item.wholesalePrice))}</b>
                ) : (
                  <span style={{ color: '#64748b' }}>—</span>
                )}
              </span>
              <span style={{ maxWidth: '95px', flex: '0 0 95px' }}>
                {item.wholesaleEnabled && item.wholesaleMinQuantity ? (
                  <span className="wholesale-min-pill" style={{ background: '#0f172a', padding: '2px 8px', borderRadius: '4px', border: '1px solid #334155', fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
                    {item.wholesaleMinQuantity}
                  </span>
                ) : (
                  <span style={{ color: '#64748b' }}>—</span>
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
          )
        })}
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
    const retPrice = Number(product.retailPrice !== undefined && product.retailPrice !== null ? product.retailPrice : product.sellingPrice)
    if (
      !product.name.trim() ||
      retPrice < 0 ||
      product.costPrice < 0 ||
      product.stockQuantity < 0
    ) {
      return setError('Complete valid product details.')
    }

    if (product.wholesaleEnabled) {
      const wsPrice = Number(product.wholesalePrice)
      const wsMin = Number(product.wholesaleMinQuantity)
      if (isNaN(wsPrice) || wsPrice <= 0) {
        return setError('Wholesale price must be greater than 0.')
      }
      if (isNaN(wsMin) || wsMin <= 0) {
        return setError('Wholesale minimum quantity must be greater than 0.')
      }
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
    if (discNum !== null && discNum >= retPrice) {
      return setError('Discount price must be less than the regular retail price.')
    }

    if (product.promotionEnabled) {
      const buyQty = Number(product.promotionBuyQuantity || 0)
      const freeQty = Number(product.promotionFreeQuantity || 0)
      if (buyQty < 1) {
        return setError('Promotion Buy quantity must be at least 1.')
      }
      if (freeQty < 1) {
        return setError('Promotion Free quantity must be at least 1.')
      }
      if (product.promotionStartDate && product.promotionEndDate && product.promotionStartDate > product.promotionEndDate) {
        return setError('Promotion End Date cannot be earlier than Start Date.')
      }
    }

    save(
      {
        code: codeVal,
        name: product.name,
        category: product.category,
        barcode: product.barcode,
        costPrice: Number(product.costPrice),
        sellingPrice: retPrice,
        retailPrice: retPrice,
        wholesaleEnabled: Boolean(product.wholesaleEnabled),
        wholesalePrice: product.wholesaleEnabled && product.wholesalePrice != null ? Number(product.wholesalePrice) : null,
        wholesaleMinQuantity: product.wholesaleEnabled && product.wholesaleMinQuantity != null ? Math.max(1, Math.floor(Number(product.wholesaleMinQuantity))) : null,
        discountPrice: discNum,
        stockQuantity: Number(product.stockQuantity),
        lowStockLevel: Number(product.lowStockLevel),
        unit: product.unit,
        active: product.active,
        promotionEnabled: Boolean(product.promotionEnabled),
        promotionType: product.promotionType || 'BUY_X_GET_Y_FREE',
        promotionBuyQuantity: product.promotionBuyQuantity ? Math.max(1, Math.floor(Number(product.promotionBuyQuantity))) : 2,
        promotionFreeQuantity: product.promotionFreeQuantity ? Math.max(1, Math.floor(Number(product.promotionFreeQuantity))) : 1,
        promotionStartDate: product.promotionStartDate ? product.promotionStartDate.trim() : null,
        promotionEndDate: product.promotionEndDate ? product.promotionEndDate.trim() : null,
        promotionActive: product.promotionActive ?? true,
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
          <label>
            RETAIL PRICE (RS.)
            <input
              type="number"
              min="0"
              step="0.01"
              value={product.retailPrice !== undefined && product.retailPrice !== null ? product.retailPrice : (product.sellingPrice || '')}
              onChange={e => {
                const val = e.target.value === '' ? 0 : Number(e.target.value)
                setProduct({
                  ...product,
                  retailPrice: val,
                  sellingPrice: val,
                })
              }}
              placeholder="e.g. 100"
              required
            />
          </label>

          {/* WHOLESALE PRICING CONFIGURATION */}
          <div className={`promo-config-card ${product.wholesaleEnabled ? 'enabled' : ''}`} style={{ gridColumn: '1 / -1' }}>
            <div className="promo-card-header">
              <div className="promo-header-info">
                <span className="promo-badge-tag" style={{ background: '#0284c7', color: '#fff' }}>WHOLESALE PRICING</span>
                <div className="promo-card-title">📦 Wholesale Selling Rules</div>
                <p className="promo-card-desc">Configure wholesale unit price and minimum quantity threshold for bulk sales</p>
              </div>
              <label className="promo-switch-label">
                <input
                  type="checkbox"
                  checked={Boolean(product.wholesaleEnabled)}
                  onChange={e =>
                    setProduct({
                      ...product,
                      wholesaleEnabled: e.target.checked,
                      wholesalePrice: e.target.checked ? (product.wholesalePrice || null) : product.wholesalePrice,
                      wholesaleMinQuantity: e.target.checked ? (product.wholesaleMinQuantity || 12) : product.wholesaleMinQuantity,
                    })
                  }
                />
                <span>{product.wholesaleEnabled ? 'Wholesale ON' : 'Wholesale OFF'}</span>
              </label>
            </div>

            {product.wholesaleEnabled && (
              <div className="promo-card-body">
                <div className="promo-input-row">
                  <label>
                    WHOLESALE PRICE (RS.)
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={product.wholesalePrice ?? ''}
                      onChange={e =>
                        setProduct({
                          ...product,
                          wholesalePrice: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      placeholder="e.g. 85"
                      required={Boolean(product.wholesaleEnabled)}
                    />
                  </label>
                  <label>
                    WHOLESALE MINIMUM QUANTITY
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={product.wholesaleMinQuantity ?? ''}
                      onChange={e =>
                        setProduct({
                          ...product,
                          wholesaleMinQuantity: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10)),
                        })
                      }
                      placeholder="e.g. 12"
                      required={Boolean(product.wholesaleEnabled)}
                    />
                  </label>
                </div>

                {product.wholesalePrice !== null &&
                  product.wholesalePrice !== undefined &&
                  Number(product.wholesalePrice) > 0 &&
                  Number(product.retailPrice ?? product.sellingPrice) > 0 &&
                  Number(product.wholesalePrice) >= Number(product.retailPrice ?? product.sellingPrice) && (
                    <div style={{ background: '#451a03', border: '1px solid #b45309', padding: '10px 14px', borderRadius: '6px', color: '#fef08a', fontSize: '12px', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>⚠️</span>
                      <span>Wholesale price is not lower than retail price. Please confirm.</span>
                    </div>
                  )}
              </div>
            )}
          </div>
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

          {/* PROMOTION CONFIGURATION */}
          <div className={`promo-config-card ${product.promotionEnabled ? 'enabled' : ''}`}>
            <div className="promo-card-header">
              <div className="promo-header-info">
                <span className="promo-badge-tag">PROMOTIONAL OFFER</span>
                <div className="promo-card-title">🎁 Buy X Get Y Free Promotion</div>
                <p className="promo-card-desc">Configure promotional buy-and-get-free rules for POS billing</p>
              </div>
              <label className="promo-switch-label">
                <input
                  type="checkbox"
                  checked={Boolean(product.promotionEnabled)}
                  onChange={e =>
                    setProduct({
                      ...product,
                      promotionEnabled: e.target.checked,
                      promotionBuyQuantity: product.promotionBuyQuantity || 2,
                      promotionFreeQuantity: product.promotionFreeQuantity || 1,
                      promotionActive: e.target.checked ? (product.promotionActive ?? true) : product.promotionActive,
                    })
                  }
                />
                <span>Enable Promotion</span>
              </label>
            </div>

            {product.promotionEnabled && (
              <div className="promo-card-body">
                <div className="promo-input-group">
                  <label>
                    PROMOTION TYPE
                    <select
                      value={product.promotionType || 'BUY_X_GET_Y_FREE'}
                      onChange={e => setProduct({ ...product, promotionType: e.target.value })}
                    >
                      <option value="BUY_X_GET_Y_FREE">Buy X Get Y Free (e.g. Buy 2 Get 1 Free)</option>
                    </select>
                  </label>
                </div>

                <div className="promo-input-row">
                  <label>
                    BUY QUANTITY (X)
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={product.promotionBuyQuantity ?? 2}
                      onChange={e => setProduct({ ...product, promotionBuyQuantity: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                      placeholder="e.g. 2"
                      required={Boolean(product.promotionEnabled)}
                    />
                  </label>
                  <label>
                    GET FREE QUANTITY (Y)
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={product.promotionFreeQuantity ?? 1}
                      onChange={e => setProduct({ ...product, promotionFreeQuantity: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                      placeholder="e.g. 1"
                      required={Boolean(product.promotionEnabled)}
                    />
                  </label>
                </div>

                <div className="promo-input-row">
                  <label>
                    START DATE (OPTIONAL)
                    <input
                      type="date"
                      value={product.promotionStartDate || ''}
                      onChange={e => setProduct({ ...product, promotionStartDate: e.target.value || null })}
                    />
                  </label>
                  <label>
                    END DATE (OPTIONAL)
                    <input
                      type="date"
                      value={product.promotionEndDate || ''}
                      onChange={e => setProduct({ ...product, promotionEndDate: e.target.value || null })}
                    />
                  </label>
                </div>

                <div className="promo-status-row">
                  <div className="status-label-group">
                    <span className="status-title">Promotion Active</span>
                    <span className="status-sub">Toggle whether this promotion should be immediately active in POS</span>
                  </div>
                  <label className="status-pill-toggle">
                    <input
                      type="checkbox"
                      checked={product.promotionActive ?? true}
                      onChange={e => setProduct({ ...product, promotionActive: e.target.checked })}
                    />
                    <span className={`status-pill ${product.promotionActive ?? true ? 'active' : 'inactive'}`}>
                      {product.promotionActive ?? true ? '● Active' : '○ Paused'}
                    </span>
                  </label>
                </div>

                <div className="promo-preview-banner">
                  <span className="preview-sparkle">✨</span>
                  <div className="preview-text">
                    <strong>Buy {product.promotionBuyQuantity || 2} → Get {product.promotionFreeQuantity || 1} Free</strong>
                    <p>Customer pays for {product.promotionBuyQuantity || 2}, receives {(product.promotionBuyQuantity || 2) + (product.promotionFreeQuantity || 1)} items. Stock reduces by {(product.promotionBuyQuantity || 2) + (product.promotionFreeQuantity || 1)}.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <p className="validation" style={{ gridColumn: '1 / -1' }}>{error}</p>}
        </div>
        <footer>
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
