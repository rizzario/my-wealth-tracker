'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Receipt,
  TrendingDown,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Calendar,
  Eye,
  EyeOff,
  Filter,
  PieChart,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  AlertCircle,
  Tag,
  Check,
  Clock,
} from 'lucide-react';
import { getCurrencySymbol } from '@/lib/currency';

export interface FinancialTransaction {
  id: number | string;
  user_id?: string;
  transaction_date: string;
  type: 'INCOME' | 'EXPENSE' | string;
  transaction_type?: string;
  category: string;
  amount: number;
  account_id?: string | number | null;
  note?: string | null;
  created_at?: string;
}

export interface AccountOption {
  id: string;
  account_name: string;
  bank_name?: string | null;
  account_type: string;
  currency?: string;
  current_balance: number;
  is_liability: boolean;
}

interface ExpenseIncomeSectionProps {
  onTransactionsUpdated?: () => void;
  onCashFlowUpdated?: () => void;
}

// หมวดหมู่รายจ่ายยอดนิยมพร้อมไอคอน/สี
const POPULAR_EXPENSE_CATEGORIES = [
  'อาหาร & เครื่องดื่ม',
  'เดินทาง & ค่าน้ำมัน',
  'ช้อปปิ้ง & ของใช้',
  'ที่พัก & ค่าเช่า',
  'ค่าน้ำ / ค่าไฟ / อินเทอร์เน็ต',
  'ความบันเทิง & สตรีมมิ่ง',
  'สุขภาพ & ยารักษาโรค',
  'การศึกษา & พัฒนาตนเอง',
  'ประกันภัย',
  'ผ่อนชำระ & หนี้สิน',
  'อื่นๆ',
];

// หมวดหมู่รายรับยอดนิยม
const POPULAR_INCOME_CATEGORIES = [
  'เงินเดือน (Salary)',
  'โบนัส (Bonus)',
  'เงินปันผล (Dividend)',
  'รายได้ธุรกิจ / ฟรีแลนซ์',
  'ดอกเบี้ยเงินฝาก',
  'ขายของ / สินค้ามือสอง',
  'รับเงินคืน (Cashback / Refund)',
  'ของขวัญ / เงินรับให้',
  'อื่นๆ',
];

