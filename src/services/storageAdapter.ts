import { isSupabaseMode, storageMode, type StorageMode } from '../lib/storage'

export { storageMode, type StorageMode }
export const storageAdapter = {
  mode: storageMode,
  isLocal: () => !isSupabaseMode(),
  isSupabase: isSupabaseMode,
  readLocal: <T>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback } },
  writeLocal: (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value)),
}
