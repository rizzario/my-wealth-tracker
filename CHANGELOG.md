# Changelog

## [Unreleased] - 2026-09-25

### Portfolio Holdings Broker Support & Auto Trade Synchronization (ผูกโบรกเกอร์สินทรัพย์ และบันทึก Trade/หักเงินสดอัตโนมัติ)

#### 1. Broker Tracking in Portfolio Holdings (`components/PortfolioTable.tsx`)
- **New Broker Column & Tag**: Added `broker` column to `portfolio_holdings` database schema, TypeScript types, and UI table.
- **Sorting & Badges**: Users can now sort holdings by Broker alphabetically, with broker badges displayed cleanly in the table.
- **Datalist Suggestions**: Input supports fast selection from popular brokers (`BLS`, `InnovestX`, `Dime!`, `Kasikorn Securities`, `SCB Securities`, `Binance`, `Bitkub`, etc.).

#### 2. Automatic Trade Order & Balance Deduction on Asset Creation
- **Auto BUY Generation**: When adding a new asset to the portfolio, checking **"บันทึกเป็นรายการซื้อ (BUY) ใน Trade Transactions อัตโนมัติ"** will automatically record a corresponding BUY order in `trade_transactions`.
- **Linked Cash Deduction**: Automatically deducts the purchase cost (`volume * initial_cost * exchange_rate`) from the selected `financial_accounts` to keep cash on hand perfectly synchronized.
- **Shared Broker Mappings**: Automatically selects the mapped financial account if a default was previously set for that broker in the Trade tab or Portfolio tab (`localStorage: broker_account_mappings`).

#### 3. Buy on Dip & Stop Loss Trade Integration
- In the Edit Asset modal, after running the **Buy on Dip (DCA)** or **Stop Loss / ขาย** calculator, users can toggle to automatically log the calculated BUY or SELL trade into `trade_transactions` and update the cash balance accordingly.

#### 4. Required SQL Migration
```sql
ALTER TABLE public.portfolio_holdings
  ADD COLUMN IF NOT EXISTS broker character varying(50) null;

CREATE INDEX IF NOT EXISTS idx_holdings_broker ON public.portfolio_holdings(broker);
```

---

## [Unreleased] - 2026-09-24

### Trade Transactions Ledger & Broker-to-Account Binding (ระบบบันทึกประวัติการเทรดและผูกบัญชีโบรกเกอร์)

#### 1. Dedicated Trade Transactions Tab (`components/TradeTransactionsSection.tsx`)
- **New Top-Level Navigation Tab**: Added `'trades'` (ประวัติการเทรด) tab adjacent to 'พอร์ตลงทุน' (Holdings) in `app/page.tsx`.
- **Summary Metrics Dashboard**:
  - ยอดซื้อสะสม (Total BUY Amount in THB).
  - ยอดขายสะสม (Total SELL Amount in THB).
  - กระแสเงินสดสุทธิ (Net Cash Flow in/out).
  - ค่าธรรมเนียม & ภาษีรวม (Total Commission & Tax).
  - จำนวนรายการซื้อขายทั้งหมด (Total Trades Count).
- **Interactive Trade Ledger Table**:
  - Displays Date, Broker, Linked Financial Account (`account_id`), Side (BUY / SELL / FREE), Stock Symbol, Units, Unit Price (with currency symbol), Commission Fee, Net Amount (THB), and Trade Reason / Order ID.
  - Resizable column widths with live mouse drag-and-drop handles and localStorage persistence (`trades_col_widths`).
  - Full Pagination controls with configurable page sizes (10, 20, 50, 100 rows per page, default 20) and smart page navigation (`<< < 1 2 ... > >>`).
  - Multi-criteria Filtering: Search text, Broker filter, Trade Side filter, Year filter, and Linked Financial Account filter.

#### 2. Broker-to-Financial-Account Binding Architecture
- **Smart Auto-Pick Binding**:
  - When recording a trade with a broker (e.g. `BLS`, `InnovestX`, `Dime!`), the form automatically detects and selects the linked financial account (e.g. `BLS` ➔ `[BBL] บัญชีออมทรัพย์ ATS` หรือ `BLS Cash Balance`).
  - Users can set and adjust default mappings at any time via the dedicated **"ผูกบัญชีโบรกเกอร์ (Broker Accounts Settings)"** modal or via the "จำบัญชีนี้เป็นค่าเริ่มต้นสำหรับ {broker}" checkbox.
  - Broker-account preferences persist across sessions in `localStorage: broker_account_mappings`.
