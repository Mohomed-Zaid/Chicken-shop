import { useEffect, useState } from 'react'
import { requireSupabase } from '../services/supabase/clientHelpers'
import type { UserProfile, UserRole } from '../services/authService'

export function Users() {
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const load = async () => { try { const { data, error: queryError } = await requireSupabase().from('profiles').select('*').order('created_at'); if (queryError) throw queryError; setProfiles((data || []) as UserProfile[]) } catch { setError('Unable to load users.') } }
  useEffect(() => { void load() }, [])
  const update = async (profile: UserProfile, changes: Partial<UserProfile>) => { setBusy(profile.id); setError(''); try { const { data, error: updateError } = await requireSupabase().from('profiles').update(changes).eq('id', profile.id).select().single(); if (updateError) throw updateError; setProfiles(current => current.map(item => item.id === profile.id ? data as UserProfile : item)) } catch { setError('User change was not permitted.') } finally { setBusy('') } }
  return <section className="prices-page"><header className="page-header"><div><small>ADMINISTRATION</small><h1>Users</h1><p>Manage roles and active cashier access.</p></div></header>{error && <p className="validation">{error}</p>}<section className="price-table"><div className="price-row table-head"><span>Name</span><span>Email</span><span>Role</span><span>Access</span></div>{profiles.map(profile => <div className="price-row" key={profile.id}><span><b>{profile.full_name}</b></span><span>{profile.email || 'No email'}</span><span><select value={profile.role} disabled={busy === profile.id} onChange={event => void update(profile, { role: event.target.value as UserRole })}><option value="admin">Admin</option><option value="cashier">Cashier</option></select></span><span><button className={profile.active ? 'status active' : 'status'} disabled={busy === profile.id} onClick={() => void update(profile, { active: !profile.active })}>{profile.active ? 'Active' : 'Inactive'}</button></span></div>)}</section><p className="user-note">Create new authentication accounts through Supabase Authentication, then the profile trigger adds them here as cashiers.</p></section>
}