import { listRows, upsertRows } from './clientHelpers'
export type ChickenCutRow = { id: string; name: string; price_per_kg: number; active: boolean; created_at?: string; updated_at?: string }
export type ChickenPriceHistoryRow = { id: string; chicken_cut_id: string | null; old_price: number | null; new_price: number; changed_at: string }
export const getChickenCuts = () => listRows<ChickenCutRow>('chicken_cuts')
export const getChickenPriceHistory = () => listRows<ChickenPriceHistoryRow>('chicken_price_history')
export const saveChickenCuts = (rows: ChickenCutRow[]) => upsertRows('chicken_cuts', rows)
export const saveChickenPriceHistory = (rows: ChickenPriceHistoryRow[]) => upsertRows('chicken_price_history', rows)
