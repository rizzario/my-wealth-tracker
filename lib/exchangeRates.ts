import YahooFinance from 'yahoo-finance2';
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
  getCurrencySymbol,
} from './currency';

export { SUPPORTED_CURRENCIES, type SupportedCurrency, getCurrencySymbol };

/**
 * Currency Exchange Rates Management Helper
 * Reference: AGENTS.md §3.9
 *
 * Supported currencies: EUR, HKD, JPY, SGD, USD, THB
 * Base valuation currency: THB
 */

export interface CurrencyExchangeRate {
  currency: string;
  rate_to_thb: number;
  updated_at: string;
}

export type ExchangeRateMap = Record<string, number>;

/**
 * Default fallback rates to THB in case of network unavailability.
 */
export const DEFAULT_RATES_TO_THB: ExchangeRateMap = {
  THB: 1.0,
  USD: 33.35,
  EUR: 38.25,
  HKD: 4.25,
  JPY: 0.213,
  SGD: 26.10,
};

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * Fetch live exchange rates from Open Exchange API (single request gives all cross rates)
 * with a fallback to Yahoo Finance.
 */
export async function fetchLiveExchangeRates(): Promise<ExchangeRateMap> {
  const ratesMap: ExchangeRateMap = { ...DEFAULT_RATES_TO_THB };

  // Primary source: Open Exchange API
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { 'User-Agent': 'my-wealth-tracker/1.0' },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      const thbRate = Number(data?.rates?.THB);

      if (thbRate && thbRate > 0) {
        ratesMap.USD = parseFloat(thbRate.toFixed(6));
        ratesMap.THB = 1.0;

        if (data.rates.EUR) ratesMap.EUR = parseFloat((thbRate / Number(data.rates.EUR)).toFixed(6));
        if (data.rates.HKD) ratesMap.HKD = parseFloat((thbRate / Number(data.rates.HKD)).toFixed(6));
        if (data.rates.JPY) ratesMap.JPY = parseFloat((thbRate / Number(data.rates.JPY)).toFixed(6));
        if (data.rates.SGD) ratesMap.SGD = parseFloat((thbRate / Number(data.rates.SGD)).toFixed(6));

        return ratesMap;
      }
    }
  } catch (err) {
    console.warn('Open Exchange API failed, trying Yahoo Finance fallback:', err);
  }

  // Fallback source: Yahoo Finance forex tickers
  try {
    const tickers = ['USDTHB=X', 'EURTHB=X', 'HKDTHB=X', 'JPYTHB=X', 'SGDTHB=X'];

    for (const ticker of tickers) {
      try {
        const quote: any = await yahooFinance.quote(ticker);
        const price = Number(quote?.regularMarketPrice);
        if (price && price > 0) {
          const c = ticker.slice(0, 3);
          ratesMap[c] = parseFloat(price.toFixed(6));
        }
      } catch (e) {
        console.warn(`Yahoo fallback failed for ${ticker}:`, e);
      }
    }
  } catch (err) {
    console.error('All live exchange rate sources failed:', err);
  }

  return ratesMap;
}

/**
 * Sync live exchange rates from the API and upsert into Supabase `currency_exchange_rates`.
 */
export async function syncCurrencyExchangeRates(supabase: any): Promise<ExchangeRateMap> {
  const liveRates = await fetchLiveExchangeRates();

  const rows = Object.entries(liveRates).map(([currency, rate_to_thb]) => ({
    currency: currency.toUpperCase(),
    rate_to_thb,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('currency_exchange_rates')
    .upsert(rows, { onConflict: 'currency' });

  if (error) {
    console.error(
      'Failed to upsert currency_exchange_rates in Supabase (check RLS policy on currency_exchange_rates):',
      error.message
    );
  }

  return liveRates;
}

/**
 * Get exchange rates. First checks `currency_exchange_rates` in Supabase.
 * If empty or forceSync is true, syncs from the API and caches in Supabase.
 */
export async function getCurrencyExchangeRates(
  supabase: any,
  forceSync: boolean = false
): Promise<ExchangeRateMap> {
  if (forceSync) {
    return syncCurrencyExchangeRates(supabase);
  }

  try {
    const { data, error } = await supabase
      .from('currency_exchange_rates')
      .select('currency, rate_to_thb, updated_at');

    if (!error && data && data.length > 0) {
      const map: ExchangeRateMap = { THB: 1.0 };
      for (const row of data) {
        map[row.currency.toUpperCase()] = Number(row.rate_to_thb);
      }

      // If all required currencies are present, return the DB cache
      const hasAll = SUPPORTED_CURRENCIES.every((c) => map[c] != null && map[c] > 0);
      if (hasAll) {
        return map;
      }
    }
  } catch (err) {
    console.warn('Failed to read currency_exchange_rates from DB:', err);
  }

  // Fallback: sync from external API and store into DB
  return syncCurrencyExchangeRates(supabase);
}
