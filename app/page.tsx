'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Wallet, TrendingUp, PiggyBank, PlusCircle, CalendarClock } from 'lucide-react';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'holdings' | 'cash_pvd' | 'expenses'>('overview');
  
  // States ข้อมูล
  const [holdings, setHoldings] = useState<any[]>([]);
  const [cashPvd, setCashPvd] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  
  // State สำหรับฟอร์มบันทึกค่าใช้จ่าย
  const [formType, setFormType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [category, setCategory] = useState('อาหาร');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // 1. ดึงข้อมูลพอร์ตลงทุน
    const { data: hData } = await supabase.from('portfolio_holdings').select('*');
    if (hData) setHoldings(hData);

    // 2. ดึงเงินฝาก + PVD
    const { data: cData } = await supabase.from('cash_and_pvd_assets').select('*');
    if (cData) setCashPvd(cData);

    // 3. ดึงรายการรับ-จ่ายล่าสุด 15 รายการ
    const { data: tData } = await supabase
      .from('expense_income_transactions')
      .select('*')
      .order('transaction_date', { ascending: false })
      .limit(15);
    if (tData) setTransactions(tData);
  };

  // คำนวณภาพรวม Net Worth
  const totalHoldingsCostTHB = holdings.reduce((sum, item) => sum + Number(item.total_cost_thb || 0), 0);
  const totalHoldingsValueTHB = holdings.reduce((sum, item) => sum + Number(item.total_present_price_thb || 0), 0);
  const holdingsPL = totalHoldingsValueTHB - totalHoldingsCostTHB;
  const holdingsYield = totalHoldingsCostTHB > 0 ? (holdingsPL / totalHoldingsCostTHB) * 100 : 0;

  const totalLiquidCash = cashPvd.filter(item => item.is_liquid).reduce((sum, item) => sum + Number(item.current_balance || 0), 0);
  const totalPVD = cashPvd.filter(item => item.account_type === 'PVD').reduce((sum, item) => sum + Number(item.current_balance || 0), 0);
  
  const totalNetWorth = totalHoldingsValueTHB + totalLiquidCash + totalPVD;

  // บันทึกรายรับ-รายจ่าย
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;

    await supabase.from('expense_income_transactions').insert([
      {
        type: formType,
        category,
        amount: parseFloat(amount),
        note
      }
    ]);

    setAmount('');
    setNote('');
    fetchData();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      {/* Header */}
      <header className="bg-emerald-950 text-white border-b border-emerald-900 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Wallet className="h-6 w-6 text-emerald-400" />
            <h1 className="text-xl font-bold tracking-tight">Personal Wealth Hub</h1>
          </div>
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
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-6 space-y-6">
        {/* Top Cards: Net Worth & Financial Health */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-emerald-600" /> รวมความมั่งคั่งสุทธิ (Net Worth)
            </span>
            <p className="text-2xl font-bold mt-2 text-slate-900">
              ฿{totalNetWorth.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-blue-600" /> พอร์ตลงทุน (Unrealized P&L)
            </span>
            <p className="text-2xl font-bold mt-2 text-slate-900">
              ฿{totalHoldingsValueTHB.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
            </p>
            <p className={`text-xs font-semibold mt-1 ${holdingsPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {holdingsPL >= 0 ? '+' : ''}฿{holdingsPL.toLocaleString('th-TH', { maximumFractionDigits: 0 })} ({holdingsYield.toFixed(2)}%)
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <PiggyBank className="h-4 w-4 text-amber-600" /> สภาพคล่องพร้อมใช้ (Liquid Cash)
            </span>
            <p className="text-2xl font-bold mt-2 text-slate-900">
              ฿{totalLiquidCash.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-xs text-slate-400">เงินฝากออมทรัพย์ทุกธนาคาร</span>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-purple-600" /> กองทุนสำรองเลี้ยงชีพ (PVD)
            </span>
            <p className="text-2xl font-bold mt-2 text-slate-900">
              ฿{totalPVD.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-xs text-slate-400">สินทรัพย์เพื่อการเกษียณ</span>
          </div>
        </section>

        {/* Tab 1: Overview & Quick Expense Form */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ฝั่งซ้าย: ฟอร์มบันทึกรับ-จ่าย */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <h2 className="text-base font-bold flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-emerald-600" /> บันทึกรายรับ-รายจ่าย
              </h2>
              <form onSubmit={handleSaveTransaction} className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setFormType('EXPENSE')}
                    className={`py-1.5 rounded-md font-medium text-xs transition-all ${
                      formType === 'EXPENSE' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    รายจ่าย
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('INCOME')}
                    className={`py-1.5 rounded-md font-medium text-xs transition-all ${
                      formType === 'INCOME' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    รายรับ
                  </button>
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-medium">หมวดหมู่</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="เช่น อาหาร, เดินทาง, ช้อปปิ้ง, เงินเดือน"
                    className="w-full mt-1 border border-slate-300 rounded-lg p-2 text-sm focus:outline-emerald-600"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-medium">จำนวนเงิน (บาท)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full mt-1 border border-slate-300 rounded-lg p-2 text-sm focus:outline-emerald-600 font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-medium">บันทึกช่วยจำ (Note)</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                    className="w-full mt-1 border border-slate-300 rounded-lg p-2 text-sm focus:outline-emerald-600"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-2.5 rounded-lg transition-all text-sm mt-2 shadow-sm"
                >
                  บันทึกรายการ
                </button>
              </form>
            </div>

            {/* ฝั่งขวา: รายการธุรกรรมรับ-จ่ายล่าสุด */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-base font-bold mb-4">รายการบันทึกล่าสุด</h2>
              <div className="divide-y divide-slate-100 overflow-y-auto max-h-[360px]">
                {transactions.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">ยังไม่มีรายการบันทึก</p>
                ) : (
                  transactions.map((tx) => (
                    <div key={tx.id} className="py-2.5 flex justify-between items-center text-sm">
                      <div>
                        <p className="font-semibold text-slate-800">{tx.category}</p>
                        <p className="text-xs text-slate-400">{tx.transaction_date} {tx.note && `• ${tx.note}`}</p>
                      </div>
                      <span className={`font-bold ${tx.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {tx.type === 'INCOME' ? '+' : '-'}฿{Number(tx.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Asset on Hand */}
        {activeTab === 'holdings' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h2 className="text-sm font-semibold">Asset on Hand ({holdings.length} รายการ)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Stock / List</th>
                    <th className="p-3 text-right">Volume</th>
                    <th className="p-3 text-right">Initial Cost</th>
                    <th className="p-3 text-right">Total THB (Cost)</th>
                    <th className="p-3 text-right">Present Price</th>
                    <th className="p-3 text-right">Present THB</th>
                    <th className="p-3 text-right">Yield (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holdings.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-semibold text-slate-800">{item.symbol}</td>
                      <td className="p-3 text-right font-mono">{Number(item.volume).toLocaleString()}</td>
                      <td className="p-3 text-right font-mono">{Number(item.initial_cost).toLocaleString()}</td>
                      <td className="p-3 text-right font-mono text-slate-600">
                        ฿{Number(item.total_cost_thb).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono font-medium text-blue-700">
                        {Number(item.present_price).toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold text-slate-900">
                        ฿{Number(item.total_present_price_thb).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`p-3 text-right font-mono font-bold ${Number(item.yield_percent) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {Number(item.yield_percent) >= 0 ? '+' : ''}{Number(item.yield_percent).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: เงินฝาก & PVD */}
        {activeTab === 'cash_pvd' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cashPvd.map((acc) => (
              <div key={acc.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">{acc.account_name}</h3>
                    <p className="text-xs text-slate-400">{acc.bank_name || acc.account_type}</p>
                  </div>
                  {acc.interest_rate > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-medium">
                      ดอกเบี้ย {acc.interest_rate}%
                    </span>
                  )}
                </div>
                <p className="text-xl font-bold text-slate-900">
                  ฿{Number(acc.current_balance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </p>
                {acc.account_type === 'PVD' && (
                  <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex justify-between">
                    <span>เงินสะสมเรา: ฿{Number(acc.pvd_employee_contrib).toLocaleString()}</span>
                    <span>สมทบจากบริษัท: ฿{Number(acc.pvd_employer_contrib).toLocaleString()}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}