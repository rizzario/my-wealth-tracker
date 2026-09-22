/**
 * Client-safe currency helpers and symbols
 */

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'HKD', 'JPY', 'SGD', 'THB'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function getCurrencySymbol(currency?: string | null): string {
  switch ((currency || 'THB').toUpperCase()) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'HKD':
      return 'HK$';
    case 'JPY':
      return '¥';
    case 'SGD':
      return 'S$';
    case 'THB':
    default:
      return '฿';
  }
}
