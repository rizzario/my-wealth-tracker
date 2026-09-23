# AGENT.md — System Context & Architecture Guidelines

> Context file for AI coding agents working on `my-wealth-tracker`.
> Schema section verified against the live Supabase DDL. Anything still uncertain is marked **[VERIFY]**.
> Known defects are collected in §7 — read that section before changing anything that touches money.

---

## 1. Project Overview

| | |
|---|---|
| **Name** | Personal Wealth & Portfolio Tracker (`my-wealth-tracker`) |
| **Goal** | Track multi-asset net worth — bank/cash, credit cards, fixed deposits, Provident Fund, Thai/US equities, crypto, gold, mutual funds — with automated price fetching and multi-user auth. |
| **Framework** | Next.js (App Router, Turbopack, TypeScript, Tailwind CSS) |
| **Database & Auth** | Supabase (PostgreSQL + RLS, Supabase Auth via `@supabase/ssr` + GitHub OAuth) |
| **Hosting** | Vercel (Serverless + Vercel Cron) |
| **Base currency** | THB. Every `*_thb` column and every net-worth figure is THB. |

---

## 2. Tech Stack & Key Libraries

**Supabase SDK**
- `@supabase/ssr` — cookie-based auth for App Router
- `@supabase/supabase-js` — database operations
- `@/lib/supabase/client.ts` — browser singleton (Client Components)
- `@/lib/supabase/server.ts` — Server Components, Server Actions, Route Handlers

**Market data**
- Crypto → Binance public REST (`https://api.binance.com/api/v3/ticker/price`)
- Equities, US & Thai → `yahoo-finance2` (instance-based, v3/v4)
- FX USD/THB → Open Exchange (`https://open.er-api.com/v6/latest/USD`)

**UI** — Lucide React, Tailwind CSS

---

## 3. Data Model

Seven tables: `profiles`, `portfolio_holdings`, `trade_transactions`, `cash_and_pvd_assets`,
`financial_accounts`, `expense_income_transactions`.

### 3.0 Table boundary rule — read before touching any balance

Two tables hold cash-like balances. They **must not hold the same account**, or net worth
double-counts. The deciding question is *not* liquidity — that is a spectrum and it cannot
settle borderline cases like a high-yield digital savings account. The rule is:

> **Does money move in and out of this account through `expense_income_transactions`?**

| Answer | Table | Intended `account_type` |
|---|---|---|
| Yes — spending / operating account | `financial_accounts` | `bank`, `cash`, `credit_card`, `loan` |
| No — parked or locked for yield | `cash_and_pvd_assets` | `FIXED_DEPOSIT`, `PVD`, `HIGH_YIELD` |

**The database does not enforce this today.** `expense_income_transactions.account_id` is a
`bigint` pointing at `cash_and_pvd_assets`, i.e. the exact inverse of the rule, and neither
`account_type` column has a CHECK constraint. §7.2 and §8 cover the fix. Until that migration
lands, treat the rule as the *target* state and do not write new code that deepens the
`cash_and_pvd_assets` ↔ transactions coupling.

### 3.1 Row Level Security

**[VERIFY] — no `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` statement appears in the schema
dump.** Confirm in the Supabase dashboard that every table below is RLS-enabled. If any is not,
the anon key exposes every user's rows.

Expected policy shape:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON <table>
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

`profiles` is keyed on `id` rather than `user_id`, so its policy uses `auth.uid() = id`.

Ownership column notes:
- `user_id` is **nullable** on every table and defaults to `auth.uid()` — except
  `financial_accounts.user_id`, which has **no default**. Inserts into `financial_accounts` must
  pass `user_id` explicitly or the row is orphaned. See §7.3.

