'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  X,
  UploadCloud,
  Sparkles,
  Camera,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Clock,
  ArrowRightLeft,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  History,
  Info,
  RotateCcw,
} from 'lucide-react';
import { AccountOption } from './ExpenseIncomeSection';

interface SlipScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountOption[];
  onTransactionSaved: () => void;
  expenseCategories: string[];
  incomeCategories: string[];
  transferCategories: string[];
}

interface ParsedSlipData {
  amount: number;
  transaction_date: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  category: string;
  sender_bank?: string;
  sender_account_masked?: string;
  sender_name?: string;
  receiver_bank?: string;
  receiver_account_masked?: string;
  receiver_name?: string;
  memo?: string;
  reference_number?: string;
  confidence_score?: number;
  matched_account_id?: string | null;
  matched_to_account_id?: string | null;
  is_historical_suggested?: boolean;
}

export default function SlipScannerModal({
  isOpen,
  onClose,
  accounts,
  onTransactionSaved,
  expenseCategories,
  incomeCategories,
  transferCategories,
}: SlipScannerModalProps) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'scanning' | 'review'>('upload');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form review fields
  const [parsedData, setParsedData] = useState<ParsedSlipData | null>(null);
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('12:00');
  const [type, setType] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>('EXPENSE');
  const [category, setCategory] = useState<string>('อาหาร & เครื่องดื่ม');
  const [amount, setAmount] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isHistorical, setIsHistorical] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Reset state when modal opens or closes
  useEffect(() => {
    if (!isOpen) {
      setStep('upload');
      setImagePreview(null);
      setErrorMessage(null);
      setParsedData(null);
    }
  }, [isOpen]);

  // Handle Drag & Drop
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Process File and call /api/scan-slip
  const handleProcessFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('กรุณาอัปโหลดไฟล์รูปภาพสลิปเท่านั้น (PNG, JPG, WEBP)');
      return;
    }

    setErrorMessage(null);
    setStep('scanning');

    // Create local preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/scan-slip', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.message || result.error || 'ไม่สามารถสแกนสลิปได้');
      }

      const slip: ParsedSlipData = result.data;
      setParsedData(slip);

      // Parse Date & Time
      if (slip.transaction_date) {
        try {
          const d = new Date(slip.transaction_date);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          setDate(`${yyyy}-${mm}-${dd}`);
          setTime(`${hh}:${min}`);
        } catch {
          setDate(new Date().toISOString().split('T')[0]);
          setTime('12:00');
        }
      } else {
        setDate(new Date().toISOString().split('T')[0]);
        setTime('12:00');
      }

      // Populate form state
      setType(slip.type || 'EXPENSE');
      setCategory(slip.category || 'อาหาร & เครื่องดื่ม');
      setAmount(slip.amount != null ? String(slip.amount) : '');
      setAccountId(slip.matched_account_id || (accounts[0]?.id ? String(accounts[0].id) : ''));
      setToAccountId(slip.matched_to_account_id || '');

      // Construct note from memo and ref
      const noteParts: string[] = [];
      if (slip.receiver_name) noteParts.push(`ถึง: ${slip.receiver_name}`);
      if (slip.memo) noteParts.push(`[${slip.memo}]`);
      if (slip.reference_number) noteParts.push(`Ref: ${slip.reference_number}`);
      setNote(noteParts.join(' '));

      // Set is_historical flag based on suggestion
      setIsHistorical(Boolean(slip.is_historical_suggested));

      setStep('review');
    } catch (err: any) {
      console.error('Slip scan error:', err);
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ Gemini AI');
      setStep('upload');
    }
  }, [accounts]);

  // Support Clipboard Paste (Ctrl + V)
  useEffect(() => {
    if (!isOpen || step !== 'upload') return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            handleProcessFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, step, handleProcessFile]);

  // Save reviewed transaction to Supabase
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      alert('กรุณาระบุจำนวนเงินที่มากกว่า 0');
      return;
    }

    if (type === 'TRANSFER') {
      if (!accountId) {
        alert('กรุณาเลือกบัญชีต้นทาง (From Account)');
        return;
      }
      if (!toAccountId) {
        alert('กรุณาเลือกบัญชีปลายทาง (To Account)');
        return;
      }
      if (accountId === toAccountId) {
        alert('บัญชีต้นทางและบัญชีปลายทางต้องไม่ใช่บัญชีเดียวกัน');
        return;
      }
    }

    try {
      setIsSaving(true);
      const fullDateTime = time ? `${date}T${time}:00` : `${date}T12:00:00`;

      const payload: any = {
        account_id: accountId || null,
        to_account_id: type === 'TRANSFER' ? toAccountId || null : null,
        type,
        transaction_type: type.toLowerCase(),
        category: category.trim(),
        amount: parseFloat(amount) || 0,
        note: note.trim() || null,
        transaction_date: fullDateTime,
        is_historical: isHistorical,
      };

      const { error } = await supabase.from('expense_income_transactions').insert([payload]);

      if (error) throw error;

      onTransactionSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving transaction from slip:', err);
      alert(`ไม่สามารถบันทึกรายการได้: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <span>AI สแกนสลิปโอนเงิน</span>
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  Gemini 3.8 Flash
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                สแกนรูปสลิปธนาคารและกรอกข้อมูลรายรับ-จ่ายให้อัตโนมัติ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Error Message Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-700 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">เกิดข้อผิดพลาดในการสแกนสลิป</p>
                <p className="text-rose-600/90 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* STEP 1: Upload Drag & Drop Zone */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleProcessFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50/60 scale-[0.99]'
                    : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50/70 bg-white'
                }`}
              >
                <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-600 shadow-xs">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800">
                    ลากรูปสลิปมาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์
                  </p>
                  <p className="text-xs text-slate-500">
                    รองรับรูปภาพ JPG, PNG, WEBP หรือกดถ่ายรูปด้วยกล้องมือถือ
                  </p>
                  <p className="text-[11px] text-emerald-600 font-medium pt-1">
                    💡 กดปุ่ม <span className="font-mono bg-emerald-100 px-1 py-0.5 rounded">Ctrl + V</span> เพื่อวางรูปจากคลิปบอร์ดได้ทันที
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleProcessFile(file);
                  }}
                />
              </div>

              {/* Supported Banks info pills */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">ครอบคลุมทุกธนาคารไทย:</span> KBank, SCB, BBL, Krungthai, TTB, Bay, GSB, PromptPay, TrueMoney ฯลฯ
              </div>
            </div>
          )}

          {/* STEP 2: Scanning & Processing Animation */}
          {step === 'scanning' && (
            <div className="py-8 flex flex-col items-center justify-center gap-4 text-center">
              {imagePreview && (
                <div className="relative w-40 h-52 rounded-2xl overflow-hidden shadow-lg border border-slate-200">
                  <img
                    src={imagePreview}
                    alt="Slip Preview"
                    className="w-full h-full object-cover filter brightness-95"
                  />
                  {/* Glowing Laser Scan Line Animation */}
                  <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-500 shadow-[0_0_12px_#10b981] animate-bounce" />
                </div>
              )}
              <div className="space-y-1.5">
                <div className="flex items-center justify-center gap-2 text-emerald-700 font-bold text-sm">
                  <Sparkles className="w-4 h-4 animate-spin text-emerald-500" />
                  <span>Gemini 3.8 Flash กำลังอ่านข้อมูลสลิป...</span>
                </div>
                <p className="text-xs text-slate-500">
                  กำลังถอดรหัสยอดเงิน วันที่ ธนาคาร และจับคู่บัญชีอัตโนมัติ
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Review & Edit Form */}
          {step === 'review' && (
            <form onSubmit={handleSaveTransaction} className="space-y-4">
              {/* Slip thumbnail + Extracted Highlights */}
              <div className="flex items-center gap-3.5 p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
                {imagePreview && (
                  <div className="w-14 h-16 shrink-0 rounded-xl overflow-hidden border border-emerald-300 shadow-xs">
                    <img src={imagePreview} alt="Slip" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-800">
                      ตรวจพบ: {parsedData?.sender_bank || 'สลิปโอนเงิน'} ฿{parsedData?.amount?.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep('upload')}
                      className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>สแกนรูปอื่น</span>
                    </button>
                  </div>
                  <p className="text-emerald-700/80 truncate mt-0.5">
                    {parsedData?.receiver_name ? `ผู้รับ: ${parsedData.receiver_name}` : 'สลิปสำเร็จ'}
                    {parsedData?.sender_account_masked && ` • จาก ${parsedData.sender_account_masked}`}
                  </p>
                </div>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. ประเภทธุรกรรม */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">ประเภทรายการ</label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setType('EXPENSE')}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition ${
                        type === 'EXPENSE' ? 'bg-rose-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      รายจ่าย
                    </button>
                    <button
                      type="button"
                      onClick={() => setType('INCOME')}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition ${
                        type === 'INCOME' ? 'bg-emerald-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      รายรับ
                    </button>
                    <button
                      type="button"
                      onClick={() => setType('TRANSFER')}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition ${
                        type === 'TRANSFER' ? 'bg-indigo-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      โอนเงิน
                    </button>
                  </div>
                </div>

                {/* 2. ยอดเงิน */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">ยอดเงิน (บาท)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">฿</span>
                    <input
                      type="number"
                      step="any"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-1.5 text-sm font-bold font-mono text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                {/* 3. วันที่ */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">วันที่</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                {/* 4. เวลา */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">เวลา</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                {/* 5. หมวดหมู่ */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700">หมวดหมู่</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    {(type === 'EXPENSE'
                      ? expenseCategories
                      : type === 'INCOME'
                      ? incomeCategories
                      : transferCategories
                    ).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 6. บัญชีต้นทาง */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    {type === 'TRANSFER' ? 'จากบัญชีต้นทาง (From)' : 'บันทึกเข้า/ตัดจากบัญชี'}
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">-- ไม่ระบุบัญชี --</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.account_name} ({acc.bank_name || acc.account_type})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 7. บัญชีปลายทาง (สำหรับโอนเงิน) */}
                {type === 'TRANSFER' && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      เข้าบัญชีปลายทาง (To)
                    </label>
                    <select
                      value={toAccountId}
                      onChange={(e) => setToAccountId(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="">-- เลือกบัญชีปลายทาง --</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.account_name} ({acc.bank_name || acc.account_type})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 8. หมายเหตุ */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700">บันทึกช่วยจำ (Note)</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="รายละเอียดเพิ่มเติม หรือร้านค้า"
                    className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* 9. Historical Slip Toggle Switch (is_historical) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${isHistorical ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800">
                        สลิปย้อนหลัง (Historical Record)
                      </span>
                      {isHistorical && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.2 rounded-full">
                          ไม่ปรับยอดเงินคงเหลือ
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {isHistorical
                        ? 'บันทึกเป็นประวัติย้อนหลังเท่านั้น เพื่อดูรายงานสถิติ โดยไม่ไปหักลบยอดเงินคงเหลือปัจจุบันในบัญชี'
                        : 'ปรับยอดเงินคงเหลือในบัญชีตามรายการปกติ'}
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isHistorical}
                    onChange={(e) => setIsHistorical(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
                </label>
              </div>

              {/* Actions Footer */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition shadow-xs cursor-pointer"
                >
                  {isSaving ? (
                    <span>กำลังบันทึก...</span>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>ยืนยันบันทึกรายการ</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
