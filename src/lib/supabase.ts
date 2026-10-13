import { createClient } from '@supabase/supabase-js'
import { neonClient } from './neonClient'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined
const mode = import.meta.env.VITE_STORAGE_MODE

// Default to Neon if VITE_STORAGE_MODE=neon or if no Supabase URL is provided
export const isNeonMode = mode === 'neon' || !url

export const supabaseConfigured = isNeonMode ? true : Boolean(url && key)
export const supabase: any = isNeonMode ? neonClient : (supabaseConfigured ? createClient(url!, key!) : null)