- **Optional Balance Synchronization**:
  - When saving a trade, users can toggle "ปรับยอดเงินในบัญชีทันที" to automatically deduct the net amount on BUY or credit the net amount on SELL from the linked `financial_accounts`.
- **Database Schema & Safe Migration Support**:
  - Added `account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL` to `tableschema.txt` and SQL index `idx_trades_account_id`.
  - Frontend includes defensive error handling: if the user hasn't yet executed the migration in Supabase, the app detects the missing column, alerts the user with the SQL snippet, and safely proceeds without breaking trade entries.

#### 3. Required SQL Migration
```sql
ALTER TABLE public.trade_transactions
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trades_account_id ON public.trade_transactions(account_id);
```

---

## [Unreleased] - 2026-09-23

### Category Combobox with Popular Categories (ระบบเลือกและพิมพ์ค้นหาหมวดหมู่อัจฉริยะ)

#### 1. Dropdown Typing Field (`CategoryCombobox`)
- **Seamless Typing & Dropdown**: Converted the Category input in both the **Create Transaction Form** and **Edit Transaction Modal** into an interactive Combobox. Users can freely type custom category names or click the dropdown arrow to browse and select from popular categories.
- **Dynamic Type-Aware Category Filtering**:
  - Automatically loads presets based on transaction type: `POPULAR_EXPENSE_CATEGORIES` (รายจ่าย), `POPULAR_INCOME_CATEGORIES` (รายรับ), and `POPULAR_TRANSFER_CATEGORIES` (โอน/ชำระบัตร).
  - Also dynamically merges distinct historical categories previously recorded by the user for that transaction type.
- **Real-Time Live Search**: Filters suggestions on-the-fly as the user types, with a matching count indicator.
- **Custom Category Prompt**: When typing a category not present in the list, displays an intuitive `+ ใช้หมวดหมู่: "{typed_text}"` option.
- **Interactive UX Features**:
  - Chevron toggle button with rotation animation.
  - Active selection checkmark (`Check`) and highlighted badge.
  - Quick "ล้าง" (Clear) action in dropdown header.
  - Automatic click-outside detection and `Escape` key listener to dismiss dropdown.
  - Non-clipping modal dialog overlay (`relative` modal container).

---

### Transaction Ledger Pagination & Drag-and-Drop Resizable Columns (ระบบแบ่งหน้าและปรับความกว้างคอลัมน์)

#### 1. Configurable Pagination & Smooth Navigation
- **Page Size Selection**: Added dropdown supporting `10`, `20`, `50`, and `100` items per page (defaulting to 20, persisted in `localStorage: tx_table_page_size`).
- **Dynamic Status Display**: Displays `แสดง {startIndex} - {endIndex} จาก {total} รายการ` for clear record visibility.
- **Smart Navigation Controls**: Built pagination bar featuring First (`<<`), Previous (`<`), numbered page buttons with automatic ellipsis (`...`) for large record sets, Next (`>`), and Last (`>>`).
- **Filter-Aware Auto-Reset**: Changing search keywords, month selectors, or transaction type filters automatically resets page index to 1.

#### 2. Drag-to-Resize Column Headers
- **Live Drag-and-Drop Handles**: Hovering and dragging column borders allows real-time width adjustment with an intuitive resize cursor (`col-resize`) and blue border accent.
- **Fixed Table Layout Architecture**: Implemented `table-fixed` with `<colgroup>` and explicit pixel widths for all table columns (`date`, `category`, `note`, `account`, `amount`, `actions`).
- **Minimum Width Enforcement**: Prevents accidental column collapse with safe minimum width thresholds (60px to 140px).
- **Persistent Layouts**: Column widths are automatically remembered across page reloads via `localStorage: tx_table_col_widths`.
- **Reset Layout Button**: Added "รีเซ็ตคอลัมน์" button (`RotateCcw`) in table header toolbar to easily restore default balanced widths.

