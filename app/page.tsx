// app/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Wallet,
  TrendingUp,
  PiggyBank,
  CalendarClock,
  Eye,
  EyeOff,
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  Receipt,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import PortfolioTable from '../components/PortfolioTable';
import CashAndPVDTable from '../components/CashAndPvdSection';
import CashFlowSection from '../components/CashFlowSection';
import ExpenseIncomeSection from '../components/ExpenseIncomeSection';
import TradeTransactionsSection from '../components/TradeTransactionsSection';
import OverviewSection from '../components/OverviewSection';
import { useIdleTimer } from './hooks/useIdleTimer';
import { calculateNetWorthSummary } from '@/lib/networth';

type TabKey = 'overview' | 'holdings' | 'trades' | 'cash_pvd' | 'cashflow' | 'expenses';

interface TabItem {
  id: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const TABS: TabItem[] = [
  {
    id: 'overview',
    label: 'ภาพรวม',
    icon: LayoutDashboard,
    description: 'สรุปความมั่งคั่งสุทธิ และรายการบันทึกล่าสุด',
  },
  {
    id: 'holdings',
    label: 'พอร์ตลงทุน',
    icon: TrendingUp,
    description: 'พอร์ตหุ้น คริปโต กองทุน และผลตอบแทน P&L',
  },
  {
    id: 'trades',
    label: 'ประวัติการเทรด',
    icon: ArrowLeftRight,
    description: 'บันทึกซื้อ-ขายหุ้นและผูกบัญชีโบรกเกอร์',
  },
  {
    id: 'cash_pvd',
    label: 'เงินฝาก & PVD',
    icon: PiggyBank,
    description: 'เงินฝากดอกเบี้ยสูง ฝากประจำ และ PVD',
  },
  {
    id: 'cashflow',
    label: 'กระแสเงินสด',
    icon: CreditCard,
    description: 'สภาพคล่องพร้อมใช้ บัญชีหมุนเวียน และบัตรเครดิต',
  },
  {
    id: 'expenses',
    label: 'รับ-จ่าย & รายงาน',
    icon: Receipt,
    description: 'บันทึกรายรับ-รายจ่ายประจำวัน และวิเคราะห์ค่าใช้จ่าย',
  },
];

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  useIdleTimer();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const tabsNavRef = useRef<HTMLDivElement>(null);

