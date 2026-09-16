import { supabase } from '../../lib/supabase'

export function requireSupabase() {
  if (!supabase) throw new Error('Database connection failed.')
  return supabase
}

export async function listRows<T>(table: string): Promise<T[]> {
  const { data, error } = await requireSupabase().from(table).select('*')
  if (error) { console.error(`Unable to load ${table}.`, error); throw new Error(`Unable to load ${table}.`) }
  return (data || []) as T[]
}

export async function upsertRows<T extends Record<string, unknown>>(table: string, rows: T[]) {
  if (!rows.length) return [] as T[]
  const { data, error } = await requireSupabase().from(table).upsert(rows as never[]).select()
  if (error) { console.error(`Unable to migrate ${table}.`, error); throw new Error(`Unable to migrate ${table}.`) }
  return (data || []) as T[]
}