### 3.2 `profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK, FK → `auth.users(id)` ON DELETE CASCADE | also the owner column |
| `full_name` | TEXT, nullable | |
| `avatar_url` | TEXT, nullable | |
| `preferred_currency` | VARCHAR(3), default `'THB'` | **not currently honoured** — the app hard-codes THB |
| `updated_at` | TIMESTAMPTZ, default `now()` | |

### 3.3 `portfolio_holdings`

Positions in stocks, crypto, gold, and mutual funds. One row per symbol — this table is a
*current position snapshot*, not a ledger. `trade_transactions` (§3.4) is the ledger.

| Column | Type | Notes |
|---|---|---|
| `id` | **BIGSERIAL**, PK | not a UUID — `/api/update-prices?id=` takes an integer |
| `user_id` | UUID, nullable, default `auth.uid()`, FK → `auth.users(id)` CASCADE | |
| `symbol` | VARCHAR(50), **UNIQUE (global)** | ⚠️ see §7.1 — this breaks multi-user |
| `currency` | VARCHAR(10), NOT NULL, default `'THB'` | |
| `volume` | NUMERIC(18,8), NOT NULL, default `0` | |
| `initial_cost` | NUMERIC(18,4), NOT NULL, default `0` | average buy price per unit, in `currency` |
| `present_price` | NUMERIC(18,4), NOT NULL, default `0` | latest market price per unit, in `currency` |
| `exchange_rate` | NUMERIC(10,4), NOT NULL, default `1.0` | single column serving two different jobs |
| `updated_at` | TIMESTAMPTZ, default `now()` | |
| `cost_exchange_rate` | NUMERIC(10,4), NOT NULL, default `1.0` | For contain exchange rate when initialize transaction |

Generated columns (all `STORED`):

| Column | Definition |
|---|---|
| `total_cost` | `volume * initial_cost` |
| `total_cost_thb` | `CASE WHEN currency = 'USD' THEN volume * initial_cost * exchange_rate ELSE volume * initial_cost END` |
| `total_present_price` | `volume * present_price` |
| `total_present_price_thb` | `CASE WHEN currency = 'USD' THEN volume * present_price * exchange_rate ELSE volume * present_price END` |
| `yield_percent` | `CASE WHEN initial_cost > 0 THEN (present_price - initial_cost) / initial_cost * 100 ELSE 0 END` |

Three consequences agents must know:

1. **Only `USD` triggers FX conversion.** Any other non-THB currency (HKD, EUR, SGD…) falls into
   the `ELSE` branch and is silently treated as THB. Do not add a holding in a third currency
   without changing these expressions first.
2. **`yield_percent` is FX-blind.** It compares per-unit prices in the native currency, so for USD
   holdings it excludes all exchange-rate gain or loss. For a THB-true return, compute in the app:
   `(total_present_price_thb - total_cost_thb) / total_cost_thb * 100`.
3. **There is no `category` column.** Do not select it unless a migration adds it.

### 3.4 `trade_transactions`

Buy/sell ledger, with the fields needed for Thai tax reporting.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL, PK | |
| `user_id` | UUID, nullable, default `auth.uid()` | |
| `broker` | VARCHAR(30), NOT NULL | |
| `order_id` | VARCHAR(50), nullable | broker's reference |
| `trade_date` | DATE, NOT NULL | |
| `trade_year` | INTEGER, generated `EXTRACT(year FROM trade_date)` | tax-year grouping |
| `side` | VARCHAR(10), CHECK `BUY` \| `SELL` \| `FREE` | `FREE` = stock dividend / bonus share |
| `stock_symbol` | VARCHAR(50), NOT NULL | **plain string — no FK to `portfolio_holdings`** |
| `currency` | VARCHAR(10), NOT NULL, default `'THB'` | |
| `units` | NUMERIC(18,8), NOT NULL | |
| `unit_price` | NUMERIC(18,4), NOT NULL | |
| `exchange_rate` | NUMERIC(12,6), nullable, default `1.0` | FX **on the trade date** — the correct historical rate |
| `gross_amount` / `fee` / `withholding_tax` / `net_amount` | NUMERIC | native currency; `net_amount` NOT NULL |
| `gross_amount_thb` / `fee_thb` / `net_amount_thb` | NUMERIC | THB; `net_amount_thb` NOT NULL |
| `reason` | TEXT, nullable | free-text rationale |
| `created_at` | TIMESTAMPTZ, default `now()` | |

