import YahooFinance from 'yahoo-finance2';

/**
 * Standard constants for gold weight and purity conversions
 * - 1 Troy Ounce (oz t) = 31.1034768 grams
 * - International Gold Spot (XAU) standard purity = 99.5% (0.995)
 * - Thai Standard Gold Bar purity = 96.5% (0.965)
 * - Thai 1 Baht-weight (1 บาททองคำ) = 15.244 grams (for 96.5% bullion)
 */
export const TROY_OUNCE_IN_GRAMS = 31.1034768;
export const THAI_GOLD_PURITY_RATIO = 96.5 / 99.5; // ~0.969849246
export const THAI_BAHT_WEIGHT_GRAMS = 15.244;

export type GoldAssetType = 'GOLD_OZ' | 'GOLD_G' | 'GOLD_965_G' | 'GOLD_965_BAHT';

export interface GoldSymbolConfig {
  type: GoldAssetType;
  label: string;
  unit: 'OZ' | 'G' | 'BAHT';
  grams: number;
  purityRatio: number;
}

export interface GoldApiResponse {
  currency: string;
  currencySymbol?: string;
  exchangeRate?: number;
  name?: string;
  price: number;
  symbol?: string;
  updatedAt?: string;
  updatedAtReadable?: string;
}

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * Parse and normalize holding symbol to identify supported gold assets.
 * Supports:
 * - GOLD (G), GOLD(G), GOLD-G, GOLD_G -> 99.5% pure gold per gram
 * - GOLD (OZ), GOLD(OZ), GOLD-OZ, GOLD_OZ, XAU, XAUUSD, GOLD -> 99.5% pure gold per troy ounce
 * - GOLD 965 (G), GOLD965(G), GOLD 96.5 (G), GOLD 965 -> Thai 96.5% gold per gram
 * - GOLD 965 (BAHT), GOLD (BAHT), GOLD 965 (บาท) -> Thai 96.5% gold 1 Baht-weight (15.244g)
 */
export function parseGoldSymbol(rawSymbol: string): GoldSymbolConfig | null {
  if (!rawSymbol) return null;
  const sym = rawSymbol.toUpperCase().replace(/\s+/g, ' ').trim();

  // Must start with GOLD or XAU
  if (!sym.startsWith('GOLD') && !sym.startsWith('XAU')) {
    return null;
  }

  // 1. Thai Baht weight (15.244g of 96.5% bullion)
  if (sym.includes('BAHT') || sym.includes('บาท')) {
    return {
      type: 'GOLD_965_BAHT',
      label: 'ทองคำแท่ง 96.5% (1 บาท / 15.244 กรัม)',
      unit: 'BAHT',
      grams: THAI_BAHT_WEIGHT_GRAMS,
      purityRatio: THAI_GOLD_PURITY_RATIO,
    };
  }

  // 2. Thai 96.5% gold per gram (GOLD 965 (G), GOLD965(G), GOLD 96.5, etc.)
  if (sym.includes('965') || sym.includes('96.5')) {
    return {
      type: 'GOLD_965_G',
      label: 'ทองคำ 96.5% (กรัม)',
      unit: 'G',
      grams: 1.0,
      purityRatio: THAI_GOLD_PURITY_RATIO,
    };
  }

  // 3. International standard gold per gram (GOLD (G), GOLD(G), etc. 99.5% purity)
  if (
    sym.includes('(G)') ||
    sym.endsWith(' G') ||
    sym.endsWith('_G') ||
    sym.endsWith('-G') ||
    sym.includes('GRAM') ||
    sym.includes('995') ||
    sym.includes('99.5') ||
    sym.includes('9999')
  ) {
    return {
      type: 'GOLD_G',
      label: 'ทองคำ 99.5% (กรัม)',
      unit: 'G',
      grams: 1.0,
      purityRatio: 1.0,
    };
  }

  // 4. International standard gold per Troy Ounce (GOLD (OZ), XAU, XAUUSD, GOLD)
  if (
    sym.includes('(OZ)') ||
    sym.endsWith(' OZ') ||
    sym.endsWith('_OZ') ||
    sym.endsWith('-OZ') ||
    sym.includes('OUNCE') ||
    sym === 'GOLD' ||
    sym.startsWith('XAU')
  ) {
    return {
      type: 'GOLD_OZ',
      label: 'ทองคำ Gold Spot XAU/USD (ทรอยออนซ์)',
      unit: 'OZ',
      grams: TROY_OUNCE_IN_GRAMS,
      purityRatio: 1.0,
    };
  }

  return null;
}

