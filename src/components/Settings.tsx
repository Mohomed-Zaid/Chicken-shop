import { useEffect, useState, type FormEvent } from 'react'
import { useSubscription } from '../context/SubscriptionContext'
import { useAuth } from '../context/AuthContext'
import { getBusinessSettings, saveBusinessSettings, type BusinessSettingsRow } from '../services/supabase/settingsService'
import { storageAdapter } from '../services/storageAdapter'
import { resetAllDataForRealUse } from '../services/resetService'

export function Settings() {
  const { subscription, status, daysRemaining, expiryDate, history, renew, activate, suspend, reactivate, checkSubscription, loading: subLoading } = useSubscription()
  const { isAdmin, profile } = useAuth()

  const [settings, setSettings] = useState<BusinessSettingsRow>({
    id: 'default',
    business_name: 'Chicken Kade & Grocery',
    address: '123 Main Street, Colombo, Sri Lanka',
    phone: '077 123 4567',
    email: 'info@chickenkade.lk',
    footer_message: 'Thank you for your business! Please come again.',
    show_customer: true,
    show_cashier: true,
    show_payment_method: true,
    auto_print_receipt: false,
  })

  const [saving, setSaving] = useState(false)
  const [saveNotice, setSaveNotice] = useState('')
  const [saveError, setSaveError] = useState('')

  // License Modal State
  const [showLicenseModal, setShowLicenseModal] = useState(false)
  const [modalDuration, setModalDuration] = useState(30)
  const [modalBusinessName, setModalBusinessName] = useState('')
  const [licenseProcessing, setLicenseProcessing] = useState(false)
  const [licenseError, setLicenseError] = useState('')

  // System Reset Modal State
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetConfirmationInput, setResetConfirmationInput] = useState('')
  const [clearProductsOption, setClearProductsOption] = useState(true)
  const [resetProcessing, setResetProcessing] = useState(false)
  const [resetError, setResetError] = useState('')

  useEffect(() => {
    let mounted = true
    if (storageAdapter.isSupabase()) {
      getBusinessSettings()
        .then(rows => {
          if (!mounted) return
          if (rows && rows.length > 0) {
            setSettings(rows[0])
          }
        })
        .catch(err => console.error('Failed to load business settings:', err))
    } else {
      const cached = storageAdapter.readLocal<BusinessSettingsRow | null>('business_settings', null)
      if (cached) setSettings(cached)
    }
    return () => {
      mounted = false
    }
  }, [])

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveNotice('')
    setSaveError('')

    // 1. Always persist locally immediately so POS and thermal receipts update without interruption
    storageAdapter.writeLocal('business_settings', settings)
    try {
      localStorage.setItem('business-settings', JSON.stringify({
        businessName: settings.business_name,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        footerMessage: settings.footer_message,
        autoPrintReceipt: settings.auto_print_receipt,
        showCustomer: settings.show_customer,
        showCashier: settings.show_cashier,
        showPaymentMethod: settings.show_payment_method,
      }))
    } catch {}

    // 2. Sync to Supabase if in online/Supabase mode
    try {
      if (storageAdapter.isSupabase()) {
        await saveBusinessSettings({
          ...settings,
          updated_at: new Date().toISOString(),
        })
      }
      setSaveNotice('Settings saved successfully.')
    } catch (err) {
      console.warn('Supabase settings sync error:', err)
      const msg = err instanceof Error ? err.message : 'Database permission restriction'
      setSaveNotice(`Settings saved locally. Note: Cloud sync pending (${msg}). Please apply migration 009 in Supabase SQL editor.`)
    } finally {
      setSaving(false)
    }
  }

  const handleQuickRenew = async () => {
    if (!window.confirm('Renew subscription for 30 days?')) return
    setLicenseProcessing(true)
    try {
      await renew(30)
      setSaveNotice('Subscription successfully renewed for 30 days.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Renewal failed.')
    } finally {
      setLicenseProcessing(false)
    }
  }

  const handleModalActivate = async (e: FormEvent) => {
    e.preventDefault()
    setLicenseProcessing(true)
    setLicenseError('')
    try {
      await activate({
        businessName: modalBusinessName || subscription?.business_name,
        plan: '30_days',
        durationDays: Number(modalDuration) || 30,
      })
      setShowLicenseModal(false)
      setSaveNotice('License activated successfully.')
    } catch (err) {
      setLicenseError(err instanceof Error ? err.message : 'Failed to activate license.')
    } finally {
      setLicenseProcessing(false)
    }
  }

  const handleExecuteReset = async () => {
    if (resetConfirmationInput !== 'RESET') return
    setResetProcessing(true)
    setResetError('')
    try {
      const result = await resetAllDataForRealUse({ clearProducts: clearProductsOption })
      setShowResetModal(false)
      setSaveNotice(result.message)
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Reset failed.')
    } finally {
      setResetProcessing(false)
    }
  }

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const isSuperAdmin = profile?.email?.trim().toLowerCase() === 'zaidn2848@gmail.com'

  return (
    <section className="settings-page">
      <header className="page-header">
        <div>
          <small>CONFIGURATION</small>
          <h2>Store {isSuperAdmin ? '& License ' : ''}Settings</h2>
        </div>
        {saveNotice && <div className="pos-notice" style={{ margin: 0 }}>{saveNotice}</div>}
        {saveError && <div className="validation" style={{ margin: 0 }}>{saveError}</div>}
      </header>

      <div className="settings-grid" style={!isSuperAdmin ? { gridTemplateColumns: '1fr', maxWidth: '800px' } : undefined}>
        {/* SUBSCRIPTION & LICENSE PANEL - VISIBLE ONLY FOR zaidn2848@gmail.com */}
        {isSuperAdmin && (
          <section className="settings-card subscription-panel">
            <div className="card-header">
              <div>
                <small>LICENSE MANAGEMENT</small>
                <h3>30-Day Subscription Status</h3>
              </div>
              <div className={`status-pill ${status}`}>
                <span className="dot" />
                {status.toUpperCase()}
              </div>
            </div>

            <div className="subscription-summary-box">
              <div className="stat-grid">
                <div className="stat-item">
                  <span className="stat-label">CURRENT PLAN</span>
                  <strong className="stat-value">{subscription?.plan === '30_days' ? '30 Days POS License' : subscription?.plan || '30 Days'}</strong>
                </div>
                <div className="stat-item">
                  <span className="stat-label">DAYS REMAINING</span>
                  <strong className={`stat-value ${daysRemaining <= 7 ? 'warn' : ''}`}>
                    {status === 'expired' ? 'Expired' : `${daysRemaining} Days`}
                  </strong>
                </div>
                <div className="stat-item">
                  <span className="stat-label">START DATE</span>
                  <span className="stat-subvalue">{formatDate(subscription?.start_date)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">END DATE (EXPIRY)</span>
                  <span className="stat-subvalue highlight">{formatDate(expiryDate)}</span>
                </div>
              </div>

              <div className="server-time-note">
                <span>Authoritative Server Time:</span>
                <code>{formatDate(subscription?.server_time)}</code>
                <button
                  type="button"
                  className="btn-text-action"
                  onClick={() => checkSubscription()}
                  disabled={subLoading}
                >
                  {subLoading ? 'Verifying...' : '🔄 Verify Now'}
                </button>
              </div>
            </div>

            {isAdmin && (
              <div className="subscription-admin-actions">
                <button
                  type="button"
                  className="confirm"
                  onClick={handleQuickRenew}
                  disabled={licenseProcessing}
                >
                  {licenseProcessing ? 'Processing...' : '➕ Renew 30 Days'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setModalBusinessName(subscription?.business_name || settings.business_name || '')
                    setModalDuration(30)
                    setShowLicenseModal(true)
                  }}
                >
                  ⚙️ License Manager
                </button>
                {status === 'suspended' ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => reactivate()}
                    disabled={licenseProcessing}
                  >
                    ✓ Reactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    className="secondary danger"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to suspend this subscription?')) {
                        suspend()
                      }
                    }}
                    disabled={licenseProcessing}
                  >
                    ⊘ Suspend License
                  </button>
                )}
              </div>
            )}

            {/* AUDIT LOGS */}
            <div className="subscription-history-section">
              <h4>Subscription Audit History</h4>
              {history.length > 0 ? (
                <div className="history-table-wrapper">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Action</th>
                        <th>Old Expiry</th>
                        <th>New Expiry</th>
                        <th>Admin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(item => (
                        <tr key={item.id}>
                          <td>{formatDate(item.created_at)}</td>
                          <td>
                            <span className={`badge-action ${item.action}`}>{item.action}</span>
                          </td>
                          <td>{formatDate(item.old_expiry_date)}</td>
                          <td><b>{formatDate(item.new_expiry_date)}</b></td>
                          <td><small>{item.performed_by || 'system'}</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-subtext">No historical renewal records found.</p>
              )}
            </div>
          </section>
        )}

        {/* STORE & RECEIPT SETTINGS FORM */}
        <section className="settings-card store-profile-panel">
          <div className="card-header">
            <div>
              <small>STORE DETAILS</small>
              <h3>Business & Receipt Information</h3>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="settings-form">
            <label>
              BUSINESS NAME
              <input
                value={settings.business_name || ''}
                onChange={e => setSettings({ ...settings, business_name: e.target.value })}
                placeholder="e.g. Chicken Kade & Grocery"
                required
              />
            </label>

            <div className="form-row-2">
              <label>
                PHONE NUMBER
                <input
                  value={settings.phone || ''}
                  onChange={e => setSettings({ ...settings, phone: e.target.value })}
                  placeholder="e.g. 077 123 4567"
                />
              </label>

              <label>
                EMAIL ADDRESS
                <input
                  value={settings.email || ''}
                  onChange={e => setSettings({ ...settings, email: e.target.value })}
                  placeholder="e.g. shop@example.com"
                />
              </label>
            </div>

            <label>
              STORE ADDRESS
              <input
                value={settings.address || ''}
                onChange={e => setSettings({ ...settings, address: e.target.value })}
                placeholder="e.g. 123 Galle Road, Colombo"
              />
            </label>

            <label>
              RECEIPT FOOTER MESSAGE (SINHALA / ENGLISH)
              <textarea
                rows={2}
                value={settings.footer_message || ''}
                onChange={e => setSettings({ ...settings, footer_message: e.target.value })}
                placeholder="e.g. නැවත පැමිණෙන්න / Thank you for shopping with us!"
              />
            </label>

            <div className="checkbox-options-grid">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.show_cashier}
                  onChange={e => setSettings({ ...settings, show_cashier: e.target.checked })}
                />
                <span>Print Cashier Name on Receipts</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.show_customer}
                  onChange={e => setSettings({ ...settings, show_customer: e.target.checked })}
                />
                <span>Print Customer Info on Receipts</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.show_payment_method}
                  onChange={e => setSettings({ ...settings, show_payment_method: e.target.checked })}
                />
                <span>Show Payment Method (Cash / Card)</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.auto_print_receipt}
                  onChange={e => setSettings({ ...settings, auto_print_receipt: e.target.checked })}
                />
                <span>Auto-Prompt Receipt Print Dialog on Sale</span>
              </label>
            </div>

            <div className="form-actions">
              <button className="confirm" type="submit" disabled={saving}>
                {saving ? 'Saving Settings...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* SYSTEM DATA RESET / PRODUCTION PREPARATION - ADMIN ONLY */}
      {isAdmin && (
        <section
          className="settings-card"
          style={{
            marginTop: '24px',
            maxWidth: isSuperAdmin ? '100%' : '800px',
            borderColor: 'rgba(239, 68, 68, 0.4)',
            background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.05) 0%, rgba(15, 23, 42, 0.4) 100%)',
          }}
        >
          <div className="card-header">
            <div>
              <small style={{ color: '#ef4444', fontWeight: 700 }}>PRODUCTION LAUNCH</small>
              <h3 style={{ margin: '4px 0 0' }}>Clear Test Data for Real Use</h3>
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                padding: '4px 10px',
                borderRadius: '12px',
                fontWeight: 600,
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              ADMINISTRATOR ONLY
            </span>
          </div>

          <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.9rem', lineHeight: '1.6', margin: '14px 0 18px' }}>
            Ready to start live shop operations? Use this tool to wipe test transactions, test customers, held orders, purchases, expenses, and demo products. All invoice and purchase sequences will restart cleanly from <strong>000001</strong>. Your logins, subscription, and store details remain safely intact.
          </p>

          <div>
            <button
              type="button"
              className="confirm"
              style={{
                background: '#dc2626',
                borderColor: '#ef4444',
                color: '#ffffff',
                padding: '10px 18px',
                fontWeight: 600,
                fontSize: '0.92rem',
                cursor: 'pointer',
              }}
              onClick={() => {
                setResetConfirmationInput('')
                setResetError('')
                setShowResetModal(true)
              }}
            >
              🗑️ Clear All Test Data for Real Use
            </button>
          </div>
        </section>
      )}

      {/* Admin License Modal */}
      {showLicenseModal && (
        <div className="shade">
          <form className="dialog custom-dialog" onSubmit={handleModalActivate} style={{ maxWidth: '480px' }}>
            <header>
              <div>
                <small>ADMINISTRATOR LICENSE ACTIVATION</small>
                <h2>Set / Activate Subscription</h2>
              </div>
              <button type="button" onClick={() => setShowLicenseModal(false)}>×</button>
            </header>
            <div className="editor-body">
              <label>
                BUSINESS / TENANT NAME
                <input
                  value={modalBusinessName}
                  onChange={e => setModalBusinessName(e.target.value)}
                  placeholder="Business Name"
                  required
                />
              </label>

              <label>
                LICENSE PLAN
                <select value="30_days" disabled>
                  <option value="30_days">30 Days Standard Plan</option>
                </select>
              </label>

              <label>
                DURATION
                <select value={modalDuration} onChange={e => setModalDuration(Number(e.target.value))}>
                  <option value={30}>30 Days</option>
                  <option value={60}>60 Days (2 Months)</option>
                  <option value={90}>90 Days (3 Months)</option>
                  <option value={365}>365 Days (1 Year)</option>
                </select>
              </label>

              {licenseError && <p className="validation">{licenseError}</p>}
            </div>
            <footer>
              <button type="button" onClick={() => setShowLicenseModal(false)}>
                Cancel
              </button>
              <button className="confirm" type="submit" disabled={licenseProcessing}>
                {licenseProcessing ? 'Saving...' : 'Activate Subscription'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* Admin System Data Reset Confirmation Modal */}
      {showResetModal && (
        <div className="shade">
          <div className="dialog custom-dialog" style={{ maxWidth: '540px' }}>
            <header>
              <div>
                <small style={{ color: '#ef4444', fontWeight: 700 }}>CONFIRM SYSTEM DATA WIPE</small>
                <h2 style={{ margin: '4px 0 0' }}>Reset Data for Production</h2>
              </div>
              <button type="button" onClick={() => !resetProcessing && setShowResetModal(false)}>×</button>
            </header>

            <div className="editor-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                }}
              >
                <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#f87171', fontSize: '0.9rem' }}>
                  ⚠️ This will permanently remove all test data:
                </p>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#cbd5e1', fontSize: '0.84rem', lineHeight: '1.6' }}>
                  <li>All <strong>Sales & Invoices</strong> (Invoice counter resets to <code>INV-000001</code>)</li>
                  <li>All <strong>Held Orders</strong></li>
                  <li>All <strong>Customers & Credit Payments</strong> (Receipt counter resets to <code>PAY-000001</code>)</li>
                  <li>All <strong>Purchases, Suppliers & Supplier Payments</strong> (Counter resets to <code>PUR-000001</code>)</li>
                  <li>All <strong>Inventory movements & adjustments</strong></li>
                  <li>All <strong>Recorded Expenses</strong></li>
                  <li>All <strong>Chicken Price Change History</strong></li>
                </ul>
              </div>

              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                }}
              >
                <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#4ade80', fontSize: '0.9rem' }}>
                  🛡️ Safely preserved (Will NOT be deleted):
                </p>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#cbd5e1', fontSize: '0.84rem', lineHeight: '1.6' }}>
                  <li><strong>User Logins & Accounts</strong> (Admin and Cashier accounts remain active)</li>
                  <li><strong>Subscription & License Status</strong> (Your plan stays valid)</li>
                  <li><strong>Store Details</strong> (Shop name, phone, address, receipt settings)</li>
                  <li><strong>Standard Chicken Cuts</strong> (Fresh Chicken, Breast, Legs, Wings, etc.)</li>
                </ul>
              </div>

              <label
                className="checkbox-label"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  margin: '14px 0',
                  padding: '8px 12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={clearProductsOption}
                  onChange={e => setClearProductsOption(e.target.checked)}
                />
                <span style={{ fontSize: '0.88rem' }}>Also clear grocery products catalog (start with clean 0 products)</span>
              </label>

              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Type <strong style={{ color: '#ef4444' }}>RESET</strong> to confirm:
                </label>
                <input
                  value={resetConfirmationInput}
                  onChange={e => setResetConfirmationInput(e.target.value.toUpperCase())}
                  placeholder="RESET"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  disabled={resetProcessing}
                />
              </div>

              {resetError && <p className="validation" style={{ marginTop: '12px' }}>{resetError}</p>}
            </div>

            <footer>
              <button type="button" onClick={() => setShowResetModal(false)} disabled={resetProcessing}>
                Cancel
              </button>
              <button
                className="confirm"
                style={{ background: '#dc2626', borderColor: '#ef4444' }}
                disabled={resetConfirmationInput !== 'RESET' || resetProcessing}
                onClick={handleExecuteReset}
              >
                {resetProcessing ? 'Resetting Data...' : 'Confirm System Reset'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}
