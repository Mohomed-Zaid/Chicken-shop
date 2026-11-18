import { useState } from 'react'
import { useSubscription } from '../context/SubscriptionContext'
import { useAuth } from '../context/AuthContext'

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return 'N/A'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

export function SubscriptionBanner() {
  const { isActive, status, daysRemaining, renew, reactivate, startDate, expiryDate } = useSubscription()
  const { isAdmin, profile } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const [renewing, setRenewing] = useState(false)

  const isSuperAdmin = profile?.email?.trim().toLowerCase() === 'zaidn2848@gmail.com'

  if (!isSuperAdmin || dismissed || (isActive && daysRemaining > 7)) {
    return null
  }

  const message =
    status === 'suspended'
      ? 'Store license is currently SUSPENDED (other accounts are locked out).'
      : !isActive || daysRemaining <= 0
      ? 'Store 30-day subscription has EXPIRED (other accounts are locked out). Renew to restore store access.'
      : daysRemaining === 1
      ? 'Your 30-day subscription expires tomorrow.'
      : `Your 30-day subscription expires in ${daysRemaining} days.`

  const handleRenew = async () => {
    setRenewing(true)
    try {
      if (status === 'suspended') {
        await reactivate()
      } else {
        await renew(30)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Renewal failed')
    } finally {
      setRenewing(false)
    }
  }

  return (
    <div className={`subscription-warning-banner no-print ${!isActive || daysRemaining <= 2 ? 'urgent' : ''}`}>
      <div className="banner-content">
        <span className="banner-icon">{!isActive ? '🔒' : '⚠️'}</span>
        <div className="banner-text-group">
          <span className="banner-text">{message}</span>
          <span className="banner-dates">
            Subscription Period: <strong>{formatDate(startDate)}</strong> — <strong>{formatDate(expiryDate)}</strong>
          </span>
        </div>
      </div>
      <div className="banner-actions">
        {(isAdmin || isSuperAdmin) && (
          <button className="banner-renew-btn" onClick={handleRenew} disabled={renewing}>
            {renewing ? 'Processing...' : status === 'suspended' ? 'Reactivate License' : '⚡ Renew 30 Days'}
          </button>
        )}
        <button className="banner-close-btn" onClick={() => setDismissed(true)} title="Dismiss notice for now">
          ×
        </button>
      </div>
    </div>
  )
}