Indexes: `broker`, `stock_symbol`, `trade_date DESC`.

> **No trigger links this table to `portfolio_holdings`.** Inserting a trade does *not* change
> `volume` or `initial_cost`. Position updates are entirely the application's job today. If an agent
> is asked to "record a trade", it must update both tables or the portfolio drifts from the ledger.

### 3.5 `cash_and_pvd_assets`

Parked / locked yield-bearing assets. See §3.0.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL, PK | |
| `user_id` | UUID, nullable, default `auth.uid()`, FK CASCADE | |
| `account_name` | VARCHAR(100), NOT NULL | |
| `account_type` | VARCHAR(30), NOT NULL | **no CHECK constraint** — values are convention only |
| `bank_name` | VARCHAR(50), nullable | |
| `account_number` | VARCHAR(30), nullable | |
| `current_balance` | NUMERIC(14,2), NOT NULL, default `0.00` | **the single value used for net worth** |
| `pvd_employee_contrib` | NUMERIC(14,2), nullable, default `0.00` | display only — see gotcha below |
| `pvd_employer_contrib` | NUMERIC(14,2), nullable, default `0.00` | display only — see gotcha below |
| `cost_basis` | NUMERIC(14,2), nullable, default `0.00` | amount contributed, for gain calculation |
| `holding_period_years` | INTEGER, nullable | PVD/RMF 5-year tax rule tracking |
| `tax_deductible` | BOOLEAN, nullable, default `false` | qualifies for Thai tax deduction |
| `is_tax_exempt` | BOOLEAN, nullable, default `false` | interest exempt from the 15% WHT |
| `interest_rate` | NUMERIC(5,2), nullable, default `0.00` | |
| `base_interest_rate` | NUMERIC(5,2), nullable, default `0.25` | |
| `promo_interest_rate` | NUMERIC(5,2), nullable | |
| `promo_duration_days` | INTEGER, nullable | drives the countdown badge |
| `deposit_start_date` | DATE, nullable | |
| `maturity_date` | DATE, nullable | |
| `interest_payout_frequency` | VARCHAR(30), nullable, default `'SEMI_ANNUAL'` | |
| `next_interest_payout_date` | DATE, nullable | |
| `is_liquid` | BOOLEAN, nullable, default `true` | **ambiguous — see §8 M5** |
| `notes` | TEXT, nullable | |
| `updated_at` | TIMESTAMPTZ, default `now()` | no ON UPDATE trigger; the app must set it |

> **PVD double-count gotcha:** `current_balance` already includes employee contributions, employer
> contributions, and accumulated returns. Never add `pvd_employee_contrib` or
> `pvd_employer_contrib` on top of it in any total. They exist for the contribution breakdown UI only.
> `cost_basis` is likewise a component, not an addend — unrealised gain is
> `current_balance - cost_basis`.

### 3.6 `financial_accounts`

