import { supabase, supabaseConfigured } from '../lib/supabase'

export type SubscriptionStatus = 'active' | 'expired' | 'suspended' | 'unverified'

export interface SubscriptionData {
  id: string
  business_id: string
  business_name: string
  plan: string
  start_date: string
  expiry_date: string
  stored_status: string
  effective_status: SubscriptionStatus
  is_active: boolean
  server_time: string
  days_remaining: number
  seconds_remaining: number
  created_at?: string
  updated_at?: string
}

export interface SubscriptionHistoryEntry {
  id: string
  subscription_id: string
  action: 'activated' | 'renewed' | 'suspended' | 'reactivated'
  old_start_date: string | null
  old_expiry_date: string | null
  new_start_date: string | null
  new_expiry_date: string | null
  performed_by: string | null
  created_at: string
}

const DEFAULT_BUSINESS_ID = 'default-business'

// In-memory fallback for local demonstration mode ONLY when Supabase credentials are not present
let localMockSubscription: SubscriptionData | null = null
let localMockHistory: SubscriptionHistoryEntry[] = []

function initLocalMock() {
  if (localMockSubscription) return
  const now = new Date()
  const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const id = `mock-sub-${Date.now()}`
  localMockSubscription = {
    id,
    business_id: DEFAULT_BUSINESS_ID,
    business_name: 'Chicken Kade & Grocery',
    plan: '30_days',
    start_date: now.toISOString(),
    expiry_date: expiry.toISOString(),
    stored_status: 'active',
    effective_status: 'active',
    is_active: true,
    server_time: now.toISOString(),
    days_remaining: 30,
    seconds_remaining: 30 * 86400,
  }
  localMockHistory = [
    {
      id: `hist-${Date.now()}`,
      subscription_id: id,
      action: 'activated',
      old_start_date: null,
      old_expiry_date: null,
      new_start_date: now.toISOString(),
      new_expiry_date: expiry.toISOString(),
      performed_by: 'system-init',
      created_at: now.toISOString(),
    },
  ]
}

/**
 * Authoritative call to fetch current subscription status from Supabase server
 */
