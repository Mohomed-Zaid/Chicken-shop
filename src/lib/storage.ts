import { isNeonMode } from './supabase'

export type StorageMode = 'local' | 'supabase' | 'neon'

const configuredMode = import.meta.env.VITE_STORAGE_MODE

export const storageMode: StorageMode =
  configuredMode === 'local' ? 'local' : isNeonMode ? 'neon' : 'supabase'

export const isSupabaseMode = () => storageMode === 'neon' || storageMode === 'supabase'
