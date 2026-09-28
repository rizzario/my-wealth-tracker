'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  PieChart,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  CalendarClock,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  ArrowRight,
  Receipt,
  Layers,
  Sparkles,
  Percent,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { NetWorthSummary } from '@/lib/networth';

export interface FinancialTransaction {
  id: number | string;
  user_id?: string;
  transaction_date: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | string;
  transaction_type?: string;
  category: string;
  amount: number;
  account_id?: string | number | null;
  to_account_id?: string | number | null;
  note?: string | null;
  created_at?: string;
}

export interface HoldingItem {
  id: string;
  symbol: string;
  broker?: string | null;
  volume: number;
  currency: string;
  initial_cost: number;
  present_price: number | null;
  exchange_rate?: number;
  cost_exchange_rate?: number;
  total_cost_thb?: number;
  total_present_price_thb?: number;
  yield_percent?: number;
}

interface OverviewSectionProps {
  summary: NetWorthSummary;
  holdings: HoldingItem[];
  cashPvd: any[];
  financialAccounts: any[];
  transactions: FinancialTransaction[];
  recentTransactions: FinancialTransaction[];
  hideValues: boolean;
  onNavigateTab: (tab: 'overview' | 'holdings' | 'trades' | 'cash_pvd' | 'cashflow' | 'expenses') => void;
}

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export default function OverviewSection({
  summary,
  holdings,
  cashPvd,
  financialAccounts,
  transactions,
  recentTransactions,
  hideValues,
  onNavigateTab,
}: OverviewSectionProps) {
  // Chart Display Mode for Asset Allocation: 'donut' | 'stackbar'
  const [chartMode, setChartMode] = useState<'donut' | 'stackbar'>(() => {
    try {
      const saved = localStorage.getItem('overview_chart_mode');
      if (saved === 'donut' || saved === 'stackbar') return saved;
    } catch {}
    return 'donut';
  });

  // Allocation Scope: 'all' (สินทรัพย์รวม) | 'portfolio' (เจาะลึกพอร์ตหุ้น/คริปโต)
  const [allocationScope, setAllocationScope] = useState<'all' | 'portfolio'>('all');

  // Selected or hovered category index
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Month Navigator State: default to current month
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const handleChartModeChange = (mode: 'donut' | 'stackbar') => {
    setChartMode(mode);
    try {
      localStorage.setItem('overview_chart_mode', mode);
    } catch {}
  };

  // Helper formatting numbers defensively (AGENTS.md §5.4)
  const formatMoney = (val?: number | null, prefix = '฿') => {
    if (hideValues) return '฿••••••';
    const num = Number(val ?? 0);
    return `${prefix}${num.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatShortMoney = (val?: number | null, prefix = '฿') => {
    if (hideValues) return '฿••••';
    const num = Number(val ?? 0);
    return `${prefix}${num.toLocaleString('th-TH', {
      maximumFractionDigits: 0,
    })}`;
  };

  // ----------------------------------------------------
  // 1. LEFT COLUMN: Asset Allocation Breakdown & Port Ratio
  // ----------------------------------------------------
  const assetAllocationData = useMemo(() => {
    if (allocationScope === 'portfolio' && holdings.length > 0) {
      // Sub-breakdown of investment holdings
      let thaiStockVal = 0;
      let usStockVal = 0;
      let cryptoVal = 0;
      let goldFundsVal = 0;

      const cryptoSymbols = ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'XRP'];

      for (const h of holdings) {
        const sym = (h.symbol || '').toUpperCase().trim();
        const cur = (h.currency || 'THB').toUpperCase();
        const val = Number(h.total_present_price_thb ?? 0);

        if (cryptoSymbols.includes(sym)) {
          cryptoVal += val;
        } else if (sym.startsWith('GOLD') || sym.startsWith('K-') || sym.startsWith('SCBTA') || sym === 'GOOG80') {
          goldFundsVal += val;
        } else if (cur === 'USD' || ['AAPL', 'NVDA', 'TSLA', 'AMD', 'VOO', 'QQQI', 'MSFT', 'GOOG', 'AMZN', 'META'].includes(sym)) {
          usStockVal += val;
        } else {
          thaiStockVal += val;
        }
      }

      const totalVal = thaiStockVal + usStockVal + cryptoVal + goldFundsVal;

      const items = [
        {
          id: 'thai_stocks',
          name: 'หุ้นไทย (Thai Equities)',
          value: thaiStockVal,
          color: '#0284c7', // sky-600
          bgColor: 'bg-sky-500',
          textColor: 'text-sky-600',
          count: holdings.filter((h) => {
            const sym = (h.symbol || '').toUpperCase();
            const cur = (h.currency || 'THB').toUpperCase();
            return cur === 'THB' && !cryptoSymbols.includes(sym) && !sym.startsWith('GOLD') && !sym.startsWith('K-');
          }).length,
          targetTab: 'holdings' as const,
        },
        {
          id: 'us_stocks',
          name: 'หุ้นต่างประเทศ (US / Global)',
          value: usStockVal,
          color: '#4f46e5', // indigo-600
          bgColor: 'bg-indigo-600',
          textColor: 'text-indigo-600',
          count: holdings.filter((h) => (h.currency || '').toUpperCase() === 'USD').length,
          targetTab: 'holdings' as const,
        },
        {
          id: 'crypto',
          name: 'คริปโตเคอร์เรนซี (Crypto)',
          value: cryptoVal,
          color: '#f59e0b', // amber-500
          bgColor: 'bg-amber-500',
          textColor: 'text-amber-600',
          count: holdings.filter((h) => cryptoSymbols.includes((h.symbol || '').toUpperCase())).length,
          targetTab: 'holdings' as const,
        },
        {
          id: 'gold_funds',
          name: 'ทองคำ / กองทุน / DR',
          value: goldFundsVal,
          color: '#10b981', // emerald-500
          bgColor: 'bg-emerald-500',
          textColor: 'text-emerald-600',
          count: holdings.filter((h) => {
            const sym = (h.symbol || '').toUpperCase();
            return sym.startsWith('GOLD') || sym.startsWith('K-') || sym.startsWith('SCBTA') || sym === 'GOOG80';
          }).length,
          targetTab: 'holdings' as const,
        },
      ]
        .filter((item) => item.value > 0)
        .map((item) => ({
          ...item,
          percent: totalVal > 0 ? (item.value / totalVal) * 100 : 0,
        }));

      return {
        total: totalVal,
        items,
        label: 'พอร์ตลงทุนรวม (Portfolio Holdings)',
      };
    }

    // High-level: All Assets breakdown
    const totalAssets =
      summary.totalLiquidCash +
      summary.totalHoldingsValueTHB +
      summary.totalFixedDeposit +
      summary.totalPVD;

    const items = [
      {
        id: 'liquid_cash',
        name: 'สภาพคล่องพร้อมใช้ (Liquid Cash)',
        value: summary.totalLiquidCash,
        color: '#f59e0b', // amber-500
        bgColor: 'bg-amber-500',
        textColor: 'text-amber-600',
        count: financialAccounts.filter((a) => !a.is_liability).length,
        description: 'เงินฝากออมทรัพย์ บัญชีกระแสรายวัน & เงินสด',
        targetTab: 'cashflow' as const,
      },
      {
        id: 'holdings',
        name: 'พอร์ตลงทุน (Investments)',
        value: summary.totalHoldingsValueTHB,
        color: '#3b82f6', // blue-500
        bgColor: 'bg-blue-500',
        textColor: 'text-blue-600',
        count: holdings.length,
        description: 'หุ้นไทย, หุ้นนอก, คริปโต, กองทุนรวม',
        targetTab: 'holdings' as const,
      },
      {
        id: 'fixed_deposit',
        name: 'เงินฝากประจำ (Fixed Deposits)',
        value: summary.totalFixedDeposit,
        color: '#8b5cf6', // violet-500
        bgColor: 'bg-violet-500',
        textColor: 'text-violet-600',
        count: cashPvd.filter((c) => (c.account_type || '').toUpperCase() === 'FIXED_DEPOSIT').length,
        description: 'บัญชีเงินฝากประจำเพื่อดอกเบี้ยสูง',
        targetTab: 'cash_pvd' as const,
      },
      {
        id: 'pvd',
        name: 'กองทุนสำรองเลี้ยงชีพ (PVD)',
        value: summary.totalPVD,
        color: '#10b981', // emerald-500
        bgColor: 'bg-emerald-500',
        textColor: 'text-emerald-600',
        count: cashPvd.filter((c) => (c.account_type || '').toUpperCase() === 'PVD').length,
        description: 'สินทรัพย์เพื่อการเกษียณอายุ',
        targetTab: 'cash_pvd' as const,
      },
    ]
      .filter((item) => item.value > 0)
      .map((item) => ({
        ...item,
        percent: totalAssets > 0 ? (item.value / totalAssets) * 100 : 0,
      }));

    return {
      total: totalAssets,
      items,
      label: 'สินทรัพย์รวมทั้งหมด (Total Assets)',
    };
  }, [summary, holdings, cashPvd, financialAccounts, allocationScope]);

  // Donut SVG circumference and stroke offset calculation
  const donutRadius = 68;
  const donutCircumference = 2 * Math.PI * donutRadius; // ≈ 427.256

  // ----------------------------------------------------
  // 2. RIGHT COLUMN: Monthly Spent Summary Box
  // ----------------------------------------------------
  const currentSelectedYear = selectedDate.getFullYear();
  const currentSelectedMonth = selectedDate.getMonth(); // 0-11

  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return (
      now.getFullYear() === currentSelectedYear &&
      now.getMonth() === currentSelectedMonth
    );
  }, [currentSelectedYear, currentSelectedMonth]);

  const handlePrevMonth = () => {
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleResetToCurrentMonth = () => {
    setSelectedDate(new Date());
  };

  // Filter transactions for the selected month
  const monthlyTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (!tx.transaction_date) return false;
      const d = new Date(tx.transaction_date);
      return (
        d.getFullYear() === currentSelectedYear &&
        d.getMonth() === currentSelectedMonth
      );
    });
  }, [transactions, currentSelectedYear, currentSelectedMonth]);

  // Metrics: Income, Outcome/Expense, Remain, Savings Rate, Top Categories
  const monthlyMetrics = useMemo(() => {
    let income = 0;
    let expense = 0;
    let transfer = 0;
    let incomeCount = 0;
    let expenseCount = 0;

    const categoryMap: Record<string, number> = {};

    for (const tx of monthlyTransactions) {
      const typeVal = String(tx.type || tx.transaction_type || '').toUpperCase();
      const amt = Number(tx.amount || 0);

      if (typeVal === 'INCOME') {
        income += amt;
        incomeCount++;
      } else if (typeVal === 'EXPENSE') {
        expense += amt;
        expenseCount++;
        const cat = tx.category || 'อื่นๆ';
        categoryMap[cat] = (categoryMap[cat] || 0) + amt;
      } else if (typeVal === 'TRANSFER') {
        transfer += amt;
      }
    }

    const remain = income - expense;
    const savingsRate = income > 0 ? (remain / income) * 100 : 0;
    const spentRate = income > 0 ? (expense / income) * 100 : 0;

    // Days in selected month
    const totalDaysInMonth = new Date(currentSelectedYear, currentSelectedMonth + 1, 0).getDate();
    const now = new Date();
    const daysPassed = isCurrentMonth
      ? Math.max(1, Math.min(now.getDate(), totalDaysInMonth))
      : totalDaysInMonth;
    const avgDailyExpense = expense > 0 && daysPassed > 0 ? expense / daysPassed : 0;

    // Top 3 Expense Categories
    const topCategories = Object.entries(categoryMap)
      .map(([cat, amt]) => ({
        category: cat,
        amount: amt,
        percent: expense > 0 ? (amt / expense) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    return {
      income,
      expense,
      remain,
      transfer,
      incomeCount,
      expenseCount,
      savingsRate,
      spentRate,
      avgDailyExpense,
      daysPassed,
      totalDaysInMonth,
      topCategories,
    };
  }, [monthlyTransactions, currentSelectedYear, currentSelectedMonth, isCurrentMonth]);

  // Format transaction date helper for recent list
  const formatRecentTxDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;

      const day = String(d.getDate()).padStart(2, '0');
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const y = d.getFullYear();

      const hasTime = dateStr.includes('T') || dateStr.includes(' ') || dateStr.includes(':');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');

      return (
        <span className="inline-flex items-center gap-1.5">
          <span>{`${day}/${m}/${y}`}</span>
          {hasTime && (
            <span className="inline-flex items-center gap-0.5 text-slate-400 font-mono text-[11px]">
              <Clock className="w-2.5 h-2.5" />
              <span>{`${hh}:${mm} น.`}</span>
            </span>
          )}
        </span>
      );
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* 2-Column Responsive Layout: Port Ratio (Left) & Monthly Spent (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
        
        {/* ======================================================== */}
        {/* 1. LEFT COLUMN: Port Ratio & Asset Allocation Breakdown */}
        {/* ======================================================== */}
        <div className="lg:col-span-6 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                    <PieChart className="w-4 h-4" />
                  </div>
                  <h2 className="text-base font-bold text-slate-800 tracking-tight">
                    สัดส่วนสินทรัพย์ & พอร์ตลงทุน
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Asset Allocation Breakdown & Portfolio Ratio
                </p>
              </div>

              {/* Action Buttons: Sub-scope & Chart Type Toggle */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                {holdings.length > 0 && (
                  <div className="bg-slate-100 p-0.5 rounded-lg flex text-[11px] font-medium text-slate-600">
                    <button
                      type="button"
                      onClick={() => setAllocationScope('all')}
                      className={`px-2 py-1 rounded-md transition cursor-pointer ${
                        allocationScope === 'all'
                          ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                          : 'hover:text-slate-900'
                      }`}
                    >
                      สินทรัพย์รวม
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllocationScope('portfolio')}
                      className={`px-2 py-1 rounded-md transition cursor-pointer ${
                        allocationScope === 'portfolio'
                          ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                          : 'hover:text-slate-900'
                      }`}
                    >
                      พอร์ตลงทุน
                    </button>
                  </div>
                )}

                <div className="bg-slate-100 p-0.5 rounded-lg flex text-xs text-slate-600">
                  <button
                    type="button"
                    onClick={() => handleChartModeChange('donut')}
                    title="แสดงแผนภูมิโดนัท"
                    className={`p-1.5 rounded-md transition cursor-pointer ${
                      chartMode === 'donut'
                        ? 'bg-white text-blue-600 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <PieChart className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChartModeChange('stackbar')}
                    title="แสดงแถบสแตกบาร์"
                    className={`p-1.5 rounded-md transition cursor-pointer ${
                      chartMode === 'stackbar'
                        ? 'bg-white text-blue-600 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Total Assets / Portfolio Heading Value */}
            <div className="py-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-400">
                  {assetAllocationData.label}
                </span>
                <p className="text-2xl font-bold text-slate-900 tracking-tight">
                  {formatMoney(assetAllocationData.total)}
                </p>
              </div>

              {summary.totalLiabilities > 0 && allocationScope === 'all' && (
                <div className="text-right">
                  <span className="text-[11px] text-rose-500 font-medium">
                    หนี้สินคงค้าง
                  </span>
                  <p className="text-xs font-semibold text-rose-600">
                    -{formatMoney(summary.totalLiabilities)}
                  </p>
                </div>
              )}
            </div>

            {/* Chart Area */}
            {assetAllocationData.items.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                ยังไม่มีข้อมูลสินทรัพย์ในหมวดหมู่นี้
              </div>
            ) : chartMode === 'donut' ? (
              /* Donut Chart View */
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
                <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 180 180">
                    {/* Background Track */}
                    <circle
                      cx="90"
                      cy="90"
                      r={donutRadius}
                      className="text-slate-100"
                      strokeWidth="16"
                      stroke="currentColor"
                      fill="transparent"
                    />

                    {/* Donut Segments */}
                    {(() => {
                      let accumulatedOffset = 0;
                      return assetAllocationData.items.map((item, idx) => {
                        const dashLength = (item.percent / 100) * donutCircumference;
                        const strokeOffset = accumulatedOffset;
                        accumulatedOffset += dashLength;
                        const isHovered = hoveredIdx === idx;

                        return (
                          <circle
                            key={item.id}
                            cx="90"
                            cy="90"
                            r={donutRadius}
                            fill="transparent"
                            stroke={item.color}
                            strokeWidth={isHovered ? 20 : 16}
                            strokeDasharray={`${dashLength} ${donutCircumference}`}
                            strokeDashoffset={-strokeOffset}
                            className="transition-all duration-300 cursor-pointer"
                            onMouseEnter={() => setHoveredIdx(idx)}
                            onMouseLeave={() => setHoveredIdx(null)}
                          />
                        );
                      });
                    })()}
                  </svg>

                  {/* Donut Center Display */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2 pointer-events-none">
                    {hoveredIdx !== null && assetAllocationData.items[hoveredIdx] ? (
                      <div className="animate-in fade-in duration-200">
                        <span className="text-[10px] font-semibold text-slate-400 block truncate max-w-[100px]">
                          {assetAllocationData.items[hoveredIdx].name.split('(')[0]}
                        </span>
                        <span className="text-base font-extrabold text-slate-900 block leading-tight">
                          {assetAllocationData.items[hoveredIdx].percent.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono block">
                          {formatShortMoney(assetAllocationData.items[hoveredIdx].value)}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
                          สัดส่วน
                        </span>
                        <span className="text-sm font-bold text-slate-800 block">
                          {assetAllocationData.items.length} ประเภท
                        </span>
                        <span className="text-[10px] text-emerald-600 font-medium block">
                          100.0%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Donut Mini Breakdown Legend */}
                <div className="space-y-2 flex-1 w-full">
                  {assetAllocationData.items.map((item, idx) => (
                    <div
                      key={item.id}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() => onNavigateTab(item.targetTab)}
                      className={`p-2 rounded-xl transition-all flex items-center justify-between cursor-pointer border ${
                        hoveredIdx === idx
                          ? 'bg-slate-50 border-slate-300 shadow-xs'
                          : 'border-transparent hover:bg-slate-50/70'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-xs font-medium text-slate-700 truncate">
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-slate-900">
                          {formatMoney(item.value)}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                          {item.percent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Stacked Bar View */
              <div className="space-y-4 py-2">
                <div className="w-full bg-slate-100 rounded-full h-5 overflow-hidden flex shadow-inner p-0.5 gap-0.5">
                  {assetAllocationData.items.map((item, idx) => (
                    <div
                      key={item.id}
                      style={{
                        width: `${Math.max(item.percent, 1.5)}%`,
                        backgroundColor: item.color,
                      }}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() => onNavigateTab(item.targetTab)}
                      title={`${item.name}: ${item.percent.toFixed(1)}% (${formatMoney(item.value)})`}
                      className={`h-full transition-all duration-300 cursor-pointer first:rounded-l-full last:rounded-r-full ${
                        hoveredIdx === idx ? 'brightness-110 shadow-sm scale-y-110' : ''
                      }`}
                    />
                  ))}
                </div>

                {/* Stackbar Detailed Table */}
                <div className="divide-y divide-slate-100 pt-1">
                  {assetAllocationData.items.map((item, idx) => (
                    <div
                      key={item.id}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() => onNavigateTab(item.targetTab)}
                      className={`py-2 px-1 flex items-center justify-between text-xs transition cursor-pointer rounded-lg ${
                        hoveredIdx === idx ? 'bg-slate-50 font-medium' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-slate-800 truncate">{item.name}</span>
                        {item.count > 0 && (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded-full">
                            {item.count} รายการ
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-right shrink-0">
                        <span className="font-semibold text-slate-900">
                          {formatMoney(item.value)}
                        </span>
                        <span className="text-slate-500 font-mono text-[11px] w-12 text-right">
                          {item.percent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Left Column Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">
              {allocationScope === 'portfolio' ? 'สัดส่วนสินทรัพย์เสี่ยงเพื่อสร้างผลตอบแทน' : 'สัดส่วนสินทรัพย์ตามแผนความมั่งคั่งสุทธิ'}
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab(allocationScope === 'portfolio' ? 'holdings' : 'cashflow')}
              className="text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 cursor-pointer transition"
            >
              <span>{allocationScope === 'portfolio' ? 'ดูพอร์ตหุ้น' : 'ดูกระแสเงินสด'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. RIGHT COLUMN: Summary of Monthly Spent Box           */}
        {/* ======================================================== */}
        <div className="lg:col-span-6 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            {/* Header & Month Navigator */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800 tracking-tight">
                    สรุปรายรับ - รายจ่ายประจำเดือน
                  </h2>
                  <p className="text-xs text-slate-400">
                    Monthly Spending & Cash Flow Summary
                  </p>
                </div>
              </div>

              {/* Month Selector Controls */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                  title="เดือนก่อนหน้า"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-semibold text-slate-800 text-center whitespace-nowrap">
                  <span>{`${THAI_MONTHS_FULL[currentSelectedMonth]} ${currentSelectedYear}`}</span>
                  {isCurrentMonth && (
                    <span className="ml-1.5 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                      เดือนนี้
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                  title="เดือนถัดไป"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                {!isCurrentMonth && (
                  <button
                    type="button"
                    onClick={handleResetToCurrentMonth}
                    className="ml-1 text-[11px] font-medium text-emerald-700 hover:underline cursor-pointer"
                  >
                    กลับเดือนนี้
                  </button>
                )}
              </div>
            </div>

            {/* 3 Core Metric Summary Cards (Income, Outcome, Remain) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-4">
              {/* รายรับ (Income) */}
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                    <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                    <span>รายรับรวม (Income)</span>
                  </span>
                  <span className="text-[10px] text-emerald-600/80 font-mono">
                    {monthlyMetrics.incomeCount} รายการ
                  </span>
                </div>
                <div className="mt-2">
                  <p className="text-lg sm:text-xl font-bold text-emerald-800 tracking-tight leading-tight">
                    {formatMoney(monthlyMetrics.income, '+฿')}
                  </p>
                </div>
              </div>

              {/* รายจ่าย (Outcome / Expense) */}
              <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-rose-700 flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                    <span>รายจ่ายรวม (Outcome)</span>
                  </span>
                  <span className="text-[10px] text-rose-600/80 font-mono">
                    {monthlyMetrics.expenseCount} รายการ
                  </span>
                </div>
                <div className="mt-2">
                  <p className="text-lg sm:text-xl font-bold text-rose-800 tracking-tight leading-tight">
                    {formatMoney(monthlyMetrics.expense, '-฿')}
                  </p>
                </div>
              </div>

              {/* คงเหลือสุทธิ (Remain / Net) */}
              <div
                className={`border rounded-xl p-3 flex flex-col justify-between ${
                  monthlyMetrics.remain >= 0
                    ? 'bg-blue-50/70 border-blue-200/80'
                    : 'bg-amber-50/70 border-amber-200/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-semibold flex items-center gap-1 ${
                      monthlyMetrics.remain >= 0 ? 'text-blue-700' : 'text-amber-800'
                    }`}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>คงเหลือสุทธิ (Remain)</span>
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      monthlyMetrics.remain >= 0
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {monthlyMetrics.remain >= 0 ? 'เงินออม' : 'เกินงบ'}
                  </span>
                </div>
                <div className="mt-2">
                  <p
                    className={`text-lg sm:text-xl font-bold tracking-tight leading-tight ${
                      monthlyMetrics.remain >= 0 ? 'text-blue-900' : 'text-amber-900'
                    }`}
                  >
                    {formatMoney(monthlyMetrics.remain, monthlyMetrics.remain >= 0 ? '+฿' : '฿')}
                  </p>
                </div>
              </div>
            </div>

            {/* Savings & Spent Ratio Visual Bar */}
            <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Percent className="w-3.5 h-3.5 text-slate-500" />
                  <span>อัตราการออมเงิน (Savings Rate)</span>
                </span>
                <span
                  className={`font-bold ${
                    monthlyMetrics.savingsRate >= 20
                      ? 'text-emerald-600'
                      : monthlyMetrics.savingsRate > 0
                      ? 'text-blue-600'
                      : 'text-rose-600'
                  }`}
                >
                  {monthlyMetrics.income > 0
                    ? `${monthlyMetrics.savingsRate.toFixed(1)}%`
                    : '0.0%'}
                </span>
              </div>

              {/* Multi-segment Progress Bar: Spent vs Remain */}
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden flex">
                <div
                  style={{ width: `${Math.min(monthlyMetrics.spentRate, 100)}%` }}
                  className="bg-rose-500 transition-all duration-300"
                  title={`รายจ่าย: ${monthlyMetrics.spentRate.toFixed(1)}%`}
                />
                {monthlyMetrics.remain > 0 && (
                  <div
                    style={{ width: `${Math.min(monthlyMetrics.savingsRate, 100)}%` }}
                    className="bg-emerald-500 transition-all duration-300"
                    title={`เงินออม: ${monthlyMetrics.savingsRate.toFixed(1)}%`}
                  />
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>ใช้จ่าย {monthlyMetrics.spentRate.toFixed(1)}%</span>
                </span>
                {monthlyMetrics.avgDailyExpense > 0 && (
                  <span className="text-slate-400">
                    เฉลี่ย ฿{Math.round(monthlyMetrics.avgDailyExpense).toLocaleString()}/วัน
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>ออมได้ {monthlyMetrics.savingsRate.toFixed(1)}%</span>
                </span>
              </div>
            </div>

            {/* Top 3 Spending Categories Mini List */}
            <div className="pt-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                หมวดหมู่รายจ่ายสูงสุด 3 อันดับแรก
              </span>

              {monthlyMetrics.topCategories.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2 bg-slate-50/50 rounded-lg">
                  ยังไม่มีการบันทึกรายจ่ายในเดือนนี้
                </p>
              ) : (
                <div className="space-y-2">
                  {monthlyMetrics.topCategories.map((item, idx) => (
                    <div key={item.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium truncate max-w-[200px]">
                          {idx + 1}. {item.category}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {formatMoney(item.amount)}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            ({item.percent.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          style={{ width: `${item.percent}%` }}
                          className={`h-full rounded-full ${
                            idx === 0
                              ? 'bg-rose-500'
                              : idx === 1
                              ? 'bg-amber-500'
                              : 'bg-indigo-500'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column Footer */}
          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">
              {monthlyMetrics.transfer > 0
                ? `(มีการโอน/ชำระบัตร ฿${monthlyMetrics.transfer.toLocaleString()})`
                : 'บันทึกรายรับ-รายจ่ายเพื่อติดตามกระแสเงินสด'}
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('expenses')}
              className="text-emerald-700 hover:text-emerald-800 font-semibold inline-flex items-center gap-1 cursor-pointer transition"
            >
              <span>ดูบันทึกรับ-จ่ายทั้งหมด</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* ======================================================== */}
      {/* 3. RECENT ACTIVITY LIST (5 ล่าสุด)                       */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">
              รายการบันทึกล่าสุด
            </h2>
            <p className="text-xs text-slate-400">
              ธุรกรรมรับ-จ่าย และโอนเงินล่าสุดในระบบ
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('expenses')}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>ดูทั้งหมด & บันทึกรายการ</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              ยังไม่มีรายการบันทึก
            </p>
          ) : (
            recentTransactions.map((tx) => {
              const typeVal = String(tx.type || tx.transaction_type || '').toUpperCase();
              const isIncome = typeVal === 'INCOME';
              const isTransfer = typeVal === 'TRANSFER';

              return (
                <div
                  key={tx.id}
                  className="py-3 flex justify-between items-center text-sm hover:bg-slate-50/60 px-2 rounded-xl transition"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-slate-800 truncate">
                        {tx.category}
                      </p>
                      {isTransfer && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                          โอน/ชำระ
                        </span>
                      )}
                      {isIncome && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                          รายรับ
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center flex-wrap gap-x-1.5">
                      {formatRecentTxDateTime(tx.transaction_date)}
                      {tx.note && <span className="truncate max-w-[250px]">• {tx.note}</span>}
                    </div>
                  </div>

                  <span
                    className={`font-bold text-sm shrink-0 ${
                      isTransfer
                        ? 'text-indigo-600'
                        : isIncome
                        ? 'text-emerald-600'
                        : 'text-slate-800'
                    }`}
                  >
                    {isTransfer ? '⇄ ' : isIncome ? '+' : '-'}
                    {formatMoney(tx.amount)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
