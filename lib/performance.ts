/**
 * lib/performance.ts
 * Performance analytics engine for calculating Realized P&L, Broker Performance,
 * and Top-Gainer / Top-Loser rankings from trade ledger transactions.
 */

export interface TradeRecord {
  id: number | string;
  broker: string;
  order_id?: string | null;
  trade_date: string;
  side: 'BUY' | 'SELL' | 'FREE' | string;
  stock_symbol: string;
  currency: string;
  units: number;
  unit_price: number;
  exchange_rate: number;
  fee_thb: number;
  gross_amount_thb?: number | null;
  net_amount_thb: number;
  withholding_tax?: number;
  reason?: string | null;
}

export interface HoldingRecord {
  id: number | string;
  symbol: string;
  broker?: string | null;
  volume: number;
  initial_cost: number;
  present_price: number | null;
  currency: string;
  exchange_rate?: number;
  total_cost_thb?: number;
  total_present_price_thb?: number;
  yield_percent?: number;
}

export interface ClosedPosition {
  id: string; // symbol-broker-date or trade id
  symbol: string;
  broker: string;
  currency: string;
  tradeDate: string;
  tradeYear: number;
  unitsSold: number;
  sellPrice: number;
  avgBuyCostThb: number;
  totalCostBasisThb: number;
  netSellProceedsThb: number;
  realizedPnlThb: number;
  realizedYieldPercent: number;
  totalFeesThb: number;
  isProfit: boolean;
  orderId?: string | null;
  reason?: string | null;
}

export interface SymbolPerformance {
  symbol: string;
  broker: string;
  currency: string;
  totalUnitsSold: number;
  totalCostBasisThb: number;
  totalNetProceedsThb: number;
  realizedPnlThb: number;
  realizedYieldPercent: number;
  totalFeesThb: number;
  tradeCount: number;
  winningTrades: number;
  losingTrades: number;
  firstTradeDate: string;
  lastTradeDate: string;
  isOpenHolding: boolean;
  openUnits: number;
  unrealizedPnlThb: number;
}

export interface BrokerPerformance {
  broker: string;
  totalRealizedPnlThb: number;
  totalSellProceedsThb: number;
  totalBuyCostThb: number;
  totalFeesPaidThb: number;
  totalWhtPaidThb: number;
  closedTradesCount: number;
  winningTradesCount: number;
  losingTradesCount: number;
  winRatePercent: number;
  profitFactor: number;
  topGainerSymbol?: string;
  topGainerAmountThb?: number;
  topLoserSymbol?: string;
  topLoserAmountThb?: number;
  activeHoldingsCount: number;
  unrealizedPnlThb: number;
}

export interface OverallPerformanceScorecard {
  totalRealizedPnlThb: number;
  totalRealizedYieldPercent: number;
  totalClosedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  profitFactor: number;
  grossProfitsThb: number;
  grossLossesThb: number;
  totalFeesPaidThb: number;
  totalWhtPaidThb: number;
  totalNetCashFlowThb: number;
  activePortHoldingsCount: number;
  totalUnrealizedPnlThb: number;
}

/**
 * Process chronological trade transactions to calculate closed realized trades
 * using running average cost basis per symbol and broker.
 */
