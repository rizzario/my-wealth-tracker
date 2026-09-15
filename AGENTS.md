# AGENT.md - System Context & Architecture Guidelines

## 1. Project Overview
- **Name:** Personal Wealth & Portfolio Tracker (`my-wealth-tracker`)
- **Primary Goal:** Track multi-asset wealth (Cash/Bank deposits with interest tracking, Thai/US Stocks, Crypto, Mutual Funds, Gold) with automated market price fetching and portfolio valuation.
- **Hosting & Infrastructure:** Vercel (Production Serverless + Vercel Cron).
- **Frontend & Backend Framework:** Next.js (App Router, TypeScript, Tailwind CSS).
- **Database:** Supabase (PostgreSQL with Supabase JS SDK).

---

## 2. Tech Stack & Key Libraries
- **Framework:** Next.js (App Router, Turbopack)
- **Database Client:** `@supabase/supabase-js` (`@/lib/supabase.ts`)
- **Market Data APIs:**
  - **Crypto:** Binance Public REST API (`https://api.binance.com/api/v3/ticker/price`)
  - **Equities (US & Thai):** `yahoo-finance2` (Node.js library, v3/v4 instance-based)
  - **FX Rates (USD/THB):** Open Exchange API (`https://open.er-api.com/v6/latest/USD`)
- **Styling:** Tailwind CSS

---

## 3. Database Schema Reference (Supabase)

### Table: `portfolio_holdings`
Stores positions in stocks, crypto, gold, and mutual funds.
- `id` (UUID / Primary Key)
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

---

## 4. Architecture & Data Flow

### A. Market Price Ingestion (`/api/update-prices`)
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

### B. Client Architecture
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