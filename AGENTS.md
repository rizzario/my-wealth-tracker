# AGENT.md - System Context & Architecture Guidelines

## 1. Project Overview
- **Name:** Personal Wealth & Portfolio Tracker (`my-wealth-tracker`)
- **Primary Goal:** Track multi-asset wealth (Cash/Bank deposits with interest tracking, Thai/US Stocks, Crypto, Mutual Funds, Gold, and Provident Fund) with automated market price fetching, portfolio valuation, and multi-user authentication.
- **Hosting & Infrastructure:** Vercel (Production Serverless + Vercel Cron).
- **Frontend & Backend Framework:** Next.js (App Router, Turbopack, TypeScript, Tailwind CSS).
- **Database & Auth:** Supabase (PostgreSQL with RLS + Supabase Auth via SSR & GitHub OAuth).

---

## 2. Tech Stack & Key Libraries
- **Framework:** Next.js (App Router, Turbopack)
- **Authentication & DB SDK:**
  - `@supabase/ssr` (Next.js App Router cookie-based authentication)
  - `@supabase/supabase-js` (Database operations)
  - Client utility: `@/lib/supabase/client.ts` (Browser singleton)
  - Server utility: `@/lib/supabase/server.ts` (Server Components & Route Handlers)
- **Market Data APIs:**
  - **Crypto:** Binance Public REST API (`https://api.binance.com/api/v3/ticker/price`)
  - **Equities (US & Thai):** `yahoo-finance2` (Node.js library, v3/v4 instance-based)
  - **FX Rates (USD/THB):** Open Exchange API (`https://open.er-api.com/v6/latest/USD`)
- **Icons & Styling:** Lucide React, Tailwind CSS

---

## 3. Database Schema Reference (Supabase)

### Row Level Security (RLS) Policy
All tables are enforced with Row Level Security. Queries automatically filter by user context:


### Table: `portfolio_holdings`
Stores positions in stocks, crypto, gold, and mutual funds.
- `id` (UUID / Primary Key)
- `user_id` (UUID, FK -> `auth.users(id)`) -Row-level owner.
- `symbol` (TEXT, e.g., 'AAPL', 'PTT', 'BTC', 'GOLD 965 (G)')
- `volume` (NUMERIC) - Current units/shares held (Can be `null` in edge cases; always fallback to `0`).
- `currency` (TEXT) - Currency that use to buy stock.
- `initial_cost` (NUMERIC) - Average buy price per unit (match with currency) (Can be `null`; fallback to `0`).
- `present_price` (NUMERIC, nullable) - Latest fetched market price per unit (match with currency).
- `total_present_price` (NUMERIC, GENERATED/Calculated) - Total market value when buy per unit (`exchange_rate * present_price`).
- `exchange_rate` (NUMERIC) - Present exchange rate when buy stock (1.00 is THB).
- `total_cost_thb` (NUMERIC, GENERATED/Calculated) - Total market value when buy in THB (`(volume * initial_cost) * exchange_rate`).
- `total_present_price_thb` (NUMERIC, GENERATED/Calculated) - Present total market value in THB (`(volume * present_price) * exchange_rate`).
- `yield_percent` (NUMERIC, GENERATED/Calculated) - PnL % based on cost and present price.
- `updated_at` (TIMESTAMPTZ) - Last sync timestamp.

*Note: Do NOT query `category` column from `portfolio_holdings` unless explicitly added in migration.*

### Table: `cash_and_pvd_assets`
Stores bank accounts, high-yield digital savings, fixed deposits, and Provident Fund (PVD).
- `id` (BIGINT, PK)
- `user_id` (UUID, FK -> `auth.users(id)`) -Row-level owner.
- `account_name` (VARCHAR(100))
- `account_type` (VARCHAR(30)) - 'SAVINGS', 'HIGH_YIELD', 'FIXED_DEPOSIT', 'PVD'
- `bank_name` (VARCHAR(50), nullable)
- `account_number` (VARCHAR(30), nullable)
- `current_balance` (NUMERIC(14,2))
- `pvd_employee_contrib` (NUMERIC(14,2), nullable)
- `pvd_employer_contrib` (NUMERIC(14,2), nullable)
- `interest_rate` (NUMERIC(5,2), nullable)
- `promo_interest_rate` (NUMERIC(5,2), nullable)
- `promo_duration_days` (INTEGER, nullable)
- `deposit_start_date` (DATE, nullable)
- `maturity_date` (DATE, nullable)
- `base_interest_rate` (NUMERIC(5,2), default 0.25)
- `is_liquid` (BOOLEAN, default true)
- `is_tax_exempt` (BOOLEAN, default false)
- `interest_payout_frequency` (VARCHAR(30), default 'SEMI_ANNUAL')
- `next_interest_payout_date` (DATE, nullable)
- `updated_at` (TIMESTAMPTZ)

