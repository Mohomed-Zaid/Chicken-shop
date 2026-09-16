import { useState } from 'react'
import { useSubscription } from '../context/SubscriptionContext'
import { useAuth } from '../context/AuthContext'

export function SubscriptionBanner() {
  const { isActive, daysRemaining, renew } = useSubscription()
  const { isAdmin, profile } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const [renewing, setRenewing] = useState(false)

  const isSuperAdmin = profile?.email?.trim().toLowerCase() === 'zaidn2848@gmail.com'

  if (!isSuperAdmin || dismissed || !isActive || daysRemaining > 7) {
    return null
  }

  const message =
    daysRemaining <= 0
      ? 'Your 30-day subscription expires today!'
      : daysRemaining === 1
      ? 'Your 30-day subscription expires tomorrow.'
      : `Your 30-day subscription expires in ${daysRemaining} days.`

  const handleRenew = async () => {
    setRenewing(true)
    try {
      await renew(30)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Renewal failed')
    } finally {
      setRenewing(false)
    }
  }

  return (
    <div className={`subscription-warning-banner ${daysRemaining <= 2 ? 'urgent' : ''}`}>
      <div className="banner-content">
        <span className="banner-icon">⚠️</span>
        <span className="banner-text">{message}</span>
      </div>
      <div className="banner-actions">
        {isAdmin && (
          <button className="banner-renew-btn" onClick={handleRenew} disabled={renewing}>
            {renewing ? 'Renewing...' : 'Renew 30 Days'}
          </button>
        )}
        <button className="banner-close-btn" onClick={() => setDismissed(true)} title="Dismiss notice for now">
          ×
        </button>
      </div>
    </div>
  )
}
