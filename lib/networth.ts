/**
 * Canonical Net Worth calculation and financial balance helpers.
 * Reference: AGENTS.md §3.8
 *
 * Formula:
 * Net Worth (THB) =
 *     SUM(financial_accounts.current_balance  WHERE is_liability = false)
 *   - SUM(financial_accounts.current_balance  WHERE is_liability = true)
 *   + SUM(cash_and_pvd_assets.current_balance)
 *   + SUM(portfolio_holdings.total_present_price_thb)
 *
 * Gotchas avoided:
 * - Never add pvd_employee_contrib or pvd_employer_contrib on top of current_balance (already included).
 * - Stored liabilities are positive; sign comes from is_liability = true.
 * - Defensive against null, undefined, or string numbers returned by Supabase.
 */

export interface FinancialAccountLike {
  current_balance?: number | string | null;
  is_liability?: boolean | null;
  account_type?: string | null;
}

export interface CashPvdAssetLike {
  current_balance?: number | string | null;
  amount?: number | string | null;
  account_type?: string | null;
  asset_type?: string | null;
  is_liquid?: boolean | null;
}

export interface PortfolioHoldingLike {
  total_present_price_thb?: number | string | null;
  total_cost_thb?: number | string | null;
  present_price?: number | string | null;
  volume?: number | string | null;
  exchange_rate?: number | string | null;
  currency?: string | null;
}

export interface NetWorthSummary {
  // Canonical Net Worth
  netWorth: number;

  // Components of Net Worth
  totalOperatingAssets: number;     // financial_accounts (is_liability = false)
  totalLiabilities: number;         // financial_accounts (is_liability = true)
  totalCashAndPvd: number;          // ALL cash_and_pvd_assets (PVD + Fixed Deposit + High Yield)
  totalHoldingsValueTHB: number;    // portfolio_holdings (total_present_price_thb)
  totalHoldingsCostTHB: number;     // portfolio_holdings (total_cost_thb)
  holdingsPL: number;               // totalHoldingsValueTHB - totalHoldingsCostTHB
  holdingsYield: number;            // (holdingsPL / totalHoldingsCostTHB) * 100

  // Category breakdowns for dashboard cards
  totalLiquidCash: number;          // Operating Assets + parked liquid cash
  totalPVD: number;                 // Provident Fund (PVD)
  totalFixedDeposit: number;        // Fixed Deposit (เงินฝากประจำ)
}

/**
 * Calculates the canonical net worth and all related category balances.
 */
export function calculateNetWorthSummary(
  holdings: PortfolioHoldingLike[] = [],
  cashPvd: CashPvdAssetLike[] = [],
  financialAccounts: FinancialAccountLike[] = []
): NetWorthSummary {
  // 1. Financial Accounts (Operating Cash/Bank vs Short-term Liabilities)
  let totalOperatingAssets = 0;
  let totalLiabilities = 0;

  for (const acc of financialAccounts) {
    const balance = Number(acc.current_balance ?? 0);
    if (acc.is_liability) {
      totalLiabilities += balance;
    } else {
      totalOperatingAssets += balance;
    }
  }

  // 2. Cash and PVD Assets (Parked / locked yield-bearing assets)
  let totalCashAndPvd = 0;
  let totalPVD = 0;
  let totalFixedDeposit = 0;
  let parkedLiquidCash = 0;

  for (const item of cashPvd) {
    // Defense: current_balance is the single value used for net worth
    const balance = Number(item.current_balance ?? item.amount ?? 0);
    totalCashAndPvd += balance;

    const accType = (item.account_type || item.asset_type || '').toUpperCase();
    if (accType === 'PVD') {
      totalPVD += balance;
    } else if (accType === 'FIXED_DEPOSIT') {
      totalFixedDeposit += balance;
    } else {
      // CASH, SAVINGS, HIGH_YIELD, etc.
      parkedLiquidCash += balance;
    }
  }

  // 3. Portfolio Holdings (Stocks, Crypto, Gold, Mutual Funds)
  let totalHoldingsCostTHB = 0;
  let totalHoldingsValueTHB = 0;

  for (const h of holdings) {
    totalHoldingsCostTHB += Number(h.total_cost_thb ?? 0);
    totalHoldingsValueTHB += Number(h.total_present_price_thb ?? 0);
  }

  const holdingsPL = totalHoldingsValueTHB - totalHoldingsCostTHB;
  const holdingsYield = totalHoldingsCostTHB > 0 ? (holdingsPL / totalHoldingsCostTHB) * 100 : 0;

  // Canonical formula (§3.8)
  const netWorth =
    totalOperatingAssets - totalLiabilities + totalCashAndPvd + totalHoldingsValueTHB;

  // Liquid cash available for immediate spending:
  // Operating bank/cash + liquid high yield / savings
  const totalLiquidCash = totalOperatingAssets + parkedLiquidCash;

  return {
    netWorth,
    totalOperatingAssets,
    totalLiabilities,
    totalCashAndPvd,
    totalHoldingsValueTHB,
    totalHoldingsCostTHB,
    holdingsPL,
    holdingsYield,
    totalLiquidCash,
    totalPVD,
    totalFixedDeposit,
  };
}

/**
 * Asynchronously fetches all components and computes the canonical Net Worth summary.
 * Checks for the Postgres view `v_net_worth` first (M7), and seamlessly falls back
 * to querying individual tables if the view has not yet been applied in Supabase.
 */
export async function fetchNetWorthSummary(supabase: any): Promise<NetWorthSummary> {
  try {
    const { data: viewRow, error } = await supabase.from('v_net_worth').select('*').maybeSingle();
    if (!error && viewRow) {
      const totalHoldingsCostTHB = Number(viewRow.total_holdings_cost_thb ?? 0);
      const holdingsPL = Number(viewRow.holdings_pl_thb ?? 0);
      const holdingsYield = totalHoldingsCostTHB > 0 ? (holdingsPL / totalHoldingsCostTHB) * 100 : 0;

      return {
        netWorth: Number(viewRow.net_worth_thb ?? 0),
        totalOperatingAssets: Number(viewRow.total_operating_assets ?? 0),
        totalLiabilities: Number(viewRow.total_liabilities ?? 0),
        totalCashAndPvd: Number(viewRow.total_cash_and_pvd ?? 0),
        totalHoldingsValueTHB: Number(viewRow.total_holdings_value_thb ?? 0),
        totalHoldingsCostTHB,
        holdingsPL,
        holdingsYield,
        totalLiquidCash: Number(viewRow.total_liquid_cash ?? 0),
        totalPVD: Number(viewRow.total_pvd ?? 0),
        totalFixedDeposit: Number(viewRow.total_fixed_deposit ?? 0),
      };
    }
  } catch {
    // If v_net_worth query fails, proceed to fallback below
  }

  // Fallback: Query underlying tables directly and compute using calculateNetWorthSummary
  const [hRes, cRes, fRes] = await Promise.all([
    supabase.from('portfolio_holdings').select('*'),
    supabase.from('cash_and_pvd_assets').select('*'),
    supabase.from('financial_accounts').select('*'),
  ]);

  const holdings = (hRes.data || []) as PortfolioHoldingLike[];
  const cashPvd = (cRes.data || []) as CashPvdAssetLike[];
  const financialAccounts = (fRes.data || []) as FinancialAccountLike[];

  return calculateNetWorthSummary(holdings, cashPvd, financialAccounts);
}