Operating cash and short-term liabilities. See §3.0.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK, default `gen_random_uuid()` | |
| `user_id` | UUID, nullable, FK CASCADE | ⚠️ **no `auth.uid()` default** — §7.3 |
| `account_name` | TEXT, NOT NULL | |
| `account_type` | TEXT, NOT NULL | **no CHECK constraint**; also `text`, not `varchar`, unlike sibling tables |
| `bank_name` | VARCHAR(50), nullable | `'Krungsri'`, `'KBank'`, `'KTC'` |
| `account_number` | VARCHAR(30), nullable | masked / last 4 |
| `is_liability` | BOOLEAN, nullable, default `false` | `false` = asset, `true` = debt |
| `current_balance` | NUMERIC(14,2), nullable, default `0` | liquid balance, or outstanding balance if liability. **Stored positive**; sign comes from `is_liability`. |
| `credit_limit` | NUMERIC(14,2), nullable, default `0.00` | |
| `interest_rate` | NUMERIC(5,2), nullable, default `0.00` | % p.a. |
| `billing_cycle_day` | INTEGER, nullable | 1–31 |
| `payment_due_day` | INTEGER, nullable | 1–31 |
| `created_at` | TIMESTAMPTZ, default `now()` | |
| `updated_at` | TIMESTAMPTZ, nullable, **no default** | stays NULL unless the app sets it |
| `currency` |  VARCHAR(10) NOT NULL default `THB` | for other currency need to multiply exchange rate |
| `cost_exchange_rate` | NUMERIC(10,4), NOT NULL, default `1.0` | For contain exchange rate when initialize transaction |

### 3.7 `expense_income_transactions`

Daily income / expense log.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL, PK | |
| `user_id` | UUID, nullable, default `auth.uid()`, FK CASCADE | |
| `transaction_date` | DATE, NOT NULL, default `CURRENT_DATE` | |
| `type` | VARCHAR(10), NOT NULL, CHECK `INCOME` \| `EXPENSE` | |
| `transaction_type` | VARCHAR(10), NOT NULL, CHECK `INCOME` \| `EXPENSE` | |
| `category` | VARCHAR(50), NOT NULL | no CHECK — free text |
| `amount` | NUMERIC(12,2), NOT NULL | **no `> 0` constraint** — a negative EXPENSE silently credits the account |
| `account_id` | BIGINT, nullable, FK → **`cash_and_pvd_assets(id)`** | ⚠️ wrong target — §7.2 |
| `note` | TEXT, nullable | |
| `created_at` | TIMESTAMPTZ, default `now()` | |

**Trigger:** `on_transaction_inserted` — `AFTER INSERT FOR EACH ROW EXECUTE update_account_balance()`.

> ⚠️ **INSERT only.** There is no UPDATE or DELETE trigger, so editing the amount of a transaction,
> or deleting one, leaves the account balance permanently wrong with no error. See §7.4.

### 3.8 Net worth — canonical formula

Implement **once** (a shared `lib/networth.ts` helper, or a Postgres view) and import it everywhere.
Do not re-derive it per component.

```
Net Worth (THB) =
    SUM(financial_accounts.current_balance  WHERE is_liability = false)
  - SUM(financial_accounts.current_balance  WHERE is_liability = true)
  + SUM(cash_and_pvd_assets.current_balance)
  + SUM(portfolio_holdings.total_present_price_thb)
```

Once §3.0 holds, the three asset terms are disjoint. Neither transaction table is a term:
`expense_income_transactions` mutates an account balance, and `trade_transactions` is history
behind `portfolio_holdings`. Adding either one would double-count.

---

### 3.9 `currency_exchange_rates`

Global exchange rates lookup table (shared by all users, no `user_id` column).

| Column | Type | Notes |
|---|---|---|
| `currency` | VARCHAR(10) NOT NULL, PK default `'THB'` | base currencies: EUR, HKD, JPY, SGD, USD, THB |
| `rate_to_thb` | NUMERIC(12,6) NOT NULL | exchange rate to multiply to get THB |
| `updated_at` | TIMESTAMPTZ, NOT NULL, default `now()` | |

**RLS Policies:**
Because this table is a global market reference table without a `user_id` column:
- `SELECT`: Allowed for `authenticated` and `anon` (`USING (true)`).
- `INSERT` / `UPDATE`: Allowed for `authenticated` (and service role) so user-triggered syncs succeed (`WITH CHECK (true)`).


## 4. Architecture & Data Flow

