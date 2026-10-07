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

  // Must start with GOLD or XAU or contain Thai gold terms
  if (!sym.startsWith('GOLD') && !sym.startsWith('XAU') && !sym.includes('ทอง')) {
    return null;
  }

  // 1. Thai Baht weight (15.244g of 96.5% bullion)
  if (sym.includes('BAHT') || sym.includes('บาท') || sym.includes('ทองคำแท่ง')) {
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
    sym.startsWith('XAU') ||
    sym.includes('ทอง')
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
 * Parse numeric strings with magnitude suffix (k/m/b), spaces, and commas.
 * Examples:
 * - "66.5k" or "66.5K" -> 66500
 * - "1.5m" -> 1500000
 * - "66,500" -> 66500
 * - 0.2292 -> 0.2292
 */
export function parseNumberWithSuffix(val: string | number | null | undefined): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const clean = String(val).trim().replace(/,/g, '');
  if (!clean) return 0;
  const lower = clean.toLowerCase();
  if (lower.endsWith('k')) {
    const n = parseFloat(lower.slice(0, -1).trim());
    return isNaN(n) ? 0 : n * 1000;
  }
  if (lower.endsWith('m')) {
    const n = parseFloat(lower.slice(0, -1).trim());
    return isNaN(n) ? 0 : n * 1000000;
  }
  if (lower.endsWith('b')) {
    const n = parseFloat(lower.slice(0, -1).trim());
    return isNaN(n) ? 0 : n * 1000000000;
  }
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

export interface GoldConversionDetail {
  units: number;
  unitType: 'BAHT' | 'G' | 'OZ';
  totalCashThb: number;
  bahtWeight: number;    // จำนวนบาททองคำ
  grams: number;         // จำนวนกรัม
  salung: number;        // จำนวนสลึง
  pricePerBaht: number;  // ราคาต่อ 1 บาททอง
  pricePerGram: number;  // ราคาต่อ 1 กรัม
  pricePerSalung: number;// ราคาต่อ 1 สลึง
}

export function calculateGoldMetrics(
  config: GoldSymbolConfig,
  units: number,
  pricePerUnit: number
): GoldConversionDetail {
  const totalCashThb = units * pricePerUnit;
  let bahtWeight = 0;
  let grams = 0;
  let salung = 0;
  let pricePerBaht = 0;
  let pricePerGram = 0;
  let pricePerSalung = 0;

  if (config.unit === 'BAHT') {
    bahtWeight = units;
    grams = units * THAI_BAHT_WEIGHT_GRAMS;
    salung = units * 4;
    pricePerBaht = pricePerUnit;
    pricePerGram = pricePerUnit / THAI_BAHT_WEIGHT_GRAMS;
    pricePerSalung = pricePerUnit / 4;
  } else if (config.unit === 'G') {
    grams = units;
    bahtWeight = units / THAI_BAHT_WEIGHT_GRAMS;
    salung = (units / THAI_BAHT_WEIGHT_GRAMS) * 4;
    pricePerGram = pricePerUnit;
    pricePerBaht = pricePerUnit * THAI_BAHT_WEIGHT_GRAMS;
    pricePerSalung = (pricePerUnit * THAI_BAHT_WEIGHT_GRAMS) / 4;
  } else if (config.unit === 'OZ') {
    grams = units * TROY_OUNCE_IN_GRAMS;
    bahtWeight = grams / THAI_BAHT_WEIGHT_GRAMS;
    salung = bahtWeight * 4;
    pricePerGram = pricePerUnit / TROY_OUNCE_IN_GRAMS;
    pricePerBaht = pricePerGram * THAI_BAHT_WEIGHT_GRAMS;
    pricePerSalung = pricePerBaht / 4;
  }

  return {
    units,
    unitType: config.unit,
    totalCashThb,
    bahtWeight,
    grams,
    salung,
    pricePerBaht,
    pricePerGram,
    pricePerSalung,
  };
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
