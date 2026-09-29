# Specification: Recurring Commitments & Pending Liabilities Module

## 1. Overview & Business Objectives
Implement a recurring liabilities/expenses management system (`recurring_commitments`) to support:
- Scheduled recurring payments: Monthly, Quarterly, and Annual commitments (e.g., Health Insurance, Installment Plans 0%, Subscriptions).
- Flexible commitment duration: Explicit `start_date` and optional `end_date` (if `null`, treated as indefinite/ongoing).
- Dynamic pending calculations on liabilities: Pending charges linked to Credit Cards or Loan accounts do not prematurely mutate `current_balance` in `financial_accounts`. Instead, they compute a projected statement balance (`current_balance + pending_amount`) in the UI.
- One-click reconciliation: Ability to transition an upcoming due payment into a confirmed transaction (`expense_income_transactions`), subsequently triggering real account balance updates.

---

## 2. Database Schema (Supabase DDL)

Execute the following DDL in Supabase:

```sql
-- Create recurring_commitments table
create table if not exists public.recurring_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  name varchar(100) not null,                     -- e.g., 'AIA Health Insurance', 'iPhone 16 Pro Installment'
  amount numeric(18, 4) not null check (amount > 0),
  frequency varchar(20) not null default 'MONTHLY', -- 'MONTHLY', 'QUARTERLY', 'ANNUAL'
  due_day integer not null check (due_day between 1 and 31),
  due_month integer null check (due_month between 1 and 12), -- Required if frequency = 'ANNUAL'
  start_date date not null,
  end_date date null,                              -- null indicates ongoing/continuous
  is_active boolean not null default true,
  payment_account_id uuid references public.financial_accounts(id) on delete set null,
  category varchar(50) not null default 'Other',   -- e.g., 'Insurance', 'Installment', 'Subscription'
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recurring_commitments_freq_check check (
    frequency in ('MONTHLY', 'QUARTERLY', 'ANNUAL')
  )
);

-- Enable RLS
alter table public.recurring_commitments enable row level security;

-- RLS Policy: Users can only manage their own commitments
create policy "Users can manage own recurring commitments"
  on public.recurring_commitments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexing
create index if not exists idx_recurring_commitments_user on public.recurring_commitments(user_id);
create index if not exists idx_recurring_commitments_acc on public.recurring_commitments(payment_account_id);
```

## 3. Core Business Logic (`lib/recurringCommitments.ts`)

Create a helper library `lib/recurringCommitments.ts` containing pure functions:

### 3.1 Eligibility & Active Check
A commitment is active in a given target month (`targetYear`, `targetMonth` where month is 1-12) if:
1. `is_active === true`
2. `start_date` <= last day of target month
3. `end_date === null` OR `end_date` >= first day of target month
4. Frequency match:
    - `MONTHLY`: active every month
    - `QUARTERLY`: active if targetMonth matches start_date quarterly intervals
    - `ANNUAL`: active only if targetMonth === due_month

### 3.2 Projected Statement Calculation
For any credit card or liability account in `financial_accounts`:
- `actual_balance`: current_balance (existing table value)
- `pending_commitments`: Sum of active commitments for this account in the current billing cycle/month that haven't been logged yet as confirmed transactions in `expense_income_transactions`.
- `projected_total`: actual_balance + pending_commitments

## 4. UI Implementation Details

### 4.1 Credit Card / Liability Card Enhancement (`Cash Flow` Tab & Dashboard)
- Update liability cards (where `is_liability = true` or `account_type = 'credit_card'`):
- Display actual current balance (`ยอดรูดปัจจุบัน / ยอดหนี้ค้างจริง`).
- If `pending_commitments > 0`, display a sub-badge or inline warning:
    - `รอดำเนินการตัดรอบนี้ (Pending): +฿XX,XXX`
    - `ยอดประมาณการสิ้นรอบ (Projected): ฿XX,XXX`
- Show a small collapsible accordion listing pending items (e.g., "15 ต.ค. เบี้ยประกัน AIA: ฿24,000").

### 4.2 Management Modal / CRUD Form
- Add a section or modal to manage recurring items:
    - Inputs: Name, Amount, Frequency (`MONTHLY` | `ANNUAL`), Due Day (1-31), Due Month (1-12, shown if Annual), Start Date, End Date (Optional checkbox: "ทำรายการต่อเนื่อง"), Payment Account (Dropdown of `financial_accounts`), Category, Notes.

### 4.3 Action Workflow: "Confirm & Convert to Transaction"
- Add an action button next to an upcoming/pending commitment: `[บันทึกตัดเงินจริง]`
- On click:
    - Creates a new entry in `expense_income_transactions`:
        - `type: 'EXPENSE'`
        - `amount: commitment.amount`
        - `account_id: commitment.payment_account_id`
        - `category: commitment.category`
        - `note: '[Recurring] ' + commitment.name`
        - `date: Current date / due date`
    - The database trigger `on_transaction_changed` will naturally update `financial_accounts.current_balance`.
    - Re-evaluates pending view for the rest of the cycle.

## 5. Verification Checklist
1. [ ] Successfully executed the SQL DDL in Supabase with RLS enabled.
2. [ ] Created sample recurring commitment (Annual Health Insurance, e.g., ฿24,000 due in October, linked to KBank Credit Card).
3. [ ] Verified that KBank Credit Card shows unchanged `current_balance` in database, but displays `Pending: +฿24,000` on the UI.
4. [ ] Tested ongoing vs. bounded commitments (`end_date = null` vs `end_date = '2026-12-31'`).
5. [ ] Verified that clicking `Confirm & Convert` generates a record in `expense_income_transactions` and updates `current_balance` seamlessly.