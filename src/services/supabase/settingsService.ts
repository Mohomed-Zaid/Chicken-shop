import { listRows, upsertRows } from './clientHelpers'
export type BusinessSettingsRow = { id: string; business_name: string | null; address: string | null; phone: string | null; email: string | null; footer_message: string | null; show_customer: boolean; show_cashier: boolean; show_payment_method: boolean; auto_print_receipt: boolean; updated_at?: string }
export const getBusinessSettings = () => listRows<BusinessSettingsRow>('business_settings')
export const saveBusinessSettings = (settings: BusinessSettingsRow) => upsertRows('business_settings', [settings])
