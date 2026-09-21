// app/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Wallet, TrendingUp, PiggyBank, CalendarClock, Eye, EyeOff } from 'lucide-react';
import PortfolioTable from '../components/PortfolioTable';
import CashAndPVDTable from '../components/CashAndPvdSection';
import ExpenseIncomeSection from '../components/ExpenseIncomeSection';
import { useIdleTimer } from './hooks/useIdleTimer';
import { calculateNetWorthSummary } from '@/lib/networth';

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  useIdleTimer();

  const [activeTab, setActiveTab] = useState<'overview' | 'holdings' | 'cash_pvd' | 'expenses'>('overview');
  
  // States ข้อมูล
  const [holdings, setHoldings] = useState<any[]>([]);
  const [cashPvd, setCashPvd] = useState<any[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [hideValues, setHideValues] = useState<boolean>(false);

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

    // 4. ดึงธุรกรรมล่าสุดมาแสดงใน Tab Overview
    const { data: tData } = await supabase
      .from('expense_income_transactions')
      .select('*')
      .order('transaction_date', { ascending: false })
      .limit(5);
    if (tData) setRecentTransactions(tData);
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
      <header className="bg-emerald-950 text-white border-b border-emerald-900 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Wallet className="h-6 w-6 text-emerald-400" />
            <h1 className="text-xl font-bold tracking-tight">Personal Wealth Hub</h1>
          </div>

          <div className="flex items-center space-x-3">
            <nav className="flex space-x-1 bg-emerald-900/60 p-1 rounded-lg text-xs font-medium">
              {(['overview', 'holdings', 'cash_pvd', 'expenses'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-md capitalize transition-all ${
                    activeTab === tab ? 'bg-emerald-500 text-white shadow' : 'text-emerald-200 hover:text-white'
                  }`}
                >
                  {tab === 'overview' ? 'ภาพรวม' : tab === 'holdings' ? 'พอร์ตลงทุน' : tab === 'cash_pvd' ? 'เงินฝาก & PVD' : 'รับ-จ่าย'}
                </button>
              ))}
            </nav>

            <div className="h-5 w-[1px] bg-emerald-800" />

            <button
              onClick={handleSignOut}
              className="px-2.5 py-1.5 text-xs text-emerald-300 hover:text-red-300 hover:bg-emerald-900/80 rounded-md transition"
              title="ออกจากระบบ"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-6 space-y-6">
        {/* Top Cards: Net Worth & Financial Health */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

        {/* Tab 1: Overview (หน้าสรุปและรายการล่าสุดแบบกว้าง) */}
        {activeTab === 'overview' && (
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-slate-800">รายการบันทึกล่าสุด</h2>
              <button
                onClick={() => setActiveTab('expenses')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                ดูทั้งหมดและบันทึกรายการ →
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {recentTransactions.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">ยังไม่มีรายการบันทึก</p>
              ) : (
                recentTransactions.map((tx) => {
                  const typeVal = String(tx.type || tx.transaction_type || '').toUpperCase();
                  const isIncome = typeVal === 'INCOME';
                  return (
                    <div key={tx.id} className="py-3 flex justify-between items-center text-sm">
                      <div>
                        <p className="font-semibold text-slate-800">{tx.category}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {tx.transaction_date} {tx.note && `• ${tx.note}`}
                        </p>
                      </div>
                      <span className={`font-bold text-sm ${isIncome ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {isIncome ? '+' : '-'}฿{Number(tx.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Asset on Hand */}
        {activeTab === 'holdings' && (
          <PortfolioTable onHoldingsUpdated={fetchAllOverviewData} />
        )}

        {/* Tab 3: เงินฝาก & PVD */}
        {activeTab === 'cash_pvd' && (
          <CashAndPVDTable onCashPvdUpdated={fetchAllOverviewData} />
        )}

        {/* Tab 4: Expense & Income */}
        {activeTab === 'expenses' && (
          <ExpenseIncomeSection onCashFlowUpdated={fetchAllOverviewData} />
        )}
      </main>
    </div>
  );
}