### 4.1 SSR session guard — `middleware.ts`
- Validates the session with `supabase.auth.getUser()`.
- Unauthenticated → redirect to `/login`.
- Authenticated on `/login` → redirect to `/`.
- Matcher excludes `_next/static`, `_next/image`, `favicon.ico`.

### 4.2 OAuth exchange — `app/auth/callback/route.ts`
- `supabase.auth.exchangeCodeForSession(code)`, then redirect to the dashboard.

### 4.3 Browser client singleton — `lib/supabase/client.ts`
- Caches the browser client across re-renders to avoid `Multiple GoTrueClient instances detected`.

### 4.4 Price ingestion — `GET /api/update-prices`

| Param | Behaviour |
|---|---|
| `?id=<bigint>` | update one holding (integer PK, **not** a UUID) |
| *(none)* | batch-update every supported holding |

Routing by `symbol`:

1. **Crypto** — `BTC`, `ETH`, `SOL`, `BNB`, `DOGE`, `XRP` → Binance (USD) × `usdThbRate`
2. **US equities / ETFs** — known list (`AAPL`, `NVDA`, `TSLA`, `VOO`, `QQQI`, …) → Yahoo
3. **Thai equities** — default fallback (`PTT`, `SCB`, `LH`, `EA`, `SCGP`, …) → append `.BK` → Yahoo → already THB
4. **Manual / excluded** — symbols prefixed `GOLD`, `K-`, `SCBTA`, `GOOG80` (DRs and Thai mutual
   funds with no Yahoo coverage) **must be skipped before any fetch**, or the batch run throws.

Because the `*_thb` generated columns apply `exchange_rate` themselves for USD rows, this route
should write `present_price` in the holding's **native** currency and let the database convert.
Writing an already-converted THB figure into a `currency = 'USD'` row double-applies the rate.
**[VERIFY]** which convention the current implementation follows — §7.2 is entangled with this.

Scheduled by `vercel.json` Cron — e.g. `30 10 * * 1-5` = 17:30 ICT, weekdays.

### 4.5 Client architecture

| File | Kind | Responsibility |
|---|---|---|
| `app/page.tsx` | Client Component (`'use client'`) | Dashboard shell. Tabs `'ภาพรวม' \| 'พอร์ตลงทุน' \| 'เงินฝาก & PVD' \| 'รับ-จ่าย'`, net worth aggregation (§3.8), Privacy Mode. |
| `components/PortfolioTable.tsx` | Client | Positions table. State: `holdings`, `loadingData`, `isBulkUpdating`, `updatingRowId`. Row-level and bulk refresh re-fetch from Supabase — no page reload. |
| `components/CashAndPvdSection.tsx` | Client | Fixed deposits + PVD. Dual-mode create/edit modal, promo countdown badges. |

> The dashboard is a **Client Component**. Auth is enforced upstream in `middleware.ts`, so no
> server wrapper is needed. (An earlier draft called it a Server Component — obsolete.)

---

## 5. Critical Constraints & Gotchas

### 5.1 Supabase client selection — the silent-`[]` trap
- Client Components → `import { createClient } from '@/lib/supabase/client'`
- Server Components / Actions / Route Handlers → `import { createClient } from '@/lib/supabase/server'`

A static unauthenticated client means RLS matches nothing and the query returns `[]` with **no
error**. If a table renders empty but has rows in the Supabase dashboard, check this first.

### 5.2 Directive placement & component rules
- `'use client'` must be the literal first line, UTF-8 **without** BOM.
- A component function inside a `'use client'` file must **not** be `async`.

### 5.3 `yahoo-finance2` is a class

```typescript
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
```

If TypeScript reports `never` or a missing property on `quote`, cast:
`(quote as any)` or `(yahooFinance as any).quote(...)`.

### 5.4 Defensive number formatting — still required