export function calculateClosedPositions(trades: TradeRecord[]): ClosedPosition[] {
  // Sort trades chronologically: oldest first
  const sortedTrades = [...trades].sort((a, b) => {
    const dateComp = (a.trade_date || '').localeCompare(b.trade_date || '');
    if (dateComp !== 0) return dateComp;
    return Number(a.id || 0) - Number(b.id || 0);
  });

  // Track inventory state per key: `${broker}__${symbol}`
  const inventory: Record<
    string,
    {
      units: number;
      totalCostThb: number;
    }
  > = {};

  const closedPositions: ClosedPosition[] = [];

  for (const t of sortedTrades) {
    const sym = (t.stock_symbol || '').trim().toUpperCase();
    const broker = (t.broker || 'BLS').trim();
    const key = `${broker}__${sym}`;

    if (!inventory[key]) {
      inventory[key] = { units: 0, totalCostThb: 0 };
    }

    const state = inventory[key];
    const side = (t.side || '').toUpperCase();
    const units = Number(t.units || 0);
    const fx = Number(t.exchange_rate || 1.0);
    const feeThb = Number(t.fee_thb || 0);
    const netThb = Number(t.net_amount_thb || 0);
    const grossThb = Number(t.gross_amount_thb || units * Number(t.unit_price || 0) * fx);

    if (side === 'BUY' || side === 'FREE') {
      if (units > 0) {
        state.units += units;
        // Cost basis includes fees paid on buy
        state.totalCostThb += side === 'BUY' ? (netThb > 0 ? netThb : grossThb + feeThb) : feeThb;
      }
    } else if (side === 'SELL') {
      if (units > 0) {
        let costBasisThb = 0;
        let avgCostPerUnitThb = 0;

        if (state.units > 0 && state.totalCostThb > 0) {
          avgCostPerUnitThb = state.totalCostThb / state.units;
          // Allocate cost basis proportional to units sold
          const allocatedUnits = Math.min(units, state.units);
          costBasisThb = allocatedUnits * avgCostPerUnitThb;

          // If selling more than tracked in inventory, calculate remainder at estimated unit cost
          if (units > state.units) {
            const excessUnits = units - state.units;
            costBasisThb += excessUnits * avgCostPerUnitThb;
          }

          // Deduct from running inventory
          state.units = Math.max(0, state.units - units);
          state.totalCostThb = Math.max(0, state.totalCostThb - costBasisThb);
        } else {
          // No prior recorded buy, cost basis defaults to grossThb before profit
          costBasisThb = 0;
        }

        const netProceedsThb = netThb > 0 ? netThb : grossThb - feeThb;
        const realizedPnlThb = netProceedsThb - costBasisThb;
        const realizedYieldPercent = costBasisThb > 0 ? (realizedPnlThb / costBasisThb) * 100 : 0;
        const tradeYear = parseInt(t.trade_date ? t.trade_date.split('-')[0] : '0', 10) || new Date().getFullYear();

        closedPositions.push({
          id: String(t.id),
          symbol: sym,
          broker,
          currency: t.currency || 'THB',
          tradeDate: t.trade_date,
          tradeYear,
          unitsSold: units,
          sellPrice: Number(t.unit_price || 0),
          avgBuyCostThb: units > 0 ? costBasisThb / units : 0,
          totalCostBasisThb: costBasisThb,
          netSellProceedsThb: netProceedsThb,
          realizedPnlThb,
          realizedYieldPercent,
          totalFeesThb: feeThb,
          isProfit: realizedPnlThb > 0,
          orderId: t.order_id,
          reason: t.reason,
        });
      }
    }
  }

  // Return closed positions sorted newest first
  return closedPositions.reverse();
}

/**
 * Aggregate performance per symbol across closed positions and compare with active holdings
 */
export function calculateSymbolPerformances(
  closedPositions: ClosedPosition[],
  holdings: HoldingRecord[] = []
): SymbolPerformance[] {
  const map: Record<string, SymbolPerformance> = {};

  // Build active holdings lookup: key `${broker}__${symbol}`
  const activeHoldingsMap = new Map<string, HoldingRecord>();
  holdings.forEach((h) => {
    const sym = (h.symbol || '').trim().toUpperCase();
    const broker = (h.broker || 'BLS').trim();
    activeHoldingsMap.set(`${broker}__${sym}`, h);
    activeHoldingsMap.set(sym, h); // general fallback
  });

  for (const pos of closedPositions) {
    const key = `${pos.broker}__${pos.symbol}`;
    if (!map[key]) {
      const active = activeHoldingsMap.get(key) || activeHoldingsMap.get(pos.symbol);
      const openUnits = Number(active?.volume || 0);
      const unrealizedPnlThb =
        openUnits > 0
          ? Number(active?.total_present_price_thb || 0) - Number(active?.total_cost_thb || 0)
          : 0;

      map[key] = {
        symbol: pos.symbol,
        broker: pos.broker,
        currency: pos.currency,
        totalUnitsSold: 0,
        totalCostBasisThb: 0,
        totalNetProceedsThb: 0,
        realizedPnlThb: 0,
        realizedYieldPercent: 0,
        totalFeesThb: 0,
        tradeCount: 0,
        winningTrades: 0,
        losingTrades: 0,
        firstTradeDate: pos.tradeDate,
        lastTradeDate: pos.tradeDate,
        isOpenHolding: openUnits > 0,
        openUnits,
        unrealizedPnlThb,
      };
    }

    const item = map[key];
    item.totalUnitsSold += pos.unitsSold;
    item.totalCostBasisThb += pos.totalCostBasisThb;
    item.totalNetProceedsThb += pos.netSellProceedsThb;
    item.realizedPnlThb += pos.realizedPnlThb;
    item.totalFeesThb += pos.totalFeesThb;
    item.tradeCount += 1;
    if (pos.isProfit) {
      item.winningTrades += 1;
    } else {
      item.losingTrades += 1;
    }

    if (pos.tradeDate < item.firstTradeDate) item.firstTradeDate = pos.tradeDate;
    if (pos.tradeDate > item.lastTradeDate) item.lastTradeDate = pos.tradeDate;
  }

  // Calculate overall yield percentage per symbol
  return Object.values(map).map((item) => {
    item.realizedYieldPercent =
      item.totalCostBasisThb > 0
        ? (item.realizedPnlThb / item.totalCostBasisThb) * 100
        : 0;
    return item;
  });
}

