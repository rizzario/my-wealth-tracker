## Project: Personal Wealth & Expense Tracker
- Tech Stack: Next.js (App Router), Tailwind CSS, Supabase (PostgreSQL)

## Database Tables:
1. `portfolio_holdings`: Tracks Asset on Hand (Stocks, Funds, Crypto, Gold). Has generated columns for total costs and yield.
2. `trade_transactions`: Trade ledger across BLS, FNS, and Dime.
3. `cash_and_pvd_assets`: Liquid bank accounts, promo interest rates, and Provident Fund (PVD).
4. `expense_income_transactions`: Daily/monthly income and expense records.

## Rules:
- All queries must use `@/lib/supabase` client.
- When calculating Net Worth: Sum of (total_present_price_thb) + liquid cash + PVD balance.
- Keep UI mobile-friendly and fast.