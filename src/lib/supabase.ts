import { neonClient } from './neonClient'

// Unconditionally use Neon client — Supabase has been permanently replaced
export const isNeonMode = true
export const supabaseConfigured = true
export const supabase: any = neonClient