/**
 * Fetch current Gold Spot price (USD per Troy Ounce) from Gold API
 * URL: https://api.gold-api.com/price/XAU/USD
 * Fallback to Yahoo Finance (GC=F Gold Futures) if gold-api.com is unreachable.
 */
export async function fetchGoldSpotUsd(): Promise<number | null> {
  // Primary: gold-api.com
  try {
    const res = await fetch('https://api.gold-api.com/price/XAU/USD', {
      headers: {
        'User-Agent': 'my-wealth-tracker/1.0',
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const data: GoldApiResponse = await res.json();
      const price = Number(data.price);
      if (price && price > 0) {
        return price;
      }
    }
  } catch (err) {
    console.warn('Gold API (gold-api.com) request failed, trying Yahoo Finance fallback:', err);
  }

  // Fallback: Yahoo Finance Gold Futures (GC=F)
  try {
    const quote: any = await yahooFinance.quote('GC=F');
    const price = Number(quote?.regularMarketPrice);
    if (price && price > 0) {
      return price;
    }
  } catch (err) {
    console.error('All Gold price providers failed:', err);
  }

  return null;
}

/**
 * Calculate the present price per unit in the holding's currency.
 *
 * Formulas:
 * 1. GOLD (OZ):
 *    - USD price = XAU/USD
 *    - THB price = XAU/USD * usdThbRate
 *
 * 2. GOLD (G) [99.5% pure]:
 *    - USD price = (XAU/USD) / 31.1034768
 *    - THB price = ((XAU/USD) / 31.1034768) * usdThbRate
 *
 * 3. GOLD 965 (G) [96.5% Thai gold]:
 *    - USD price = ((XAU/USD) / 31.1034768) * (96.5 / 99.5)
 *    - THB price = ((XAU/USD) / 31.1034768) * (96.5 / 99.5) * usdThbRate
 *
 * 4. GOLD 965 (BAHT) [1 Baht weight = 15.244g]:
 *    - USD price = ((XAU/USD) / 31.1034768) * (96.5 / 99.5) * 15.244
 *    - THB price = ((XAU/USD) / 31.1034768) * (96.5 / 99.5) * 15.244 * usdThbRate
 */
export function calculateGoldHoldingPrice(
  config: GoldSymbolConfig,
  xauUsdPrice: number,
  usdThbRate: number,
  holdingCurrency: string = 'THB',
  ratesMap: Record<string, number> = {}
): number {
  let usdPricePerUnit: number;

  if (config.type === 'GOLD_OZ') {
    usdPricePerUnit = xauUsdPrice;
  } else {
    // USD per gram of pure gold
    const usdPerPureGram = xauUsdPrice / TROY_OUNCE_IN_GRAMS;
    // Adjusted by purity ratio (e.g. 96.5/99.5) and weight in grams
    usdPricePerUnit = usdPerPureGram * config.purityRatio * config.grams;
  }

  const targetCurr = holdingCurrency.toUpperCase();
  if (targetCurr === 'USD') {
    return usdPricePerUnit;
  }

  // Convert USD -> THB
  const thbPricePerUnit = usdPricePerUnit * (usdThbRate > 0 ? usdThbRate : 33.35);

  if (targetCurr === 'THB') {
    return thbPricePerUnit;
  }

  // For other fiat currencies (e.g. EUR, SGD, JPY)
  const targetRateToThb = ratesMap[targetCurr] || 1.0;
  return targetRateToThb > 0 ? thbPricePerUnit / targetRateToThb : thbPricePerUnit;
}
