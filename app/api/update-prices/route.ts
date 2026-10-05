import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import YahooFinance from 'yahoo-finance2';
import {
  getCurrencyExchangeRates,
  syncCurrencyExchangeRates,
  type ExchangeRateMap,
} from '@/lib/exchangeRates';
import {
  parseGoldSymbol,
  fetchGoldSpotUsd,
  calculateGoldHoldingPrice,
} from '@/lib/gold';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * Check if the symbol is manually tracked or not supported by Yahoo/Binance.
 * Reference: AGENTS.md §4.4
 */
function isExcludedSymbol(rawSymbol: string): boolean {
  const sym = rawSymbol.toUpperCase().trim();
  // Check if it's a recognized gold symbol format - if so, do NOT exclude
  if (sym.startsWith('GOLD') || sym.startsWith('XAU')) {
    return parseGoldSymbol(sym) === null;
  }
  return (
    sym.startsWith('K-') ||
    sym.startsWith('SCBTA') ||
    sym === 'GOOG80'
  );
}

/**
 * Map raw symbol to appropriate Yahoo Finance ticker.
 * Supports Thai (.BK), US tickers, and international tickers (.HK, .SI, .T, .PA, etc.)
 */
function mapSymbolForYahoo(rawSymbol: string): string | null {
  const sym = rawSymbol.toUpperCase().trim();
  if (isExcludedSymbol(sym) || parseGoldSymbol(sym) !== null) {
    return null;
  }
  // If the symbol already includes a market suffix (.BK, .HK, .SI, .T, .PA, .DE, etc.)
  if (sym.includes('.')) return sym;

  const usTickers = [
    'AAPL', 'NVDA', 'TSLA', 'AMD', 'VOO', 'VZ', 'QQQI', 'GOOG', 'MSFT', 'AMZN', 'META', 'SPY', 'QQQ'
  ];
  if (usTickers.includes(sym)) return sym;

  // Fallback to SET (Stock Exchange of Thailand) ticker
  return `${sym}.BK`;
}