export default function ExpenseIncomeSection({
  onTransactionsUpdated,
  onCashFlowUpdated,
}: ExpenseIncomeSectionProps) {
  const supabase = createClient();

  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Privacy Mode
  const [hideValues, setHideValues] = useState(false);

  // Filter States
  const [periodPreset, setPeriodPreset] = useState<'this_month' | 'last_month' | 'this_year' | 'all' | 'custom'>('this_month');
  const [customMonth, setCustomMonth] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State: บันทึกรายการใหม่
  const [isFormExpanded, setIsFormExpanded] = useState(true);
  const [txType, setTxType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [txDate, setTxDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [txTime, setTxTime] = useState(() => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [category, setCategory] = useState('อาหาร & เครื่องดื่ม');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submittingTx, setSubmittingTx] = useState(false);

  // Modal State: แก้ไขรายการที่มีอยู่
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<FinancialTransaction | null>(null);
  const [editType, setEditType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('12:00');
  const [editAccountId, setEditAccountId] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // โหลดการตั้งค่า Privacy Mode
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hide_cashflow_values');
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
        localStorage.setItem('hide_cashflow_values', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // ดึงบัญชีจาก financial_accounts
  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('id, account_name, bank_name, account_type, currency, current_balance, is_liability')
        .order('is_liability', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      const accList = (data || []) as AccountOption[];
      setAccounts(accList);
      if (accList.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accList[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching accounts:', err.message);
    }
  };

  // ดึงรายการธุรกรรมทั้งหมดของผู้ใช้
  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('expense_income_transactions')
        .select('*')
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions((data || []) as FinancialTransaction[]);
    } catch (err: any) {
      console.error('Error fetching transactions:', err.message);
    }
  };

  useEffect(() => {
    const initLoad = async () => {
      setLoading(true);
      await Promise.all([fetchAccounts(), fetchTransactions()]);
      setLoading(false);
    };
    initLoad();
  }, []);

  // เมื่อเปลี่ยน txType ให้เลือกหมวดหมู่เริ่มต้นที่เหมาะสม
  const handleTxTypeChange = (newType: 'EXPENSE' | 'INCOME') => {
    setTxType(newType);
    if (newType === 'EXPENSE') {
      setCategory(POPULAR_EXPENSE_CATEGORIES[0]);
    } else {
      setCategory(POPULAR_INCOME_CATEGORIES[0]);
    }
  };

  // บันทึกรายการใหม่
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      alert('กรุณาระบุจำนวนเงินที่มากกว่า 0');
      return;
    }

    try {
      setSubmittingTx(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้');

      const fullDateTime = txTime ? `${txDate}T${txTime}:00` : txDate;
      const payload: any = {
        user_id: user.id,
        account_id: selectedAccountId || null,
        type: txType,
        transaction_type: txType.toLowerCase(),
        category: category.trim(),
        amount: parseFloat(amount) || 0,
        note: note.trim() || null,
        transaction_date: fullDateTime,
      };

      const { error } = await supabase.from('expense_income_transactions').insert(payload);

      if (error) throw error;

      setAmount('');
      setNote('');
      await fetchTransactions();
      onTransactionsUpdated?.();
      onCashFlowUpdated?.();
    } catch (err: any) {
      if (err.message?.includes('invalid input syntax for type bigint')) {
        const retryWithoutAccount = confirm(
          '⚠️ เกิดข้อผิดพลาดจากฐานข้อมูล:\n' +
          'คอลัมน์ account_id ในตาราง expense_income_transactions ของ Supabase ยังคงเป็นชนิด bigint (เดิมผูกกับ cash_and_pvd_assets) จึงยังไม่สามารถผูกกับ UUID ของ financial_accounts ได้\n\n' +
          '👉 วิธีแก้ไขถาวร: กรุณารันคำสั่ง SQL Migration ใน Supabase SQL Editor เพื่อเปลี่ยน account_id ให้เป็น UUID\n\n' +
          'คุณต้องการบันทึกรายการนี้โดย "ไม่ระบุบัญชี" ชั่วคราวก่อนหรือไม่?'
        );
        if (retryWithoutAccount) {
          try {
            const fullDateTime = txTime ? `${txDate}T${txTime}:00` : txDate;
            const retryPayload = {
              user_id: (await supabase.auth.getUser()).data.user?.id,
              account_id: null,
              type: txType,
              transaction_type: txType.toLowerCase(),
              category: category.trim(),
              amount: parseFloat(amount) || 0,
              note: note.trim() || null,
              transaction_date: fullDateTime,
            };
            const { error: retryError } = await supabase.from('expense_income_transactions').insert(retryPayload);
            if (retryError) throw retryError;
            setAmount('');
            setNote('');
            await fetchTransactions();
            onTransactionsUpdated?.();
            onCashFlowUpdated?.();
            return;
          } catch (rErr: any) {
            alert('เกิดข้อผิดพลาด: ' + rErr.message);
          }
        }
      } else {
        alert('เกิดข้อผิดพลาดในการบันทึกรายการ: ' + err.message);
      }
    } finally {
      setSubmittingTx(false);
    }
  };

  // เปิด Modal แก้ไขรายการ
  const handleOpenEditModal = (tx: FinancialTransaction) => {
    setEditingTx(tx);
    const typeUpper = String(tx.type || tx.transaction_type || 'EXPENSE').toUpperCase();
    setEditType(typeUpper === 'INCOME' ? 'INCOME' : 'EXPENSE');

    // แยกวันและเวลา
    const dateStr = tx.transaction_date || '';
    if (dateStr.includes('T') || dateStr.includes(' ')) {
      const parts = dateStr.replace(' ', 'T').split('T');
      setEditDate(parts[0]);
      if (parts[1]) {
        const timeParts = parts[1].split(':');
        if (timeParts.length >= 2) {
          setEditTime(`${timeParts[0].padStart(2, '0')}:${timeParts[1].padStart(2, '0')}`);
        } else {
          setEditTime('12:00');
        }
      } else {
        setEditTime('12:00');
      }
    } else {
      setEditDate(dateStr || new Date().toISOString().split('T')[0]);
      if (tx.created_at) {
        const cd = new Date(tx.created_at);
        const hh = String(cd.getHours()).padStart(2, '0');
        const mm = String(cd.getMinutes()).padStart(2, '0');
        setEditTime(`${hh}:${mm}`);
      } else {
        setEditTime('12:00');
      }
    }

    setEditAccountId(tx.account_id ? String(tx.account_id) : '');
    setEditCategory(tx.category || '');
    setEditAmount(tx.amount != null ? String(tx.amount) : '');
    setEditNote(tx.note || '');
    setIsEditModalOpen(true);
  };

  // บันทึกการแก้ไขรายการ
  const handleSaveEditTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    if (!editAmount || parseFloat(editAmount) <= 0) {
      alert('กรุณาระบุจำนวนเงินที่มากกว่า 0');
      return;
    }

    try {
      setSubmittingEdit(true);
      const fullDateTime = editTime ? `${editDate}T${editTime}:00` : editDate;
      const payload: any = {
        account_id: editAccountId || null,
        type: editType,
        transaction_type: editType.toLowerCase(),
        category: editCategory.trim(),
        amount: parseFloat(editAmount) || 0,
        note: editNote.trim() || null,
        transaction_date: fullDateTime,
      };

      const { error } = await supabase
        .from('expense_income_transactions')
        .update(payload)
        .eq('id', editingTx.id);

      if (error) throw error;

      setIsEditModalOpen(false);
      setEditingTx(null);
      await fetchTransactions();
      onTransactionsUpdated?.();
      onCashFlowUpdated?.();
    } catch (err: any) {
      if (err.message?.includes('invalid input syntax for type bigint')) {
        const retryWithoutAccount = confirm(
          '⚠️ เกิดข้อผิดพลาดจากฐานข้อมูล:\n' +
          'คอลัมน์ account_id ในตาราง expense_income_transactions ของ Supabase ยังคงเป็นชนิด bigint (เดิมผูกกับ cash_and_pvd_assets) จึงยังไม่สามารถผูกกับ UUID ของ financial_accounts ได้\n\n' +
          '👉 วิธีแก้ไขถาวร: กรุณารันคำสั่ง SQL Migration ใน Supabase SQL Editor เพื่อเปลี่ยน account_id ให้เป็น UUID\n\n' +
          'คุณต้องการบันทึกการแก้ไขนี้โดย "ไม่ระบุบัญชี" ชั่วคราวก่อนหรือไม่?'
        );
        if (retryWithoutAccount) {
          try {
            const fullDateTime = editTime ? `${editDate}T${editTime}:00` : editDate;
            const retryPayload = {
              account_id: null,
              type: editType,
              transaction_type: editType.toLowerCase(),
              category: editCategory.trim(),
              amount: parseFloat(editAmount) || 0,
              note: editNote.trim() || null,
              transaction_date: fullDateTime,
            };
            const { error: retryError } = await supabase
              .from('expense_income_transactions')
              .update(retryPayload)
              .eq('id', editingTx.id);
            if (retryError) throw retryError;
            setIsEditModalOpen(false);
            setEditingTx(null);
            await fetchTransactions();
            onTransactionsUpdated?.();
            onCashFlowUpdated?.();
            return;
          } catch (rErr: any) {
            alert('เกิดข้อผิดพลาด: ' + rErr.message);
          }
        }
      } else {
        alert('เกิดข้อผิดพลาดในการแก้ไขรายการ: ' + err.message);
      }
    } finally {
      setSubmittingEdit(false);
    }
  };

  // ลบรายการ
  const handleDeleteTransaction = async (id: number | string, catName: string) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายการ "${catName}"?`)) return;
    try {
      const { error } = await supabase
        .from('expense_income_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchTransactions();
      onTransactionsUpdated?.();
      onCashFlowUpdated?.();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการลบรายการ: ' + err.message);
    }
  };

  // กรองรายการตามช่วงเวลา (Period)
  const periodFilteredTransactions = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth(); // 0-11

    return transactions.filter((tx) => {
      if (!tx.transaction_date) return true;
      const txD = new Date(tx.transaction_date);
      const y = txD.getFullYear();
      const m = txD.getMonth();

      if (periodPreset === 'this_month') {
        return y === curYear && m === curMonth;
      }
      if (periodPreset === 'last_month') {
        const targetMonth = curMonth === 0 ? 11 : curMonth - 1;
        const targetYear = curMonth === 0 ? curYear - 1 : curYear;
        return y === targetYear && m === targetMonth;
      }
      if (periodPreset === 'this_year') {
        return y === curYear;
      }
      if (periodPreset === 'custom') {
        if (!customMonth) return true;
        const [cy, cm] = customMonth.split('-').map(Number);
        return y === cy && m === cm - 1;
      }
      // 'all'
      return true;
    });
  }, [transactions, periodPreset, customMonth]);

  // คำนวณยอดสรุป (Income, Expense, Net, Savings Rate) สำหรับช่วงเวลาที่เลือก
  const summaryMetrics = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const tx of periodFilteredTransactions) {
      const t = String(tx.type || tx.transaction_type || '').toUpperCase();
      const amt = Number(tx.amount || 0);
      if (t === 'INCOME') {
        income += amt;
      } else {
        expense += amt;
      }
    }

    const net = income - expense;
    const savingsRate = income > 0 ? Math.max(0, (net / income) * 100) : 0;

    return { income, expense, net, savingsRate };
  }, [periodFilteredTransactions]);

  // วิเคราะห์สัดส่วนค่าใช้จ่ายตามหมวดหมู่ (Category Breakdown)
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    let totalExpense = 0;

    for (const tx of periodFilteredTransactions) {
      const t = String(tx.type || tx.transaction_type || '').toUpperCase();
      if (t === 'EXPENSE') {
        const amt = Number(tx.amount || 0);
        const cat = tx.category || 'อื่นๆ';
        map[cat] = (map[cat] || 0) + amt;
        totalExpense += amt;
      }
    }

    const sorted = Object.entries(map)
      .map(([cat, amt]) => ({
        category: cat,
        amount: amt,
        percent: totalExpense > 0 ? (amt / totalExpense) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return { items: sorted, totalExpense };
  }, [periodFilteredTransactions]);

  // กรองรายการสำหรับตาราง/รายการ (ค้นหา + ประเภท + บัญชี)
  const displayedTransactions = useMemo(() => {
    let list = periodFilteredTransactions;

    if (typeFilter !== 'ALL') {
      list = list.filter((tx) => {
        const t = String(tx.type || tx.transaction_type || '').toUpperCase();
        return t === typeFilter;
      });
    }

    if (selectedAccountFilter !== 'ALL') {
      list = list.filter((tx) => String(tx.account_id || '') === selectedAccountFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((tx) => {
        const cat = (tx.category || '').toLowerCase();
        const noteText = (tx.note || '').toLowerCase();
        const amt = String(tx.amount || '');
        return cat.includes(q) || noteText.includes(q) || amt.includes(q);
      });
    }

    return [...list].sort(
      (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
    );
  }, [periodFilteredTransactions, typeFilter, selectedAccountFilter, searchQuery]);

  // Helper สำหรับจัดรูปแบบวัน-เวลา
  const formatTxDateTime = (dateStr?: string | null) => {
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
        <div className="flex flex-col">
          <span className="font-semibold text-slate-800">{`${day}/${m}/${y}`}</span>
          {hasTime && (
            <span className="text-[11px] text-slate-400 font-mono flex items-center gap-0.5 mt-0.5">
              <Clock className="w-2.5 h-2.5 text-slate-400" />
              <span>{`${hh}:${mm} น.`}</span>
            </span>
          )}
        </div>
      );
    } catch {
      return dateStr;
    }
  };

  // Helper สำหรับจัดรูปแบบยอดเงิน
  const formatMoney = (val: number | null | undefined, options?: { prefix?: string }) => {
    if (hideValues) return '฿••••••';
    const num = Number(val || 0);
    return `${options?.prefix ?? '฿'}${num.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Helper หาชื่อบัญชี
  const getAccountLabel = (accId?: string | number | null) => {
    if (!accId) return null;
    const found = accounts.find((a) => String(a.id) === String(accId));
    if (!found) return null;
    return found.bank_name ? `[${found.bank_name}] ${found.account_name}` : found.account_name;
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* หัวข้อหน้าหลัก */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Receipt className="w-6 h-6 text-emerald-600" />
              <span>บันทึกรายรับ-รายจ่าย & รายงาน (Expense & Income)</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              บันทึกรายการประจำวัน สรุปภาพรวมกระแสเงินสด วิเคราะห์สัดส่วนค่าใช้จ่าย และดูรายงานย้อนหลัง
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* ปุ่มซ่อน/แสดงยอดเงิน */}
            <button
              type="button"
              onClick={toggleHideValues}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition shadow-xs cursor-pointer"
              title={hideValues ? 'แสดงตัวเลขยอดเงิน' : 'ซ่อนตัวเลขยอดเงิน'}
            >
              {hideValues ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{hideValues ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'}</span>
            </button>

            {/* ปุ่มพับ/เปิดฟอร์มบันทึก */}
            <button
              type="button"
              onClick={() => setIsFormExpanded((p) => !p)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-xs cursor-pointer"
            >
              <Plus className={`w-3.5 h-3.5 transition-transform ${isFormExpanded ? 'rotate-45' : ''}`} />
              <span>{isFormExpanded ? 'ปิดฟอร์มบันทึก' : '+ บันทึกรายการใหม่'}</span>
            </button>
          </div>
        </div>

        {/* แถบเลือกช่วงเวลา (Period Filter Bar) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold overflow-x-auto">
            <button
              type="button"
              onClick={() => setPeriodPreset('this_month')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                periodPreset === 'this_month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              เดือนนี้
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('last_month')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                periodPreset === 'last_month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              เดือนที่แล้ว
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('this_year')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                periodPreset === 'this_year' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ปีนี้
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('all')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                periodPreset === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('custom')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                periodPreset === 'custom' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              เลือกเดือนเฉพาะ
            </button>
          </div>

          {periodPreset === 'custom' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">เลือกเดือน:</span>
              <input
                type="month"
                value={customMonth}
                onChange={(e) => setCustomMonth(e.target.value)}
                className="px-3 py-1 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          )}
        </div>

        {/* การ์ดสรุปตัวชี้วัดทางการเงิน (Summary Metric Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. รวมรายรับ */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <span className="p-1 rounded-md bg-emerald-100 text-emerald-700">
                  <ArrowDownRight className="w-3.5 h-3.5" />
                </span>
                รวมรายรับ (Income)
              </span>
            </div>
            <p className="text-xl font-bold text-emerald-600 mt-2">
              {formatMoney(summaryMetrics.income)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">ในรอบเวลาที่เลือก</p>
          </div>

          {/* 2. รวมรายจ่าย */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <span className="p-1 rounded-md bg-rose-100 text-rose-700">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
                รวมรายจ่าย (Expenses)
              </span>
            </div>
            <p className="text-xl font-bold text-rose-600 mt-2">
              {formatMoney(summaryMetrics.expense)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">ในรอบเวลาที่เลือก</p>
          </div>

          {/* 3. กระแสเงินสดสุทธิ (Net Savings) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <span className="p-1 rounded-md bg-sky-100 text-sky-700">
                  <Wallet className="w-3.5 h-3.5" />
                </span>
                คงเหลือสุทธิ (Net Cash Flow)
              </span>
            </div>
            <p className={`text-xl font-bold mt-2 ${summaryMetrics.net >= 0 ? 'text-sky-600' : 'text-rose-600'}`}>
              {summaryMetrics.net > 0 && !hideValues ? '+' : ''}{formatMoney(summaryMetrics.net)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {summaryMetrics.net >= 0 ? 'เงินเก็บคงเหลือ' : 'ใช้จ่ายเกินรายรับ'}
            </p>
          </div>

          {/* 4. อัตราการออม (Savings Rate) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <span className="p-1 rounded-md bg-indigo-100 text-indigo-700">
                  <PieChart className="w-3.5 h-3.5" />
                </span>
                อัตราการออม (Savings Rate)
              </span>
            </div>
            <p className="text-xl font-bold text-indigo-600 mt-2">
              {hideValues ? '••%' : `${summaryMetrics.savingsRate.toFixed(1)}%`}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">คิดเป็น % ของรายรับทั้งหมด</p>
          </div>
        </div>

        {/* แถวกลาง: ฟอร์มบันทึกรายการ (ซ้าย) + รายงานสัดส่วนค่าใช้จ่าย (ขวา) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ฝั่งซ้าย: ฟอร์มบันทึกรายการ (5 cols) */}
          {isFormExpanded && (
            <div className="lg:col-span-5 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-emerald-600" />
                  <span>บันทึกรายการ</span>
                </h2>
                <span className="text-xs text-slate-400">บันทึกลงบัญชีของคุณ</span>
              </div>

              {/* ปุ่มสลับประเภท รายจ่าย vs รายรับ */}
              <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleTxTypeChange('EXPENSE')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    txType === 'EXPENSE' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>รายจ่าย (Expense)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTxTypeChange('INCOME')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    txType === 'INCOME' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>รายรับ (Income)</span>
                </button>
              </div>

              <form onSubmit={handleCreateTransaction} className="space-y-3.5">
                {/* วันที่ และ บัญชี */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        วันที่ & เวลาทำรายการ
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          setTxDate(now.toISOString().split('T')[0]);
                          const hh = String(now.getHours()).padStart(2, '0');
                          const mm = String(now.getMinutes()).padStart(2, '0');
                          setTxTime(`${hh}:${mm}`);
                        }}
                        className="text-[10px] text-emerald-600 hover:text-emerald-700 font-semibold cursor-pointer"
                        title="ตั้งเป็นวันและเวลาปัจจุบัน"
                      >
                        ตอนนี้
                      </button>
                    </label>
                    <div className="grid grid-cols-12 gap-1.5">
                      <input
                        type="date"
                        required
                        value={txDate}
                        onChange={(e) => setTxDate(e.target.value)}
                        className="col-span-7 px-2.5 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      />
                      <input
                        type="time"
                        required
                        value={txTime}
                        onChange={(e) => setTxTime(e.target.value)}
                        className="col-span-5 px-2 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {txType === 'EXPENSE' ? 'จ่ายจากบัญชี / บัตร' : 'เข้าบัญชี'}
                    </label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    >
                      <option value="">-- ไม่ระบุบัญชี --</option>
                      {accounts.map((acc) => {
                        const curr = (acc.currency || 'THB').toUpperCase();
                        return (
                          <option key={acc.id} value={acc.id}>
                            {acc.bank_name ? `[${acc.bank_name}] ` : ''}{acc.account_name} ({formatMoney(acc.current_balance, { prefix: getCurrencySymbol(curr) })})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {/* หมวดหมู่ และ แท็กแนะนำ */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    หมวดหมู่ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="เช่น อาหาร, เงินเดือน, ช้อปปิ้ง"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />

                  {/* Quick Tags Chips */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(txType === 'EXPENSE' ? POPULAR_EXPENSE_CATEGORIES : POPULAR_INCOME_CATEGORIES).slice(0, txType === 'EXPENSE' ? POPULAR_EXPENSE_CATEGORIES.length : POPULAR_INCOME_CATEGORIES.length).map((catName) => (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => setCategory(catName)}
                        className={`text-[11px] px-2 py-0.5 rounded-lg border transition cursor-pointer ${
                          category === catName
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {catName}
                      </button>
                    ))}
                  </div>
                </div>

                {/* จำนวนเงิน */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    จำนวนเงิน (บาท) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>

                {/* บันทึกช่วยจำ */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    บันทึกช่วยจำ (Note)
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingTx}
                  className={`w-full py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition disabled:opacity-50 mt-2 cursor-pointer ${
                    txType === 'EXPENSE' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {submittingTx ? 'กำลังบันทึก...' : txType === 'EXPENSE' ? 'บันทึกรายจ่าย' : 'บันทึกรายรับ'}
                </button>
              </form>
            </div>
          )}

          {/* ฝั่งขวา: รายงานสัดส่วนค่าใช้จ่ายตามหมวดหมู่ (7 cols หรือ 12 cols ถ้าปิดฟอร์ม) */}
          <div className={`${isFormExpanded ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                  <PieChart className="w-4 h-4 text-indigo-600" />
                  <span>รายงานสัดส่วนรายจ่าย (Spending Breakdown)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  รวมรายจ่าย {formatMoney(categoryBreakdown.totalExpense)} ในรอบเวลาที่เลือก
                </p>
              </div>
            </div>

            {categoryBreakdown.items.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-1">
                <AlertCircle className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-sm font-medium">ยังไม่มีข้อมูลรายจ่ายในรอบเวลานี้</p>
                <p className="text-xs text-slate-400">บันทึกรายจ่ายเพื่อดูการกระจายตัวของค่าใช้จ่ายตามหมวดหมู่</p>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {categoryBreakdown.items.map((item, idx) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                        <span className="truncate">{item.category}</span>
                      </span>
                      <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                        <span className="font-bold text-slate-800">{formatMoney(item.amount)}</span>
                        <span className="text-slate-400 w-12 text-right">
                          {hideValues ? '••%' : `${item.percent.toFixed(1)}%`}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          idx === 0 ? 'bg-rose-500' : idx === 1 ? 'bg-amber-500' : idx === 2 ? 'bg-sky-500' : 'bg-slate-400'
                        }`}
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* แถวล่าง: ตารางรายงานประวัติธุรกรรม (Transaction Report & Ledger) */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-slate-700" />
                <span>ประวัติรายการธุรกรรม (Transaction Ledger)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                พบ {displayedTransactions.length} รายการ (จากทั้งหมด {periodFilteredTransactions.length} รายการในรอบเวลา)
              </p>
            </div>

            {/* Sub-Filters: Type, Account, Search */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Type Filter */}
              <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setTypeFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    typeFilter === 'ALL' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  ทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('EXPENSE')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    typeFilter === 'EXPENSE' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-500 hover:text-rose-600'
                  }`}
                >
                  รายจ่าย
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('INCOME')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    typeFilter === 'INCOME' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-emerald-600'
                  }`}
                >
                  รายรับ
                </button>
              </div>

              {/* Account Filter */}
              <select
                value={selectedAccountFilter}
                onChange={(e) => setSelectedAccountFilter(e.target.value)}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
              >
                <option value="ALL">ทุกบัญชี</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bank_name ? `[${a.bank_name}] ` : ''}{a.account_name}
                  </option>
                ))}
              </select>

              {/* Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ค้นหาหมวดหมู่, โน้ต..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-7 py-1 text-xs border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 w-44 sm:w-56"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* รายการธุรกรรม (Table / List) */}
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              กำลังโหลดข้อมูลธุรกรรม...
            </div>
          ) : displayedTransactions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-medium text-slate-600">ไม่พบรายการธุรกรรมที่ตรงกับเงื่อนไข</p>
              <p className="text-xs text-slate-400">ลองเปลี่ยนช่วงเวลา ล้างคำค้นหา หรือบันทึกรายการใหม่</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                    <th className="py-3 px-3.5">วันที่</th>
                    <th className="py-3 px-3">หมวดหมู่</th>
                    <th className="py-3 px-3">บันทึกช่วยจำ</th>
                    <th className="py-3 px-3">บัญชีที่ใช้</th>
                    <th className="py-3 px-3 text-right">จำนวนเงิน</th>
                    <th className="py-3 px-3 text-center w-20">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {displayedTransactions.map((tx) => {
                    const typeUpper = String(tx.type || tx.transaction_type || '').toUpperCase();
                    const isIncome = typeUpper === 'INCOME';
                    const accName = getAccountLabel(tx.account_id);

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/80 transition group">
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600">
                          {formatTxDateTime(tx.transaction_date)}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isIncome ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            <Tag className="w-2.5 h-2.5" />
                            <span>{tx.category}</span>
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-slate-600 max-w-[200px] truncate" title={tx.note || '-'}>
                          {tx.note || <span className="text-slate-300">-</span>}
                        </td>

                        <td className="py-2.5 px-3 text-slate-500 max-w-[150px] truncate" title={accName || 'ไม่ระบุ'}>
                          {accName ? (
                            <span className="font-medium text-slate-700 truncate block">{accName}</span>
                          ) : (
                            <span className="text-slate-300 italic">ไม่ระบุบัญชี</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span className={`font-bold text-xs sm:text-sm ${isIncome ? 'text-emerald-600' : 'text-slate-900'}`}>
                            {hideValues ? (
                              <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••</span>
                            ) : (
                              `${isIncome ? '+' : '-'}฿${Number(tx.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            )}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(tx)}
                              className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition cursor-pointer"
                              title="แก้ไขรายการ"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTransaction(tx.id, tx.category)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="ลบรายการนี้"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Modal Pop-up: แก้ไขรายการธุรกรรม */}
      {isEditModalOpen && editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-slate-700" />
                <h2 className="text-base font-bold text-slate-800">แก้ไขรายการธุรกรรม</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveEditTransaction} className="p-6 space-y-4">
              {/* สลับประเภท */}
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setEditType('EXPENSE')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    editType === 'EXPENSE' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  รายจ่าย
                </button>
                <button
                  type="button"
                  onClick={() => setEditType('INCOME')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    editType === 'INCOME' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  รายรับ
                </button>
              </div>

              {/* วันที่ และ บัญชี */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      วันที่ & เวลาทำรายการ
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        setEditDate(now.toISOString().split('T')[0]);
                        const hh = String(now.getHours()).padStart(2, '0');
                        const mm = String(now.getMinutes()).padStart(2, '0');
                        setEditTime(`${hh}:${mm}`);
                      }}
                      className="text-[10px] text-emerald-600 hover:text-emerald-700 font-semibold cursor-pointer"
                      title="ตั้งเป็นวันและเวลาปัจจุบัน"
                    >
                      ตอนนี้
                    </button>
                  </label>
                  <div className="grid grid-cols-12 gap-1.5">
                    <input
                      type="date"
                      required
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="col-span-7 px-2.5 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    />
                    <input
                      type="time"
                      required
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="col-span-5 px-2 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">บัญชีที่ใช้</label>
                  <select
                    value={editAccountId}
                    onChange={(e) => setEditAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="">-- ไม่ระบุบัญชี --</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.bank_name ? `[${a.bank_name}] ` : ''}{a.account_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* หมวดหมู่ */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">หมวดหมู่</label>
                <input
                  type="text"
                  required
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>

              {/* จำนวนเงิน */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">จำนวนเงิน (บาท)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>

              {/* โน้ต */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">บันทึกช่วยจำ (Note)</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="รายละเอียดเพิ่มเติม"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>

              {/* Footer Buttons */}
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {submittingEdit ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}