export async function getCurrentSubscription(businessId: string = DEFAULT_BUSINESS_ID): Promise<SubscriptionData> {
  if (!supabaseConfigured || !supabase) {
    initLocalMock()
    const now = new Date()
    const expiry = new Date(localMockSubscription!.expiry_date)
    const isExpired = expiry.getTime() <= now.getTime()
    const isSuspended = localMockSubscription!.stored_status === 'suspended'
    const effective_status: SubscriptionStatus = isSuspended ? 'suspended' : isExpired ? 'expired' : 'active'
    const seconds_remaining = Math.max(0, Math.floor((expiry.getTime() - now.getTime()) / 1000))
    const days_remaining = Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (86400 * 1000)))

    localMockSubscription = {
      ...localMockSubscription!,
      effective_status,
      is_active: effective_status === 'active',
      server_time: now.toISOString(),
      days_remaining,
      seconds_remaining,
    }
    return localMockSubscription
  }

  try {
    const { data, error } = await supabase.rpc('get_current_subscription', {
      p_business_id: businessId,
    })

    if (error) {
      console.error('Subscription verification RPC failed:', error)
      // If server cannot be reached or RPC fails, DO NOT assume active
      return {
        id: '',
        business_id: businessId,
        business_name: 'Unknown Store',
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
    }

    return data as SubscriptionData
  } catch (err) {
    console.error('Network or communication error during subscription check:', err)
    return {
      id: '',
      business_id: businessId,
      business_name: 'Unknown Store',
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
  }
}

/**
 * Check whether the subscription is active using server-authoritative response
 */
export async function isSubscriptionActive(businessId: string = DEFAULT_BUSINESS_ID): Promise<boolean> {
  const sub = await getCurrentSubscription(businessId)
  return sub.is_active && sub.effective_status === 'active'
}

/**
 * Returns the effective status of the subscription
 */
export async function getSubscriptionStatus(businessId: string = DEFAULT_BUSINESS_ID): Promise<SubscriptionStatus> {
  const sub = await getCurrentSubscription(businessId)
  return sub.effective_status
}

/**
 * Returns the days remaining
 */
export async function getDaysRemaining(businessId: string = DEFAULT_BUSINESS_ID): Promise<number> {
  const sub = await getCurrentSubscription(businessId)
  return sub.days_remaining
}

/**
 * Returns the authoritative expiry date ISO string
 */
export async function getExpiryDate(businessId: string = DEFAULT_BUSINESS_ID): Promise<string | null> {
  const sub = await getCurrentSubscription(businessId)
  return sub.expiry_date || null
}

/**
 * Activate a fresh 30-day subscription for a business
 */
export async function activateSubscription(params?: {
  businessId?: string
  businessName?: string
  plan?: string
  durationDays?: number
}): Promise<SubscriptionData> {
  const businessId = params?.businessId || DEFAULT_BUSINESS_ID
  const businessName = params?.businessName || 'Chicken Kade & Grocery'
  const plan = params?.plan || '30_days'
  const durationDays = params?.durationDays || 30

  if (!supabaseConfigured || !supabase) {
    initLocalMock()
    const now = new Date()
    const expiry = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
    const oldStart = localMockSubscription!.start_date
    const oldExpiry = localMockSubscription!.expiry_date

    localMockSubscription = {
      id: localMockSubscription!.id,
      business_id: businessId,
      business_name: businessName,
      plan,
      start_date: now.toISOString(),
      expiry_date: expiry.toISOString(),
      stored_status: 'active',
      effective_status: 'active',
      is_active: true,
      server_time: now.toISOString(),
      days_remaining: durationDays,
      seconds_remaining: durationDays * 86400,
    }

    localMockHistory.unshift({
      id: `hist-${Date.now()}`,
      subscription_id: localMockSubscription.id,
      action: 'activated',
      old_start_date: oldStart,
      old_expiry_date: oldExpiry,
      new_start_date: now.toISOString(),
      new_expiry_date: expiry.toISOString(),
      performed_by: 'admin',
      created_at: now.toISOString(),
    })

    return localMockSubscription
  }

  const { data, error } = await supabase.rpc('activate_subscription', {
    p_business_id: businessId,
    p_business_name: businessName,
    p_plan: plan,
    p_duration_days: durationDays,
  })

  if (error) throw new Error(error.message || 'Failed to activate subscription.')
  return data as SubscriptionData
}

/**
 * Renew subscription:
 * - If still active: adds durationDays onto the existing expiry_date
 * - If expired: starts durationDays from now
 */
export async function renewSubscription(params?: {
  businessId?: string
  durationDays?: number
}): Promise<SubscriptionData> {
  const businessId = params?.businessId || DEFAULT_BUSINESS_ID
  const durationDays = params?.durationDays || 30

  if (!supabaseConfigured || !supabase) {
    initLocalMock()
    const now = new Date()
    const currentExpiry = new Date(localMockSubscription!.expiry_date)
    const isCurrentlyActive = localMockSubscription!.stored_status === 'active' && currentExpiry.getTime() > now.getTime()

    const oldStart = localMockSubscription!.start_date
    const oldExpiry = localMockSubscription!.expiry_date

    let newStart: Date
    let newExpiry: Date

    if (isCurrentlyActive) {
      newStart = new Date(oldStart)
      newExpiry = new Date(currentExpiry.getTime() + durationDays * 24 * 60 * 60 * 1000)
    } else {
      newStart = now
      newExpiry = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
    }

    const seconds = Math.floor((newExpiry.getTime() - now.getTime()) / 1000)
    const days = Math.ceil((newExpiry.getTime() - now.getTime()) / (86400 * 1000))

    localMockSubscription = {
      ...localMockSubscription!,
      start_date: newStart.toISOString(),
      expiry_date: newExpiry.toISOString(),
      stored_status: 'active',
      effective_status: 'active',
      is_active: true,
      server_time: now.toISOString(),
      days_remaining: days,
      seconds_remaining: seconds,
    }

    localMockHistory.unshift({
      id: `hist-${Date.now()}`,
      subscription_id: localMockSubscription.id,
      action: 'renewed',
      old_start_date: oldStart,
      old_expiry_date: oldExpiry,
      new_start_date: newStart.toISOString(),
      new_expiry_date: newExpiry.toISOString(),
      performed_by: 'admin',
      created_at: now.toISOString(),
    })

    return localMockSubscription
  }

  const { data, error } = await supabase.rpc('renew_subscription', {
    p_business_id: businessId,
    p_duration_days: durationDays,
  })

  if (error) throw new Error(error.message || 'Failed to renew subscription.')
  return data as SubscriptionData
}

/**
 * Suspend an active subscription (Admin action)
 */
export async function suspendSubscription(businessId: string = DEFAULT_BUSINESS_ID): Promise<SubscriptionData> {
  if (!supabaseConfigured || !supabase) {
    initLocalMock()
    const now = new Date()
    localMockSubscription = {
      ...localMockSubscription!,
      stored_status: 'suspended',
      effective_status: 'suspended',
      is_active: false,
      server_time: now.toISOString(),
    }
    localMockHistory.unshift({
      id: `hist-${Date.now()}`,
      subscription_id: localMockSubscription.id,
      action: 'suspended',
      old_start_date: localMockSubscription.start_date,
      old_expiry_date: localMockSubscription.expiry_date,
      new_start_date: localMockSubscription.start_date,
      new_expiry_date: localMockSubscription.expiry_date,
      performed_by: 'admin',
      created_at: now.toISOString(),
    })
    return localMockSubscription
  }

  const { data, error } = await supabase.rpc('suspend_subscription', {
    p_business_id: businessId,
  })

  if (error) throw new Error(error.message || 'Failed to suspend subscription.')
  return data as SubscriptionData
}

/**
 * Reactivate a suspended subscription (Admin action)
 */
export async function reactivateSubscription(businessId: string = DEFAULT_BUSINESS_ID): Promise<SubscriptionData> {
  if (!supabaseConfigured || !supabase) {
    initLocalMock()
    const now = new Date()
    const expiry = new Date(localMockSubscription!.expiry_date)
    const newExpiry = expiry.getTime() <= now.getTime() ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : expiry

    localMockSubscription = {
      ...localMockSubscription!,
      stored_status: 'active',
      effective_status: 'active',
      is_active: true,
      expiry_date: newExpiry.toISOString(),
      server_time: now.toISOString(),
      days_remaining: Math.ceil((newExpiry.getTime() - now.getTime()) / (86400 * 1000)),
      seconds_remaining: Math.floor((newExpiry.getTime() - now.getTime()) / 1000),
    }

    localMockHistory.unshift({
      id: `hist-${Date.now()}`,
      subscription_id: localMockSubscription.id,
      action: 'reactivated',
      old_start_date: localMockSubscription.start_date,
      old_expiry_date: localMockSubscription.expiry_date,
      new_start_date: localMockSubscription.start_date,
      new_expiry_date: newExpiry.toISOString(),
      performed_by: 'admin',
      created_at: now.toISOString(),
    })

    return localMockSubscription
  }

  const { data, error } = await supabase.rpc('reactivate_subscription', {
    p_business_id: businessId,
  })

  if (error) throw new Error(error.message || 'Failed to reactivate subscription.')
  return data as SubscriptionData
}

/**
 * Fetch subscription audit history
 */
export async function getSubscriptionHistory(subscriptionId?: string): Promise<SubscriptionHistoryEntry[]> {
  if (!supabaseConfigured || !supabase) {
    return [...localMockHistory]
  }

  let query = supabase
    .from('subscription_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (subscriptionId) {
    query = query.eq('subscription_id', subscriptionId)
  }

  const { data, error } = await query
  if (error) {
    console.error('Error fetching subscription history:', error)
    return []
  }

  return (data || []) as SubscriptionHistoryEntry[]
}
