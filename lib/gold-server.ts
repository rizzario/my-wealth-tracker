import YahooFinance from 'yahoo-finance2';
import type { GoldApiResponse } from './gold';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * Fetch current Gold Spot price (USD per Troy Ounce) from Gold API (Server-only).
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
