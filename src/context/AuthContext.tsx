import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseMode } from '../lib/storage'
import { getCurrentSession, getUserProfile, onAuthStateChange, signIn as authenticate, signOut as endSession, type UserProfile, type UserRole } from '../services/authService'

type AuthValue = { user: User | null; profile: UserProfile | null; role: UserRole | null; loading: boolean; isAuthenticated: boolean; isAdmin: boolean; isCashier: boolean; signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void> }
const AuthContext = createContext<AuthValue | null>(null)
const localProfile: UserProfile = { id: 'local-admin', full_name: 'Local Administrator', email: null, role: 'admin', active: true, created_at: '', updated_at: '' }

export function AuthProvider({ children }: { children: ReactNode }) {
  const local = !isSupabaseMode()
  const [user, setUser] = useState<User | null>(local ? { id: localProfile.id } as User : null)
  const [profile, setProfile] = useState<UserProfile | null>(local ? localProfile : null)
  const [loading, setLoading] = useState(!local)
  useEffect(() => {
    if (local) return
    let mounted = true
    getCurrentSession().then(async session => { if (!mounted) return; setUser(session?.user || null); setProfile(await getUserProfile(session?.user)); setLoading(false) }).catch(() => mounted && setLoading(false))
    const { data: { subscription } } = onAuthStateChange(async session => { setUser(session?.user || null); setProfile(await getUserProfile(session?.user)); setLoading(false) })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [local])
  const value: AuthValue = {
    user,
    profile,
    role: profile?.role || null,
    loading,
    isAuthenticated: Boolean(user && profile?.active),
    isAdmin:
      (profile?.role === 'admin' ||
        profile?.email?.toLowerCase() === 'zaidn2848@gmail.com' ||
        profile?.email?.toLowerCase() === 'chickenkade@gmail.com') &&
      Boolean(profile?.active),
    isCashier: profile?.role === 'cashier' && Boolean(profile?.active),
    signIn: async (email, password) => {
      const data = await authenticate(email, password)
      if (data?.user) {
        setUser(data.user)
        const p = await getUserProfile(data.user)
        setProfile(p)
      }
    },
    signOut: async () => {
      await endSession()
      setUser(null)
      setProfile(null)
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value }