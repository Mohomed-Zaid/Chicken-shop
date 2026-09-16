import { supabaseConfigured } from './supabase'

export type StorageMode = 'local' | 'supabase'

const configuredMode = import.meta.env.VITE_STORAGE_MODE

export const storageMode: StorageMode =
  configuredMode === 'local' ? 'local' : configuredMode === 'supabase' || supabaseConfigured ? 'supabase' : 'local'

export const isSupabaseMode = () => storageMode === 'supabase'