#### 3. Expanded Text Visibility
- **Removed Hardcoded Width Limits**: Removed restrictive `max-w-[200px]` constraints on `note` (บันทึกช่วยจำ) and `account` (บัญชี / ต้นทาง ➔ ปลายทาง), allowing cells to cleanly expand to any dragged width without premature truncation.
- **Accessible Tooltips**: Maintained full-text `title` attributes on truncated items for quick hover previews.

---

### Transfer & Credit Card Bill Payment Support (การโอนเงินระหว่างบัญชี & ชำระบัตรเครดิต)

#### 1. Internal Transfers & Debt Deduction Architecture
- **Eliminated Double-Counting of Expenses**: Paying credit card bills or transferring between own bank accounts is now tracked as `TRANSFER` rather than `EXPENSE`.
  - **Credit Card Bill Payment**: When paying off a credit card from a bank account, it decreases bank balance and decreases credit card outstanding balance simultaneously. Expenses were already accounted for when the purchases were initially made; classifying the payment as an expense would double-count expenses and artificially distort monthly savings rate.
  - **Internal Bank Transfer**: Moving funds between accounts (e.g. SCB to KBank) is net-neutral to personal wealth. Classifying as expense/income would inflate both.
- **Added `to_account_id`**: Added destination account FK (`to_account_id uuid`) referencing `financial_accounts(id)`.
- **Allowed `type = 'TRANSFER'`**: Updated check constraint on `expense_income_transactions.type` to support `INCOME`, `EXPENSE`, and `TRANSFER`.

#### 2. Dual-Account Trigger Balance Synchronization (`apply_txn_to_balance()`)
- **Automated Dual-Account Balance Adjustment**:
  - `account_id` (Source Account): Balance decreases (outflow for bank asset, increases debt if cash advance).
  - `to_account_id` (Destination Account): Balance increases if bank asset, or reduces credit card/loan debt if liability (`is_liability = true`).
- **Complete Reversal Support**: When a transfer is edited or deleted, both source and destination accounts are restored cleanly.

#### 3. UI/UX Enhancements in `ExpenseIncomeSection` & `app/page.tsx`
- **3-Way Type Selector**: Added `[ รายจ่าย ] [ รายรับ ] [ โอน/ชำระบัตร ]` with `ArrowRightLeft` icon.
- **Dynamic Transfer Form**: Displays two dropdowns (จากบัญชีต้นทาง ➔ ไปยังบัญชีปลายทาง) with contextual helper banners explaining debt deduction or net-neutral asset movement.
- **Transfer Categories**: Added presets: `ชำระค่าบัตรเครดิต`, `โอนเงินระหว่างบัญชี`, `ชำระสินเชื่อ / ค่างวด`, `ถอนเงินสด / เติมกระเป๋าเงิน`, `โอนเงินเพื่อลงทุน`.
- **5th Metric Card**: Added dedicated "โอน & ชำระบัตร (Transfer)" card showing internal flow volume without impacting Net Savings (`Income - Expense`) or Savings Rate calculations.
- **Table Ledger Display**: Renders transfer badge with `ArrowRightLeft`, visual flow (`[ต้นทาง] ➔ [ปลายทาง]`), and neutral `⇄ ฿...` styling.
- **Edit Modal**: Fully supports editing and re-assigning transfer source and destination accounts.
- **Overview Tab Integration (`app/page.tsx`)**: Recent transactions list now detects `type = 'TRANSFER'`, displaying an "โอน/ชำระ" badge and neutral `⇄ ฿...` formatting.