/**
 * Calculate performance metrics grouped by broker
 */
export function calculateBrokerPerformances(
  closedPositions: ClosedPosition[],
  trades: TradeRecord[],
  holdings: HoldingRecord[] = []
): BrokerPerformance[] {
  const brokerMap: Record<string, BrokerPerformance> = {};

  // Initialize from all available brokers in trades or closed positions
  const allBrokers = new Set<string>();
  trades.forEach((t) => {
    if (t.broker?.trim()) allBrokers.add(t.broker.trim());
  });
  closedPositions.forEach((p) => allBrokers.add(p.broker));
  holdings.forEach((h) => {
    if (h.broker?.trim()) allBrokers.add(h.broker.trim());
  });

  allBrokers.forEach((b) => {
    brokerMap[b] = {
      broker: b,
      totalRealizedPnlThb: 0,
      totalSellProceedsThb: 0,
      totalBuyCostThb: 0,
      totalFeesPaidThb: 0,
      totalWhtPaidThb: 0,
      closedTradesCount: 0,
      winningTradesCount: 0,
      losingTradesCount: 0,
      winRatePercent: 0,
      profitFactor: 0,
      activeHoldingsCount: 0,
      unrealizedPnlThb: 0,
    };
  });

  // Accumulate trade fees & volumes
  trades.forEach((t) => {
    const b = (t.broker || 'BLS').trim();
    if (!brokerMap[b]) {
      brokerMap[b] = {
        broker: b,
        totalRealizedPnlThb: 0,
        totalSellProceedsThb: 0,
        totalBuyCostThb: 0,
        totalFeesPaidThb: 0,
        totalWhtPaidThb: 0,
        closedTradesCount: 0,
        winningTradesCount: 0,
        losingTradesCount: 0,
        winRatePercent: 0,
        profitFactor: 0,
        activeHoldingsCount: 0,
        unrealizedPnlThb: 0,
      };
    }
    const fx = Number(t.exchange_rate || 1.0);
    brokerMap[b].totalFeesPaidThb += Number(t.fee_thb || 0);
    brokerMap[b].totalWhtPaidThb += Number(t.withholding_tax || 0) * (fx > 0 ? fx : 1.0);

    if (t.side === 'BUY') {
      brokerMap[b].totalBuyCostThb += Number(t.net_amount_thb || t.gross_amount_thb || 0);
    } else if (t.side === 'SELL') {
      brokerMap[b].totalSellProceedsThb += Number(t.net_amount_thb || 0);
    }
  });

  // Accumulate closed position gains per broker & find top gainer/loser
  const symbolGainsByBroker: Record<string, Record<string, number>> = {};
  const grossProfitsByBroker: Record<string, number> = {};
  const grossLossesByBroker: Record<string, number> = {};

  closedPositions.forEach((pos) => {
    const b = pos.broker;
    if (!brokerMap[b]) return;

    brokerMap[b].totalRealizedPnlThb += pos.realizedPnlThb;
    brokerMap[b].closedTradesCount += 1;
    if (pos.isProfit) {
      brokerMap[b].winningTradesCount += 1;
      grossProfitsByBroker[b] = (grossProfitsByBroker[b] || 0) + pos.realizedPnlThb;
    } else {
      brokerMap[b].losingTradesCount += 1;
      grossLossesByBroker[b] = (grossLossesByBroker[b] || 0) + Math.abs(pos.realizedPnlThb);
    }

    if (!symbolGainsByBroker[b]) symbolGainsByBroker[b] = {};
    symbolGainsByBroker[b][pos.symbol] = (symbolGainsByBroker[b][pos.symbol] || 0) + pos.realizedPnlThb;
  });

  // Accumulate active holdings per broker
  holdings.forEach((h) => {
    const b = (h.broker || 'BLS').trim();
    if (brokerMap[b] && Number(h.volume || 0) > 0) {
      brokerMap[b].activeHoldingsCount += 1;
      const unrealized = Number(h.total_present_price_thb || 0) - Number(h.total_cost_thb || 0);
      brokerMap[b].unrealizedPnlThb += unrealized;
    }
  });

  // Compute rates and find best/worst symbols
  return Object.values(brokerMap).map((b) => {
    b.winRatePercent =
      b.closedTradesCount > 0
        ? (b.winningTradesCount / b.closedTradesCount) * 100
        : 0;

    const gp = grossProfitsByBroker[b.broker] || 0;
    const gl = grossLossesByBroker[b.broker] || 0;
    b.profitFactor = gl > 0 ? gp / gl : gp > 0 ? gp : 0;

    const symGains = symbolGainsByBroker[b.broker] || {};
    const symEntries = Object.entries(symGains);
    if (symEntries.length > 0) {
      symEntries.sort((a, b) => b[1] - a[1]);
      if (symEntries[0][1] > 0) {
        b.topGainerSymbol = symEntries[0][0];
        b.topGainerAmountThb = symEntries[0][1];
      }
      const last = symEntries[symEntries.length - 1];
      if (last[1] < 0) {
        b.topLoserSymbol = last[0];
        b.topLoserAmountThb = last[1];
      }
    }

    return b;
  });
}

