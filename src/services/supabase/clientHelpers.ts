import { supabase } from '../../lib/supabase'

export function requireSupabase() {
  if (!supabase) throw new Error('Database connection failed.')
  return supabase
}

export async function listRows<T>(table: string): Promise<T[]> {
  const { data, error } = await requireSupabase().from(table).select('*')
  if (error) {
    console.error(`Unable to load ${table}:`, error)
    throw new Error(error.message || `Unable to load ${table}.`)
  }
  return (data || []) as T[]
}

export async function upsertRows<T extends Record<string, unknown>>(table: string, rows: T[]) {
  if (!rows.length) return [] as T[]
  const { data, error } = await requireSupabase().from(table).upsert(rows as never[]).select()
  if (error) {
    console.error(`Unable to save ${table}:`, error)
    throw new Error(error.message || `Unable to save ${table}.`)
  }
  return (data || []) as T[]
}

export async function deleteRow(table: string, id: string): Promise<void> {
  const { error } = await requireSupabase().from(table).delete().eq('id', id)
  if (error) {
    console.error(`Unable to delete from ${table}:`, error)
    throw new Error(error.message || `Unable to delete from ${table}.`)
  }
}
