'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Holding {
  id: string;
  symbol: string;
  volume: number;
  currency: string;
  initial_cost: number;
  present_price: number | null;
  total_present_price_thb?: number;
  yield_percent?: number;
  updated_at?: string;
}

export default function PortfolioTable() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [updatingRowId, setUpdatingRowId] = useState<string | null>(null);

  // ดึงข้อมูลพอร์ตล่าสุดจาก Supabase
  const fetchHoldings = async () => {
    try {
      const { data, error } = await supabase
        .from('portfolio_holdings')
        .select('*')
        .order('symbol', { ascending: true });

      if (error) throw error;
      if (data) setHoldings(data);
    } catch (err: any) {
      console.error('Fetch error:', err.message);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchHoldings();
  }, []);

  // อัปเดตราคาเฉพาะตัว (Row-level)
  const handleUpdateSingle = async (id: string) => {
    try {
      setUpdatingRowId(id);
      const res = await fetch(`/api/update-prices?id=${id}`);
      if (res.ok) {
        await fetchHoldings();
      }
    } catch (err) {
      console.error('Single update failed:', err);
    } finally {
      setUpdatingRowId(null);
    }
  };

  // อัปเดตราคาทั้งหมด (Bulk Update)
  const handleUpdateAll = async () => {
    try {
      setIsBulkUpdating(true);
      const res = await fetch('/api/update-prices');
      if (res.ok) {
        await fetchHoldings();
      }
    } catch (err) {
      console.error('Bulk update failed:', err);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  if (loadingData) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 text-center text-gray-500">
        กำลังโหลดข้อมูลพอร์ตสินทรัพย์...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Asset on Hand</h2>
          <p className="text-xs text-gray-500 mt-0.5">พอร์ตหุ้น คริปโต และสินทรัพย์ลงทุน</p>
        </div>

        <button
          onClick={handleUpdateAll}
          disabled={isBulkUpdating || updatingRowId !== null}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          <span className={`text-sm ${isBulkUpdating ? 'animate-spin' : ''}`}>🔄</span>
          {isBulkUpdating ? 'กำลังซิงค์ราคาตลาด...' : 'อัปเดตราคาตลาดทั้งหมด'}
        </button>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80 text-gray-500 text-xs uppercase font-medium">
                <th className="py-3 px-4">สินทรัพย์</th>
                <th className="py-3 px-4 text-right">จำนวน</th>
                <th className="py-3 px-4 text-right">ต้นทุนเฉลี่ย</th>
                <th className="py-3 px-4 text-right">ราคาตลาดล่าสุด (THB)</th>
                <th className="py-3 px-4 text-right">ผลตอบแทน (%)</th>
                <th className="py-3 px-4 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {holdings.map((item) => {
              const isRowLoading = updatingRowId === item.id;
              return (
                <tr key={item.id} className="hover:bg-blue-50/30 transition">
                    <td className="py-3 px-4 font-semibold text-gray-800">{item.symbol}</td>
                    {/* volume: ถ้าไม่มีค่าให้ fallback เป็น 0 */}
                    <td className="py-3 px-4 text-right text-gray-600">
                    {(item.volume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>

                    {/* Initial Cost */}
                    <td className="py-3 px-4 text-right text-gray-600">
                    {item.initial_cost != null
                        ? `${item.currency === "USD" ? "$" : "฿"}${Number(item.initial_cost).toLocaleString(
                            undefined,
                            {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            }
                        )}`
                        : "-"}
                    </td>

                    {/* Present Price */}
                    <td className="py-3 px-4 text-right font-semibold text-gray-600">
                    {item.present_price != null
                        ? `${item.currency === "USD" ? "$" : "฿"}${Number(item.present_price).toLocaleString(
                            undefined,
                            {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            }
                        )}`
                        : "-"}
                    </td>
                    {/* Yield % */}
                    <td
                        className={`py-3 px-4 text-right font-medium ${
                            (item.yield_percent ?? 0) >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                        >
                        {(item.yield_percent ?? 0).toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                        })}
                        %
                    </td>
                    <td className="py-3 px-4 text-center">
                        <button
                        onClick={() => handleUpdateSingle(item.id)}
                        disabled={isRowLoading || isBulkUpdating}
                        title="กดเพื่อดึงราคาเฉพาะตัวนี้"
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition disabled:opacity-30"
                        >
                        <span className={`inline-block text-xs ${isRowLoading ? 'animate-spin text-blue-600' : ''}`}>
                            🔄
                        </span>
                        </button>
                    </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}