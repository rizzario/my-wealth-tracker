/**
 * Recurring Commitments & Pending Liabilities Module
 * Reference: TASK_RECURRING_COMMITMENTS.md
 *
 * Provides pure business logic for:
 * - Determining active commitments in a given year/month (Monthly, Quarterly, Annual)
 * - Identifying if a commitment has already been converted/confirmed into a transaction
 * - Calculating actual vs. pending liabilities and projected statement balances for credit cards/loans
 */

export type CommitmentFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

export interface RecurringCommitment {
  id: string;
  user_id?: string;
  name: string;
  amount: number;
  frequency: CommitmentFrequency;
  due_day: number; // 1-31
  due_month?: number | null; // 1-12 (required when frequency = 'ANNUAL')
  start_date: string; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD (null = indefinite/ongoing)
  is_active: boolean;
  payment_account_id?: string | null;
  category: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const RECURRING_CATEGORIES = [
  'เบี้ยประกัน (Insurance)',
  'ผ่อนชำระ 0% (Installment)',
  'ค่าสมาชิก & ซับสคริปชัน (Subscription)',
  'ค่าสาธารณูปโภค (Utility)',
  'ค่าผ่อนบ้าน/รถ (Loan/Mortgage)',
  'ค่าเช่า (Rent)',
  'อื่นๆ (Other)',
] as const;

/**
 * Returns the ISO string date range (first day and last day) for a given year and month (1-12).
 */
export function getMonthDateRange(year: number, month: number): { firstDay: string; lastDay: string } {
  const yStr = String(year);
  const mStr = String(month).padStart(2, '0');
  const firstDay = `${yStr}-${mStr}-01`;
  const lastDayNum = new Date(year, month, 0).getDate();
  const lastDay = `${yStr}-${mStr}-${String(lastDayNum).padStart(2, '0')}`;
  return { firstDay, lastDay };
}

/**
 * Calculates the exact due date (YYYY-MM-DD) for a commitment in a given target month,
 * safely clamping due_day if the month has fewer days (e.g. day 31 in Feb -> Feb 28/29).
 */
export function getCommitmentDueDate(
  commitment: RecurringCommitment,
  targetYear: number,
  targetMonth: number
): string {
  const lastDayNum = new Date(targetYear, targetMonth, 0).getDate();
  const day = Math.min(commitment.due_day, lastDayNum);
  const mStr = String(targetMonth).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  return `${targetYear}-${mStr}-${dStr}`;
}

/**
 * Checks whether a commitment is eligible/active in a given target month (targetMonth is 1-12).
 * Rules:
 * 1. is_active === true
 * 2. start_date <= last day of target month
 * 3. end_date === null OR end_date >= first day of target month
 * 4. Frequency match:
 *    - MONTHLY: active every month
 *    - QUARTERLY: active if (targetMonth - startMonth) in quarters from start_date
 *    - ANNUAL: active only if targetMonth === due_month (or startMonth if due_month is omitted)
 */
export function isCommitmentActiveInMonth(
  commitment: RecurringCommitment,
  targetYear: number,
  targetMonth: number
): boolean {
  if (!commitment.is_active) return false;

  const { firstDay, lastDay } = getMonthDateRange(targetYear, targetMonth);

  // 1. start_date must not be in the future beyond this target month
  if (commitment.start_date > lastDay) {
    return false;
  }

  // 2. end_date must not be prior to this target month
  if (commitment.end_date && commitment.end_date < firstDay) {
    return false;
  }

  // Parse start_date year & month
  const [sYearStr, sMonthStr] = commitment.start_date.split('-');
  const startYear = parseInt(sYearStr, 10);
  const startMonth = parseInt(sMonthStr, 10);

  // 3. Frequency matching
  if (commitment.frequency === 'MONTHLY') {
    return true;
  }

  if (commitment.frequency === 'QUARTERLY') {
    const totalMonthsDiff = (targetYear - startYear) * 12 + (targetMonth - startMonth);
    return totalMonthsDiff >= 0 && totalMonthsDiff % 3 === 0;
  }

  if (commitment.frequency === 'ANNUAL') {
    const targetDueMonth = commitment.due_month != null ? commitment.due_month : startMonth;
    return targetMonth === targetDueMonth;
  }

  return false;
}

/**
 * Checks if an active recurring commitment has already been logged/confirmed
 * in expense_income_transactions for the target month.
 */
export function hasCommitmentBeenConfirmed(
  commitment: RecurringCommitment,
  targetYear: number,
  targetMonth: number,
  transactions: any[]
): boolean {
  if (!transactions || transactions.length === 0) return false;

  const { firstDay, lastDay } = getMonthDateRange(targetYear, targetMonth);
  const normalizedName = (commitment.name || '').trim().toLowerCase();
  if (!normalizedName) return false;

  const idTag = `[rc:${commitment.id}]`.toLowerCase();
  const prefixNote = `[recurring] ${normalizedName}`;

  return transactions.some((txn) => {
    const type = (txn.type || '').toUpperCase();
    if (type !== 'EXPENSE') return false;

    // Check transaction date in target month
    const tDate = txn.transaction_date ? txn.transaction_date.slice(0, 10) : '';
    if (!tDate || tDate < firstDay || tDate > lastDay) {
      return false;
    }

    // Check account link if commitment specifies a payment account
    if (commitment.payment_account_id && txn.account_id && txn.account_id !== commitment.payment_account_id) {
      return false;
    }

    const note = (txn.note || '').toLowerCase();

    // 1. Primary Match: Match by unique ID tag [rc:UUID]
    if (note.includes(idTag)) return true;

    // 2. Secondary Match: Explicit recurring prefix [recurring] + name
    if (note.includes(prefixNote)) return true;

    // 3. Has [recurring] tag and includes commitment name
    if (note.includes('[recurring]') && note.includes(normalizedName)) return true;

    // 4. If account is explicitly linked and name is sufficiently unique (>= 3 chars), check note
    if (
      commitment.payment_account_id &&
      txn.account_id === commitment.payment_account_id &&
      normalizedName.length >= 3 &&
      note.includes(normalizedName)
    ) {
      return true;
    }

    return false;
  });
}

export interface AccountPendingSummary {
  accountId: string;
  accountName: string;
  bankName?: string | null;
  accountType: string;
  currency: string;
  isLiability: boolean;
  actualBalance: number;
  pendingAmount: number;
  projectedBalance: number;
  pendingCommitments: RecurringCommitment[];
  confirmedCommitments: RecurringCommitment[];
}

export interface LiabilitiesProjectionSummary {
  accountsMap: Record<string, AccountPendingSummary>;
  totalActualLiabilities: number;
  totalPendingLiabilities: number;
  totalProjectedLiabilities: number;
  allActiveCommitmentsThisMonth: RecurringCommitment[];
  allPendingCommitmentsThisMonth: RecurringCommitment[];
  allConfirmedCommitmentsThisMonth: RecurringCommitment[];
}

/**
 * Computes actual balance, pending recurring commitments, and projected statement balances
 * for all liability and operating accounts.
 */
export function calculatePendingLiabilities(
  accounts: any[] = [],
  commitments: RecurringCommitment[] = [],
  transactions: any[] = [],
  targetYear: number = new Date().getFullYear(),
  targetMonth: number = new Date().getMonth() + 1
): LiabilitiesProjectionSummary {
  const accountsMap: Record<string, AccountPendingSummary> = {};
  const allActiveCommitmentsThisMonth: RecurringCommitment[] = [];
  const allPendingCommitmentsThisMonth: RecurringCommitment[] = [];
  const allConfirmedCommitmentsThisMonth: RecurringCommitment[] = [];

  for (const acc of accounts) {
    const bal = Number(acc.current_balance || 0);
    accountsMap[acc.id] = {
      accountId: acc.id,
      accountName: acc.account_name,
      bankName: acc.bank_name,
      accountType: acc.account_type,
      currency: (acc.currency || 'THB').toUpperCase(),
      isLiability: Boolean(acc.is_liability),
      actualBalance: bal,
      pendingAmount: 0,
      projectedBalance: bal,
      pendingCommitments: [],
      confirmedCommitments: [],
    };
  }

  for (const c of commitments) {
    if (!isCommitmentActiveInMonth(c, targetYear, targetMonth)) {
      continue;
    }

    allActiveCommitmentsThisMonth.push(c);
    const isConfirmed = hasCommitmentBeenConfirmed(c, targetYear, targetMonth, transactions);

    if (isConfirmed) {
      allConfirmedCommitmentsThisMonth.push(c);
    } else {
      allPendingCommitmentsThisMonth.push(c);
    }

    if (c.payment_account_id && accountsMap[c.payment_account_id]) {
      const accSummary = accountsMap[c.payment_account_id];
      if (isConfirmed) {
        accSummary.confirmedCommitments.push(c);
      } else {
        const amt = Number(c.amount || 0);
        accSummary.pendingCommitments.push(c);
        accSummary.pendingAmount += amt;
        // For credit cards & liabilities, pending commitments increase the outstanding balance
        accSummary.projectedBalance += amt;
      }
    }
  }

  let totalActualLiabilities = 0;
  let totalPendingLiabilities = 0;
  let totalProjectedLiabilities = 0;

  for (const acc of accounts) {
    if (acc.is_liability) {
      const summary = accountsMap[acc.id];
      totalActualLiabilities += summary.actualBalance;
      totalPendingLiabilities += summary.pendingAmount;
      totalProjectedLiabilities += summary.projectedBalance;
    }
  }

  return {
    accountsMap,
    totalActualLiabilities,
    totalPendingLiabilities,
    totalProjectedLiabilities,
    allActiveCommitmentsThisMonth,
    allPendingCommitmentsThisMonth,
    allConfirmedCommitmentsThisMonth,
  };
}

/**
 * Creates the transaction payload to insert into `expense_income_transactions`
 * when converting a recurring commitment to a confirmed payment.
 */
export function createExpensePayloadFromCommitment(
  commitment: RecurringCommitment,
  userId?: string,
  targetDate?: string
) {
  return {
    user_id: userId,
    type: 'EXPENSE',
    amount: commitment.amount,
    account_id: commitment.payment_account_id || null,
    category: commitment.category || 'Other',
    note: `[Recurring] ${commitment.name} [rc:${commitment.id}]`,
    transaction_date: targetDate || new Date().toISOString(),
  };
}