Most numeric columns are `NOT NULL` at the database level, but values can still arrive `null` or
`undefined` in the client: generated columns are declared nullable, partial `select()` lists omit
fields, left joins produce nulls, and optimistic UI state is often half-populated. Never call
`.toLocaleString()` on a raw field.

```typescript
(item.volume ?? 0).toLocaleString()
item.initial_cost != null ? Number(item.initial_cost).toLocaleString(...) : '-'
item.total_present_price_thb != null ? Number(item.total_present_price_thb).toLocaleString(...) : '-'
```

Also note Supabase returns `numeric` as a **string** in some client versions. Always `Number(...)`
before arithmetic, or `'100' + 50` becomes `'10050'`.

### 5.5 Environment variables
- Browser-readable: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Server-only secrets must **not** carry the `NEXT_PUBLIC_` prefix.

### 5.6 Vercel deployment
- Do not set a custom root directory in `vercel.json` or the Vercel UI — this is not a monorepo.
- `npm run build` must pass locally before pushing.

---

## 6. Naming inconsistencies (cosmetic, but they cause agent errors)

| Concern | `portfolio_holdings` / `cash_and_pvd_assets` / `trade_transactions` | `financial_accounts` |
|---|---|---|
| PK type | `bigserial` | `uuid` |
| `account_name` type | `varchar` | `text` |
| `user_id` default | `auth.uid()` | *(none)* |

Agents writing shared helpers should not assume a uniform ID type across tables.

---

## 7. Known defects

### 7.1 `portfolio_holdings.symbol` is globally UNIQUE — breaks multi-user 🔴

```sql
constraint portfolio_holdings_symbol_key unique (symbol)
```

The constraint has no `user_id` component. Once any user holds `AAPL`, every other user's insert of
`AAPL` fails with a duplicate-key error. In a single-user deployment this is invisible; the moment a
second account signs in, the app is broken. Fix in §8 M0. Treat as highest priority.

### 7.2 `exchange_rate` conflates the purchase rate with the current rate 🔴

One column feeds both generated expressions:

- `total_cost_thb` needs the FX rate **on the purchase date** (historical cost basis)
- `total_present_price_thb` needs the FX rate **today** (current valuation)

If `/api/update-prices` refreshes `exchange_rate` to today's USD/THB, the THB cost basis is
retroactively rewritten every sync and unrealised P&L in THB is wrong. If it does *not* refresh it,
current valuation uses a stale rate instead. Either way one of the two numbers is incorrect — the
column cannot satisfy both.

Note that `trade_transactions.exchange_rate` is correctly scoped: it is the rate on `trade_date`.
The fix is to give `portfolio_holdings` the same separation — §8 M1.

### 7.3 `financial_accounts.user_id` has no `auth.uid()` default 🟡

Every other table defaults it. An insert that omits `user_id` produces a row with `user_id IS NULL`,
which no `auth.uid() = user_id` policy will ever match — the row is written, returns no error, and is
then invisible to its own creator. §8 M2.

### 7.4 Transaction trigger fires on INSERT only 🔴

`on_transaction_inserted` is `AFTER INSERT`. Editing a transaction's `amount`, `type`, or
`account_id`, or deleting it, does not reverse or reapply the balance change. Balances drift
silently and permanently. §8 M4 replaces it with an INSERT/UPDATE/DELETE trigger.

Related: `amount` has no `CHECK (amount > 0)`, so a negative `EXPENSE` inverts the sign and credits
the account.

### 7.5 `trade_transactions` is not wired to `portfolio_holdings` 🟡

No FK, no trigger. `stock_symbol` is a loose string that can drift from `portfolio_holdings.symbol`
(case, whitespace, `.BK` suffix). Recording a trade requires a coordinated write to both tables in
the application layer. §8 M6.

### 7.6 RLS not visible in the schema dump 🔴 **[VERIFY]**

See §3.1. Verify before anything else in this list — if RLS is off, none of the rest matters.

---

## 8. Migration plan