### Table: `expense_income_transactions`
Daily income/expense logging.
- `id` (BIGINT, PK)
- `user_id` (UUID, FK -> `auth.users(id)`)
- `type` (VARCHAR(10)) - 'INCOME' or 'EXPENSE'
- `category` (VARCHAR(50))
- `amount` (NUMERIC(12,2))
- `account_id`
- `note` (TEXT, nullable)
- `transaction_date` (DATE, default CURRENT_DATE)
- `created_at` (TIMESTAMPTZ)

### Table: `financial_accounts`
Operational cash flow & liability tracking accounts.
- `id` (UUID, PK, default gen_random_uuid())
- `user_id` (UUID, FK -> auth.users(id) ON DELETE CASCADE)
- `account_name` (VARCHAR(100)) - Account or card nickname
- `account_type` (VARCHAR(30)) - 'bank', 'cash', 'credit_card', or 'loan'
- `bank_name` (VARCHAR(50), nullable) - Institution name (e.g. 'Krungsri', 'KBank', 'KTC')
- `account_number` (VARCHAR(30), nullable) - Masked number or last 4 digits
- `is_liability` (BOOLEAN, default false) - false = Asset, true = Short-term debt
- `current_balance` (NUMERIC(14,2), default 0.00) - Current liquid balance or outstanding balance
- `credit_limit` (NUMERIC(14,2), default 0.00) - Total credit line for credit card/loan
- `interest_rate` (NUMERIC(5,2), default 0.00) - Annual interest rate (% p.a.)
- `billing_cycle_day` (INTEGER, nullable) - Statement closing date (1-31)
- `payment_due_day` (INTEGER, nullable) - Payment due date (1-31)
- `created_at` (TIMESTAMPTZ, default NOW())
- `updated_at` (TIMESTAMPTZ, default NOW())

---

## 4. Architecture & Data Flow

### A. SSR Session Guard (`middleware.ts`)
Intercepts incoming requests at Root edge:
- Validates user session via `supabase.auth.getUser()`.
- Unauthenticated users attempting to access protected routes are redirected to `/login`.
- Authenticated users on `/login` are automatically redirected to dashboard (`/`).
- Matches all paths except static assets (`_next/static`, `_next/image`, `favicon.ico`).

### B. OAuth Exchange Route (`app/auth/callback/route.ts`)
- Exchanges authorization code for session: `supabase.auth.exchangeCodeForSession(code)`.
- Redirects back to dashboard after GitHub authorization.

### C. Client Singleton Pattern (`lib/supabase/client.ts`)
- Prevents `Multiple GoTrueClient instances detected` warning by caching the browser client instance across component re-renders.

### D. Market Price Ingestion (`/api/update-prices`)
- **Endpoint:** `GET /api/update-prices`
- **Query Params:**
  - `?id=<uuid>` (Optional): Updates a single asset row.
  - (No param): Batch updates all supported assets.
- **Asset Routing & Mapping Logic:**
  1. **Crypto:** Symbol in `['BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'XRP']`
     - Fetches from Binance in USD -> Multiplied by `usdThbRate` -> Output THB.
  2. **US Stocks / ETFs:** Symbol in known US list (e.g., `AAPL`, `NVDA`, `TSLA`, `VOO`, `QQQI`, etc.)
     - Fetches from Yahoo Finance -> If quote currency is USD, multiply by `usdThbRate` -> Output THB.
  3. **Thai Stocks:** Default fallback for SET equities (e.g., `PTT`, `SCB`, `LH`, `EA`, `SCGP`)
     - Appends `.BK` (e.g., `PTT.BK`) -> Fetches from Yahoo Finance -> Stored in THB.
  4. **Excluded / Manual Assets:**
     - Prefix `GOLD`, `K-`, `SCBTA`, `GOOG80` (DRs / Thai Mutual Funds without Yahoo Finance support) MUST be bypassed to avoid runtime failures.