#### 4. Required SQL Migration Reference
```sql
ALTER TABLE public.expense_income_transactions
  ADD COLUMN IF NOT EXISTS to_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_to_account_id 
  ON public.expense_income_transactions(to_account_id);

ALTER TABLE public.expense_income_transactions
  DROP CONSTRAINT IF EXISTS expense_income_transactions_type_check;

ALTER TABLE public.expense_income_transactions
  ADD CONSTRAINT expense_income_transactions_type_check
  CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER'));

-- Trigger Function supporting dual-account balance adjustments on INSERT, UPDATE, DELETE
CREATE OR REPLACE FUNCTION public.apply_txn_to_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  src_liab boolean; dst_liab boolean; delta numeric(14,2);
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.type = 'TRANSFER' THEN
      IF OLD.account_id IS NOT NULL THEN
        SELECT is_liability INTO src_liab FROM public.financial_accounts WHERE id = OLD.account_id;
        delta := OLD.amount; IF src_liab THEN delta := -delta; END IF;
        UPDATE public.financial_accounts SET current_balance = current_balance + delta, updated_at = now() WHERE id = OLD.account_id;
      END IF;
      IF OLD.to_account_id IS NOT NULL THEN
        SELECT is_liability INTO dst_liab FROM public.financial_accounts WHERE id = OLD.to_account_id;
        delta := -OLD.amount; IF dst_liab THEN delta := -delta; END IF;
        UPDATE public.financial_accounts SET current_balance = current_balance + delta, updated_at = now() WHERE id = OLD.to_account_id;
      END IF;
    ELSE
      IF OLD.account_id IS NOT NULL THEN
        SELECT is_liability INTO src_liab FROM public.financial_accounts WHERE id = OLD.account_id;
        delta := CASE WHEN OLD.type = 'INCOME' THEN -OLD.amount ELSE OLD.amount END;
        IF src_liab THEN delta := -delta; END IF;
        UPDATE public.financial_accounts SET current_balance = current_balance + delta, updated_at = now() WHERE id = OLD.account_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.type = 'TRANSFER' THEN
      IF NEW.account_id IS NOT NULL THEN
        SELECT is_liability INTO src_liab FROM public.financial_accounts WHERE id = NEW.account_id;
        delta := -NEW.amount; IF src_liab THEN delta := -delta; END IF;
        UPDATE public.financial_accounts SET current_balance = current_balance + delta, updated_at = now() WHERE id = NEW.account_id;
      END IF;
      IF NEW.to_account_id IS NOT NULL THEN
        SELECT is_liability INTO dst_liab FROM public.financial_accounts WHERE id = NEW.to_account_id;
        delta := NEW.amount; IF dst_liab THEN delta := -delta; END IF;
        UPDATE public.financial_accounts SET current_balance = current_balance + delta, updated_at = now() WHERE id = NEW.to_account_id;
      END IF;
    ELSE
      IF NEW.account_id IS NOT NULL THEN
        SELECT is_liability INTO src_liab FROM public.financial_accounts WHERE id = NEW.account_id;
        delta := CASE WHEN NEW.type = 'INCOME' THEN NEW.amount ELSE -NEW.amount END;
        IF src_liab THEN delta := -delta; END IF;
        UPDATE public.financial_accounts SET current_balance = current_balance + delta, updated_at = now() WHERE id = NEW.account_id;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_transaction_changed ON public.expense_income_transactions;
CREATE TRIGGER on_transaction_changed
AFTER INSERT OR UPDATE OR DELETE ON public.expense_income_transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_txn_to_balance();
```

---

### Expense & Income Time Tracking & UUID Foreign Key Migration

#### 1. Timestamp Support for Transactions
- **Field updated to timestamptz**: Updated `expense_income_transactions.transaction_date` from plain `date` to `timestamp with time zone` (`timestamptz`) defaulting to `now()`.
- **Date & Time Input UI**: Added a dedicated time picker (`HH:mm`) alongside the date input with a quick 1-click **"ตอนนี้ (Now)"** button in both the new transaction form and the edit transaction modal.
- **Micro-chronological Sorting**: Transactions entered on the same date now sort accurately down to the minute/second (`DESC`) instead of indeterminate ordering.
- **Clock Display**: Rendered formatted date and time (`DD/MM/YYYY • HH:mm น.`) with a Lucide clock icon across both the transaction ledger and the Overview dashboard tab.

#### 2. Account Binding Migration (Bigint to UUID)
- **Resolved type mismatch**: Replaced legacy `bigint` FK referencing `cash_and_pvd_assets(id)` with a `uuid` FK pointing to `financial_accounts(id)`.
- **Defensive Error Interception**: Added graceful UI handling if legacy schema throws `invalid input syntax for type bigint`, allowing users to optionally proceed or view migration instructions.