Ordered. M0 first; M3 depends on M2.

**M0 — scope the symbol constraint to the user**
```sql
ALTER TABLE portfolio_holdings
  DROP CONSTRAINT portfolio_holdings_symbol_key;
 
ALTER TABLE portfolio_holdings
  ADD CONSTRAINT portfolio_holdings_user_symbol_key UNIQUE (user_id, symbol);
```
Check for existing duplicates first:
`SELECT symbol, count(*) FROM portfolio_holdings GROUP BY symbol HAVING count(*) > 1;`
Any code relying on `upsert(..., { onConflict: 'symbol' })` must become
`onConflict: 'user_id,symbol'`.

**M1 — split the exchange rate**
```sql
ALTER TABLE portfolio_holdings
  ADD COLUMN cost_exchange_rate numeric(12,6) NOT NULL DEFAULT 1.0;

UPDATE portfolio_holdings SET cost_exchange_rate = exchange_rate;

ALTER TABLE portfolio_holdings
  DROP COLUMN total_cost_thb;

ALTER TABLE portfolio_holdings
  ADD COLUMN total_cost_thb numeric(18,4)
  GENERATED ALWAYS AS (volume * initial_cost * cost_exchange_rate) STORED;
```
`exchange_rate` then means "current rate" only, and `/api/update-prices` may refresh it freely.
Consider dropping the `CASE WHEN currency = 'USD'` guard at the same time — with THB rows carrying
`1.0`, unconditional multiplication is correct and supports a third currency. Backfill
`cost_exchange_rate` from `trade_transactions.exchange_rate` where a matching BUY exists.

**M2 — restore the ownership default**
```sql
ALTER TABLE financial_accounts
  ALTER COLUMN user_id SET DEFAULT auth.uid();

UPDATE financial_accounts SET user_id = '<your-uuid>' WHERE user_id IS NULL;

ALTER TABLE financial_accounts ALTER COLUMN user_id SET NOT NULL;
```
Apply `SET NOT NULL` to `user_id` on the other five tables too, after checking for NULLs.

**M3 — move spending accounts into `financial_accounts` and repoint transactions**

Keep an explicit id map, since the PK type changes from `bigint` to `uuid`.

```sql
-- 3a. map old rows to new UUIDs
CREATE TABLE tmp_account_map AS
SELECT id AS old_id, gen_random_uuid() AS new_id
FROM cash_and_pvd_assets
WHERE account_type NOT IN ('FIXED_DEPOSIT', 'PVD', 'HIGH_YIELD');

-- 3b. copy them across
INSERT INTO financial_accounts
  (id, user_id, account_name, account_type, bank_name, account_number,
   is_liability, current_balance, interest_rate, created_at, updated_at)
SELECT m.new_id, c.user_id, c.account_name, 'bank', c.bank_name, c.account_number,
       false, c.current_balance, c.interest_rate, now(), now()
FROM cash_and_pvd_assets c
JOIN tmp_account_map m ON m.old_id = c.id;

-- 3c. repoint the FK column
ALTER TABLE expense_income_transactions
  DROP CONSTRAINT expense_income_transactions_account_id_fkey;

ALTER TABLE expense_income_transactions ADD COLUMN account_uuid uuid;

UPDATE expense_income_transactions t
SET account_uuid = m.new_id
FROM tmp_account_map m
WHERE t.account_id = m.old_id;

ALTER TABLE expense_income_transactions DROP COLUMN account_id;
ALTER TABLE expense_income_transactions RENAME COLUMN account_uuid TO account_id;

ALTER TABLE expense_income_transactions
  ADD CONSTRAINT fk_txn_account
  FOREIGN KEY (account_id) REFERENCES financial_accounts(id) ON DELETE SET NULL;

-- 3d. remove the migrated rows
DELETE FROM cash_and_pvd_assets WHERE id IN (SELECT old_id FROM tmp_account_map);
DROP TABLE tmp_account_map;
```

