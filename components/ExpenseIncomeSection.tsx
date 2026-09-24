'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
  ArrowRightLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { getCurrencySymbol } from '@/lib/currency';

// ค่าความกว้างเริ่มต้นของแต่ละคอลัมน์ (px)
export const DEFAULT_COLUMN_WIDTHS = {
  date: 130,
  category: 140,
  note: 230,
  account: 240,
  amount: 140,
  actions: 80,
};

export type ColumnKey = keyof typeof DEFAULT_COLUMN_WIDTHS;

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
  'โอนเงินบัญชีอื่น / ชำระบิล',
  'ของขวัญ / บริจาค / การกุศล',
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

// หมวดหมู่โอนเงิน / ชำระบิลยอดนิยม
const POPULAR_TRANSFER_CATEGORIES = [
  'ชำระค่าบัตรเครดิต',
  'โอนเงินระหว่างบัญชี',
  'ชำระสินเชื่อ / ค่างวด',
  'ถอนเงินสด / เติมกระเป๋าเงิน',
  'โอนเงินเพื่อลงทุน',
  'อื่นๆ',
];

interface CategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
  placeholder?: string;
  required?: boolean;
  type?: 'EXPENSE' | 'INCOME' | 'TRANSFER' | string;
}

function CategoryCombobox({
  value,
  onChange,
  categories,
  placeholder = 'เลือกหรือพิมพ์หมวดหมู่...',
  required = false,
  type = 'EXPENSE',
}: CategoryComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ปิด dropdown เมื่อคลิกนอกพื้นที่
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCategories = useMemo(() => {
    const q = (value || '').trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((cat) => cat.toLowerCase().includes(q));
  }, [categories, value]);

  const exactMatch = categories.some(
    (cat) => cat.toLowerCase() === (value || '').trim().toLowerCase()
  );

  const focusBorder =
    type === 'TRANSFER'
      ? 'focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500'
      : type === 'EXPENSE'
      ? 'focus-within:ring-2 focus-within:ring-rose-500 focus-within:border-rose-500'
      : 'focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500';

  const activeBadgeBg =
    type === 'TRANSFER'
      ? 'bg-indigo-50 text-indigo-700'
      : type === 'EXPENSE'
      ? 'bg-rose-50 text-rose-700'
      : 'bg-emerald-50 text-emerald-700';

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={`flex items-center border border-slate-300 rounded-xl bg-white transition shadow-2xs ${focusBorder}`}
      >
        <input
          type="text"
          required={required}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOpen(false);
          }}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-xs outline-none bg-transparent rounded-xl"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
          title="เลือกหมวดหมู่ยอดนิยม"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-slate-700' : ''
            }`}
          />
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between bg-slate-50/80 sticky top-0 z-10 backdrop-blur-xs">
            <span>หมวดหมู่ยอดนิยม ({filteredCategories.length})</span>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                }}
                className="text-[10px] text-slate-400 hover:text-rose-600 cursor-pointer"
              >
                ล้าง
              </button>
            )}
          </div>

          {/* List items */}
          <div className="py-1">
            {filteredCategories.length > 0 ? (
              filteredCategories.map((catName) => {
                const isSelected = value.trim() === catName;
                return (
                  <button
                    key={catName}
                    type="button"
                    onClick={() => {
                      onChange(catName);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-xs text-left flex items-center justify-between transition cursor-pointer hover:bg-slate-50 ${
                      isSelected ? `${activeBadgeBg} font-semibold` : 'text-slate-700'
                    }`}
                  >
                    <span className="truncate">{catName}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 ml-1.5 text-current" />}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-xs text-slate-400 text-center">
                ไม่พบหมวดหมู่ที่ตรงกัน
              </div>
            )}

            {/* Custom value option if user typed something not in list */}
            {value.trim() && !exactMatch && (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full px-3 py-1.5 text-xs text-left text-indigo-600 hover:bg-indigo-50/60 font-medium flex items-center gap-1.5 border-t border-slate-100 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>ใช้หมวดหมู่: &quot;{value.trim()}&quot;</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE' | 'TRANSFER'>('ALL');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State: บันทึกรายการใหม่
  const [isFormExpanded, setIsFormExpanded] = useState(true);
  const [txType, setTxType] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>('EXPENSE');
  const [txDate, setTxDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [txTime, setTxTime] = useState(() => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [category, setCategory] = useState('อาหาร & เครื่องดื่ม');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submittingTx, setSubmittingTx] = useState(false);

  // Modal State: แก้ไขรายการที่มีอยู่
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<FinancialTransaction | null>(null);
  const [editType, setEditType] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>('EXPENSE');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('12:00');
  const [editAccountId, setEditAccountId] = useState('');
  const [editToAccountId, setEditToAccountId] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('tx_table_page_size');
      if (saved) return Number(saved);
    } catch {}
    return 20;
  });

  // Resizable Columns State
  const [colWidths, setColWidths] = useState<Record<ColumnKey, number>>(() => {
    try {
      const saved = localStorage.getItem('tx_table_col_widths');
      if (saved) return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_COLUMN_WIDTHS;
  });
  const [isResizing, setIsResizing] = useState(false);

  // เมื่อตัวกรองหรือการค้นหาเปลี่ยน ให้รีเซ็ตกลับหน้าแรก (Page 1)
  useEffect(() => {
    setCurrentPage(1);
  }, [periodPreset, customMonth, typeFilter, selectedAccountFilter, searchQuery]);

  // จัดการการลากปรับขนาดคอลัมน์ (Column Resizing via Drag & Drop)
  const handleMouseDownResize = (colKey: ColumnKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[colKey];
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const minW = colKey === 'actions' ? 70 : 80;
      const newWidth = Math.max(minW, startWidth + delta);
      setColWidths((prev) => ({ ...prev, [colKey]: newWidth }));
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setColWidths((latest) => {
        try {
          localStorage.setItem('tx_table_col_widths', JSON.stringify(latest));
        } catch {}
        return latest;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleResetColumnWidths = () => {
    setColWidths(DEFAULT_COLUMN_WIDTHS);
    try {
      localStorage.removeItem('tx_table_col_widths');
    } catch {}
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    try {
      localStorage.setItem('tx_table_page_size', String(newSize));
    } catch {}
  };

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
      if (accList.length > 1 && !toAccountId) {
        setToAccountId(accList[1].id);
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

  // ดึงหมวดหมู่ยอดนิยมตามประเภทรายการ (พร้อมรวบรวมหมวดหมู่ที่ผู้ใช้เคยบันทึกไว้ในอดีต)
  const getCategoriesForType = (type: string) => {
    const baseList =
      type === 'TRANSFER'
        ? POPULAR_TRANSFER_CATEGORIES
        : type === 'INCOME'
        ? POPULAR_INCOME_CATEGORIES
        : POPULAR_EXPENSE_CATEGORIES;

    const userCategories = Array.from(
      new Set(
        transactions
          .filter((t) => t.type === type && t.category?.trim())
          .map((t) => t.category.trim())
      )
    );

    return Array.from(new Set([...baseList, ...userCategories]));
  };

  // เมื่อเปลี่ยน txType ให้เลือกหมวดหมู่เริ่มต้นที่เหมาะสม
  const handleTxTypeChange = (newType: 'EXPENSE' | 'INCOME' | 'TRANSFER') => {
    setTxType(newType);
    if (newType === 'EXPENSE') {
      setCategory(POPULAR_EXPENSE_CATEGORIES[0]);
    } else if (newType === 'INCOME') {
      setCategory(POPULAR_INCOME_CATEGORIES[0]);
    } else {
      setCategory(POPULAR_TRANSFER_CATEGORIES[0]);
    }
  };

  // บันทึกรายการใหม่
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      alert('กรุณาระบุจำนวนเงินที่มากกว่า 0');
      return;
    }

    if (txType === 'TRANSFER') {
      if (!selectedAccountId) {
        alert('กรุณาเลือกบัญชีต้นทาง (From Account)');
        return;
      }
      if (!toAccountId) {
        alert('กรุณาเลือกบัญชีปลายทาง (To Account)');
        return;
      }
      if (selectedAccountId === toAccountId) {
        alert('บัญชีต้นทางและบัญชีปลายทางต้องไม่ใช่บัญชีเดียวกัน');
        return;
      }
    }

    try {
      setSubmittingTx(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้');

      const fullDateTime = txTime ? `${txDate}T${txTime}:00` : txDate;
      const payload: any = {
        user_id: user.id,
        account_id: selectedAccountId || null,
        to_account_id: txType === 'TRANSFER' ? (toAccountId || null) : null,
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
      if (err.message?.includes('to_account_id') || err.message?.includes('type_check')) {
        alert(
          '⚠️ เกิดข้อผิดพลาดจากฐานข้อมูล Supabase:\n' +
          'ยังไม่ได้เพิ่มคอลัมน์ to_account_id หรือยังไม่ได้ปลดล็อกเงื่อนไข type = TRANSFER ในตาราง expense_income_transactions\n\n' +
          '👉 กรุณารันคำสั่ง SQL Migration ใน Supabase SQL Editor เพื่อรองรับระบบโอนเงินและชำระบัตรเครดิต'
        );
      } else if (err.message?.includes('invalid input syntax for type bigint')) {
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
              to_account_id: null,
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
    if (typeUpper === 'INCOME') {
      setEditType('INCOME');
    } else if (typeUpper === 'TRANSFER') {
      setEditType('TRANSFER');
    } else {
      setEditType('EXPENSE');
    }

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
    setEditToAccountId(tx.to_account_id ? String(tx.to_account_id) : '');
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

    if (editType === 'TRANSFER') {
      if (!editAccountId) {
        alert('กรุณาเลือกบัญชีต้นทาง (From Account)');
        return;
      }
      if (!editToAccountId) {
        alert('กรุณาเลือกบัญชีปลายทาง (To Account)');
        return;
      }
      if (editAccountId === editToAccountId) {
        alert('บัญชีต้นทางและบัญชีปลายทางต้องไม่ใช่บัญชีเดียวกัน');
        return;
      }
    }

    try {
      setSubmittingEdit(true);
      const fullDateTime = editTime ? `${editDate}T${editTime}:00` : editDate;
      const payload: any = {
        account_id: editAccountId || null,
        to_account_id: editType === 'TRANSFER' ? (editToAccountId || null) : null,
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

  // คำนวณยอดสรุป (Income, Expense, Transfer, Net, Savings Rate) สำหรับช่วงเวลาที่เลือก
  const summaryMetrics = useMemo(() => {
    let income = 0;
    let expense = 0;
    let transfer = 0;

    for (const tx of periodFilteredTransactions) {
      const t = String(tx.type || tx.transaction_type || '').toUpperCase();
      const amt = Number(tx.amount || 0);
      if (t === 'INCOME') {
        income += amt;
      } else if (t === 'EXPENSE') {
        expense += amt;
      } else if (t === 'TRANSFER') {
        transfer += amt;
      }
    }

    const net = income - expense;
    const savingsRate = income > 0 ? Math.max(0, (net / income) * 100) : 0;

    return { income, expense, transfer, net, savingsRate };
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
      list = list.filter(
        (tx) =>
          String(tx.account_id || '') === selectedAccountFilter ||
          String(tx.to_account_id || '') === selectedAccountFilter
      );
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

  // คำนวณการแบ่งหน้า (Pagination Logic)
  const totalRecords = displayedTransactions.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedTransactions = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return displayedTransactions.slice(start, start + pageSize);
  }, [displayedTransactions, safeCurrentPage, pageSize]);

  const startIndex = totalRecords === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endIndex = Math.min(safeCurrentPage * pageSize, totalRecords);

  // คำนวณหมายเลขหน้าสำหรับปุ่มเลือกหน้า (Smart Page Number Buttons)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (safeCurrentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (safeCurrentPage >= totalPages - 3) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
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

          {/* 3. ยอดโอนเงิน & ชำระบัตร */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <span className="p-1 rounded-md bg-indigo-100 text-indigo-700">
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                </span>
                โอน & ชำระบัตร (Transfer)
              </span>
            </div>
            <p className="text-xl font-bold text-indigo-600 mt-2">
              {formatMoney(summaryMetrics.transfer)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">เงินหมุนเวียน ไม่นับเป็นรายจ่าย</p>
          </div>

          {/* 4. กระแสเงินสดสุทธิ (Net Savings) */}
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

          {/* 5. อัตราการออม (Savings Rate) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <span className="p-1 rounded-md bg-purple-100 text-purple-700">
                  <PieChart className="w-3.5 h-3.5" />
                </span>
                อัตราการออม (Savings Rate)
              </span>
            </div>
            <p className="text-xl font-bold text-purple-600 mt-2">
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

              {/* ปุ่มสลับประเภท รายจ่าย vs รายรับ vs โอนเงิน/ชำระบัตร */}
              <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleTxTypeChange('EXPENSE')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    txType === 'EXPENSE' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>รายจ่าย</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTxTypeChange('INCOME')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    txType === 'INCOME' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>รายรับ</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTxTypeChange('TRANSFER')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    txType === 'TRANSFER' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>โอน/ชำระบัตร</span>
                </button>
              </div>

              <form onSubmit={handleCreateTransaction} className="space-y-3.5">
                {/* วันที่ และ บัญชี (โหมดปกติ vs โหมดโอนเงิน) */}
                <div className="space-y-3">
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

                  {txType === 'TRANSFER' ? (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            จากบัญชีต้นทาง (From) <span className="text-rose-500">*</span>
                          </label>
                          <select
                            required
                            value={selectedAccountId}
                            onChange={(e) => setSelectedAccountId(e.target.value)}
                            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                          >
                            <option value="">-- เลือกบัญชีต้นทาง --</option>
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

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            ไปยังบัญชีปลายทาง (To) <span className="text-rose-500">*</span>
                          </label>
                          <select
                            required
                            value={toAccountId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setToAccountId(val);
                              const targetAcc = accounts.find((a) => a.id === val);
                              if (targetAcc?.is_liability) {
                                setCategory('ชำระค่าบัตรเครดิต');
                              } else if (category === 'ชำระค่าบัตรเครดิต') {
                                setCategory('โอนเงินระหว่างบัญชี');
                              }
                            }}
                            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                          >
                            <option value="">-- เลือกบัญชีปลายทาง --</option>
                            {accounts.map((acc) => {
                              const curr = (acc.currency || 'THB').toUpperCase();
                              const isLiab = acc.is_liability;
                              return (
                                <option key={acc.id} value={acc.id}>
                                  {isLiab ? '💳 ' : '🏦 '}
                                  {acc.bank_name ? `[${acc.bank_name}] ` : ''}{acc.account_name} {isLiab ? `(หนี้: ${formatMoney(acc.current_balance)})` : `(${formatMoney(acc.current_balance, { prefix: getCurrencySymbol(curr) })})`}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      {/* Info Helper Banner */}
                      {toAccountId && (() => {
                        const dstAcc = accounts.find((a) => a.id === toAccountId);
                        const srcAcc = accounts.find((a) => a.id === selectedAccountId);
                        if (dstAcc?.is_liability) {
                          return (
                            <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200/80 text-xs text-indigo-900 flex items-start gap-2">
                              <ArrowRightLeft className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-semibold text-indigo-950">ชำระบัตรเครดิต/สินเชื่ออัตโนมัติ</p>
                                <p className="text-[11px] text-indigo-700 mt-0.5">
                                  ระบบจะหักเงินจาก <strong>{srcAcc?.account_name || 'บัญชีต้นทาง'}</strong> และปรับ<strong>ลดยอดหนี้คงค้าง</strong>ของ <strong>{dstAcc.account_name}</strong> ให้อัตโนมัติ โดยไม่นับเป็นรายจ่ายซ้ำซ้อน
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
                            <ArrowRightLeft className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-slate-900">โอนเงินระหว่างบัญชี</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                ย้ายเงินจาก {srcAcc?.account_name || 'ต้นทาง'} เข้า {dstAcc?.account_name || 'ปลายทาง'} โดยยอดรวมความมั่งคั่ง (Net Worth) ไม่เปลี่ยนแปลง
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
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
                  )}
                </div>

                {/* หมวดหมู่ และ แท็กแนะนำ */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    หมวดหมู่ <span className="text-rose-500">*</span>
                  </label>
                  <CategoryCombobox
                    value={category}
                    onChange={setCategory}
                    categories={getCategoriesForType(txType)}
                    type={txType}
                    placeholder="เลือกหรือพิมพ์หมวดหมู่..."
                    required
                  />

                  {/* Quick Tags Chips */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(txType === 'EXPENSE'
                      ? POPULAR_EXPENSE_CATEGORIES
                      : txType === 'INCOME'
                      ? POPULAR_INCOME_CATEGORIES
                      : POPULAR_TRANSFER_CATEGORIES
                    ).map((catName) => (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => setCategory(catName)}
                        className={`text-[11px] px-2 py-0.5 rounded-lg border transition cursor-pointer ${
                          category === catName
                            ? txType === 'TRANSFER'
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-800 font-semibold'
                              : 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
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
                    txType === 'EXPENSE'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : txType === 'INCOME'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {submittingTx
                    ? 'กำลังบันทึก...'
                    : txType === 'EXPENSE'
                    ? 'บันทึกรายจ่าย'
                    : txType === 'INCOME'
                    ? 'บันทึกรายรับ'
                    : 'บันทึกการโอนเงิน / ชำระหนี้'}
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
                <button
                  type="button"
                  onClick={() => setTypeFilter('TRANSFER')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    typeFilter === 'TRANSFER' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-indigo-600'
                  }`}
                >
                  โอน/ชำระ
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

              {/* Rows Per Page Selector */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl">
                <span>แสดง:</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>/หน้า</span>
              </div>

              {/* Reset Column Widths Button */}
              <button
                type="button"
                onClick={handleResetColumnWidths}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer"
                title="รีเซ็ตความกว้างของคอลัมน์กลับเป็นค่าเริ่มต้น"
              >
                <RotateCcw className="w-3 h-3 text-slate-500" />
                <span className="hidden sm:inline">รีเซ็ตคอลัมน์</span>
              </button>
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
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                <table
                  className="w-full text-left border-collapse text-xs table-fixed"
                  style={{
                    minWidth: `${Object.values(colWidths).reduce((a, b) => a + b, 0)}px`,
                  }}
                >
                  <colgroup>
                    <col style={{ width: `${colWidths.date}px` }} />
                    <col style={{ width: `${colWidths.category}px` }} />
                    <col style={{ width: `${colWidths.note}px` }} />
                    <col style={{ width: `${colWidths.account}px` }} />
                    <col style={{ width: `${colWidths.amount}px` }} />
                    <col style={{ width: `${colWidths.actions}px` }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px] select-none">
                      {/* Date */}
                      <th className="relative py-3 px-3.5 group">
                        <div className="truncate pr-2">วันที่</div>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('date', e)}
                          className="absolute top-0 right-0 w-2.5 h-full cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600 transition"
                          title="คลิกลากเพื่อปรับขนาดคอลัมน์"
                        />
                      </th>

                      {/* Category */}
                      <th className="relative py-3 px-3 group">
                        <div className="truncate pr-2">หมวดหมู่</div>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('category', e)}
                          className="absolute top-0 right-0 w-2.5 h-full cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600 transition"
                          title="คลิกลากเพื่อปรับขนาดคอลัมน์"
                        />
                      </th>

                      {/* Note */}
                      <th className="relative py-3 px-3 group">
                        <div className="flex items-center justify-between pr-2">
                          <span className="truncate">บันทึกช่วยจำ</span>
                          <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition font-normal hidden sm:inline shrink-0">
                            ⇹ ลากขยาย
                          </span>
                        </div>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('note', e)}
                          className="absolute top-0 right-0 w-2.5 h-full cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600 transition"
                          title="คลิกลากเพื่อปรับขนาดคอลัมน์"
                        />
                      </th>

                      {/* Account */}
                      <th className="relative py-3 px-3 group">
                        <div className="flex items-center justify-between pr-2">
                          <span className="truncate">บัญชีที่ใช้</span>
                          <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition font-normal hidden sm:inline shrink-0">
                            ⇹ ลากขยาย
                          </span>
                        </div>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('account', e)}
                          className="absolute top-0 right-0 w-2.5 h-full cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600 transition"
                          title="คลิกลากเพื่อปรับขนาดคอลัมน์"
                        />
                      </th>

                      {/* Amount */}
                      <th className="relative py-3 px-3 text-right group">
                        <div className="truncate pr-2">จำนวนเงิน</div>
                        <div
                          onMouseDown={(e) => handleMouseDownResize('amount', e)}
                          className="absolute top-0 right-0 w-2.5 h-full cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-600 transition"
                          title="คลิกลากเพื่อปรับขนาดคอลัมน์"
                        />
                      </th>

                      {/* Actions */}
                      <th className="py-3 px-3 text-center">
                        <div className="truncate">จัดการ</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paginatedTransactions.map((tx) => {
                      const typeUpper = String(tx.type || tx.transaction_type || '').toUpperCase();
                      const isIncome = typeUpper === 'INCOME';
                      const isTransfer = typeUpper === 'TRANSFER';
                      const accName = getAccountLabel(tx.account_id);
                      const toAccName = getAccountLabel(tx.to_account_id);

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/80 transition group">
                          <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600">
                            {formatTxDateTime(tx.transaction_date)}
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isTransfer
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : isIncome
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {isTransfer ? (
                                <ArrowRightLeft className="w-2.5 h-2.5" />
                              ) : (
                                <Tag className="w-2.5 h-2.5" />
                              )}
                              <span className="truncate">{tx.category}</span>
                            </span>
                          </td>

                          <td className="py-2.5 px-3 text-slate-600 truncate" title={tx.note || '-'}>
                            {tx.note || <span className="text-slate-300">-</span>}
                          </td>

                          <td className="py-2.5 px-3 text-slate-500">
                            {isTransfer ? (
                              <div className="flex items-center gap-1 text-xs" title={`${accName || 'ไม่ระบุ'} ➔ ${toAccName || 'ไม่ระบุ'}`}>
                                <span className="font-medium text-slate-700 truncate">{accName || 'ไม่ระบุ'}</span>
                                <ArrowRight className="w-3 h-3 text-indigo-500 shrink-0" />
                                <span className="font-medium text-indigo-700 truncate">{toAccName || 'ไม่ระบุ'}</span>
                              </div>
                            ) : accName ? (
                              <span className="font-medium text-slate-700 truncate block" title={accName}>{accName}</span>
                            ) : (
                              <span className="text-slate-300 italic">ไม่ระบุบัญชี</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <span className={`font-bold text-xs sm:text-sm ${isTransfer ? 'text-indigo-600' : isIncome ? 'text-emerald-600' : 'text-slate-900'}`}>
                              {hideValues ? (
                                <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••</span>
                              ) : (
                                `${isTransfer ? '⇄ ' : isIncome ? '+' : '-'}฿${Number(tx.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

              {/* Pagination Controls */}
              {totalRecords > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-600">
                  {/* Status info */}
                  <div className="text-slate-500">
                    แสดง <span className="font-semibold text-slate-800">{startIndex}</span> ถึง{' '}
                    <span className="font-semibold text-slate-800">{endIndex}</span> จากทั้งหมด{' '}
                    <span className="font-semibold text-slate-800">{totalRecords}</span> รายการ
                    {totalPages > 1 && (
                      <span className="ml-1 text-slate-400">(หน้า {safeCurrentPage}/{totalPages})</span>
                    )}
                  </div>

                  {/* Page Navigation Buttons */}
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      {/* First Page */}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(1)}
                        disabled={safeCurrentPage <= 1}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                        title="หน้าแรก"
                      >
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </button>

                      {/* Prev Page */}
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={safeCurrentPage <= 1}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                        title="หน้าก่อนหน้า"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      {/* Page Numbers */}
                      <div className="flex items-center gap-1 mx-1">
                        {getPageNumbers().map((p, idx) => {
                          if (p === '...') {
                            return (
                              <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 select-none">
                                ...
                              </span>
                            );
                          }
                          const isCurrent = p === safeCurrentPage;
                          return (
                            <button
                              key={`page-${p}`}
                              type="button"
                              onClick={() => setCurrentPage(Number(p))}
                              className={`min-w-[28px] h-7 px-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                                isCurrent
                                  ? 'bg-slate-900 text-white shadow-xs'
                                  : 'text-slate-600 hover:bg-slate-100 border border-slate-200'
                              }`}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>

                      {/* Next Page */}
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safeCurrentPage >= totalPages}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                        title="หน้าถัดไป"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>

                      {/* Last Page */}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={safeCurrentPage >= totalPages}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                        title="หน้าสุดท้าย"
                      >
                        <ChevronsRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Modal Pop-up: แก้ไขรายการธุรกรรม */}
      {isEditModalOpen && editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg relative animate-in zoom-in-95 duration-200"
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
                <button
                  type="button"
                  onClick={() => setEditType('TRANSFER')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    editType === 'TRANSFER' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  โอน/ชำระบัตร
                </button>
              </div>

              {/* วันที่ และ บัญชี */}
              <div className="space-y-3">
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

                {editType === 'TRANSFER' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        จากบัญชีต้นทาง (From) <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={editAccountId}
                        onChange={(e) => setEditAccountId(e.target.value)}
                        className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      >
                        <option value="">-- เลือกบัญชีต้นทาง --</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.bank_name ? `[${a.bank_name}] ` : ''}{a.account_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        ไปยังบัญชีปลายทาง (To) <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={editToAccountId}
                        onChange={(e) => setEditToAccountId(e.target.value)}
                        className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      >
                        <option value="">-- เลือกบัญชีปลายทาง --</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.is_liability ? '💳 ' : '🏦 '}
                            {a.bank_name ? `[${a.bank_name}] ` : ''}{a.account_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
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
                )}
              </div>

              {/* หมวดหมู่ */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  หมวดหมู่ <span className="text-rose-500">*</span>
                </label>
                <CategoryCombobox
                  value={editCategory}
                  onChange={setEditCategory}
                  categories={getCategoriesForType(editType)}
                  type={editType}
                  placeholder="เลือกหรือพิมพ์หมวดหมู่..."
                  required
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