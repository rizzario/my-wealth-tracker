/**
 * Interest calculation and forecasting utilities.
 * Handles End-of-Day (EOD) daily accrual, annual and monthly forecasting,
 * and calculations for `financial_accounts` (asset accounts where is_liability = false).
 * 
 * Reference: AGENTS.md §3.6
 * Thai Tax Rules (กรมสรรพากร):
 * - Regular savings account interest <= 20,000 THB/year is exempt from 15% withholding tax.
 * - If total annual interest exceeds 20,000 THB, 15% withholding tax applies.
 */

// ============================================================================
// 1. Interfaces & Types
// ============================================================================

export interface InterestCalcParams {
  balance: number;
  ratePercent: number;
  payoutFrequency: 'MONTHLY' | 'SEMI_ANNUAL' | 'ANNUAL' | 'AT_MATURITY' | string;
  depositStartDate?: string | null;
  maturityDate?: string | null;
  isTaxExempt?: boolean; // รองรับภาษีหัก ณ ที่จ่าย 15%
}

/**
 * Result interface returning daily, monthly, annual interest and tax exemption status.
 */
export interface AccountInterestResult {
  daily: number;              // EOD / daily interest (net of tax)
  monthly: number;            // Monthly forecast interest (net of tax)
  annual: number;             // Annual forecast interest (net of tax)
  taxExemptStatus: boolean;   // Whether interest is exempt from 15% withholding tax
  grossDaily: number;         // Daily interest before tax
  grossMonthly: number;       // Monthly interest before tax
  grossAnnual: number;        // Annual interest before tax
  withholdingTax: number;     // Estimated 15% withholding tax amount per year
  effectiveRate: number;      // Effective interest rate (% p.a.) after tax
  balanceTHB: number;         // Account balance converted to THB
}

/**
 * Generic shape representing a row from `financial_accounts` table.
 */
export interface FinancialAccountItem {
  id?: string;
  account_name?: string | null;
  account_type?: string | null;
  bank_name?: string | null;
  current_balance?: number | string | null;
  is_liability?: boolean | null;
  interest_rate?: number | string | null;
  currency?: string | null;
  cost_exchange_rate?: number | string | null;
  is_tax_exempt?: boolean | null;
}

/**
 * Aggregated summary for multiple `financial_accounts` (where is_liability = false).
 */
export interface FinancialAccountsInterestSummary {
  daily: number;              // Total daily EOD interest across all eligible asset accounts (net)
  monthly: number;            // Total monthly forecast interest (net)
  annual: number;             // Total annual forecast interest (net)
  taxExemptStatus: boolean;   // Overall tax exemption status (e.g. <= 20,000 THB threshold)
  grossDaily: number;         // Total daily gross interest
  grossMonthly: number;       // Total monthly gross interest
  grossAnnual: number;        // Total annual gross interest
  totalWithholdingTax: number;// Total annual 15% withholding tax
  totalAssetBalance: number;  // Total asset balance (THB)
  accountCount: number;       // Number of eligible asset accounts
  accounts: Array<{
    account: FinancialAccountItem;
    result: AccountInterestResult;
  }>;
}

export interface InterestOptions {
  isTaxExempt?: boolean;      // Explicitly override tax exemption status
  daysInYear?: number;        // 365 (standard) or 366 (leap year)
}

export interface BatchInterestOptions extends InterestOptions {
  taxThreshold?: number;      // Default 20,000 THB per year for Thai savings accounts
}

// ============================================================================
// 2. Core Helper Functions
// ============================================================================

