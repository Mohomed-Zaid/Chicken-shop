import type { ChickenItem } from '../../data/chicken'
import { listRows, upsertRows } from './clientHelpers'

export type ChickenCutRow = {
  id: string
  code?: string
  name: string
  price_per_kg: number
  active: boolean
  created_at?: string
  updated_at?: string
}

export type ChickenPriceHistoryRow = {
  id: string
  chicken_cut_id: string | null
  old_price: number | null
  new_price: number
  changed_at: string
}

export const rowToChickenItem = (row: ChickenCutRow): ChickenItem => ({
  id: row.id,
  code: row.code || '001',
  name: row.name,
  cut: row.name,
  pricePerKg: Number(row.price_per_kg || 0),
  active: row.active ?? true,
  createdAt: row.created_at || new Date().toISOString(),
  updatedAt: row.updated_at || new Date().toISOString(),
})

export const chickenItemToRow = (item: ChickenItem): ChickenCutRow => ({
  id: item.id,
  code: item.code,
  name: item.name,
  price_per_kg: item.pricePerKg,
  active: item.active,
  created_at: item.createdAt,
  updated_at: item.updatedAt,
})

export const getChickenCuts = async (): Promise<ChickenItem[]> => {
  const rows = await listRows<ChickenCutRow>('chicken_cuts')
  return rows.map(rowToChickenItem)
}

export const getChickenPriceHistory = () => listRows<ChickenPriceHistoryRow>('chicken_price_history')
export const saveChickenCuts = (items: ChickenItem[]) =>
  upsertRows('chicken_cuts', items.map(chickenItemToRow))
export const saveChickenPriceHistory = (rows: ChickenPriceHistoryRow[]) =>
  upsertRows('chicken_price_history', rows)