/**
 * Calculate overall performance scorecard
 */
export function calculateOverallScorecard(
  closedPositions: ClosedPosition[],
  trades: TradeRecord[],
  holdings: HoldingRecord[] = []
): OverallPerformanceScorecard {
  let totalRealizedPnlThb = 0;
  let totalCostBasisThb = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let grossProfitsThb = 0;
  let grossLossesThb = 0;

  closedPositions.forEach((pos) => {
    totalRealizedPnlThb += pos.realizedPnlThb;
    totalCostBasisThb += pos.totalCostBasisThb;
    if (pos.isProfit) {
      winningTrades++;
      grossProfitsThb += pos.realizedPnlThb;
    } else {
      losingTrades++;
      grossLossesThb += Math.abs(pos.realizedPnlThb);
    }
  });

  let totalFeesPaidThb = 0;
  let totalWhtPaidThb = 0;
  let totalBuyNetThb = 0;
  let totalSellNetThb = 0;

  trades.forEach((t) => {
    const fx = Number(t.exchange_rate || 1.0);
    totalFeesPaidThb += Number(t.fee_thb || 0);
    totalWhtPaidThb += Number(t.withholding_tax || 0) * (fx > 0 ? fx : 1.0);
    if (t.side === 'BUY') {
      totalBuyNetThb += Number(t.net_amount_thb || 0);
    } else if (t.side === 'SELL') {
      totalSellNetThb += Number(t.net_amount_thb || 0);
    }
  });

  let activePortHoldingsCount = 0;
  let totalUnrealizedPnlThb = 0;

  holdings.forEach((h) => {
    if (Number(h.volume || 0) > 0) {
      activePortHoldingsCount++;
      const diff = Number(h.total_present_price_thb || 0) - Number(h.total_cost_thb || 0);
      totalUnrealizedPnlThb += diff;
    }
  });

  const totalClosedTrades = closedPositions.length;
  const winRatePercent = totalClosedTrades > 0 ? (winningTrades / totalClosedTrades) * 100 : 0;
  const profitFactor = grossLossesThb > 0 ? grossProfitsThb / grossLossesThb : grossProfitsThb > 0 ? grossProfitsThb : 0;
  const totalRealizedYieldPercent = totalCostBasisThb > 0 ? (totalRealizedPnlThb / totalCostBasisThb) * 100 : 0;
  const totalNetCashFlowThb = totalSellNetThb - totalBuyNetThb;

  return {
    totalRealizedPnlThb,
    totalRealizedYieldPercent,
    totalClosedTrades,
    winningTrades,
    losingTrades,
    winRatePercent,
    profitFactor,
    grossProfitsThb,
    grossLossesThb,
    totalFeesPaidThb,
    totalWhtPaidThb,
    totalNetCashFlowThb,
    activePortHoldingsCount,
    totalUnrealizedPnlThb,
  };
}
