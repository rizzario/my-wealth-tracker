'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ArrowUpDown, ArrowUp, ArrowDown, Pencil, Check, X, RotateCw, Loader2 } from 'lucide-react';
import { getCurrencySymbol } from '@/lib/currency';

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

type SortField = 'symbol' | 'volume' | 'initial_cost' | 'present_price' | 'yield_percent';
type SortDirection = 'asc' | 'desc';

interface PortfolioTableProps {
  onHoldingsUpdated?: () => void;
}

export default function PortfolioTable({ onHoldingsUpdated }: PortfolioTableProps) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [updatingRowId, setUpdatingRowId] = useState<string | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('symbol');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Manual price editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPriceInput, setEditPriceInput] = useState<string>('');
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  const supabase = createClient();

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

  // อัปเดตราคาเฉพาะตัว (Row-level ผ่าน API)
  const handleUpdateSingle = async (id: string) => {
    try {
      setUpdatingRowId(id);
      const res = await fetch(`/api/update-prices?id=${id}`);
      if (res.ok) {
        await fetchHoldings();
        onHoldingsUpdated?.();
      }
    } catch (err) {
      console.error('Single update failed:', err);
    } finally {
      setUpdatingRowId(null);
    }
  };

  // อัปเดตราคาทั้งหมด (Bulk Update ผ่าน API)
  const handleUpdateAll = async () => {
    try {
      setIsBulkUpdating(true);
      const res = await fetch('/api/update-prices');
      if (res.ok) {
        await fetchHoldings();
        onHoldingsUpdated?.();
      }
    } catch (err) {
      console.error('Bulk update failed:', err);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // จัดการการเรียงลำดับ (Sorting)
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // เริ่มต้น: symbol เป็น asc (A-Z), ส่วนตัวเลขเป็น desc (มากไปน้อย)
      setSortDirection(field === 'symbol' ? 'asc' : 'desc');
    }
  };

  const sortedHoldings = useMemo(() => {
    return [...holdings].sort((a, b) => {
      if (sortField === 'symbol') {
        const symA = (a.symbol || '').toUpperCase();
        const symB = (b.symbol || '').toUpperCase();
        const cmp = symA.localeCompare(symB);
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      const rawA = a[sortField];
      const rawB = b[sortField];

      const isANull = rawA == null;
      const isBNull = rawB == null;
      if (isANull && isBNull) return 0;
      if (isANull) return 1;
      if (isBNull) return -1;

      const numA = Number(rawA);
      const numB = Number(rawB);

      return sortDirection === 'asc' ? numA - numB : numB - numA;
    });
  }, [holdings, sortField, sortDirection]);

  // เริ่มแก้ไขราคา
  const startEditing = (item: Holding) => {
    setEditingId(item.id);
    setEditPriceInput(item.present_price != null ? String(item.present_price) : '');
  };

  // ยกเลิกการแก้ไขราคา
  const cancelEditing = () => {
    setEditingId(null);
    setEditPriceInput('');
  };

  // บันทึกราคาตลาดด้วยตนเองไปยัง Supabase
  const handleSavePrice = async (id: string) => {
    const trimmed = editPriceInput.trim();
    if (trimmed === '') {
      alert('กรุณาระบุราคาตลาด');
      return;
    }

    const newPrice = parseFloat(trimmed);
    if (isNaN(newPrice) || newPrice < 0) {
      alert('กรุณากรอกตัวเลขราคาที่ถูกต้อง (มากกว่าหรือเท่ากับ 0)');
      return;
    }

    try {
      setSavingRowId(id);
      const { error } = await supabase
        .from('portfolio_holdings')
        .update({
          present_price: newPrice,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setEditingId(null);
      setEditPriceInput('');
      await fetchHoldings();
      onHoldingsUpdated?.();
    } catch (err: any) {
      console.error('Save price error:', err);
      alert(`ไม่สามารถบันทึกราคาได้: ${err?.message || 'เกิดข้อผิดพลาด'}`);
    } finally {
      setSavingRowId(null);
    }
  };

  const renderSortHeader = (label: string, field: SortField, align: 'left' | 'right' | 'center' = 'left') => {
    const isActive = sortField === field;
    return (
      <th
        key={field}
        className={`py-3 px-4 select-none cursor-pointer transition hover:bg-gray-100/80 ${
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
        }`}
        onClick={() => handleSort(field)}
        title={`คลิกเพื่อเรียงลำดับตาม ${label}`}
      >
        <div
          className={`inline-flex items-center gap-1.5 font-semibold text-xs tracking-wider uppercase ${
            align === 'right' ? 'flex-row-reverse' : ''
          }`}
        >
          <span className={isActive ? 'text-blue-600 font-bold' : 'text-gray-500'}>{label}</span>
          <span className={`transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400 opacity-40'}`}>
            {isActive ? (
              sortDirection === 'asc' ? (
                <ArrowUp className="w-3.5 h-3.5" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5" />
              )
            ) : (
              <ArrowUpDown className="w-3 h-3" />
            )}
          </span>
        </div>
      </th>
    );
  };

  if (loadingData) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 text-center text-gray-500 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        <span>กำลังโหลดข้อมูลพอร์ตสินทรัพย์...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-gray-50/50">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Asset on Hand</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            พอร์ตหุ้น คริปโต และสินทรัพย์ลงทุน • คลิกหัวตารางเพื่อเรียงข้อมูล หรือคลิกที่ราคาเพื่อแก้ไข
          </p>
        </div>

        <button
          onClick={handleUpdateAll}
          disabled={isBulkUpdating || updatingRowId !== null || savingRowId !== null}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer self-start sm:self-auto"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isBulkUpdating ? 'animate-spin' : ''}`} />
          {isBulkUpdating ? 'กำลังซิงค์ราคาตลาด...' : 'อัปเดตราคาตลาดทั้งหมด'}
        </button>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80 text-gray-500 text-xs uppercase font-medium">
              {renderSortHeader('สินทรัพย์', 'symbol', 'left')}
              {renderSortHeader('จำนวน', 'volume', 'right')}
              {renderSortHeader('ต้นทุนเฉลี่ย', 'initial_cost', 'right')}
              {renderSortHeader('ราคาตลาดล่าสุด', 'present_price', 'right')}
              {renderSortHeader('ผลตอบแทน (%)', 'yield_percent', 'right')}
              <th className="py-3 px-4 text-center text-xs uppercase font-semibold text-gray-500">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedHoldings.map((item) => {
              const isRowLoading = updatingRowId === item.id;
              const isSavingThisRow = savingRowId === item.id;
              const isEditing = editingId === item.id;
              const currencyPrefix = getCurrencySymbol(item.currency);

              return (
                <tr key={item.id} className="hover:bg-blue-50/30 transition">
                  {/* Symbol */}
                  <td className="py-3 px-4 font-semibold text-gray-800">{item.symbol}</td>

                  {/* Volume: ถ้าไม่มีค่าให้ fallback เป็น 0 */}
                  <td className="py-3 px-4 text-right text-gray-600">
                    {(item.volume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </td>

                  {/* Initial Cost */}
                  <td className="py-3 px-4 text-right text-gray-600">
                    {item.initial_cost != null
                      ? `${currencyPrefix}${Number(item.initial_cost).toLocaleString(
                          undefined,
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }
                        )}`
                      : '-'}
                  </td>

                  {/* Present Price (Editable) */}
                  <td className="py-3 px-4 text-right font-semibold text-gray-600">
                    {isEditing ? (
                      <div
                        className="inline-flex items-center justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="relative flex items-center">
                          <span className="text-xs text-gray-400 font-semibold mr-1">
                            {currencyPrefix}
                          </span>
                          <input
                            type="number"
                            step="any"
                            autoFocus
                            onFocus={(e) => e.target.select()}
                            value={editPriceInput}
                            onChange={(e) => setEditPriceInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSavePrice(item.id);
                              if (e.key === 'Escape') cancelEditing();
                            }}
                            disabled={isSavingThisRow}
                            placeholder="0.00"
                            className="w-24 px-2 py-1 text-right text-xs font-semibold border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-inner"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSavePrice(item.id)}
                          disabled={isSavingThisRow}
                          title="บันทึกราคา (Enter)"
                          className="p-1.5 text-white bg-emerald-600 hover:bg-emerald-700 rounded transition shadow-xs disabled:opacity-50 cursor-pointer"
                        >
                          {isSavingThisRow ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          disabled={isSavingThisRow}
                          title="ยกเลิก (Esc)"
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditing(item)}
                        title="คลิกเพื่อแก้ไขราคาตลาดด้วยตนเอง"
                        className="inline-flex items-center justify-end gap-1.5 font-semibold text-gray-700 hover:text-blue-600 cursor-pointer group py-0.5 px-1.5 -mr-1.5 rounded hover:bg-blue-50/60 transition"
                      >
                        <span>
                          {item.present_price != null
                            ? `${currencyPrefix}${Number(item.present_price).toLocaleString(
                                undefined,
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }
                              )}`
                            : '-'}
                        </span>
                        <Pencil className="w-3 h-3 text-gray-300 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition" />
                      </button>
                    )}
                  </td>

                  {/* Yield % */}
                  <td
                    className={`py-3 px-4 text-right font-medium ${
                      (item.yield_percent ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {(item.yield_percent ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                    %
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-center">
                    <div className="inline-flex items-center justify-center gap-1">
                      {/* Manual Edit Button */}
                      <button
                        type="button"
                        onClick={() => (isEditing ? cancelEditing() : startEditing(item))}
                        disabled={isRowLoading || isBulkUpdating || isSavingThisRow}
                        title={isEditing ? 'ยกเลิกการแก้ไข' : 'แก้ไขราคาปัจจุบันด้วยตนเอง'}
                        className={`p-1.5 rounded-md transition disabled:opacity-30 cursor-pointer ${
                          isEditing
                            ? 'text-rose-600 bg-rose-50 hover:bg-rose-100'
                            : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      {/* Sync Single Price from API */}
                      <button
                        type="button"
                        onClick={() => handleUpdateSingle(item.id)}
                        disabled={isRowLoading || isBulkUpdating || isSavingThisRow}
                        title="กดเพื่อดึงราคาล่าสุดจากตลาด (API)"
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition disabled:opacity-30 cursor-pointer"
                      >
                        <RotateCw
                          className={`w-3.5 h-3.5 ${isRowLoading ? 'animate-spin text-blue-600' : ''}`}
                        />
                      </button>
                    </div>
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