- **Automation:** Scheduled via `vercel.json` Cron (e.g., `30 10 * * 1-5` for 17:30 ICT weekdays).

### E. Client Architecture
- **Component Separation:**
  - `app/page.tsx`: Server Component entry point (or lightweight orchestrator).
  - `components/PortfolioTable.tsx`: Client Component (`'use client'`).
    - Handles state: `holdings`, `loadingData`, `isBulkUpdating`, `updatingRowId`.
    - Supports row-level refresh (`updatingRowId`) and bulk refresh (`isBulkUpdating`) via dynamic Supabase re-fetching without browser page reload.

---

## 5. Critical Constraints & Gotchas for AI Agents

1. **`yahoo-finance2` Usage:**
   - In modern versions, it is a Class constructor. Always use:
     ```typescript
     import YahooFinance from 'yahoo-finance2';
     const yahooFinance = new YahooFinance();
     ```
   - If TypeScript throws `never` or missing property errors on `quote`, cast as `(quote as any)` or `(yahooFinance as any).quote(...)`.
2. **Defensive Number Formatting:**
   - Database numeric values may return `null` or `undefined`.
   - Never call `.toLocaleString()` directly on raw fields. Always wrap:
     ```typescript
     (item.volume ?? 0).toLocaleString()
     item.initial_cost != null ? Number(item.initial_cost).toLocaleString(...) : '-'
     item.total_present_price_thb != null ? Number(item.total_present_price_thb).toLocaleString(...) : '-'
     ```
3. **Environment Variables:**
   - Client access requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Server-only credentials must avoid the `NEXT_PUBLIC_` prefix.
4. **Vercel Deployment:**
   - Do NOT set custom root directory in `vercel.json` or Vercel UI unless the repo is a monorepo.
   - Always verify `npm run build` passes locally before pushing commits.

5. Client Architecture
- `app/page.tsx`: Main Dashboard (`'use client'`). Manages tabs (`'ภาพรวม', 'พอร์ตลงทุน', 'เงินฝาก & PVD', 'รับ-จ่าย'`), global Net Worth calculations, and Privacy Mode state.
- `components/PortfolioTable.tsx`: Positions table with manual row/bulk refresh.
- `components/CashAndPvdSection.tsx`: Cash, savings, and PVD management with dual-mode CRUD modal (Create/Edit) and promo countdown indicators.

## 6. Critical Constraints & Gotchas for AI Agents

1. **Supabase Client Selection & RLS Context:**
   - Client Components (`'use client'`): ALWAYS use `import { createClient } from '@/lib/supabase/client'`. NEVER import static unauthenticated client instances when fetching user-isolated data, or RLS will silently return empty arrays (`[]`).
   - Server Components / Actions / Route Handlers: ALWAYS use `import { createClient } from '@/lib/supabase/server'`.
2. **Directive Placement & Component Rules:**
   - `'use client'` must be the absolute first line of the file (UTF-8 without BOM).
   - Component functions inside `'use client'` files MUST NOT be declared as `async function`.
3. **`yahoo-finance2` Usage:**
   - In modern versions, it is a Class constructor. Always use:
     ```typescript
     import YahooFinance from 'yahoo-finance2';
     const yahooFinance = new YahooFinance();
     ```
   - If TypeScript throws `never` or missing property errors on `quote`, cast as `(quote as any)` or `(yahooFinance as any).quote(...)`.
4. **Defensive Number Formatting:**
   - Database numeric values may return `null` or `undefined`.
   - Never call `.toLocaleString()` directly on raw fields. Always wrap:
     ```typescript
     (item.volume ?? 0).toLocaleString()
     item.initial_cost != null ? Number(item.initial_cost).toLocaleString(...) : '-'
     item.total_present_price_thb != null ? Number(item.total_present_price_thb).toLocaleString(...) : '-'
     ```
5. **Environment Variables:**
   - Client access requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Server-only credentials must avoid the `NEXT_PUBLIC_` prefix.
6. **Vercel Deployment:**
   - Do NOT set custom root directory in `vercel.json` or Vercel UI unless the repo is a monorepo.
   - Always verify `npm run build` passes locally before pushing commits.