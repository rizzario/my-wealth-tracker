'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  TrendingUp,
  TrendingDown,
  Building2,
  DollarSign,
  Trophy,
  Target,
  Percent,
  Search,
  Filter,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
  Receipt,
  Layers,
  Sparkles,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
} from 'lucide-react';
import {
  TradeRecord,
  HoldingRecord,
  ClosedPosition,
  SymbolPerformance,
  BrokerPerformance,
  OverallPerformanceScorecard,
  calculateClosedPositions,
  calculateSymbolPerformances,
  calculateBrokerPerformances,
  calculateOverallScorecard,
} from '@/lib/performance';
import { getCurrencySymbol } from '@/lib/currency';

interface PerformanceAnalyticsSectionProps {
  initialTrades?: TradeRecord[];
  initialHoldings?: HoldingRecord[];
}

export default function PerformanceAnalyticsSection({
  initialTrades,
  initialHoldings,
}: PerformanceAnalyticsSectionProps) {
  const supabase = createClient();

  const [trades, setTrades] = useState<TradeRecord[]>(initialTrades || []);
  const [holdings, setHoldings] = useState<HoldingRecord[]>(initialHoldings || []);
  const [loading, setLoading] = useState(!initialTrades || initialTrades.length === 0);

  // View Mode: 'realized' (Closed Trades) | 'unrealized' (Active Port) | 'brokers' (Broker Comparison)
  const [activeViewMode, setActiveViewMode] = useState<'realized' | 'unrealized' | 'brokers'>('realized');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState<string>('ALL');
  const [sortOption, setSortOption] = useState<'pnl_desc' | 'pnl_asc' | 'yield_desc' | 'yield_asc'>('pnl_desc');

  // Pagination for detailed trade ledger
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Fetch all trades and holdings if not provided
  useEffect(() => {
    if (initialTrades && initialTrades.length > 0 && initialHoldings) {
      setTrades(initialTrades);
      setHoldings(initialHoldings);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);

        // 1. Fetch active portfolio holdings
        const { data: hData } = await supabase.from('portfolio_holdings').select('*');
        if (hData) setHoldings(hData as HoldingRecord[]);

        // 2. Fetch all trade transactions (chunked loop to bypass 1,000 row limit)
        let allTrades: TradeRecord[] = [];
        let from = 0;
        const CHUNK_SIZE = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: chunk, error } = await supabase
            .from('trade_transactions')
            .select('*')
            .order('trade_date', { ascending: false })
            .order('created_at', { ascending: false })
            .range(from, from + CHUNK_SIZE - 1);

          if (error) throw error;
          if (chunk && chunk.length > 0) {
            allTrades = allTrades.concat(chunk as TradeRecord[]);
            if (chunk.length < CHUNK_SIZE) {
              hasMore = false;
            } else {
              from += CHUNK_SIZE;
            }
          } else {
            hasMore = false;
          }
        }

        setTrades(allTrades);
      } catch (err: any) {
        console.error('Failed to load analytics data:', err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [supabase, initialTrades, initialHoldings]);

  // 1. Calculate closed realized positions using FIFO / Average Cost
  const allClosedPositions = useMemo(() => {
    return calculateClosedPositions(trades);
  }, [trades]);

  // Available Years & Brokers
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    allClosedPositions.forEach((p) => {
      if (p.tradeYear) years.add(p.tradeYear);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [allClosedPositions]);

  const availableBrokers = useMemo(() => {
    const brokers = new Set<string>();
    trades.forEach((t) => {
      if (t.broker?.trim()) brokers.add(t.broker.trim());
    });
    holdings.forEach((h) => {
      if (h.broker?.trim()) brokers.add(h.broker.trim());
    });
    return Array.from(brokers).sort();
  }, [trades, holdings]);

  // 2. Filter closed positions by selected year and broker
  const filteredClosedPositions = useMemo(() => {
    return allClosedPositions.filter((pos) => {
      if (brokerFilter !== 'ALL' && pos.broker !== brokerFilter) return false;
      if (yearFilter !== 'ALL' && String(pos.tradeYear) !== yearFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchSymbol = pos.symbol.toLowerCase().includes(q);
        const matchBroker = pos.broker.toLowerCase().includes(q);
        const matchReason = (pos.reason || '').toLowerCase().includes(q);
        const matchOrderId = (pos.orderId || '').toLowerCase().includes(q);
        if (!matchSymbol && !matchBroker && !matchReason && !matchOrderId) return false;
      }
      return true;
    });
  }, [allClosedPositions, brokerFilter, yearFilter, searchQuery]);

  // 3. Aggregate performance by Symbol for Top Gainers & Losers
  const symbolPerformances = useMemo(() => {
    const list = calculateSymbolPerformances(filteredClosedPositions, holdings);

    return list.sort((a, b) => {
      if (sortOption === 'pnl_desc') return b.realizedPnlThb - a.realizedPnlThb;
      if (sortOption === 'pnl_asc') return a.realizedPnlThb - b.realizedPnlThb;
      if (sortOption === 'yield_desc') return b.realizedYieldPercent - a.realizedYieldPercent;
      return a.realizedYieldPercent - b.realizedYieldPercent;
    });
  }, [filteredClosedPositions, holdings, sortOption]);

  // Top 10 Gainers & Top 10 Losers
  const topGainers = useMemo(() => {
    return symbolPerformances.filter((s) => s.realizedPnlThb > 0).slice(0, 10);
  }, [symbolPerformances]);

  const topLosers = useMemo(() => {
    return symbolPerformances
      .filter((s) => s.realizedPnlThb < 0)
      .sort((a, b) => a.realizedPnlThb - b.realizedPnlThb)
      .slice(0, 10);
  }, [symbolPerformances]);

  // 4. Broker-by-Broker Performances
  const brokerPerformances = useMemo(() => {
    const list = calculateBrokerPerformances(allClosedPositions, trades, holdings);
    if (brokerFilter !== 'ALL') {
      return list.filter((b) => b.broker === brokerFilter);
    }
    return list.sort((a, b) => b.totalRealizedPnlThb - a.totalRealizedPnlThb);
  }, [allClosedPositions, trades, holdings, brokerFilter]);

  // 5. Overall Scorecard
  const scorecard: OverallPerformanceScorecard = useMemo(() => {
    return calculateOverallScorecard(filteredClosedPositions, trades, holdings);
  }, [filteredClosedPositions, trades, holdings]);

  // 6. Active Holdings on Port (Unrealized)
  const activePortHoldings = useMemo(() => {
    return holdings
      .filter((h) => Number(h.volume || 0) > 0)
      .filter((h) => {
        if (brokerFilter !== 'ALL' && (h.broker || 'BLS') !== brokerFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const matchSymbol = (h.symbol || '').toLowerCase().includes(q);
          const matchBroker = (h.broker || '').toLowerCase().includes(q);
          if (!matchSymbol && !matchBroker) return false;
        }
        return true;
      })
      .map((h) => {
        const costThb = Number(h.total_cost_thb || 0);
        const presentThb = Number(h.total_present_price_thb || 0);
        const unrealizedPnlThb = presentThb - costThb;
        const yieldPercent = costThb > 0 ? (unrealizedPnlThb / costThb) * 100 : 0;
        return {
          ...h,
          costThb,
          presentThb,
          unrealizedPnlThb,
          yieldPercent,
        };
      })
      .sort((a, b) => b.unrealizedPnlThb - a.unrealizedPnlThb);
  }, [holdings, brokerFilter, searchQuery]);

  // Pagination for detailed trade ledger
  const totalPages = Math.ceil(filteredClosedPositions.length / pageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedPositions = filteredClosedPositions.slice(startIndex, startIndex + pageSize);

  const handleResetFilters = () => {
    setSearchQuery('');
    setBrokerFilter('ALL');
    setYearFilter('ALL');
    setSortOption('pnl_desc');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <span>วิเคราะห์ผลตอบแทน & สรุปสถิติการเทรด (Performance Analytics)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            วิเคราะห์กำไร-ขาดทุนที่เกิดขึ้นจริง (Realized P&L), เปรียบเทียบผลงานแยกตามแต่ละโบรกเกอร์ และจัดอันดับ Top-Gainer / Top-Loser
          </p>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveViewMode('realized')}
            className={`flex-1 sm:flex-none px-3 py-1.5 font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeViewMode === 'realized'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>กำไรที่เกิดขึ้นจริง (Realized P&L)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveViewMode('brokers')}
            className={`flex-1 sm:flex-none px-3 py-1.5 font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeViewMode === 'brokers'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>เปรียบเทียบโบรกเกอร์</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveViewMode('unrealized')}
            className={`flex-1 sm:flex-none px-3 py-1.5 font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeViewMode === 'unrealized'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>พอร์ตที่ยังถืออยู่ (Unrealized)</span>
          </button>
        </div>
      </div>

      {/* Realized Mode Note Badge */}
      {activeViewMode === 'realized' && (
        <div className="bg-emerald-50/70 border border-emerald-200/80 p-3 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong>หลักเกณฑ์การคำนวณ Realized P&L:</strong> คำนวณเฉพาะรายการที่เกิดการขายแล้ว (Closed Trades) โดยจับคู่ต้นทุนเฉลี่ย (Average Cost) จากประวัติการซื้อ-ขายใน <code>trade_transactions</code> — <strong>หุ้นที่ยังถือครองอยู่ในพอร์ตจะไม่ถูกนำมานับรวมเป็นกำไรสุทธิที่นี่</strong> เพื่อให้เห็นผลงานการเทรดที่ปิดสถานะจริงได้อย่างแม่นยำ
          </span>
        </div>
      )}

      {/* 2. Executive Scorecards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* กำไร/ขาดทุนสุทธิที่เกิดขึ้นจริง */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <span
              className={`p-1 rounded-md ${
                scorecard.totalRealizedPnlThb >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {scorecard.totalRealizedPnlThb >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
            </span>
            กำไรสุทธิที่รับรู้จริง (Realized)
          </span>
          <p
            className={`text-xl font-bold mt-2 ${
              scorecard.totalRealizedPnlThb >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {scorecard.totalRealizedPnlThb >= 0 ? '+' : ''}฿
            {scorecard.totalRealizedPnlThb.toLocaleString('th-TH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
            ผลตอบแทนเฉลี่ย:{' '}
            <span className={scorecard.totalRealizedYieldPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
              {scorecard.totalRealizedYieldPercent >= 0 ? '+' : ''}
              {scorecard.totalRealizedYieldPercent.toFixed(2)}%
            </span>
          </p>
        </div>

        {/* Win Rate % */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-indigo-100 text-indigo-700">
              <Target className="w-3.5 h-3.5" />
            </span>
            อัตราชนะ (Win Rate)
          </span>
          <p className="text-xl font-bold text-slate-900 mt-2">
            {scorecard.winRatePercent.toFixed(1)}%
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            ชนะ {scorecard.winningTrades} / แพ้ {scorecard.losingTrades} รายการ
          </p>
        </div>

        {/* Profit Factor */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-amber-100 text-amber-700">
              <AwardIcon className="w-3.5 h-3.5" />
            </span>
            Profit Factor
          </span>
          <p className="text-xl font-bold text-slate-900 mt-2">
            {scorecard.profitFactor >= 999 ? '∞' : scorecard.profitFactor.toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            กำไร ฿{Math.round(scorecard.grossProfitsThb).toLocaleString()} / ขาดทุน ฿{Math.round(scorecard.grossLossesThb).toLocaleString()}
          </p>
        </div>

        {/* ค่าธรรมเนียม & ภาษีจ่ายไป */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-amber-100 text-amber-700">
              <DollarSign className="w-3.5 h-3.5" />
            </span>
            ค่าคอมมิชชั่น & WHT (Fees)
          </span>
          <p className="text-xl font-bold text-amber-600 mt-2">
            ฿{(scorecard.totalFeesPaidThb + scorecard.totalWhtPaidThb).toLocaleString('th-TH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">ต้นทุนค่าธรรมเนียมทั้งหมด</p>
        </div>

        {/* หุ้นที่ยังถือครองอยู่ (Unrealized) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs col-span-2 lg:col-span-1">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-blue-100 text-blue-700">
              <Wallet className="w-3.5 h-3.5" />
            </span>
            หุ้นที่ยังถือ (Active Port)
          </span>
          <p className={`text-xl font-bold mt-2 ${scorecard.totalUnrealizedPnlThb >= 0 ? 'text-blue-600' : 'text-slate-800'}`}>
            {scorecard.totalUnrealizedPnlThb >= 0 ? '+' : ''}฿
            {scorecard.totalUnrealizedPnlThb.toLocaleString('th-TH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {scorecard.activePortHoldingsCount} สินทรัพย์ในพอร์ตปัจจุบัน
          </p>
        </div>
      </div>

      {/* 3. Filter Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* ค้นหา */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อหุ้น (เช่น SCGP, PTT, AAPL)..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          {/* ฟิลเตอร์โบรกเกอร์ */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">โบรกเกอร์:</span>
            <select
              value={brokerFilter}
              onChange={(e) => setBrokerFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="ALL">โบรกเกอร์ทั้งหมด</option>
              {availableBrokers.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* ฟิลเตอร์ปี */}
          {activeViewMode !== 'unrealized' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium hidden sm:inline">ปีที่ทำรายการ:</span>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="ALL">ทุกปี (All Time)</option>
                {availableYears.map((y) => (
                  <option key={y} value={String(y)}>
                    ปี {y}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* เรียงลำดับ */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">เรียงตาม:</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as any)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="pnl_desc">กำไรสูงสุด (฿ มาก ➔ น้อย)</option>
              <option value="pnl_asc">ขาดทุนสูงสุด (฿ น้อย ➔ มาก)</option>
              <option value="yield_desc">ผลตอบแทนสูงสุด (% มาก ➔ น้อย)</option>
              <option value="yield_asc">ผลตอบแทนต่ำสุด (% น้อย ➔ มาก)</option>
            </select>
          </div>

          {/* ปุ่มรีเซ็ต */}
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition flex items-center gap-1 cursor-pointer"
            title="ล้างตัวกรองทั้งหมด"
          >
            <RotateCcw className="w-3 h-3 text-slate-500" />
            <span className="hidden sm:inline">รีเซ็ต</span>
          </button>
        </div>
      </div>

      {/* 4. MAIN CONTENT AREA BASED ON VIEW MODE */}

      {/* MODE 1: REALIZED PERFORMANCE (TOP GAINERS / LOSERS & CLOSED TRADES) */}
      {activeViewMode === 'realized' && (
        <div className="space-y-6">
          {/* Top Gainers & Top Losers Side-by-Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Gainers Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                    <Trophy className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Top Gainers (หุ้นที่ทำกำไรสูงสุด)</h3>
                    <p className="text-[11px] text-slate-500">
                      {brokerFilter !== 'ALL' ? `เฉพาะโบรกเกอร์ ${brokerFilter}` : 'จัดอันดับจากทุกโบรกเกอร์'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {topGainers.length} ตัว
                </span>
              </div>

              {topGainers.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  ยังไม่มีประวัติการขายที่ได้กำไรตามเงื่อนไขที่เลือก
                </div>
              ) : (
                <div className="space-y-2.5">
                  {topGainers.map((item, idx) => (
                    <div
                      key={`${item.broker}__${item.symbol}`}
                      className="p-3 rounded-xl bg-slate-50/70 hover:bg-emerald-50/40 border border-slate-200/70 transition flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-sm">{item.symbol}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-medium">
                              {item.broker}
                            </span>
                            {item.isOpenHolding && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-blue-100 text-blue-700 font-medium" title="ยังมีหุ้นตัวนี้ค้างอยู่ในพอร์ต">
                                ยังถืออยู่
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            ขายแล้ว {item.totalUnitsSold.toLocaleString()} หน่วย ({item.tradeCount} ครั้ง)
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-bold text-emerald-600 font-mono text-sm block">
                          +฿{item.realizedPnlThb.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[11px] font-mono text-emerald-700 font-medium block">
                          +{item.realizedYieldPercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Losers Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
                    <TrendingDown className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Top Losers (หุ้นที่ขาดทุนสูงสุด)</h3>
                    <p className="text-[11px] text-slate-500">
                      {brokerFilter !== 'ALL' ? `เฉพาะโบรกเกอร์ ${brokerFilter}` : 'จัดอันดับจากทุกโบรกเกอร์'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  {topLosers.length} ตัว
                </span>
              </div>

              {topLosers.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  ไม่มีประวัติการขายที่ขาดทุนตามเงื่อนไขที่เลือก ยอดเยี่ยมมาก!
                </div>
              ) : (
                <div className="space-y-2.5">
                  {topLosers.map((item, idx) => (
                    <div
                      key={`${item.broker}__${item.symbol}`}
                      className="p-3 rounded-xl bg-slate-50/70 hover:bg-rose-50/40 border border-slate-200/70 transition flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-sm">{item.symbol}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-medium">
                              {item.broker}
                            </span>
                            {item.isOpenHolding && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-blue-100 text-blue-700 font-medium" title="ยังมีหุ้นตัวนี้ค้างอยู่ในพอร์ต">
                                ยังถืออยู่
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            ขายแล้ว {item.totalUnitsSold.toLocaleString()} หน่วย ({item.tradeCount} ครั้ง)
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-bold text-rose-600 font-mono text-sm block">
                          -฿{Math.abs(item.realizedPnlThb).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[11px] font-mono text-rose-700 font-medium block">
                          {item.realizedYieldPercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Detailed Closed Positions Ledger */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  ประวัติรายการขาย & กำไร-ขาดทุนที่ปิดสถานะแล้ว (Closed Trades Ledger)
                </h3>
              </div>
              <span className="text-xs text-slate-500">
                รวม {filteredClosedPositions.length} รายการขาย
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold">
                    <th className="py-3 px-3">วันที่ขาย</th>
                    <th className="py-3 px-3">สัญลักษณ์ / โบรกเกอร์</th>
                    <th className="py-3 px-3 text-right">จำนวนที่ขาย</th>
                    <th className="py-3 px-3 text-right">ราคาขาย / ต้นทุนเฉลี่ย</th>
                    <th className="py-3 px-3 text-right">ยอดรับสุทธิ (Proceeds)</th>
                    <th className="py-3 px-3 text-right">ต้นทุนที่ตัด (Cost)</th>
                    <th className="py-3 px-3 text-right">กำไร-ขาดทุน (Realized P&L)</th>
                    <th className="py-3 px-3 text-right">ผลตอบแทน (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400 font-sans">
                        กำลังประมวลผลการคำนวณกำไร-ขาดทุน...
                      </td>
                    </tr>
                  ) : paginatedPositions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400 font-sans">
                        ไม่พบประวัติการขายที่ปิดสถานะตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    paginatedPositions.map((pos) => {
                      const isProfit = pos.isProfit;
                      const currSym = getCurrencySymbol(pos.currency);
                      return (
                        <tr key={pos.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{pos.tradeDate}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-bold text-slate-900 font-sans">{pos.symbol}</span>
                            <span className="ml-1.5 px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[10px] font-sans border border-slate-200">
                              {pos.broker}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-700">
                            {pos.unitsSold.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="text-slate-800 block">
                              {currSym}{pos.sellPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-sans">
                              ทุน {currSym}{pos.avgBuyCostThb.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-700">
                            ฿{pos.netSellProceedsThb.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500">
                            ฿{pos.totalCostBasisThb.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
                            <span className={isProfit ? 'text-emerald-700' : 'text-rose-700'}>
                              {isProfit ? '+' : ''}฿
                              {pos.realizedPnlThb.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isProfit
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {isProfit ? '+' : ''}
                              {pos.realizedYieldPercent.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filteredClosedPositions.length > pageSize && (
              <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50">
                <span>
                  แสดง {startIndex + 1} - {Math.min(startIndex + pageSize, filteredClosedPositions.length)} จาก {filteredClosedPositions.length} รายการ
                </span>
                <div className="flex items-center gap-1 font-sans">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={safeCurrentPage <= 1}
                    className="p-1 rounded border border-slate-200 text-slate-600 disabled:opacity-30 transition cursor-pointer"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safeCurrentPage <= 1}
                    className="p-1 rounded border border-slate-200 text-slate-600 disabled:opacity-30 transition cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 font-semibold">
                    {safeCurrentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage >= totalPages}
                    className="p-1 rounded border border-slate-200 text-slate-600 disabled:opacity-30 transition cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safeCurrentPage >= totalPages}
                    className="p-1 rounded border border-slate-200 text-slate-600 disabled:opacity-30 transition cursor-pointer"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODE 2: BROKER COMPARISON & EVALUATION */}
      {activeViewMode === 'brokers' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {brokerPerformances.map((bp) => {
              const isProfit = bp.totalRealizedPnlThb >= 0;
              return (
                <div
                  key={bp.broker}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-emerald-600" />
                        <span className="font-bold text-slate-900 text-base">{bp.broker}</span>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          bp.winRatePercent >= 50
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        Win Rate: {bp.winRatePercent.toFixed(1)}%
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 py-3 border-b border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">กำไรสุทธิรับรู้จริง (Realized)</span>
                        <span
                          className={`text-lg font-bold font-mono block mt-0.5 ${
                            isProfit ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isProfit ? '+' : ''}฿
                          {bp.totalRealizedPnlThb.toLocaleString('th-TH', {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">ค่าธรรมเนียมรวมจ่ายไป</span>
                        <span className="text-lg font-bold text-amber-600 font-mono block mt-0.5">
                          ฿{(bp.totalFeesPaidThb + bp.totalWhtPaidThb).toLocaleString('th-TH', {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-3 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>รายการที่ปิดสถานะ:</span>
                        <span className="font-bold font-mono">
                          {bp.closedTradesCount} รายการ (ชนะ {bp.winningTradesCount} / แพ้ {bp.losingTradesCount})
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Profit Factor:</span>
                        <span className="font-bold font-mono">
                          {bp.profitFactor >= 999 ? '∞' : bp.profitFactor.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>หุ้นคงค้างในพอร์ต:</span>
                        <span className="font-bold font-mono">{bp.activeHoldingsCount} รายการ</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-1.5 text-[11px] bg-slate-50/70 p-3 rounded-xl">
                    {bp.topGainerSymbol && (
                      <div className="flex items-center justify-between text-emerald-800">
                        <span className="flex items-center gap-1 font-medium">
                          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                          ทำกำไรสูงสุด:
                        </span>
                        <span className="font-bold font-mono">
                          {bp.topGainerSymbol} (+฿{Math.round(bp.topGainerAmountThb || 0).toLocaleString()})
                        </span>
                      </div>
                    )}
                    {bp.topLoserSymbol && (
                      <div className="flex items-center justify-between text-rose-800">
                        <span className="flex items-center gap-1 font-medium">
                          <ArrowDownRight className="w-3.5 h-3.5 text-rose-600" />
                          ขาดทุนสูงสุด:
                        </span>
                        <span className="font-bold font-mono">
                          {bp.topLoserSymbol} (-฿{Math.abs(Math.round(bp.topLoserAmountThb || 0)).toLocaleString()})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODE 3: UNREALIZED (ACTIVE PORT HOLDINGS) */}
      {activeViewMode === 'unrealized' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-blue-600" />
                <span>หุ้นและสินทรัพย์ที่ยังถือครองอยู่ในพอร์ต (Active Holdings & Unrealized P&L)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ผลกำไร-ขาดทุนที่ยังไม่เกิดขึ้นจริง (Paper Gain/Loss) ตามราคาตลาดปัจจุบัน — แยกอิสระจาก Realized P&L
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {activePortHoldings.length} รายการ
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold">
                  <th className="py-3 px-3">สัญลักษณ์</th>
                  <th className="py-3 px-3">โบรกเกอร์</th>
                  <th className="py-3 px-3 text-right">จำนวนหน่วย</th>
                  <th className="py-3 px-3 text-right">ราคาเฉลี่ย / ตลาด</th>
                  <th className="py-3 px-3 text-right">ต้นทุนรวม (THB)</th>
                  <th className="py-3 px-3 text-right">มูลค่าปัจจุบัน (THB)</th>
                  <th className="py-3 px-3 text-right">กำไร-ขาดทุนทางบัญชี (Unrealized)</th>
                  <th className="py-3 px-3 text-right">Yield (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {activePortHoldings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-sans">
                      ไม่มีสินทรัพย์คงค้างในพอร์ตตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  activePortHoldings.map((h) => {
                    const isProfit = h.unrealizedPnlThb >= 0;
                    const currSym = getCurrencySymbol(h.currency);
                    return (
                      <tr key={h.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-900 font-sans">{h.symbol}</td>
                        <td className="py-2.5 px-3 text-slate-600 font-sans">{h.broker || 'BLS'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-700">
                          {Number(h.volume).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="text-slate-800 block">
                            {currSym}{Number(h.present_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-sans">
                            ทุน {currSym}{Number(h.initial_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          ฿{h.costThb.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-800 font-medium">
                          ฿{h.presentThb.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
                          <span className={isProfit ? 'text-emerald-700' : 'text-rose-700'}>
                            {isProfit ? '+' : ''}฿
                            {h.unrealizedPnlThb.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isProfit
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {isProfit ? '+' : ''}
                            {h.yieldPercent.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AwardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}
