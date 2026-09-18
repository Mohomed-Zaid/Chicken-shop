import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import {
  getCurrentSubscription,
  activateSubscription,
  renewSubscription,
  suspendSubscription,
  reactivateSubscription,
  getSubscriptionHistory,
  type SubscriptionData,
  type SubscriptionHistoryEntry,
  type SubscriptionStatus,
} from '../services/subscriptionService'

interface SubscriptionContextValue {
  subscription: SubscriptionData | null
  loading: boolean
  status: SubscriptionStatus
  isActive: boolean
  isExpired: boolean
  isSuspended: boolean
  isUnverified: boolean
  daysRemaining: number
  startDate: string | null
  expiryDate: string | null
  error: string | null
  history: SubscriptionHistoryEntry[]
  checkSubscription: (silent?: boolean) => Promise<SubscriptionData>
  activate: (params?: { businessName?: string; plan?: string; durationDays?: number }) => Promise<void>
  renew: (durationDays?: number) => Promise<void>
  suspend: () => Promise<void>
  reactivate: () => Promise<void>
  loadHistory: () => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null)

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<SubscriptionHistoryEntry[]>([])

  const fetchStatus = useCallback(async (silent = true): Promise<SubscriptionData> => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getCurrentSubscription()
      setSubscription(data)
      if (data.effective_status === 'unverified') {
        setError('Unable to verify subscription with server.')
      }
      return data
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Subscription check failed.'
      setError(msg)
      const fallback: SubscriptionData = {
        id: '',
        business_id: 'default-business',
        business_name: 'Chicken Kade & Grocery',
        plan: '30_days',
        start_date: '',
        expiry_date: '',
        stored_status: 'unknown',
        effective_status: 'unverified',
        is_active: false,
        server_time: '',
        days_remaining: 0,
        seconds_remaining: 0,
      }
      setSubscription(fallback)
      return fallback
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const logs = await getSubscriptionHistory()
      setHistory(logs)
    } catch (err) {
      console.error('Failed to load subscription history:', err)
    }
  }, [])

  // Initial load only on mount
  useEffect(() => {
    let mounted = true
    fetchStatus(false).then(() => {
      if (mounted) loadHistory()
    })

    return () => {
      mounted = false
    }
  }, [fetchStatus, loadHistory])

  // Periodic interval check every 5 minutes (silent)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus(true)
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [fetchStatus])

  // Re-verify on window focus or visibility change (silent)
  useEffect(() => {
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchStatus(true)
      }
    }

    window.addEventListener('focus', handleFocusOrVisible)
    document.addEventListener('visibilitychange', handleFocusOrVisible)

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible)
      document.removeEventListener('visibilitychange', handleFocusOrVisible)
    }
  }, [fetchStatus])

  const activate = useCallback(async (params?: { businessName?: string; plan?: string; durationDays?: number }) => {
    setError(null)
    try {
      const updated = await activateSubscription(params)
      setSubscription(updated)
      await loadHistory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to activate subscription'
      setError(msg)
      throw err
    }
  }, [loadHistory])

  const renew = useCallback(async (durationDays = 30) => {
    setError(null)
    try {
      const updated = await renewSubscription({ durationDays })
      setSubscription(updated)
      await loadHistory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to renew subscription'
      setError(msg)
      throw err
    }
  }, [loadHistory])

  const suspend = useCallback(async () => {
    setError(null)
    try {
      const updated = await suspendSubscription()
      setSubscription(updated)
      await loadHistory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to suspend subscription'
      setError(msg)
      throw err
    }
  }, [loadHistory])

  const reactivate = useCallback(async () => {
    setError(null)
    try {
      const updated = await reactivateSubscription()
      setSubscription(updated)
      await loadHistory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reactivate subscription'
      setError(msg)
      throw err
    }
  }, [loadHistory])

  const status: SubscriptionStatus = subscription?.effective_status || 'unverified'
  const isActive = status === 'active' && Boolean(subscription?.is_active)
  const isExpired = status === 'expired'
  const isSuspended = status === 'suspended'
  const isUnverified = status === 'unverified'
  const daysRemaining = subscription?.days_remaining ?? 0
  const startDate = subscription?.start_date || null
  const expiryDate = subscription?.expiry_date || null

  const value: SubscriptionContextValue = useMemo(() => ({
    subscription,
    loading,
    status,
    isActive,
    isExpired,
    isSuspended,
    isUnverified,
    daysRemaining,
    startDate,
    expiryDate,
    error,
    history,
    checkSubscription: (silent = true) => fetchStatus(silent),
    activate,
    renew,
    suspend,
    reactivate,
    loadHistory,
  }), [
    subscription,
    loading,
    status,
    isActive,
    isExpired,
    isSuspended,
    isUnverified,
    daysRemaining,
    startDate,
    expiryDate,
    error,
    history,
    fetchStatus,
    activate,
    renew,
    suspend,
    reactivate,
    loadHistory,
  ])

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
}

export function useSubscription() {
  const context = useContext(SubscriptionContext)
  if (!context) throw new Error('useSubscription must be used within SubscriptionProvider')
  return context
}