#### 3. Automatic Account Balance Adjustment Trigger
- Replaced the insert-only trigger with `apply_txn_to_balance()`, which fires on `INSERT`, `UPDATE`, and `DELETE`.
- Automatically keeps cash/bank balances and credit card/loan liabilities synchronized whenever transactions are added, edited, or deleted.

---

### Separation of Operating Assets (Bank/Cash) and Liabilities (Credit Card/Loan) in CashFlow Form

### Key Improvements Made

#### 1. Direct Action Buttons in the Header
Instead of a single generic button, the header now provides direct entry buttons for immediate clarity:

  • + เพิ่มบัญชีเงินฝาก (Opens the form in Bank / Cash mode)

  • + เพิ่มบัตร/สินเชื่อ (Opens the form in Credit Card / Loan mode)

#### 2. Tab Switcher Inside the Form
   the top of the form, users can toggle between:

  • 🏦 บัญชีเงินฝาก & เงินสด (สินทรัพย์):
      • Automatically marks is_liability: false (tracked as liquid operating assets in Net Worth).

  • 💳 บัตรเครดิต & สินเชื่อ (หนี้สิน):
      • Automatically marks is_liability: true (outstanding balance is deducted from Net Worth).

#### 3. Bullet Point / Radio Sub-Category Selection
Each tab contains contextual bullet-point options:

  • Under Bank & Cash:

      • (•) 🏦 บัญชีธนาคาร (ออมทรัพย์ / กระแสรายวัน)
      • ( ) 💵 เงินสด / กระเป๋าเงิน (Cash Wallet)
  • Under Credit Card & Loan:

      • (•) 💳 บัตรเครดิต (Credit Card)
      • ( ) 📄 สินเชื่อ / บัตรกดเงินสด / ยอดผ่อนชำระ (Loan)

#### 4. Clean, Tailored Input Fields (No Clutter)

| Category | Relevant Fields Displayed | Irrelevant Fields Removed |
| --- | --- | --- |
| บัญชีเงินฝาก & เงินสด | <ul><li>ชื่อบัญชี</li><li>ธนาคาร (Datalist ธนาคารไทย)</li><li>เลขที่บัญชี</li><li>ยอดเงินคงเหลือเริ่มต้น (บาท)</li><li>อัตราดอกเบี้ยเงินฝาก (% ต่อป๊) </li></ul> | วงเงินบัตร, วันตัดรอบบิล, วันครบกำหนดชำระต่อปี |
| บัตรเครดิต & สินเชื่อ | <ul><li>ชื่อบัตร / ชื่อสินเชื่อ</li><li>ธนาคารผู้ออกบัตร</li><li>เลขบัตร 4 หลักท้าย / เลขสัญญา</li><li>ยอดค้างชำระ / ยอดใช้ไปปัจจุบัน</li><li>วงเงินบัตร / วงเงินอนุมัติ</li><li>อัตราดอกเบี้ย (% ต่อปี)</li><li>วันตัดรอบบิล (วันที่ 1–31)</li><li>วันครบกำหนดชำระ (วันที่ 1–31)</li></ul> | สับสนเรื่องยอดเงินฝาก vs หนี้สิน |
                           
### Verification
• Production build verified via npm run build with 0 errors.

---

### Add section separate from cash and credit      

### What Was Implemented

#### 1. Centralized Exchange Rate Helper (exchangeRates.ts & currency.ts)

