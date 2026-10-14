'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Inbox,
  CheckCircle2,
  AlertCircle,
  ArrowRightLeft,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  Calendar,
  Clock,
  Trash2,
  Check,
  RotateCcw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Tag,
  Eye,
  Send,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { AccountOption } from './ExpenseIncomeSection';

export interface InboxSlipItem {
  id: string;
  source: string;
  raw_text?: string;
  amount: number;
  transaction_date: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  category: string;
  matched_account_id?: string | null;
  matched_to_account_id?: string | null;
  sender_bank?: string | null;
  sender_account_masked?: string | null;
  receiver_bank?: string | null;
  receiver_account_masked?: string | null;
  receiver_name?: string | null;
  reference_number?: string | null;
  memo?: string | null;
  confidence_score?: number;
  status: 'pending' | 'approved' | 'dismissed';
  created_at?: string;
  is_historical?: boolean;
}

interface SlipInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountOption[];
  onTransactionsUpdated: () => void;
  expenseCategories: string[];
  incomeCategories: string[];
  transferCategories: string[];
  onOpenRegexTuner?: () => void;
}

export default function SlipInboxModal({
  isOpen,
  onClose,
  accounts,
  onTransactionsUpdated,
  expenseCategories,
  incomeCategories,
  transferCategories,
  onOpenRegexTuner,
}: SlipInboxModalProps) {
  const [items, setItems] = useState<InboxSlipItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);
  const [expandedRawId, setExpandedRawId] = useState<string | null>(null);
  const [tableReady, setTableReady] = useState(true);

  // Fetch pending inbox slips
  const fetchInbox = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/slip-inbox');
      const json = await res.json();
      if (res.ok) {
        setItems(json.data || []);
        if (json.table_ready !== undefined) {
          setTableReady(json.table_ready);
        }
      }
    } catch (err) {
      console.error('Failed to fetch slip inbox:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchInbox();
    }
  }, [isOpen, fetchInbox]);

  if (!isOpen) return null;

  // Handle field update in local state
  const handleUpdateItem = (id: string, field: keyof InboxSlipItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // Approve single slip -> Move to expense_income_transactions
  const handleApprove = async (item: InboxSlipItem) => {
    if (!item.amount || item.amount <= 0) {
      alert('กรุณากรอกยอดเงินที่ถูกต้อง');
      return;
    }

    if (item.type === 'TRANSFER') {
      if (!item.matched_account_id) {
        alert('กรุณาเลือกบัญชีต้นทางสำหรับการโอนเงิน');
        return;
      }
      if (!item.matched_to_account_id) {
        alert('กรุณาเลือกบัญชีปลายทางสำหรับการโอนเงิน');
        return;
      }
      if (item.matched_account_id === item.matched_to_account_id) {
        alert('บัญชีต้นทางและปลายทางต้องไม่ใช่บัญชีเดียวกัน');
        return;
      }
    }

    try {
      setIsApprovingId(item.id);
      const res = await fetch('/api/slip-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          id: item.id.startsWith('ephemeral_') ? null : item.id,
          amount: item.amount,
          transaction_date: item.transaction_date,
          type: item.type,
          category: item.category,
          account_id: item.matched_account_id,
          to_account_id: item.matched_to_account_id,
          note: item.memo,
          is_historical: item.is_historical || false,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || 'Failed to approve');

      // Remove from list
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      onTransactionsUpdated();
    } catch (err: any) {
      alert(`ไม่สามารถบันทึกรายการได้: ${err.message}`);
    } finally {
      setIsApprovingId(null);
    }
  };

  // Dismiss / Delete an item
  const handleDismiss = async (id: string) => {
    try {
      if (!id.startsWith('ephemeral_')) {
        await fetch(`/api/slip-inbox?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err: any) {
      alert(`ลบรายการไม่สำเร็จ: ${err.message}`);
    }
  };

  // Test sample injection
  const handleAddSample = async () => {
    try {
      setIsLoading(true);
      const sampleText = `โอนเงินสำเร็จ
14 ต.ค. 69 09:15 น.
นาย กิตติพงษ์
ธ.กสิกรไทย
xxx-x-x1234-x
ไปยัง
ร้าน อเมซอน คาเฟ่
พร้อมเพย์
081-xxx-5678
จำนวนเงิน
185.00 บาท
รหัสอ้างอิง: 20261014KB987654
บันทึกช่วยจำ: กาแฟสดและขนมปัง`;

      const res = await fetch('/api/slip-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sampleText, source: 'shortcut_test_sim' }),
      });
      if (res.ok) {
        await fetchInbox();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const getCategoryList = (type: string) => {
    if (type === 'TRANSFER') return transferCategories;
    if (type === 'INCOME') return incomeCategories;
    return expenseCategories;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-600">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">
                  กล่องสลิปรอตรวจ (Slip Staging Inbox)
                </h2>
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-violet-100 text-violet-700">
                  {items.length} รายการ
                </span>
              </div>
              <p className="text-xs text-slate-500">
                สลิปที่ส่งมาจาก iPhone Shortcut หรือ Mobile App จะพักอยู่ที่นี่ก่อน เพื่อให้คุณตรวจทานก่อนลงบัญชีจริง
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchInbox}
              disabled={isLoading}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notice if table isn't migrated */}
        {!tableReady && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                ยังไม่ได้สร้างตาราง <code>slip_inbox</code> ใน Supabase (ขณะนี้ระบบทำงานในโหมด Ephemeral Staging ชั่วคราว)
              </span>
            </div>
            <span className="text-[11px] underline font-semibold cursor-pointer">
              ดูไฟล์ 20261014_create_slip_inbox.sql
            </span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {items.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Inbox className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-700">ไม่มีสลิปที่รอการตรวจสอบ</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  เมื่อคุณใช้คำสั่งลัด (Shortcut) บน iPhone สแกนสลิปโอนเงิน ข้อมูลจะปรากฏที่นี่เพื่อให้คุณกดยืนยันก่อนบันทึก
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleAddSample}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                  <span>ทดลองใส่สลิปตัวอย่างจำลองจาก iPhone</span>
                </button>

                {onOpenRegexTuner && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenRegexTuner();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5 text-slate-500" />
                    <span>เปิด Regex Tuner</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            items.map((item) => {
              const isTransfer = item.type === 'TRANSFER';
              const categories = getCategoryList(item.type);
              const isApproving = isApprovingId === item.id;
              const isRawExpanded = expandedRawId === item.id;

              return (
                <div
                  key={item.id}
                  className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs hover:border-slate-300 transition space-y-3"
                >
                  {/* Top Bar: Amount, Type Badge, Bank & Date */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">แหล่งที่มา:</span>
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-slate-100 text-slate-600 uppercase">
                        {item.source}
                      </span>
                      {item.sender_bank && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {item.sender_bank}
                        </span>
                      )}
                      {item.reference_number && (
                        <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                          Ref: {item.reference_number}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xs text-slate-400">฿</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.amount || ''}
                          onChange={(e) =>
                            handleUpdateItem(item.id, 'amount', parseFloat(e.target.value) || 0)
                          }
                          className="w-28 text-base font-bold text-slate-900 border border-slate-200 rounded-lg px-2 py-0.5 text-right focus:ring-2 focus:ring-violet-500 outline-hidden"
                        />
                      </div>

                      <select
                        value={item.type}
                        onChange={(e) =>
                          handleUpdateItem(item.id, 'type', e.target.value as any)
                        }
                        className={`text-xs font-semibold px-2 py-1 rounded-lg border outline-hidden cursor-pointer ${
                          item.type === 'TRANSFER'
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                            : item.type === 'INCOME'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-rose-50 border-rose-200 text-rose-700'
                        }`}
                      >
                        <option value="EXPENSE">รายจ่าย</option>
                        <option value="TRANSFER">โอนเงิน / ชำระบัตร</option>
                        <option value="INCOME">รายรับ</option>
                      </select>
                    </div>
                  </div>

                  {/* Form Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {/* Date & Time */}
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium block mb-1">
                        วันที่ทำรายการ:
                      </label>
                      <input
                        type="datetime-local"
                        value={
                          item.transaction_date
                            ? item.transaction_date.slice(0, 16)
                            : new Date().toISOString().slice(0, 16)
                        }
                        onChange={(e) =>
                          handleUpdateItem(item.id, 'transaction_date', e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 focus:ring-2 focus:ring-violet-500 outline-hidden"
                      />
                    </div>

                    {/* Source Account */}
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium block mb-1">
                        บัญชีต้นทาง (จ่ายออก):
                      </label>
                      <select
                        value={item.matched_account_id || ''}
                        onChange={(e) =>
                          handleUpdateItem(item.id, 'matched_account_id', e.target.value || null)
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 focus:ring-2 focus:ring-violet-500 outline-hidden bg-white"
                      >
                        <option value="">-- เลือกบัญชี --</option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.bank_name ? `[${acc.bank_name}] ` : ''}
                            {acc.account_name} ({acc.account_type})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Destination Account (Only for TRANSFER) or Category */}
                    {isTransfer ? (
                      <div>
                        <label className="text-[11px] text-slate-500 font-medium block mb-1">
                          บัญชีปลายทาง (รับเงิน/ลดหนี้):
                        </label>
                        <select
                          value={item.matched_to_account_id || ''}
                          onChange={(e) =>
                            handleUpdateItem(item.id, 'matched_to_account_id', e.target.value || null)
                          }
                          className="w-full px-2.5 py-1.5 border border-indigo-200 rounded-lg text-indigo-900 bg-indigo-50/50 focus:ring-2 focus:ring-indigo-500 outline-hidden"
                        >
                          <option value="">-- เลือกบัญชีปลายทาง --</option>
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.bank_name ? `[${acc.bank_name}] ` : ''}
                              {acc.account_name} {acc.is_liability ? '(บัตรเครดิต/หนี้)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[11px] text-slate-500 font-medium block mb-1">
                          หมวดหมู่:
                        </label>
                        <select
                          value={item.category || 'อื่นๆ'}
                          onChange={(e) =>
                            handleUpdateItem(item.id, 'category', e.target.value)
                          }
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 focus:ring-2 focus:ring-violet-500 outline-hidden bg-white"
                        >
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Memo Note Input */}
                  <div>
                    <label className="text-[11px] text-slate-500 font-medium block mb-1">
                      บันทึกช่วยจำ (Memo):
                    </label>
                    <input
                      type="text"
                      value={item.memo || ''}
                      onChange={(e) => handleUpdateItem(item.id, 'memo', e.target.value)}
                      placeholder="เช่น ข้าวมันไก่, ค่าน้ำมัน, ชำระบัตร..."
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-violet-500 outline-hidden"
                    />
                  </div>

                  {/* Raw Text Accordion Toggle */}
                  {item.raw_text && (
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRawId(isRawExpanded ? null : item.id)
                        }
                        className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>{isRawExpanded ? 'ซ่อนข้อความ OCR จาก iPhone' : 'ดูข้อความ OCR จาก iPhone'}</span>
                      </button>
                      {isRawExpanded && (
                        <pre className="mt-1.5 p-2.5 font-mono text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg overflow-x-auto max-h-36">
                          {item.raw_text}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Bottom Actions: Approve & Dismiss */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.is_historical || false}
                          onChange={(e) =>
                            handleUpdateItem(item.id, 'is_historical', e.target.checked)
                          }
                          className="rounded-sm border-slate-300 text-violet-600 focus:ring-violet-500"
                        />
                        <span>เป็นสลิปย้อนหลัง (ไม่ปรับยอดเงินในบัญชี)</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDismiss(item.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>ละเว้น</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApprove(item)}
                        disabled={isApproving}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-xl transition shadow-xs cursor-pointer"
                      >
                        {isApproving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>ยืนยันบันทึกลงรายจ่าย</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