function getPenultimateBusinessDay(year: number, monthIndex: number): Date {
  const date = new Date(year, monthIndex + 1, 0);
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  while (isWeekend(date)) {
    date.setDate(date.getDate() - 1);
  }
  date.setDate(date.getDate() - 1);
  while (isWeekend(date)) {
    date.setDate(date.getDate() - 1);
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Calculates End-of-Day (EOD) daily interest accrual based on closing balance.
 * Formula: (balance * (ratePercent / 100)) / daysInYear
 *
 * @param balance - Account balance (stored positive)
 * @param ratePercent - Interest rate per annum in percent (e.g. 1.50 for 1.5%)
 * @param isTaxExempt - If true, 0% withholding tax; if false, 15% withholding tax deducted
 * @param daysInYear - Standard 365 days (or 366 for leap years)
 * @returns Daily net interest accrued at EOD
 */
export function calculateEODInterest(
  balance: number,
  ratePercent: number,
  isTaxExempt = true,
  daysInYear = 365
): number {
  if (balance <= 0 || ratePercent <= 0) return 0;
  const grossDaily = (balance * (ratePercent / 100)) / daysInYear;
  const taxMultiplier = isTaxExempt ? 1.0 : 0.85;
  return parseFloat((grossDaily * taxMultiplier).toFixed(4));
}

/**
 * Forecasts interest to obtain per year, month, and day for a given balance and interest rate.
 *
 * @param balance - Account balance (THB)
 * @param ratePercent - Annual interest rate (%)
 * @param isTaxExempt - Exemption status from Thai 15% withholding tax
 * @param daysInYear - Number of days in the year (default 365)
 * @returns AccountInterestResult with daily, monthly, annual, and taxExemptStatus
 */
export function forecastAnnualInterest(
  balance: number,
  ratePercent: number,
  isTaxExempt = true,
  daysInYear = 365
): AccountInterestResult {
  const safeBalance = Math.max(0, Number(balance) || 0);
  const safeRate = Math.max(0, Number(ratePercent) || 0);

  const grossAnnual = safeBalance * (safeRate / 100);
  const grossMonthly = grossAnnual / 12;
  const grossDaily = grossAnnual / daysInYear;

  const taxMultiplier = isTaxExempt ? 1.0 : 0.85;
  const withholdingTax = isTaxExempt ? 0 : grossAnnual * 0.15;

  const annual = parseFloat((grossAnnual * taxMultiplier).toFixed(2));
  const monthly = parseFloat((grossMonthly * taxMultiplier).toFixed(2));
  const daily = parseFloat((grossDaily * taxMultiplier).toFixed(4));
  const effectiveRate = parseFloat((safeRate * taxMultiplier).toFixed(4));

  return {
    daily,
    monthly,
    annual,
    taxExemptStatus: isTaxExempt,
    grossDaily: parseFloat(grossDaily.toFixed(4)),
    grossMonthly: parseFloat(grossMonthly.toFixed(2)),
    grossAnnual: parseFloat(grossAnnual.toFixed(2)),
    withholdingTax: parseFloat(withholdingTax.toFixed(2)),
    effectiveRate,
    balanceTHB: safeBalance,
  };
}

// ============================================================================
// 3. Financial Accounts Interest Calculations (where is_liability = false)
// ============================================================================

/**
 * Calculates interest for a single account from `financial_accounts`.
 * Only applies to asset accounts where `is_liability` is false (or falsy).
 * Liabilities (credit cards, loans) return 0 interest income.
 *
 * @param account - Row from `financial_accounts` table
 * @param options - Optional calculation options (override tax exemption, days in year)
 * @returns AccountInterestResult with daily, monthly, annual, taxExemptStatus
 */
export function calculateFinancialAccountInterest(
  account: FinancialAccountItem,
  options?: InterestOptions
): AccountInterestResult {
  // If account is marked as a liability (debt/credit card/loan), it produces 0 interest earnings
  if (account.is_liability) {
    return {
      daily: 0,
      monthly: 0,
      annual: 0,
      taxExemptStatus: true,
      grossDaily: 0,
      grossMonthly: 0,
      grossAnnual: 0,
      withholdingTax: 0,
      effectiveRate: 0,
      balanceTHB: 0,
    };
  }

  // Defensive balance and FX rate extraction (AGENTS.md §3.6 & §5.4)
  const rawBalance = Number(account.current_balance ?? 0);
  const currency = (account.currency || 'THB').toUpperCase();
  const fxRate = Number(account.cost_exchange_rate ?? 1.0);
  const balanceTHB = currency !== 'THB' ? rawBalance * (fxRate > 0 ? fxRate : 1.0) : rawBalance;

  const ratePercent = Number(account.interest_rate ?? 0);
  const daysInYear = options?.daysInYear ?? 365;

  // Determine tax exemption:
  // 1. Explicit option override if provided
  // 2. Account level `is_tax_exempt` flag if set
  // 3. Default to true for individual account forecast (tax threshold checked at batch level)
  const isTaxExempt =
    options?.isTaxExempt !== undefined
      ? options.isTaxExempt
      : account.is_tax_exempt !== undefined && account.is_tax_exempt !== null
      ? Boolean(account.is_tax_exempt)
      : true;

  return forecastAnnualInterest(balanceTHB, ratePercent, isTaxExempt, daysInYear);
}

/**
 * Calculates aggregated interest across multiple `financial_accounts`.
 * Automatically filters for asset accounts where `is_liability` = false.
 * Evaluates the 20,000 THB Thai tax exemption threshold across all eligible accounts.
 *
 * @param accounts - Array of rows from `financial_accounts` table
 * @param options - Batch options including taxThreshold (default 20,000 THB)
 * @returns FinancialAccountsInterestSummary with total daily, monthly, annual, and taxExemptStatus
 */
export function calculateFinancialAccountsInterest(
  accounts: FinancialAccountItem[] = [],
  options?: BatchInterestOptions
): FinancialAccountsInterestSummary {
  const daysInYear = options?.daysInYear ?? 365;
  const taxThreshold = options?.taxThreshold ?? 20000;

  // 1. Filter only asset accounts (is_liability === false)
  const assetAccounts = accounts.filter((acc) => !acc.is_liability);

  // 2. First pass: compute gross annual interest across all accounts to test 20,000 THB threshold
  let totalAssetBalance = 0;
  let totalGrossAnnual = 0;
  let totalGrossMonthly = 0;
  let totalGrossDaily = 0;

  const tempResults: Array<{
    account: FinancialAccountItem;
    balanceTHB: number;
    ratePercent: number;
    grossAnnual: number;
    grossMonthly: number;
    grossDaily: number;
    explicitTaxExempt?: boolean;
  }> = [];

  for (const acc of assetAccounts) {
    const rawBalance = Number(acc.current_balance ?? 0);
    const currency = (acc.currency || 'THB').toUpperCase();
    const fxRate = Number(acc.cost_exchange_rate ?? 1.0);
    const balanceTHB = currency !== 'THB' ? rawBalance * (fxRate > 0 ? fxRate : 1.0) : rawBalance;
    const ratePercent = Number(acc.interest_rate ?? 0);

    const grossAnnual = balanceTHB > 0 && ratePercent > 0 ? balanceTHB * (ratePercent / 100) : 0;
    const grossMonthly = grossAnnual / 12;
    const grossDaily = grossAnnual / daysInYear;

    totalAssetBalance += balanceTHB;
    totalGrossAnnual += grossAnnual;
    totalGrossMonthly += grossMonthly;
    totalGrossDaily += grossDaily;

    const explicitTaxExempt =
      options?.isTaxExempt !== undefined
        ? options.isTaxExempt
        : acc.is_tax_exempt != null
        ? Boolean(acc.is_tax_exempt)
        : undefined;

    tempResults.push({
      account: acc,
      balanceTHB,
      ratePercent,
      grossAnnual,
      grossMonthly,
      grossDaily,
      explicitTaxExempt,
    });
  }

  // 3. Determine overall tax exemption status (Thai 20,000 THB threshold rule)
  // If user provided an explicit override, use it. Otherwise, if total gross interest <= 20,000 THB, exempt.
  const overallTaxExempt =
    options?.isTaxExempt !== undefined
      ? options.isTaxExempt
      : totalGrossAnnual <= taxThreshold;

  // 4. Second pass: compute net daily, monthly, annual, and withholding tax for each account
  let totalNetDaily = 0;
  let totalNetMonthly = 0;
  let totalNetAnnual = 0;
  let totalWithholdingTax = 0;

  const accountResults: Array<{
    account: FinancialAccountItem;
    result: AccountInterestResult;
  }> = [];

  for (const item of tempResults) {
    const isExempt =
      item.explicitTaxExempt !== undefined
        ? item.explicitTaxExempt
        : overallTaxExempt;

    const taxMultiplier = isExempt ? 1.0 : 0.85;
    const wht = isExempt ? 0 : item.grossAnnual * 0.15;

    const netAnnual = parseFloat((item.grossAnnual * taxMultiplier).toFixed(2));
    const netMonthly = parseFloat((item.grossMonthly * taxMultiplier).toFixed(2));
    const netDaily = parseFloat((item.grossDaily * taxMultiplier).toFixed(4));
    const effectiveRate = parseFloat((item.ratePercent * taxMultiplier).toFixed(4));

    totalNetAnnual += netAnnual;
    totalNetMonthly += netMonthly;
    totalNetDaily += netDaily;
    totalWithholdingTax += wht;

    const res: AccountInterestResult = {
      daily: netDaily,
      monthly: netMonthly,
      annual: netAnnual,
      taxExemptStatus: isExempt,
      grossDaily: parseFloat(item.grossDaily.toFixed(4)),
      grossMonthly: parseFloat(item.grossMonthly.toFixed(2)),
      grossAnnual: parseFloat(item.grossAnnual.toFixed(2)),
      withholdingTax: parseFloat(wht.toFixed(2)),
      effectiveRate,
      balanceTHB: item.balanceTHB,
    };

    accountResults.push({
      account: item.account,
      result: res,
    });
  }

  return {
    daily: parseFloat(totalNetDaily.toFixed(2)),
    monthly: parseFloat(totalNetMonthly.toFixed(2)),
    annual: parseFloat(totalNetAnnual.toFixed(2)),
    taxExemptStatus: overallTaxExempt,
    grossDaily: parseFloat(totalGrossDaily.toFixed(2)),
    grossMonthly: parseFloat(totalGrossMonthly.toFixed(2)),
    grossAnnual: parseFloat(totalGrossAnnual.toFixed(2)),
    totalWithholdingTax: parseFloat(totalWithholdingTax.toFixed(2)),
    totalAssetBalance: parseFloat(totalAssetBalance.toFixed(2)),
    accountCount: assetAccounts.length,
    accounts: accountResults,
  };
}

/**
 * Calculates estimated interest for a financial account or balance and rate.
 * Supports both object input (FinancialAccountItem) and separate balance/rate arguments.
 * Designed for direct integration with CashFlowSection and other account views.
 *
 * Example:
 * `GHB ALL Savings` 1000 (1.45%) -> Estimated interest +14.5 baht/year (~0.0397 baht/day)
 *
 * @param balanceOrAccount - Account object or numeric balance
 * @param rateOrOptions - Annual interest rate (%) or calculation options
 * @param maybeOptions - Options when passing balance and rate
 * @returns AccountInterestResult with daily, monthly, annual, taxExemptStatus
 */
export function calculateEstimatedInterest(
  balance: number,
  ratePercent: number,
  options?: InterestOptions
): AccountInterestResult;
export function calculateEstimatedInterest(
  account: FinancialAccountItem,
  options?: InterestOptions
): AccountInterestResult;
export function calculateEstimatedInterest(
  balanceOrAccount: number | FinancialAccountItem,
  rateOrOptions?: number | InterestOptions,
  maybeOptions?: InterestOptions
): AccountInterestResult {
  if (typeof balanceOrAccount === 'object' && balanceOrAccount !== null) {
    return calculateFinancialAccountInterest(
      balanceOrAccount,
      typeof rateOrOptions === 'object' ? rateOrOptions : maybeOptions
    );
  }

  const balance = Number(balanceOrAccount || 0);
  const rate = typeof rateOrOptions === 'number' ? Number(rateOrOptions || 0) : 0;
  const isTaxExempt = maybeOptions?.isTaxExempt ?? true;
  const daysInYear = maybeOptions?.daysInYear ?? 365;

  return forecastAnnualInterest(balance, rate, isTaxExempt, daysInYear);
}

// ============================================================================
// 4. Legacy / Fixed Deposit & PVD Interest Calculator (CashAndPvdSection)
// ============================================================================

export function calculateAccountInterest({
  balance,
  ratePercent,
  payoutFrequency,
  depositStartDate,
  maturityDate,
  isTaxExempt = false,
}: InterestCalcParams) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  let lastPayoutDate: Date;
  let nextPayoutDate: Date;

  if (payoutFrequency === 'MONTHLY') {
    const thisMonthPayout = getPenultimateBusinessDay(currentYear, currentMonth);

    if (today > thisMonthPayout) {
      // จ่ายรอบของเดือนนี้ไปแล้ว กำหนดรอบใหม่เป็นของเดือนหน้า
      lastPayoutDate = thisMonthPayout;
      nextPayoutDate = getPenultimateBusinessDay(currentYear, currentMonth + 1);
    } else {
      // ยังไม่ถึงวันจ่ายของเดือนนี้
      lastPayoutDate = getPenultimateBusinessDay(currentYear, currentMonth - 1);
      nextPayoutDate = thisMonthPayout;
    }
  } else if (payoutFrequency === 'AT_MATURITY' && maturityDate) {
    lastPayoutDate = depositStartDate ? new Date(depositStartDate) : new Date(currentYear, 0, 1);
    nextPayoutDate = new Date(maturityDate);
  } else {
    // SEMI_ANNUAL: ปลาย มิ.ย. และ ปลาย ธ.ค.
    const juneEnd = new Date(currentYear, 5, 30);
    const decEnd = new Date(currentYear, 11, 31);

    if (today <= juneEnd) {
      lastPayoutDate = new Date(currentYear, 0, 1);
      nextPayoutDate = juneEnd;
    } else {
      lastPayoutDate = new Date(currentYear, 6, 1);
      nextPayoutDate = decEnd;
    }
  }

  // ปรับวันเริ่มต้นหากเปิดบัญชีระหว่างงวด
  let effectiveStartDate = lastPayoutDate;
  if (depositStartDate) {
    const openDate = new Date(depositStartDate);
    openDate.setHours(0, 0, 0, 0);
    if (openDate > lastPayoutDate) {
      effectiveStartDate = openDate;
    }
  }

  // คำนวณจำนวนวัน
  const daysAccrued = Math.max(
    0,
    Math.ceil((today.getTime() - effectiveStartDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  const totalDaysInCycle = Math.max(
    1,
    Math.ceil((nextPayoutDate.getTime() - effectiveStartDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  // คำนวณดอกเบี้ย (สูตรรายวัน 365 วัน)
  const dailyGrossInterest = (balance * (ratePercent / 100)) / 365;
  const grossAccrued = dailyGrossInterest * daysAccrued;
  const grossProjected = dailyGrossInterest * totalDaysInCycle;

  // ภาษีหัก ณ ที่จ่าย 15% (ถ้าไม่ได้ยกเว้นภาษี)
  const taxMultiplier = isTaxExempt ? 1.0 : 0.85;

  return {
    effectiveStartDate: effectiveStartDate.toISOString().split('T')[0],
    nextPayoutDate: nextPayoutDate.toISOString().split('T')[0],
    daysAccrued,
    totalDaysInCycle,
    grossAccrued: parseFloat(grossAccrued.toFixed(2)),
    accruedToDate: parseFloat((grossAccrued * taxMultiplier).toFixed(2)), // สุทธิหลังหักภาษี
    projectedAtPayout: parseFloat((grossProjected * taxMultiplier).toFixed(2)), // สุทธิที่จะได้รับจริงรอบถัดไป
    taxDeduction: parseFloat((grossProjected * (1 - taxMultiplier)).toFixed(2)),
  };
}