• Fetches all cross-rates to THB in a single API request from Open Exchange Rates (https://open.er-api.com/v6/latest/USD) with automatic fallback to   
Yahoo Finance forex tickers (EURTHB=X, HKDTHB=X, JPYTHB=X, SGDTHB=X, USDTHB=X).

• Calculates rate_to_thb for all requested currencies:
    • EUR, HKD, JPY, SGD, USD, and THB (1.0).

• syncCurrencyExchangeRates(supabase): Upserts the latest rates directly into the currency_exchange_rates table.

• getCurrencyExchangeRates(supabase): Retrieves rates directly from the currency_exchange_rates table in Supabase. It only calls external FX APIs if   
the database table is empty or missing currencies.                                                                                       
#### 2. Refactored Price Ingestion Route (route.ts)

• No more fetching FX per stock:

    • On batch updates (or /api/update-prices?currency_only=true), it syncs currency_exchange_rates once at the start of the run.
    • On single holding updates (/api/update-prices?id=<bigint>), it reads the rate directly from currency_exchange_rates in Supabase with 0 external  
    FX calls.

• portfolio_holdings.exchange_rate set from currency_exchange_rates:

    • For every holding, exchange_rate is updated with rate_to_thb matching the holding's currency (USD, EUR, HKD, JPY, SGD, THB).
    • present_price is maintained in the native currency of the asset.

• International Market Ticker Support:

    • Symbols with market extensions (e.g. 0700.HK, D05.SI, 7203.T, MC.PA) are now queried directly through Yahoo Finance.                             

#### 3. Client & Calculation Updates
• **PortfolioTable.tsx**: Automatically formats currency symbols (€ for EUR, HK$ for HKD, ¥ for JPY, S$ for SGD, $ for USD, ฿ for THB).                
• **networth.ts**: Handles multi-currency valuations defensively so that all foreign currencies (EUR, HKD, JPY, SGD, USD) convert accurately to THB.   

### Recommended Database Migration for Supabase

In Supabase, portfolio_holdings previously had generated column definitions guarded by CASE WHEN currency = 'USD'.

Now that exchange_rate contains the true rate_to_thb for all non-THB currencies and 1.0 for THB, you can run this SQL in your Supabase SQL Editor to   
make the database generated columns multi-currency:

```SQL
  -- 1. Drop the old USD-restricted generated columns
  ALTER TABLE portfolio_holdings
    DROP COLUMN total_cost_thb,
    DROP COLUMN total_present_price_thb;

  -- 2. Re-add as unconditional multi-currency formulas (THB rows have exchange_rate = 1.0)
  ALTER TABLE portfolio_holdings
    ADD COLUMN total_cost_thb numeric(18, 4)
    GENERATED ALWAYS AS (volume * initial_cost * exchange_rate) STORED,
    ADD COLUMN total_present_price_thb numeric(18, 4)
    GENERATED ALWAYS AS (volume * present_price * exchange_rate) STORED;
```

### Verification
• Production build verified via npm run build with 0 errors.

---

### Foreign Currency Deposit (FCD) & Cash Exchange Rate Support in `ExpenseIncomeSection`

Added multi-currency support and initial exchange rate tracking for deposit and cash accounts (`financial_accounts`) to accommodate Foreign Currency Deposit (FCD) accounts and foreign cash holdings.

#### 1. Currency Dropdown & Initial FX Rate Input (`ExpenseIncomeSection.tsx`)
- **Currency Field**: Added a drop-down selector supporting `THB`, `USD`, `EUR`, `HKD`, `JPY`, and `SGD` (via `CURRENCY_OPTIONS` in `lib/currency.ts`), defaulting to `THB`.
- **Initial Exchange Rate (`init_exchange_rate` / `cost_exchange_rate`)**:
  - Numeric input field (4 decimal places, default blank).
  - Allows users to specify the actual historical conversion rate when depositing foreign currency.
  - If `currency === 'THB'`, the field is disabled and set to `1.0`.
  - If left blank for foreign currencies, the system automatically falls back to `rate_to_thb` fetched from the `currency_exchange_rates` table.
  - Interactive placeholder showing the latest reference rate and live THB equivalent preview while typing the balance.

#### 2. Persistence & Fallback Logic (`handleSaveAccount`)
- Automatically queries the `currency_exchange_rates` table on component mount (`fetchFxRates`) and during save.
- When inserting or updating `financial_accounts`:
  - `currency` is stored in uppercase.
  - If user provides a custom exchange rate, it is saved into `cost_exchange_rate`.
  - If blank, `cost_exchange_rate` is populated using `rate_to_thb` from `currency_exchange_rates`.
- Edit modal (`handleOpenEditForm`) pre-populates existing currency and custom exchange rate.

#### 3. FCD Account Card & Metric Updates
- **Card Display**: Added an `FCD [CURRENCY]` badge for non-THB accounts. Displays native balance with currency symbol (e.g. `$1,000.00`) alongside estimated THB equivalent and effective rate (e.g. `≈ ฿35,500.00 (@35.5000)`).
- **Privacy Mode**: Fully respects privacy toggles for both native currency and THB equivalent amounts.
- **Summary Metrics (`totalAssets`, `netBalance`)**: Multiplies foreign balances by `cost_exchange_rate` to calculate true THB totals, ensuring full alignment with the canonical Net Worth formula in `lib/networth.ts`.
- **Transaction Dropdown**: Formats account options with currency code and appropriate currency symbol.

#### 4. Schema & System Documentation
- Updated `tableschema.txt` and `AGENTS.md` to reflect `cost_exchange_rate numeric(10, 4) not null default 1.0` on `financial_accounts` and documented `currency_exchange_rates` RLS policies.

### Verification
- Production build verified via `npm run build` with 0 errors.

---

### Asset on Hand Management & Buy on Dip / Stop Loss Support (`PortfolioTable.tsx`)

Enhanced `PortfolioTable.tsx` to support complete lifecycle management of assets on hand (`portfolio_holdings`), including adding new holdings, deleting existing holdings, and comprehensive editing of holding volumes, average cost basis, and market price, protected by Supabase Row Level Security (RLS).

#### 1. Add Asset on Hand Modal
- Added a dedicated `+ เพิ่มสินทรัพย์` button in the section header.
- Provides a clean modal to record new investment holdings:
  - **Symbol**: Auto-capitalized ticker input (e.g. `AAPL`, `NVDA`, `BTC`, `PTT`).
  - **Currency**: Multi-currency selector (`THB`, `USD`, `EUR`, `HKD`, `JPY`, `SGD`).
  - **Volume & Average Cost**: Required fields with fractional/decimal precision support for crypto and equities.
  - **Market Price**: Optional field (defaults to average cost if blank, with automated background price sync via `/api/update-prices?id=...`).
- Explicitly binds `user_id: user.id` on insertion for RLS compliance and multi-user isolation.

#### 2. Remove Asset on Hand (Delete Holding)
- Added a `Trash2` action button for each asset row.
- Confirmation dialog prevents accidental deletions.
- Removes the record from `portfolio_holdings` via Supabase RLS (`.delete().eq('id', item.id)`), automatically updating portfolio valuations and Net Worth.

#### 3. Edit Volume & Average Cost with Buy on Dip / Stop Loss Calculator
- Upgraded the `Pencil` button from only editing current price to opening a full Asset Editing Modal:
  - Direct editing of `volume`, `initial_cost` (average cost), and `present_price`.
  - **Built-in DCA / Buy on Dip Calculator**:
    - Users enter additional shares bought and buy price (`ซื้อเพิ่มกี่หน่วย ที่ราคาเท่าใด`).
    - Automatically calculates weighted average cost: `(curVol * curCost + addVol * addPrice) / (curVol + addVol)`.
    - One-click application updates form fields with real-time preview.
  - **Built-in Stop Loss / Partial Sell Calculator**:
    - Users enter units sold to trim positions or cut losses.
    - Validates against current volume and updates remaining units while keeping the weighted average cost basis intact.
- Preserved quick inline editing of `present_price` directly on table cells for fast single-price adjustments.

### Verification
- Production build verified via `npm run build` with 0 errors.

---

### Layout Optimization & Pop-up Modal Form for High Account Density (`ExpenseIncomeSection.tsx`)

Redesigned the account management user experience on the Cash Flow tab (`ExpenseIncomeSection.tsx`) to support users with large numbers of accounts (15+ bank/cash accounts and 20+ credit cards/loans), eliminating long page scrolling and providing a centered Pop-up Modal Form.

#### 1. Add / Edit Pop-up Modal Form Dialog
- **Centered Modal Dialog**: Replaced the previous in-page form with an accessible, high-focus pop-up modal (`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs`).
- **Zero Scroll Frustration**: Clicking "+ เพิ่มบัญชีเงินฝาก", "+ เพิ่มบัตร/สินเชื่อ", or the "Edit (Pencil)" button on any account card or table row now instantly opens the modal dialog centered on the screen without displacing the user's scroll position.
- **Escape Key & Backdrop Dismissal**: Form can be easily dismissed via `Esc` key, modal backdrop click, or the `X` button.
- **Full Feature Parity**: Retains all previous capabilities including asset vs. liability switching, FCD currency selection (`THB`, `USD`, `EUR`, `HKD`, `JPY`, `SGD`), initial exchange rate fallback to `currency_exchange_rates`, Thai bank auto-complete datalist, credit limit usage tracking, and billing/due date inputs.

#### 2. Account Category Filter Tabs & Real-time Search Bar
- **Category Filter Tabs**: Added filter tabs at the top of the accounts container:
  - `ทั้งหมด (All)`
  - `🏦 เงินฝาก & เงินสด (Bank & Cash)` with badge count
  - `💳 บัตร & สินเชื่อ (Credit Cards & Loans)` with badge count
- **Real-time Search Bar**: Instant searching across account names, bank names, account numbers, and currency symbols with a quick-clear (`X`) button.
- **No-Match Empty State**: Clean empty state when search filters yield zero matches, with a one-click button to reset search and filters.

#### 3. Dual View Mode: Grid Cards vs. Compact Table View
- **View Switcher (`Grid` vs `Table`)**: Users can toggle between card view and a high-density compact table view, with preferences automatically remembered in `localStorage` (`cashflow_account_view_mode`).
- **Compact Table View**:
  - Displays 35+ accounts in a clean, space-efficient table requiring ~75% less vertical space.
  - Formats accounts with bank badge, masked account numbers, asset/liability badges, native & THB converted balances, credit utilization bar, interest rate, and billing cycle days.
  - Includes quick Action buttons (`Edit` and `Delete`) directly within table rows.

### Verification
---

### Separation of `CashFlow` and `ExpenseAndIncome` with Comprehensive Financial Reports

Refactored the architecture to separate Account & Liquidity Management (`CashFlowSection.tsx`) from Daily Income/Expense Tracking & Financial Reports (`ExpenseIncomeSection.tsx`) into two dedicated main tabs in `app/page.tsx`.

#### 1. Dedicated `CashFlow` Tab (`components/CashFlowSection.tsx`)
- Focused purely on bank accounts, liquid cash, Foreign Currency Deposit (FCD) accounts, credit cards, and revolving credit liabilities.
- Includes liquid asset, liability, and net liquid balance summary cards.
- Multi-currency FCD support with initial FX rates and real-time live reference rates.
- Filter tabs (`ทั้งหมด`, `🏦 เงินฝาก & เงินสด`, `💳 บัตร & สินเชื่อ`), real-time search bar, and dual view modes (`Grid View` vs `Compact Table View`).
- Accessible centered pop-up modal dialog for adding and editing financial accounts.

#### 2. Dedicated `ExpenseAndIncome` Tab with Financial Reports (`components/ExpenseIncomeSection.tsx`)
- **Period Filter Bar**: Filter transactions by `เดือนนี้ (This Month)`, `เดือนที่แล้ว (Last Month)`, `ปีนี้ (This Year)`, `ทั้งหมด (All Time)`, or custom month picker (`YYYY-MM`).
- **Summary Metrics**:
  - 🟢 รวมรายรับ (Total Income)
  - 🔴 รวมรายจ่าย (Total Expense)
  - 🔵 กระแสเงินสดสุทธิ (Net Savings / Cash Flow)
  - 🟣 อัตราการออม (Savings Rate % of income)
- **Interactive Transaction Form**:
  - Quick toggle between `รายจ่าย (Expense)` and `รายรับ (Income)`.
  - Date picker defaulting to current date.
  - Account selector linked to `financial_accounts`.
  - Quick Category tag chips for fast 1-click selection across common Thai spending and income categories.
- **Spending Breakdown & Visual Analysis**:
  - Breakdown of expenses by category with amounts, percentage shares, and colored progress bars.
- **Transaction Ledger & Report Table**:
  - Searchable by category, note, or amount.
  - Sub-filters for transaction type (`ทั้งหมด`, `รายรับ`, `รายจ่าย`) and specific accounts.
  - Full CRUD: In-table action buttons for editing (modal dialog) and deleting transactions.

#### 3. Main Navigation Updates (`app/page.tsx`)
- Added `กระแสเงินสด (Cash Flow)` tab and updated `รับ-จ่าย & รายงาน (Expense & Income)` tab in the navigation bar.
- Overview tab links directly to the dedicated reports tab and synchronizes state seamlessly.

### Verification
- Production build verified via `npm run build` with 0 errors.

---