export type PromotionType = 'BUY_X_GET_Y_FREE'

export interface PromotionConfig {
  promotionEnabled?: boolean | null
  promotionType?: PromotionType | string | null
  promotionBuyQuantity?: number | null
  promotionFreeQuantity?: number | null
  promotionStartDate?: string | null
  promotionEndDate?: string | null
  promotionActive?: boolean | null
}

export type PromotionStatus = 'active' | 'inactive' | 'scheduled' | 'expired'

export interface PromotionCalculationResult {
  paidQuantity: number
  freeQuantity: number
  totalQuantity: number
  promotionApplied: boolean
  promotionType?: string | null
  promotionBuyQuantity?: number | null
  promotionFreeQuantity?: number | null
}

/**
 * Returns today's date formatted as YYYY-MM-DD in local time
 */
export const getLocalDateString = (d: Date = new Date()): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Evaluates the status of a promotion given product settings and a reference date (defaults to today).
 */
export const getPromotionStatus = (
  promo: PromotionConfig | null | undefined,
  todayStr: string = getLocalDateString()
): PromotionStatus => {
  if (!promo || !promo.promotionEnabled) return 'inactive'
  if (promo.promotionActive === false) return 'inactive'

  const start = promo.promotionStartDate ? promo.promotionStartDate.trim() : null
  const end = promo.promotionEndDate ? promo.promotionEndDate.trim() : null

  if (start && todayStr < start) {
    return 'scheduled'
  }

  if (end && todayStr > end) {
    return 'expired'
  }

  return 'active'
}

/**
 * Checks if a promotion is currently active and eligible to be applied.
 */
export const isPromotionActive = (
  promo: PromotionConfig | null | undefined,
  todayStr: string = getLocalDateString()
): boolean => {
  return getPromotionStatus(promo, todayStr) === 'active'
}

/**
 * Calculates paid, free, and total physical quantities based on the promotion rule.
 * 
 * Formula:
 * freeQuantity = floor(paidQuantity / buyQuantity) * freeQuantityPerSet
 * totalQuantity = paidQuantity + freeQuantity
 */
export const calculatePromotion = (
  quantity: number,
  promo: PromotionConfig | null | undefined,
  todayStr: string = getLocalDateString()
): PromotionCalculationResult => {
  const paidQuantity = Math.max(0, Math.floor(quantity || 0))

  if (
    !promo ||
    !isPromotionActive(promo, todayStr) ||
    !promo.promotionBuyQuantity ||
    promo.promotionBuyQuantity <= 0 ||
    !promo.promotionFreeQuantity ||
    promo.promotionFreeQuantity <= 0 ||
    paidQuantity <= 0
  ) {
    return {
      paidQuantity,
      freeQuantity: 0,
      totalQuantity: paidQuantity,
      promotionApplied: false,
    }
  }

  const buyQuantity = promo.promotionBuyQuantity
  const freeQuantityPerSet = promo.promotionFreeQuantity
  const sets = Math.floor(paidQuantity / buyQuantity)
  const freeQuantity = sets * freeQuantityPerSet
  const totalQuantity = paidQuantity + freeQuantity

  return {
    paidQuantity,
    freeQuantity,
    totalQuantity,
    promotionApplied: freeQuantity > 0,
    promotionType: promo.promotionType || 'BUY_X_GET_Y_FREE',
    promotionBuyQuantity: buyQuantity,
    promotionFreeQuantity: freeQuantityPerSet,
  }
}

/**
 * Generates user-friendly promotion badge text (e.g. "BUY 2 GET 1 FREE").
 */
export const formatPromotionBadge = (promo: PromotionConfig | null | undefined): string => {
  if (!promo || !promo.promotionBuyQuantity || !promo.promotionFreeQuantity) return ''
  return `BUY ${promo.promotionBuyQuantity} GET ${promo.promotionFreeQuantity} FREE`
}
