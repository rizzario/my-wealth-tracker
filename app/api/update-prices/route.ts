import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

/**
 * Fetch the latest USD/THB exchange rate from Open Exchange API.
 * Reference: AGENTS.md §2
 */
async function getUsdThbRate(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { 'User-Agent': 'my-wealth-tracker/1.0' },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.rates?.THB) {
        return parseFloat(Number(data.rates.THB).toFixed(4));
      }
    }
  } catch (err) {
    console.error('Failed to fetch USD/THB exchange rate:', err);
  }
  return null;
}

/**
 * Check if the symbol is manually tracked or not supported by Yahoo/Binance.
 * Reference: AGENTS.md §4.4
 */
function isExcludedSymbol(rawSymbol: string): boolean {
  const sym = rawSymbol.toUpperCase().trim();
  return (
    sym.startsWith('GOLD') ||
    sym.startsWith('K-') ||
    sym.startsWith('SCBTA') ||
    sym === 'GOOG80'
  );
}

/**
 * Map raw symbol to appropriate Yahoo Finance ticker.
 */
function mapSymbolForYahoo(rawSymbol: string): string | null {
  const sym = rawSymbol.toUpperCase().trim();
  if (isExcludedSymbol(sym)) {
    return null;
  }
  if (sym.endsWith('.BK')) return sym;

  const usTickers = [
    'AAPL', 'NVDA', 'TSLA', 'AMD', 'VOO', 'VZ', 'QQQI', 'GOOG', 'MSFT', 'AMZN', 'META', 'SPY', 'QQQ'
  ];
  if (usTickers.includes(sym)) return sym;

  // Fallback to SET (Stock Exchange of Thailand) ticker
  return `${sym}.BK`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get('id');

    // 1. Fetch live USD/THB exchange rate
    const usdThbRate = await getUsdThbRate();

    // 2. Select between Service Role (for Cron/Admin) and Server Client (for User Session) to satisfy RLS
    let supabase;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
    } else {
      supabase = await createClient();
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

    for (const item of holdings) {
      const sym = item.symbol.toUpperCase().trim();

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
      const isCrypto = ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'XRP'].includes(sym);
      let priceSource = '';

      if (isCrypto) {
        try {
          const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}USDT`);
          if (res.ok) {
            const data = await res.json();
            if (data?.price) {
              rawPrice = parseFloat(data.price);
              priceSource = 'binance_usd';
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
              priceSource = querySymbol.endsWith('.BK') ? 'yahoo_thb' : 'yahoo_usd';
            }
          } catch (e) {
            console.error(`Stock fetch failed: ${sym}`, e);
          }
        }
      }

      if (rawPrice !== null && rawPrice > 0) {
        const isHoldingUsd = (item.currency || '').toUpperCase() === 'USD';
        let finalPresentPrice = rawPrice;

        // Currency alignment (AGENTS.md §4.4):
        // 1. If price was fetched in USD (Binance or US Equities) but holding currency is THB:
        //    Convert USD to THB so present_price matches the THB holding currency.
        if (priceSource === 'binance_usd' && !isHoldingUsd) {
          const fx = usdThbRate ?? Number(item.exchange_rate) ?? 34.0;
          finalPresentPrice = rawPrice * fx;
        } else if (priceSource === 'yahoo_usd' && !isHoldingUsd) {
          const fx = usdThbRate ?? Number(item.exchange_rate) ?? 34.0;
          finalPresentPrice = rawPrice * fx;
        }
        // 2. If price was fetched in THB (.BK) but holding currency is USD:
        else if (priceSource === 'yahoo_thb' && isHoldingUsd) {
          const fx = usdThbRate ?? Number(item.exchange_rate) ?? 34.0;
          finalPresentPrice = rawPrice / fx;
        }

        const updatePayload: Record<string, any> = {
          present_price: parseFloat(finalPresentPrice.toFixed(4)),
          updated_at: new Date().toISOString(),
        };

        // For USD holdings, update current exchange_rate to reflect live valuation (§4.4 & §7.2)
        if (isHoldingUsd && usdThbRate) {
          updatePayload.exchange_rate = usdThbRate;
        }

        const { error: updateError } = await supabase
          .from('portfolio_holdings')
          .update(updatePayload)
          .eq('id', item.id);

        updates.push({
          id: item.id,
          symbol: sym,
          newPrice: finalPresentPrice,
          currency: item.currency || 'THB',
          exchangeRateUsed: isHoldingUsd ? usdThbRate : undefined,
          success: !updateError,
          error: updateError?.message,
        });
      }
    }

    return NextResponse.json({
      status: 'success',
      usdThbRate,
      updatedCount: updates.length,
      updates,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}