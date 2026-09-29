// app/page.tsx
'use client';

import Image from 'next/image';
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
  Landmark,
  ChevronDown,
  Check,
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
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

interface NavGroupItem {
  id: 'investment' | 'asset';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  subItems: TabItem[];
}

const OVERVIEW_TAB: TabItem = {
  id: 'overview',
  label: 'ภาพรวม',
  icon: LayoutDashboard,
  description: 'สรุปความมั่งคั่งสุทธิ และภาพรวมพอร์ต',
};

const INVESTMENT_GROUP: NavGroupItem = {
  id: 'investment',
  label: 'การลงทุน',
  icon: TrendingUp,
  subItems: [
    {
      id: 'holdings',
      label: 'พอร์ตลงทุน',
      shortLabel: 'พอร์ต',
      icon: TrendingUp,
      description: 'พอร์ตหุ้น คริปโต กองทุน และผลตอบแทน P&L',
    },
    {
      id: 'trades',
      label: 'ประวัติการเทรด',
      shortLabel: 'ประวัติเทรด',
      icon: ArrowLeftRight,
      description: 'บันทึกซื้อ-ขายหุ้นและผูกบัญชีโบรกเกอร์',
    },
  ],
};

const ASSET_GROUP: NavGroupItem = {
  id: 'asset',
  label: 'สินทรัพย์',
  icon: Landmark,
  subItems: [
    {
      id: 'cash_pvd',
      label: 'สินทรัพย์ระยะยาว & ผลตอบแทนคงที่',
      shortLabel: 'ระยะยาว & PVD',
      icon: Landmark,
      description: 'หุ้นกู้, กองทุนลดหย่อนภาษี (SSF/Thai ESG), PVD, เงินฝากประจำ',
    },
    {
      id: 'cashflow',
      label: 'กระแสเงินสด & สภาพคล่อง',
      shortLabel: 'กระแสเงินสด',
      icon: CreditCard,
      description: 'สภาพคล่องพร้อมใช้ บัญชีหมุนเวียน และบัตรเครดิต',
    },
  ],
};

const EXPENSES_TAB: TabItem = {
  id: 'expenses',
  label: 'รับ-จ่าย & รายงาน',
  shortLabel: 'รับ-จ่าย',
  icon: Receipt,
  description: 'บันทึกรายรับ-รายจ่ายประจำวัน และวิเคราะห์ค่าใช้จ่าย',
};