  // States ข้อมูล
  const [holdings, setHoldings] = useState<any[]>([]);
  const [cashPvd, setCashPvd] = useState<any[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [hideValues, setHideValues] = useState<boolean>(false);

  // Smooth scroll active tab into view in the horizontal bar on mobile
  useEffect(() => {
    if (tabsNavRef.current) {
      const activeEl = tabsNavRef.current.querySelector<HTMLButtonElement>(`[data-tab="${activeTab}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeTab]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hide_top_cards_values');
      if (saved !== null) {
        setHideValues(saved === 'true');
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleHideValues = () => {
    setHideValues((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('hide_top_cards_values', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // ดึงข้อมูลภาพรวมทั้งหมดในฟังก์ชันเดียว
  const fetchAllOverviewData = useCallback(async () => {
    // 1. ดึงข้อมูลพอร์ตลงทุน
    const { data: hData } = await supabase.from('portfolio_holdings').select('*');
    if (hData) setHoldings(hData);

    // 2. ดึงเงินฝาก + PVD
    const { data: cData } = await supabase.from('cash_and_pvd_assets').select('*');
    if (cData) setCashPvd(cData);

    // 3. ดึงบัญชีการเงินหมุนเวียนทั้งหมด (รวมทั้งสินทรัพย์และหนี้สิน) จาก financial_accounts
    const { data: fData } = await supabase.from('financial_accounts').select('*');
    if (fData) setFinancialAccounts(fData);

    // 4. ดึงธุรกรรมทั้งหมดสำหรับคำนวณรายรับ-จ่ายประจำเดือน & ธุรกรรมล่าสุดใน Overview
    const { data: tData } = await supabase
      .from('expense_income_transactions')
      .select('*')
      .order('transaction_date', { ascending: false });
    if (tData) {
      setAllTransactions(tData);
      setRecentTransactions(tData.slice(0, 5));
    }
  }, [supabase]);

  useEffect(() => {
    fetchAllOverviewData();
  }, [fetchAllOverviewData]);

  // คำนวณตัวเลขสรุปความมั่งคั่งตามสูตร Canonical Formula (AGENTS.md §3.8)
  const summary = useMemo(() => {
    return calculateNetWorthSummary(holdings, cashPvd, financialAccounts);
  }, [holdings, cashPvd, financialAccounts]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      {/* Header */}
      <header className="bg-emerald-950 text-white border-b border-emerald-900 sticky top-0 z-30 shadow-md">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          {/* Main Top Bar: Logo + Desktop Navigation & Actions / Mobile Action Buttons */}
          <div className="py-2.5 sm:py-3 flex justify-between items-center gap-2">
            {/* Logo & Brand */}
            <div className="flex items-center space-x-2 sm:space-x-2.5 min-w-0">
              <div className="p-1.5 sm:p-2 bg-emerald-900/80 border border-emerald-700/50 rounded-xl shadow-xs shrink-0">
                <Wallet className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg font-bold tracking-tight text-white leading-tight truncate">
                  Personal Wealth Hub
                </h1>
                <p className="text-[10px] text-emerald-300/80 hidden sm:block truncate">
                  ติดตามความมั่งคั่ง & กระแสเงินสดส่วนบุคคล
                </p>
              </div>
            </div>

            {/* Desktop Navigation & Actions (lg and up) */}
            <div className="hidden lg:flex items-center space-x-3 shrink-0">
              <nav className="flex space-x-1 bg-emerald-900/70 border border-emerald-800/80 p-1 rounded-xl text-xs font-medium">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        isActive
                          ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                          : 'text-emerald-200 hover:text-white hover:bg-emerald-900/80'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="h-5 w-[1px] bg-emerald-800" />

              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-300 hover:text-red-300 hover:bg-emerald-900/80 border border-transparent hover:border-red-900/50 rounded-xl transition cursor-pointer"
                title="ออกจากระบบ"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ออกจากระบบ</span>
              </button>
            </div>

            {/* Mobile Actions: Compact Sign Out + Hamburger Menu Toggle (< lg) */}
            <div className="flex lg:hidden items-center space-x-1 shrink-0">
              <button
                onClick={handleSignOut}
                className="p-2 text-emerald-300 hover:text-red-300 hover:bg-emerald-900/80 rounded-xl border border-emerald-900/80 transition cursor-pointer"
                title="ออกจากระบบ"
                aria-label="ออกจากระบบ"
              >
                <LogOut className="w-4 h-4" />
              </button>

              <button
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className={`p-2 rounded-xl border transition cursor-pointer ${
                  mobileMenuOpen
                    ? 'bg-emerald-800 text-white border-emerald-600'
                    : 'text-emerald-200 hover:text-white hover:bg-emerald-900/80 border-emerald-900/80'
                }`}
                title={mobileMenuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
                aria-label={mobileMenuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
              >
                {mobileMenuOpen ? <X className="w-4 h-4 sm:w-5 sm:h-5" /> : <Menu className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Horizontal Scrollable Tab Bar (Scrollable Pill Navigation) */}
          <div className="lg:hidden pb-2.5 pt-0.5 border-t border-emerald-900/40">
            <nav
              ref={tabsNavRef}
              className="flex space-x-1.5 overflow-x-auto scrollbar-none py-0.5 -mx-1 px-1 touch-pan-x"
            >
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    data-tab={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                        : 'bg-emerald-900/50 text-emerald-200 hover:text-white hover:bg-emerald-900/80 border border-emerald-900/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Mobile Slide-Down Drawer Menu (Expanded overlay on hamburger click) */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-emerald-900 bg-emerald-950/95 backdrop-blur-md px-4 py-4 space-y-3 shadow-xl">
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider px-1">
              หมวดหมู่เมนูการทำงาน
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-start gap-3 p-3 rounded-xl text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-emerald-500 text-white shadow-md'
                        : 'bg-emerald-900/40 hover:bg-emerald-900/80 text-emerald-100 border border-emerald-900/80'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        isActive ? 'bg-emerald-600 text-white' : 'bg-emerald-950 text-emerald-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{tab.label}</span>
                        {isActive && (
                          <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-medium">
                            ปัจจุบัน
                          </span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 line-clamp-1 ${isActive ? 'text-emerald-100' : 'text-emerald-300/70'}`}>
                        {tab.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-emerald-900/80 flex items-center justify-between">
              <span className="text-xs text-emerald-400/80">
                สถานะ: เข้าสู่ระบบแล้ว
              </span>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 rounded-lg transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ออกจากระบบ</span>
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-4 sm:mt-6 space-y-6">
        {/* Top Cards: Net Worth & Financial Health */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-emerald-600" /> รวมความมั่งคั่งสุทธิ (Net Worth)
              </span>
              <button
                type="button"
                onClick={toggleHideValues}
                title={hideValues ? 'แสดงตัวเลขยอดเงิน' : 'ซ่อนตัวเลขยอดเงิน'}
                className="text-slate-400 hover:text-emerald-700 p-1 -mr-1 rounded-md hover:bg-emerald-50 transition cursor-pointer"
              >
                {hideValues ? <EyeOff className="h-4 w-4 text-emerald-600" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-2xl font-bold mt-2 text-slate-900">
              {hideValues ? (
                <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••••</span>
              ) : (
                `฿${summary.netWorth.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </p>
            {summary.totalLiabilities > 0 && !hideValues && (
              <p className="text-[11px] text-slate-400 mt-1">
                (หักหนี้สินบัตร/สินเชื่อ ฿{summary.totalLiabilities.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </p>
            )}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-blue-600" /> พอร์ตลงทุน (Unrealized P&L)
            </span>
            <p className="text-2xl font-bold mt-2 text-slate-900">
              {hideValues ? (
                <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••••</span>
              ) : (
                `฿${summary.totalHoldingsValueTHB.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`
              )}
            </p>
            <p className={`text-xs font-semibold mt-1 ${summary.holdingsPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {hideValues ? (
                <span className="tracking-widest font-mono text-slate-400 select-none">••••••</span>
              ) : (
                `${summary.holdingsPL >= 0 ? '+' : ''}฿${summary.holdingsPL.toLocaleString('th-TH', { maximumFractionDigits: 0 })} (${summary.holdingsYield.toFixed(2)}%)`
              )}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <PiggyBank className="h-4 w-4 text-amber-600" /> สภาพคล่องพร้อมใช้ (Liquid Cash)
            </span>
            <p className="text-2xl font-bold mt-2 text-slate-900">
              {hideValues ? (
                <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••••</span>
              ) : (
                `฿${summary.totalLiquidCash.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
              )}
            </p>
            <span className="text-xs text-slate-400">เงินฝากออมทรัพย์ & บัญชีหมุนเวียน</span>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-purple-600" />{' '}
              {summary.totalFixedDeposit > 0 ? 'เงินฝากประจำ & PVD' : 'กองทุนสำรองเลี้ยงชีพ (PVD)'}
            </span>
            <p className="text-2xl font-bold mt-2 text-slate-900">
              {hideValues ? (
                <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••••</span>
              ) : (
                `฿${(summary.totalPVD + summary.totalFixedDeposit).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
              )}
            </p>
            <span className="text-xs text-slate-400">
              {summary.totalFixedDeposit > 0
                ? `PVD: ฿${summary.totalPVD.toLocaleString('th-TH', { maximumFractionDigits: 0 })} • ฝากประจำ: ฿${summary.totalFixedDeposit.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`
                : 'สินทรัพย์เพื่อการเกษียณ'}
            </span>
          </div>
        </section>

        {/* Tab 1: Overview (สัดส่วนสินทรัพย์ Port Ratio, สรุปรายรับ-จ่ายประจำเดือน, และรายการล่าสุด) */}
        {activeTab === 'overview' && (
          <OverviewSection
            summary={summary}
            holdings={holdings}
            cashPvd={cashPvd}
            financialAccounts={financialAccounts}
            transactions={allTransactions}
            recentTransactions={recentTransactions}
            hideValues={hideValues}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {/* Tab 2: Asset on Hand */}
        {activeTab === 'holdings' && (
          <PortfolioTable onHoldingsUpdated={fetchAllOverviewData} />
        )}

        {/* Tab 3: ประวัติการเทรด & คำสั่งซื้อขาย (Trade Transactions) */}
        {activeTab === 'trades' && (
          <TradeTransactionsSection onTradesUpdated={fetchAllOverviewData} />
        )}

        {/* Tab 4: เงินฝาก & PVD */}
        {activeTab === 'cash_pvd' && (
          <CashAndPVDTable onCashPvdUpdated={fetchAllOverviewData} />
        )}

        {/* Tab 4: กระแสเงินสด & บัญชี (Cash Flow) */}
        {activeTab === 'cashflow' && (
          <CashFlowSection onCashFlowUpdated={fetchAllOverviewData} />
        )}

        {/* Tab 5: บันทึกรับ-จ่าย & รายงาน (Expense & Income) */}
        {activeTab === 'expenses' && (
          <ExpenseIncomeSection
            onTransactionsUpdated={fetchAllOverviewData}
            onCashFlowUpdated={fetchAllOverviewData}
          />
        )}
      </main>
    </div>
  );
}