export const maxDuration = 60; // Allow up to 60 seconds on Vercel
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get('id');
    const currencyOnly = searchParams.get('currency_only') === 'true';
    const forceSyncFx = searchParams.get('sync_fx') === 'true';

    // Check authorization source
    const authHeader = req.headers.get('authorization');
    const userAgent = req.headers.get('user-agent') || '';
    const cronSchedule = req.headers.get('x-vercel-cron-schedule');

    let isAuthorized = false;
    let authSource = 'unauthorized';

    if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
      isAuthorized = true;
      authSource = 'cron_secret';
    } else if (userAgent.includes('vercel-cron') || Boolean(cronSchedule)) {
      isAuthorized = true;
      authSource = 'vercel_cron';
    } else if (process.env.NODE_ENV === 'development') {
      isAuthorized = true;
      authSource = 'development';
    } else {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        isAuthorized = true;
        authSource = 'user_session';
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Access denied. Valid user session or Vercel Cron authorization required.',
        },
        { status: 401 }
      );
    }

    const isCron = authSource === 'cron_secret' || authSource === 'vercel_cron';

    if (isCron && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn(
        '⚠️ [CRON] Triggered by Vercel Cron, but SUPABASE_SERVICE_ROLE_KEY is not defined. RLS will prevent fetching holdings without a user session.'
      );
    }

    // 1. Select between Service Role (for Cron/Admin) and Server Client (for User Session) to satisfy RLS
    let supabase;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
    } else {
      supabase = await createClient();
    }

    // 2. Manage exchange rates:
    // If currency_only mode: sync and return immediately
    if (currencyOnly) {
      const rates = await syncCurrencyExchangeRates(supabase);
      return NextResponse.json({
        status: 'success',
        message: 'Currency exchange rates synced successfully',
        rates,
      });
    }

    // For batch updates (no targetId) or when forceSyncFx is set:
    // sync currency_exchange_rates table first so all rates are up-to-date.
    // For single-stock updates (?id=...), read the cached rates from currency_exchange_rates table.
    let ratesMap: ExchangeRateMap;
    if (!targetId || forceSyncFx) {
      ratesMap = await syncCurrencyExchangeRates(supabase);
    } else {
      ratesMap = await getCurrencyExchangeRates(supabase);
    }

    // 3. Query target holdings (include currency and exchange_rate)
    let query = supabase
      .from('portfolio_holdings')
      .select('id, symbol, currency, exchange_rate');
    if (targetId) {
      query = query.eq('id', targetId);
    }

    const { data: holdings, error: fetchError } = await query;
    if (fetchError || !holdings) {
      return NextResponse.json({ error: fetchError?.message }, { status: 500 });
    }

    const updates = [];
    let cachedGoldSpotUsd: number | null = null;
    let goldFetchAttempted = false;

    for (const item of holdings) {
      const sym = item.symbol.toUpperCase().trim();
      const holdingCurrency = (item.currency || 'THB').toUpperCase();

      // Check if this is an excluded symbol (Manual / mutual funds without automated coverage)
      if (isExcludedSymbol(sym)) {
        updates.push({
          id: item.id,
          symbol: sym,
          skipped: true,
          reason: 'Manual asset / not supported for automated price feed',
        });
        continue;
      }

      let rawPrice: number | null = null;
      const goldConfig = parseGoldSymbol(sym);
      const isCrypto = !goldConfig && ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'XRP'].includes(sym);
      let priceSource = '';

      if (goldConfig) {
        try {
          if (!goldFetchAttempted) {
            goldFetchAttempted = true;
            cachedGoldSpotUsd = await fetchGoldSpotUsd();
          }

          if (cachedGoldSpotUsd !== null && cachedGoldSpotUsd > 0) {
            const usdThbRate = ratesMap['USD'] ?? (holdingCurrency === 'USD' ? 1.0 : Number(item.exchange_rate) || 33.35);
            rawPrice = calculateGoldHoldingPrice(
              goldConfig,
              cachedGoldSpotUsd,
              usdThbRate,
              holdingCurrency,
              ratesMap
            );
            priceSource = 'gold_api';
          }
        } catch (e) {
          console.error(`Gold price fetch/calculation failed: ${sym}`, e);
        }
      } else if (isCrypto) {
        try {
          // ใช้ CoinGecko Simple Price API แทน (ไม่บล็อก Vercel Serverless)
          const cryptoMap: Record<string, string> = {
            BTC: 'bitcoin',
            ETH: 'ethereum',
            SOL: 'solana',
            BNB: 'binancecoin',
            DOGE: 'dogecoin',
            XRP: 'ripple',
          };
          const coinId = cryptoMap[sym];

          if (coinId) {
            const res = await fetch(
              `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
              { cache: 'no-store' }
            );
            if (res.ok) {
              const data = await res.json();
              if (data[coinId]?.usd) {
                rawPrice = Number(data[coinId].usd);
                priceSource = 'binance_usd'; // รักษา logic เดิมไว้
              }
            }
          }
        } catch (e) {
          console.error(`Crypto fetch failed: ${sym}`, e);
        }
      } else {
        const querySymbol = mapSymbolForYahoo(sym);
        if (querySymbol) {
          try {
            const quote: any = await yahooFinance.quote(querySymbol);
            if (quote?.regularMarketPrice != null) {
              rawPrice = Number(quote.regularMarketPrice);
              priceSource = querySymbol.endsWith('.BK') ? 'yahoo_thb' : 'yahoo_native';
            }
          } catch (e) {
            console.error(`Stock fetch failed: ${sym}`, e);
          }
        }
      }

      if (rawPrice !== null && rawPrice > 0) {
        // Look up the rate_to_thb from our currency_exchange_rates table
        const rateToThb = ratesMap[holdingCurrency] ?? (holdingCurrency === 'THB' ? 1.0 : Number(item.exchange_rate) || 1.0);
        let finalPresentPrice = rawPrice;

        if (priceSource === 'gold_api') {
          // calculateGoldHoldingPrice already returns the price directly in holdingCurrency!
          finalPresentPrice = rawPrice;
        }
        // 1. If Crypto was fetched in USD (Binance / CoinGecko):
        else if (priceSource === 'binance_usd') {
          if (holdingCurrency === 'THB') {
            finalPresentPrice = rawPrice * (ratesMap['USD'] ?? 33.5);
          } else if (holdingCurrency !== 'USD') {
            // e.g. holding in EUR, convert Binance USD to EUR
            const eurRate = ratesMap[holdingCurrency] ?? 1.0;
            finalPresentPrice = (rawPrice * (ratesMap['USD'] ?? 33.5)) / eurRate;
          }
        }
        // 2. If Yahoo was quoted in THB (.BK) but holding currency is USD:
        else if (priceSource === 'yahoo_thb' && holdingCurrency === 'USD') {
          finalPresentPrice = rawPrice / (ratesMap['USD'] ?? 33.5);
        }

        // Update portfolio_holdings:
        // Assign present_price in native currency and set exchange_rate to rate_to_thb from currency_exchange_rates
        const updatePayload: Record<string, any> = {
          present_price: parseFloat(finalPresentPrice.toFixed(4)),
          exchange_rate: parseFloat(rateToThb.toFixed(6)),
          updated_at: new Date().toISOString(),
        };

        const { error: updateError } = await supabase
          .from('portfolio_holdings')
          .update(updatePayload)
          .eq('id', item.id);

        updates.push({
          id: item.id,
          symbol: sym,
          newPrice: finalPresentPrice,
          currency: holdingCurrency,
          exchangeRateUsed: rateToThb,
          priceSource,
          goldType: goldConfig?.type,
          success: !updateError,
          error: updateError?.message,
        });
      } else {
        updates.push({
          id: item.id,
          symbol: sym,
          skipped: true,
          reason: goldConfig ? 'Failed to fetch Gold Spot price' : 'Price quote unavailable',
        });
      }
    }

    return NextResponse.json({
      status: 'success',
      source: authSource,
      rates: ratesMap,
      updatedCount: updates.length,
      warning:
        isCron && !process.env.SUPABASE_SERVICE_ROLE_KEY
          ? 'SUPABASE_SERVICE_ROLE_KEY is not defined in Vercel. Cron might not be able to read/update holdings with RLS enabled.'
          : undefined,
      updates,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}