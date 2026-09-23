### (Liabilities) using a dedicated Tab Switcher and Bullet Points.

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