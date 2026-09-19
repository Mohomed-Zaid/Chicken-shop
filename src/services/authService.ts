import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type UserRole = 'admin' | 'cashier'
export type UserProfile = {
  id: string
  full_name: string
  email: string | null
  role: UserRole
  active: boolean
  created_at: string
  updated_at: string
}

const friendlyError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '')
  const lower = message.toLowerCase()
  console.error('Supabase Auth error details:', error)

  if (lower.includes('invalid login credentials') || lower.includes('invalid_grant')) {
    return new Error('Invalid email or password. Please verify your credentials or create the user in Supabase Authentication.')
  }
  if (lower.includes('email not confirmed')) {
    return new Error('Email not confirmed. Please confirm the user in Supabase Auth Dashboard (or disable "Confirm email" in Auth settings).')
  }
  if (lower.includes('inactive')) {
    return new Error('Your account is set to inactive. Please contact the administrator.')
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
    return new Error('Unable to connect to Supabase server. Please check your internet connection.')
  }
  return new Error(message || 'Unable to sign in. Please try again.')
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase authentication is not configured.')
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error || !data.user) throw friendlyError(error)

  const profile = await getUserProfile(data.user)
  if (profile && !profile.active) {
    await supabase.auth.signOut()
    throw new Error('Your account is inactive. Please contact the administrator.')
  }
  return data
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut()
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null
  try {
    return (await supabase.auth.getUser()).data.user
  } catch {
    return null
  }
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null
  try {
    return (await supabase.auth.getSession()).data.session
  } catch {
    return null
  }
}

export async function getUserProfile(user?: User | null): Promise<UserProfile | null> {
  if (!supabase) return null
  const u = user || (await getCurrentUser())
  if (!u?.id) return null

  const emailLower = u.email?.toLowerCase() || ''
  const isAdminEmail = emailLower === 'zaidn2848@gmail.com' || emailLower === 'chickenkade@gmail.com'
  const fallbackProfile: UserProfile = {
    id: u.id,
    full_name: (u.user_metadata?.full_name as string) || u.email?.split('@')[0] || 'Administrator',
    email: u.email || null,
    role: isAdminEmail ? 'admin' : ((u.user_metadata?.role as UserRole) || 'cashier'),
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', u.id)
    if (!error && data && data.length > 0) {
      const existing = data[0] as UserProfile
      if (isAdminEmail && existing.role !== 'admin') {
        existing.role = 'admin'
        Promise.resolve(supabase.from('profiles').update({ role: 'admin', updated_at: new Date().toISOString() }).eq('id', u.id)).catch(() => {})
      }
      return existing
    }

    // Auto-create or synthesize profile if not present in the profiles table
    try {
      const { data: inserted, error: insertErr } = await supabase
        .from('profiles')
        .upsert(fallbackProfile)
        .select('*')
      if (!insertErr && inserted && inserted.length > 0) {
        return inserted[0] as UserProfile
      }
    } catch (e) {
      console.warn('Could not upsert profile:', e)
    }

    return fallbackProfile
  } catch (err) {
    console.warn('Error fetching profile from database, returning active fallback profile:', err)
    return fallbackProfile
  }
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => undefined } } }
  return supabase.auth.onAuthStateChange((_event, session) => callback(session))
}