const ALL_TABS: TabItem[] = [
  OVERVIEW_TAB,
  ...INVESTMENT_GROUP.subItems,
  ...ASSET_GROUP.subItems,
  EXPENSES_TAB,
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
  const [openDropdown, setOpenDropdown] = useState<'investment' | 'asset' | null>(null);

  const desktopNavRef = useRef<HTMLElement>(null);

  const isInvestmentActive = activeTab === 'holdings' || activeTab === 'trades';
  const isAssetActive = activeTab === 'cash_pvd' || activeTab === 'cashflow';

  // States ข้อมูล
  const [holdings, setHoldings] = useState<any[]>([]);
  const [cashPvd, setCashPvd] = useState<any[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [hideValues, setHideValues] = useState<boolean>(false);

  // Close desktop dropdown and mobile drawer on Escape key or click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (desktopNavRef.current && !desktopNavRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
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
            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
              <div className="shrink-0 flex items-center justify-center">
                <Image
                  src="/MRW_no_background.png"
                  alt="Personal Wealth Hub"
                  width={189}
                  height={142}
                  className="h-10 w-auto sm:h-12 object-contain drop-shadow-sm transition-transform duration-200 hover:scale-105"
                  priority
                />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg font-bold tracking-tight text-white leading-tight truncate">
                  Personal Wealth Hub
                </h1>
              </div>
            </div>

            {/* Desktop Navigation & Actions (md and up) */}
            <div className="hidden md:flex items-center space-x-2 lg:space-x-3 shrink-0">
              <nav
                ref={desktopNavRef}
                className="flex items-center space-x-1 bg-emerald-900/70 border border-emerald-800/80 p-1 rounded-xl text-xs font-medium"
              >
                {/* 1. ภาพรวม (Overview) */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('overview');
                    setOpenDropdown(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer ${
                    activeTab === 'overview'
                      ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                      : 'text-emerald-200 hover:text-white hover:bg-emerald-900/80'
                  }`}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>ภาพรวม</span>
                </button>

                {/* 2. การลงทุน (Investment Group Dropdown) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown((prev) => (prev === 'investment' ? null : 'investment'))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer ${
                      isInvestmentActive
                        ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                        : openDropdown === 'investment'
                        ? 'bg-emerald-800/90 text-white'
                        : 'text-emerald-200 hover:text-white hover:bg-emerald-900/80'
                    }`}
                    aria-expanded={openDropdown === 'investment'}
                    aria-haspopup="true"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>การลงทุน</span>
                    {isInvestmentActive && (
                      <span className="hidden xl:inline-block text-[10px] font-normal opacity-90 px-1 py-0.5 bg-emerald-600/80 rounded leading-none">
                        {activeTab === 'holdings' ? 'พอร์ต' : 'เทรด'}
                      </span>
                    )}
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        openDropdown === 'investment' ? 'rotate-180 text-white' : 'text-emerald-300'
                      }`}
                    />
                  </button>

                  {openDropdown === 'investment' && (
                    <div className="absolute top-full left-0 mt-1.5 min-w-[240px] bg-emerald-950/95 backdrop-blur-md border border-emerald-800/90 rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 space-y-1">
                      <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                        หมวดการลงทุน
                      </div>
                      {INVESTMENT_GROUP.subItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = activeTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => {
                              setActiveTab(sub.id);
                              setOpenDropdown(null);
                            }}
                            className={`w-full flex items-start gap-2.5 p-2 rounded-lg text-left transition-colors cursor-pointer ${
                              isSubActive
                                ? 'bg-emerald-500 text-white shadow-xs'
                                : 'text-emerald-100 hover:bg-emerald-900/80 hover:text-white'
                            }`}
                          >
                            <div
                              className={`p-1.5 rounded-md shrink-0 mt-0.5 ${
                                isSubActive ? 'bg-emerald-600 text-white' : 'bg-emerald-900/90 text-emerald-300'
                              }`}
                            >
                              <SubIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold leading-tight">{sub.label}</span>
                                {isSubActive && <Check className="w-3.5 h-3.5 shrink-0 text-white ml-1" />}
                              </div>
                              <p className={`text-[10px] mt-0.5 line-clamp-1 ${isSubActive ? 'text-emerald-100/90' : 'text-emerald-300/70'}`}>
                                {sub.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 3. สินทรัพย์ (Assets Group Dropdown) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown((prev) => (prev === 'asset' ? null : 'asset'))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer ${
                      isAssetActive
                        ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                        : openDropdown === 'asset'
                        ? 'bg-emerald-800/90 text-white'
                        : 'text-emerald-200 hover:text-white hover:bg-emerald-900/80'
                    }`}
                    aria-expanded={openDropdown === 'asset'}
                    aria-haspopup="true"
                  >
                    <Landmark className="w-3.5 h-3.5" />
                    <span>สินทรัพย์</span>
                    {isAssetActive && (
                      <span className="hidden xl:inline-block text-[10px] font-normal opacity-90 px-1 py-0.5 bg-emerald-600/80 rounded leading-none">
                        {activeTab === 'cash_pvd' ? 'ระยะยาว' : 'กระแสเงินสด'}
                      </span>
                    )}
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        openDropdown === 'asset' ? 'rotate-180 text-white' : 'text-emerald-300'
                      }`}
                    />
                  </button>

                  {openDropdown === 'asset' && (
                    <div className="absolute top-full left-0 mt-1.5 min-w-[260px] bg-emerald-950/95 backdrop-blur-md border border-emerald-800/90 rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 space-y-1">
                      <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                        หมวดสินทรัพย์
                      </div>
                      {ASSET_GROUP.subItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = activeTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => {
                              setActiveTab(sub.id);
                              setOpenDropdown(null);
                            }}
                            className={`w-full flex items-start gap-2.5 p-2 rounded-lg text-left transition-colors cursor-pointer ${
                              isSubActive
                                ? 'bg-emerald-500 text-white shadow-xs'
                                : 'text-emerald-100 hover:bg-emerald-900/80 hover:text-white'
                            }`}
                          >
                            <div
                              className={`p-1.5 rounded-md shrink-0 mt-0.5 ${
                                isSubActive ? 'bg-emerald-600 text-white' : 'bg-emerald-900/90 text-emerald-300'
                              }`}
                            >
                              <SubIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold leading-tight">{sub.label}</span>
                                {isSubActive && <Check className="w-3.5 h-3.5 shrink-0 text-white ml-1" />}
                              </div>
                              <p className={`text-[10px] mt-0.5 line-clamp-1 ${isSubActive ? 'text-emerald-100/90' : 'text-emerald-300/70'}`}>
                                {sub.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 4. รับ-จ่าย & รายงาน (Expenses) */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('expenses');
                    setOpenDropdown(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer ${
                    activeTab === 'expenses'
                      ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                      : 'text-emerald-200 hover:text-white hover:bg-emerald-900/80'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>รับ-จ่าย & รายงาน</span>
                </button>
              </nav>

              <div className="h-5 w-[1px] bg-emerald-800" />

              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-300 hover:text-red-300 hover:bg-emerald-900/80 border border-transparent hover:border-red-900/50 rounded-xl transition cursor-pointer"
                title="ออกจากระบบ"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ออกจากระบบ</span>
              </button>
            </div>

            {/* Mobile Actions: Compact Sign Out + Hamburger Menu Toggle (< md) */}
            <div className="flex md:hidden items-center space-x-1 shrink-0">
              <button
                type="button"
                onClick={handleSignOut}
                className="p-2 text-emerald-300 hover:text-red-300 hover:bg-emerald-900/80 rounded-xl border border-emerald-900/80 transition cursor-pointer"
                title="ออกจากระบบ"
                aria-label="ออกจากระบบ"
              >
                <LogOut className="w-4 h-4" />
              </button>

              <button
                type="button"
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
        </div>

        {/* Mobile Slide-Down Drawer Menu (Expanded overlay on hamburger click) */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-emerald-900 bg-emerald-950/95 backdrop-blur-md px-4 py-4 space-y-4 shadow-xl">
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider px-1">
              หมวดหมู่เมนูการทำงาน
            </div>

            {/* 1. ภาพรวม */}
            <div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('overview');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors duration-150 cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'bg-emerald-900/40 hover:bg-emerald-900/80 text-emerald-100 border border-emerald-900/80'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${activeTab === 'overview' ? 'bg-emerald-600 text-white' : 'bg-emerald-950 text-emerald-400'}`}>
                  <LayoutDashboard className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">ภาพรวม (Overview)</span>
                    {activeTab === 'overview' && (
                      <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-medium">ปัจจุบัน</span>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 ${activeTab === 'overview' ? 'text-emerald-100' : 'text-emerald-300/70'}`}>
                    สรุปความมั่งคั่งสุทธิ และรายการบันทึกล่าสุด
                  </p>
                </div>
              </button>
            </div>

            {/* 2. หมวดการลงทุน */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-emerald-300/80 px-1 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>หมวดการลงทุน (Investment)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {INVESTMENT_GROUP.subItems.map((sub) => {
                  const SubIcon = sub.icon;
                  const isActive = activeTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(sub.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-start gap-3 p-3 rounded-xl text-left transition-colors duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-emerald-500 text-white shadow-md'
                          : 'bg-emerald-900/40 hover:bg-emerald-900/80 text-emerald-100 border border-emerald-900/80'
                      }`}
                    >
                      <div className={`p-2 rounded-lg shrink-0 ${isActive ? 'bg-emerald-600 text-white' : 'bg-emerald-950 text-emerald-400'}`}>
                        <SubIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">{sub.label}</span>
                          {isActive && (
                            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-medium">ปัจจุบัน</span>
                          )}
                        </div>
                        <p className={`text-xs mt-0.5 line-clamp-1 ${isActive ? 'text-emerald-100' : 'text-emerald-300/70'}`}>
                          {sub.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. หมวดสินทรัพย์ */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-emerald-300/80 px-1 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-emerald-400" />
                <span>หมวดสินทรัพย์ (Assets)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ASSET_GROUP.subItems.map((sub) => {
                  const SubIcon = sub.icon;
                  const isActive = activeTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(sub.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-start gap-3 p-3 rounded-xl text-left transition-colors duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-emerald-500 text-white shadow-md'
                          : 'bg-emerald-900/40 hover:bg-emerald-900/80 text-emerald-100 border border-emerald-900/80'
                      }`}
                    >
                      <div className={`p-2 rounded-lg shrink-0 ${isActive ? 'bg-emerald-600 text-white' : 'bg-emerald-950 text-emerald-400'}`}>
                        <SubIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">{sub.label}</span>
                          {isActive && (
                            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-medium">ปัจจุบัน</span>
                          )}
                        </div>
                        <p className={`text-xs mt-0.5 line-clamp-1 ${isActive ? 'text-emerald-100' : 'text-emerald-300/70'}`}>
                          {sub.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. รับ-จ่าย & รายงาน */}
            <div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('expenses');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors duration-150 cursor-pointer ${
                  activeTab === 'expenses'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'bg-emerald-900/40 hover:bg-emerald-900/80 text-emerald-100 border border-emerald-900/80'
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${activeTab === 'expenses' ? 'bg-emerald-600 text-white' : 'bg-emerald-950 text-emerald-400'}`}>
                  <Receipt className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">รับ-จ่าย & รายงาน</span>
                    {activeTab === 'expenses' && (
                      <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-medium">ปัจจุบัน</span>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 ${activeTab === 'expenses' ? 'text-emerald-100' : 'text-emerald-300/70'}`}>
                    บันทึกรายรับ-รายจ่ายประจำวัน และวิเคราะห์ค่าใช้จ่าย
                  </p>
                </div>
              </button>
            </div>

            <div className="pt-2 border-t border-emerald-900/80 flex items-center justify-between">
              <span className="text-xs text-emerald-400/80">
                สถานะ: เข้าสู่ระบบแล้ว
              </span>
              <button
                type="button"
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
                className="text-slate-500 hover:text-emerald-700 p-1 -mr-1 rounded-md hover:bg-emerald-50 transition cursor-pointer"
              >
                {hideValues ? <EyeOff className="h-4 w-4 text-emerald-600" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums mt-2 text-slate-900">
              {hideValues ? (
                <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••••</span>
              ) : (
                `฿${summary.netWorth.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </p>
            {summary.totalLiabilities > 0 && !hideValues && (
              <p className="text-[11px] text-slate-500 mt-1">
                (หักหนี้สินบัตร/สินเชื่อ ฿{summary.totalLiabilities.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </p>
            )}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-blue-600" /> พอร์ตลงทุน (Unrealized P&L)
            </span>
            <p className="text-2xl font-bold font-mono tabular-nums mt-2 text-slate-900">
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
            <p className="text-2xl font-bold font-mono tabular-nums mt-2 text-slate-900">
              {hideValues ? (
                <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••••</span>
              ) : (
                `฿${summary.totalLiquidCash.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
              )}
            </p>
            <span className="text-xs text-slate-500">เงินฝากออมทรัพย์ & บัญชีหมุนเวียน</span>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Landmark className="h-4 w-4 text-purple-600" /> สินทรัพย์ระยะยาว & ผลตอบแทนคงที่
            </span>
            <p className="text-2xl font-bold font-mono tabular-nums mt-2 text-slate-900">
              {hideValues ? (
                <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••••</span>
              ) : (
                `฿${((summary.totalBonds ?? 0) + (summary.totalTaxSavingFunds ?? 0) + summary.totalPVD + summary.totalFixedDeposit + (summary.totalOtherAssets ?? 0)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
              )}
            </p>
            <span className="text-xs text-slate-500 line-clamp-1">
              {[
                (summary.totalBonds ?? 0) > 0 ? `หุ้นกู้ ฿${(summary.totalBonds ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}` : null,
                (summary.totalTaxSavingFunds ?? 0) > 0 ? `SSF/ESG ฿${(summary.totalTaxSavingFunds ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}` : null,
                summary.totalPVD > 0 ? `PVD ฿${summary.totalPVD.toLocaleString('th-TH', { maximumFractionDigits: 0 })}` : null,
                summary.totalFixedDeposit > 0 ? `ฝากประจำ ฿${summary.totalFixedDeposit.toLocaleString('th-TH', { maximumFractionDigits: 0 })}` : null,
                (summary.totalOtherAssets ?? 0) > 0 ? `อื่นๆ ฿${(summary.totalOtherAssets ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}` : null,
              ].filter(Boolean).join(' • ') || 'หุ้นกู้, SSF/Thai ESG, PVD, ฝากประจำ, สินทรัพย์อื่นๆ'}
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