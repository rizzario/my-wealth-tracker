import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

function mapSymbolForYahoo(rawSymbol: string): string | null {
  const sym = rawSymbol.toUpperCase().trim();
  if (sym.startsWith('GOLD') || sym.startsWith('K-') || sym.startsWith('SCBTA') || sym === 'GOOG80') {
    return null;
  }
  if (sym.endsWith('.BK')) return sym;

  const usTickers = ['AAPL', 'NVDA', 'TSLA', 'AMD', 'VOO', 'VZ', 'QQQI', 'GOOG'];
  if (usTickers.includes(sym)) return sym;

  return `${sym}.BK`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get('id');

    let usdThbRate = 35.5;
    try {
      const fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
      if (fxRes.ok) {
        const fxData = await fxRes.json();
        if (fxData?.rates?.THB) usdThbRate = Number(fxData.rates.THB);
      }
    } catch {
      console.warn('Fallback FX rate');
    }

    // สร้าง query: ถ้ามี targetId ให้กรองเฉพาะแถวนั้น
    let query = supabase.from('portfolio_holdings').select('id, symbol');
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
      let latestPrice: number | null = null;
      const isCrypto = ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'XRP'].includes(sym);

      if (isCrypto) {
        try {
          const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}USDT`);
          if (res.ok) {
            const data = await res.json();
            if (data.price) latestPrice = parseFloat(data.price);
          }
        } catch (e) {
          console.error(`Crypto fetch failed: ${sym}`, e);
        }
      } else {
        const querySymbol = mapSymbolForYahoo(sym);
        if (querySymbol) {
          try {
            const quote: any = await yahooFinance.quote(querySymbol);
            if (quote?.regularMarketPrice) {
              const price = Number(quote.regularMarketPrice);
              latestPrice = (!querySymbol.endsWith('.BK') && quote.currency === 'USD')
                ? price
                : price;
            }
          } catch (e) {
            console.error(`Stock fetch failed: ${sym}`, e);
          }
        }
      }

      if (latestPrice !== null && latestPrice > 0) {
        const { error: updateError } = await supabase
          .from('portfolio_holdings')
          .update({
            present_price: parseFloat(latestPrice.toFixed(2)),
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        updates.push({ id: item.id, symbol: sym, newPrice: latestPrice, success: !updateError });
      }
    }

    return NextResponse.json({ status: 'success', updatedCount: updates.length, updates });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}