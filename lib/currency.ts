/**
 * Client-safe currency helpers and symbols
 */

export const SUPPORTED_CURRENCIES = ['THB', 'USD', 'EUR', 'HKD', 'JPY', 'SGD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export interface CurrencyOption {
  code: SupportedCurrency;
  name: string;
  symbol: string;
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'THB', name: 'บาทไทย', symbol: '฿' },
  { code: 'USD', name: 'ดอลลาร์สหรัฐ', symbol: '$' },
  { code: 'EUR', name: 'ยูโร', symbol: '€' },
  { code: 'HKD', name: 'ดอลลาร์ฮ่องกง', symbol: 'HK$' },
  { code: 'JPY', name: 'เยนญี่ปุ่น', symbol: '¥' },
  { code: 'SGD', name: 'ดอลลาร์สิงคโปร์', symbol: 'S$' },
];

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
