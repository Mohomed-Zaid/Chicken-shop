import { useState, type FormEvent } from 'react'
import { useSubscription } from '../context/SubscriptionContext'
import { useAuth } from '../context/AuthContext'

export function SubscriptionLock() {
  const { subscription, isSuspended, isUnverified, expiryDate, error, renew, reactivate, activate, checkSubscription } = useSubscription()
  const { signOut, profile } = useAuth()
  const isSuperAdmin = profile?.email?.trim().toLowerCase() === 'zaidn2848@gmail.com'
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [showContactModal, setShowContactModal] = useState(false)
  const [durationDays, setDurationDays] = useState(30)
  const [businessName, setBusinessName] = useState(subscription?.business_name || 'Chicken Kade & Grocery')
  const [actionError, setActionError] = useState('')
  const [processing, setProcessing] = useState(false)

  const formatExpiry = (isoString?: string | null) => {
    if (!isoString) return 'Not available'
    try {
      const d = new Date(isoString)
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return isoString
    }
  }

  const handleQuickRenew = async () => {
    setProcessing(true)
    setActionError('')
    try {
      if (isSuspended) {
        await reactivate()
      } else {
        await renew(30)
      }
      setShowAdminModal(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Renewal failed')
    } finally {
      setProcessing(false)
    }
  }

  const handleCustomActivate = async (e: FormEvent) => {
    e.preventDefault()
    setProcessing(true)
    setActionError('')
    try {
      await activate({
        businessName,
        plan: '30_days',
        durationDays: Number(durationDays) || 30,
      })
      setShowAdminModal(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Activation failed')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="subscription-lock-screen">
      <div className="subscription-lock-card">
        <div className="lock-icon-wrapper">
          {isSuspended ? (
            <span className="lock-icon warn">⊘</span>
          ) : isUnverified ? (
            <span className="lock-icon info">⚠</span>
          ) : (
            <span className="lock-icon danger">🔒</span>
          )}
        </div>

        <div className="lock-badge">
          {isSuspended ? 'LICENSE SUSPENDED' : isUnverified ? 'CONNECTION REQUIRED' : 'SUBSCRIPTION EXPIRED'}
        </div>

        <h1>
          {isSuspended
            ? 'Subscription Suspended'
            : isUnverified
            ? 'Unable to Verify Subscription'
            : 'Subscription Expired'}
        </h1>

        <p className="lock-description">
          {isSuspended
            ? 'The POS license for this business has been temporarily suspended.'
            : isUnverified
            ? 'The system cannot verify your active 30-day license with the server. Business functions are paused until the server connection is restored.'
            : 'Your 30-day business POS license period has ended. Access to billing, inventory, and reports is locked.'}
        </p>

        {expiryDate && !isUnverified && (
          <div className="lock-details-box">
            <div className="lock-detail-row">
              <span>Business:</span>
              <b>{subscription?.business_name || 'Chicken Kade & Grocery'}</b>
            </div>
            <div className="lock-detail-row">
              <span>Plan:</span>
              <b>30 Days Commercial License</b>
            </div>
            <div className="lock-detail-row">
              <span>Expiry Date:</span>
              <b className="expiry-highlight">{formatExpiry(expiryDate)}</b>
            </div>
            {subscription?.server_time && (
              <div className="lock-detail-row">
                <span>Server Time:</span>
                <small>{formatExpiry(subscription.server_time)}</small>
              </div>
            )}
          </div>
        )}

        {error && isUnverified && (
          <div className="validation" style={{ marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <div className="lock-instructions">
          Please renew your subscription to continue using this system.
        </div>

        <div className="lock-actions">
          {isUnverified ? (
            <button className="confirm btn-lock-primary" onClick={() => checkSubscription()} disabled={processing}>
              {processing ? 'Checking...' : 'Retry Server Verification'}
            </button>
          ) : isSuperAdmin ? (
            <button className="confirm btn-lock-primary" onClick={() => setShowAdminModal(true)} disabled={processing}>
              {processing ? 'Processing...' : 'Renew Subscription (Admin)'}
            </button>
          ) : (
            <button className="confirm btn-lock-primary" onClick={() => setShowContactModal(true)}>
              Contact Owner (zaidn2848@gmail.com)
            </button>
          )}

          <button className="btn-lock-secondary" onClick={() => setShowContactModal(true)}>
            Contact ZTECH SOLUTIONS
          </button>
        </div>

        <div className="lock-footer">
          <span>Signed in as <b>{profile?.full_name || 'User'}</b> ({profile?.role || 'Guest'})</span>
          <button className="lock-signout-link" onClick={() => signOut()}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Contact ZTECH Modal */}
      {showContactModal && (
        <div className="shade">
          <div className="dialog custom-dialog" style={{ maxWidth: '440px' }}>
            <header>
              <div>
                <small>OFFICIAL SUPPORT</small>
                <h2>ZTECH SOLUTIONS</h2>
              </div>
              <button type="button" onClick={() => setShowContactModal(false)}>×</button>
            </header>
            <div className="editor-body">
              <p style={{ color: '#c9d1d9', fontSize: '14px', lineHeight: '1.6' }}>
                To renew your 30-day POS license, obtain an activation code, or receive technical support, please contact our support desk:
              </p>
              <div className="support-contact-list">
                <div className="contact-item">
                  <span className="contact-label">Provider:</span>
                  <strong>ZTECH SOLUTIONS (PVT) LTD</strong>
                </div>
                <div className="contact-item">
                  <span className="contact-label">Hotline:</span>
                  <strong>+94 77 123 4567 / +94 11 234 5678</strong>
                </div>
                <div className="contact-item">
                  <span className="contact-label">Email:</span>
                  <strong>support@ztechsolutions.lk</strong>
                </div>
                <div className="contact-item">
                  <span className="contact-label">Working Hours:</span>
                  <strong>Mon - Sun: 8:00 AM - 10:00 PM</strong>
                </div>
              </div>
            </div>
            <footer>
              <button type="button" onClick={() => setShowContactModal(false)}>Close</button>
            </footer>
          </div>
        </div>
      )}

      {/* Admin Renewal / License Activation Modal */}
      {showAdminModal && (
        <div className="shade">
          <form className="dialog custom-dialog" onSubmit={handleCustomActivate} style={{ maxWidth: '480px' }}>
            <header>
              <div>
                <small>ADMINISTRATOR LICENSE CONTROL</small>
                <h2>Renew 30-Day POS License</h2>
              </div>
              <button type="button" onClick={() => setShowAdminModal(false)} disabled={processing}>×</button>
            </header>
            <div className="editor-body">
              <p style={{ fontSize: '13px', color: '#8b9aa7', marginBottom: '14px' }}>
                Active subscriptions extend by 30 days from the current expiry date. Expired subscriptions renew for 30 days starting from now.
              </p>

              <label>
                BUSINESS NAME
                <input
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  disabled={processing}
                  required
                />
              </label>

              <label>
                LICENSE PLAN
                <input value="30 Days Standard Business POS" disabled readOnly />
              </label>

              <label>
                DURATION (DAYS)
                <select
                  value={durationDays}
                  onChange={e => setDurationDays(Number(e.target.value))}
                  disabled={processing}
                >
                  <option value={30}>30 Days (Standard 1 Month)</option>
                  <option value={60}>60 Days (2 Months)</option>
                  <option value={90}>90 Days (3 Months)</option>
                </select>
              </label>

              {actionError && <p className="validation">{actionError}</p>}
            </div>
            <footer>
              <button type="button" onClick={() => setShowAdminModal(false)} disabled={processing}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-lock-secondary"
                onClick={handleQuickRenew}
                disabled={processing}
              >
                {processing ? 'Processing...' : 'Quick 30-Day Renewal'}
              </button>
              <button className="confirm" type="submit" disabled={processing}>
                {processing ? 'Activating...' : 'Activate License'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  )
}