Any transaction left with `account_uuid IS NULL` was pointing at a fixed deposit or PVD row —
review those manually before 3d.

**M4 — a trigger that survives edits and deletes**

```sql
CREATE OR REPLACE FUNCTION apply_txn_to_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  liab boolean;
  delta numeric(14,2);
BEGIN
  -- reverse the old row
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.account_id IS NOT NULL THEN
    SELECT is_liability INTO liab FROM financial_accounts WHERE id = OLD.account_id;
    delta := CASE WHEN OLD.type = 'INCOME' THEN -OLD.amount ELSE OLD.amount END;
    IF liab THEN delta := -delta; END IF;
    UPDATE financial_accounts
       SET current_balance = current_balance + delta, updated_at = now()
     WHERE id = OLD.account_id AND user_id = OLD.user_id;
  END IF;

  -- apply the new row
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.account_id IS NOT NULL THEN
    SELECT is_liability INTO liab FROM financial_accounts WHERE id = NEW.account_id;
    delta := CASE WHEN NEW.type = 'INCOME' THEN NEW.amount ELSE -NEW.amount END;
    IF liab THEN delta := -delta; END IF;
    UPDATE financial_accounts
       SET current_balance = current_balance + delta, updated_at = now()
     WHERE id = NEW.account_id AND user_id = NEW.user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_transaction_inserted ON expense_income_transactions;

CREATE TRIGGER on_transaction_changed
AFTER INSERT OR UPDATE OR DELETE ON expense_income_transactions
FOR EACH ROW EXECUTE FUNCTION apply_txn_to_balance();

ALTER TABLE expense_income_transactions
  ADD CONSTRAINT chk_amount_positive CHECK (amount > 0);
```

The sign flip for liabilities is deliberate: an `EXPENSE` on a credit card *increases* the
outstanding balance, which is stored positive. Verify this against the existing
`update_account_balance()` body before dropping it — the old function may have used the opposite
convention, in which case historical balances need a one-off recalculation.

`SECURITY DEFINER` bypasses RLS, which is why both `UPDATE` statements carry an explicit
`user_id` predicate. Do not remove it.

**M5 — enforce the boundary, retire `is_liquid`**
```sql
ALTER TABLE cash_and_pvd_assets
  ADD CONSTRAINT chk_parked_types
  CHECK (account_type IN ('FIXED_DEPOSIT', 'PVD', 'HIGH_YIELD'));

ALTER TABLE financial_accounts
  ADD CONSTRAINT chk_operating_types
  CHECK (account_type IN ('bank', 'cash', 'credit_card', 'loan'));
```
After this, `is_liquid` is redundant for `FIXED_DEPOSIT` and `PVD`. Either drop it, or redefine it
as "withdrawable without penalty" and record that meaning here. Do not leave it ambiguous.

**M6 — link the trade ledger to positions**

Add `holding_id bigint REFERENCES portfolio_holdings(id)` to `trade_transactions`, backfilled by
matching `stock_symbol` to `symbol` within the same `user_id`. Then either add a trigger that
recomputes `volume` and weighted-average `initial_cost` from the ledger, or keep it in the
application and add a reconciliation check. A trigger is preferable — it makes the ledger the single
source of truth and removes a whole class of drift bug.

**M7 — centralise the net-worth formula**

Extract §3.8 into `lib/networth.ts` or a `v_net_worth` view, and have every tab consume it.

**M8 — `updated_at` maintenance**

Neither `financial_accounts` nor `cash_and_pvd_assets` refreshes `updated_at` on write. Add a shared
`BEFORE UPDATE` trigger rather than relying on every call site to set it.

**M9 — give `profiles` a policy** (do this one first — it's a two-minute fix for a live outage)
 
```sql
CREATE POLICY "Users can manage their own profile" ON public.profiles
  FOR ALL
  TO public
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```