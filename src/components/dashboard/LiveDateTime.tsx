import { useEffect, useState } from 'react'
import { useSubscription } from '../../context/SubscriptionContext'
import { useAuth } from '../../context/AuthContext'

export function LiveDateTime() {
  const [now, setNow] = useState<Date>(() => new Date())
  const { status, daysRemaining, isActive } = useSubscription()
  const { profile } = useAuth()

  const isSuperAdmin = profile?.email?.trim().toLowerCase() === 'zaidn2848@gmail.com'

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Greeting based on current hour
  const hour = now.getHours()
  const greeting =
    hour >= 5 && hour < 12
      ? 'Good Morning'
      : hour >= 12 && hour < 17
      ? 'Good Afternoon'
      : hour >= 17 && hour < 22
      ? 'Good Evening'
      : 'Good Night'

  // Format Date: "Monday, September 15, 2026"
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now)

  // Format 12-Hour Time with leading zeros: "06:48:32 PM"
  const hours12 = now.getHours() % 12 || 12
  const paddedHours = String(hours12).padStart(2, '0')
  const paddedMinutes = String(now.getMinutes()).padStart(2, '0')
  const paddedSeconds = String(now.getSeconds()).padStart(2, '0')
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM'
  const formattedTime = `${paddedHours}:${paddedMinutes}:${paddedSeconds} ${ampm}`

  // Timezone identifier
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Colombo'

  return (
    <div className="dashboard-live-clock-card">
      <div className="clock-left-section">
        <div className="clock-greeting-row">
          <span className="live-pulsing-dot" title="Live Clock Active" />
          <span className="greeting-text">{greeting}</span>
          <span className="timezone-tag">{timeZone}</span>
        </div>
        <div className="clock-date-text">{formattedDate}</div>
      </div>

      <div className="clock-right-section">
        <div className="clock-time-display">
          <span className="clock-icon">🕒</span>
          <span className="time-digits">{formattedTime}</span>
        </div>

        {/* Subscription Status Tag - Visible ONLY for zaidn2848@gmail.com */}
        {isSuperAdmin && (
          <div className="clock-license-pill">
            <span className={`pill-badge ${status}`}>
              {isActive ? 'ACTIVE LICENSE' : status.toUpperCase()}
            </span>
            <span className="pill-subtext">
              {status === 'expired'
                ? 'Expired'
                : `${daysRemaining} ${daysRemaining === 1 ? 'Day' : 'Days'} Remaining`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
