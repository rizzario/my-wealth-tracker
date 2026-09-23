'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Landmark,
  CreditCard,
  Wallet,
  Receipt,
  Pencil,
  Trash2,
  Plus,
  X,
  Percent,
  Calendar,
  Eye,
  EyeOff,
  AlertCircle,
  Coins,
  Search,
  LayoutGrid,
  List,
} from 'lucide-react';
import { CURRENCY_OPTIONS, getCurrencySymbol } from '@/lib/currency';

export interface FinancialAccount {
  id: string;
  user_id?: string;
  account_name: string;
  account_type: 'bank' | 'cash' | 'credit_card' | 'loan' | string;
  bank_name?: string | null;
  account_number?: string | null;
  is_liability: boolean;
  current_balance: number;
  credit_limit?: number | null;
  interest_rate?: number | null;
  billing_cycle_day?: number | null;
  payment_due_day?: number | null;
  created_at?: string;
  updated_at?: string;
  currency?: string;
  cost_exchange_rate?: number;
}

interface CashFlowSectionProps {
  onCashFlowUpdated?: () => void;
}

interface AccountFormData {
  account_name: string;
  account_type: string;
  bank_name: string;
  account_number: string;
  current_balance: string;
  credit_limit: string;
  interest_rate: string;
  billing_cycle_day: string;
  payment_due_day: string;
  is_liability: boolean;
  currency: string;
  cost_exchange_rate: string;
}

const initialFormState: AccountFormData = {
  account_name: '',
  account_type: 'bank',
  bank_name: '',
  account_number: '',
  current_balance: '',
  credit_limit: '',
  interest_rate: '',
  billing_cycle_day: '',
  payment_due_day: '',
  is_liability: false,
  currency: 'THB',
  cost_exchange_rate: '',
};

// รายชื่อสถาบันการเงินและธนาคารยอดนิยมในไทย
const THAI_BANKS = [
  'KBank (กสิกรไทย)',
  'SCB (ไทยพาณิชย์)',
  'BBL (กรุงเทพ)',
  'Krungsri (กรุงศรีอยุธยา)',
  'LH Bank (แลนด์ แอนด์ เฮ้าส์)',
  'KTB (กรุงไทย)',
  'TTB (ทหารไทยธนชาต)',
  'KKP (เกียรตินาคินภัทร)',
  'CIMB (ซีไอเอ็มบี ไทย)',
  'TISCO (ทิสโก้)',
  'UOB (ยูโอบี)',
  'GHB (ธนาคารอาคารสงเคราะห์)',
  'GSB (ออมสิน)',
  'BAAC (ธ.ก.ส.)',
  'KTC (เคทีซี)',
  'CardX (คาร์ดเอกซ์)',
  'AEON (อิออน)',
  'First Choice (เฟิร์สช้อยส์)',
  'Lotus\'s (โลตัส มันนี่ พลัส)',
];

export default function CashFlowSection({ onCashFlowUpdated }: CashFlowSectionProps) {
  const supabase = createClient();

  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Form States บัญชี/บัตร (Add & Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [formCategory, setFormCategory] = useState<'asset' | 'liability'>('asset');
  const [formData, setFormData] = useState<AccountFormData>(initialFormState);
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [hideAccountNumbers, setHideAccountNumbers] = useState(true);
  const [hideCashFlow, setHideCashFlow] = useState(false);
  const [fxRates, setFxRates] = useState<Record<string, number>>({ THB: 1.0 });

  // Account Filters & Layout View States (รองรับบัญชีจำนวนมาก 15-20+ บัญชี)
  const [accountFilter, setAccountFilter] = useState<'all' | 'asset' | 'liability'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  useEffect(() => {
    try {
      const savedAcc = localStorage.getItem('hide_cashflow_account_numbers');
      if (savedAcc !== null) {
        setHideAccountNumbers(savedAcc === 'true');
      }
      const savedCashFlow = localStorage.getItem('hide_cashflow_values');
      if (savedCashFlow !== null) {
        setHideCashFlow(savedCashFlow === 'true');
      }
      const savedView = localStorage.getItem('cashflow_account_view_mode');
      if (savedView === 'grid' || savedView === 'table') {
        setViewMode(savedView);
      }
    } catch {
      // ignore
    }
  }, []);

  // ปิด Modal เมื่อกดปุ่ม Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFormOpen) {
        handleCloseForm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFormOpen]);

  const handleToggleViewMode = (mode: 'grid' | 'table') => {
    setViewMode(mode);
    try {
      localStorage.setItem('cashflow_account_view_mode', mode);
    } catch {
      // ignore
    }
  };

  const toggleHideAccountNumbers = () => {
    setHideAccountNumbers((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('hide_cashflow_account_numbers', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const toggleHideCashFlow = () => {
    setHideCashFlow((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('hide_cashflow_values', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // ดึงบัญชีทั้งหมด
  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('*')
        .order('is_liability', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setAccounts((data || []) as FinancialAccount[]);
    } catch (err: any) {
      console.error('Error fetching accounts:', err.message);
    }
  };

  // ดึงอัตราแลกเปลี่ยนปัจจุบันสำหรับ FCD
  const fetchFxRates = async () => {
    try {
      const { data, error } = await supabase
        .from('currency_exchange_rates')
        .select('currency, rate_to_thb');

      if (error) {
        console.warn('Error fetching currency_exchange_rates:', error.message);
        return;
      }
      if (data && data.length > 0) {
        const map: Record<string, number> = { THB: 1.0 };
        for (const item of data) {
          if (item.currency) {
            map[item.currency.toUpperCase()] = Number(item.rate_to_thb);
          }
        }
        setFxRates(map);
      }
    } catch (err: any) {
      console.warn('Error in fetchFxRates:', err?.message);
    }
  };

  useEffect(() => {
    const initLoad = async () => {
      setLoading(true);
      await Promise.all([fetchAccounts(), fetchFxRates()]);
      setLoading(false);
    };
    initLoad();
  }, []);

  // สลับแท็บประเภทบัญชี (สินทรัพย์เงินฝาก vs หนี้สินบัตรเครดิต)
  const handleSwitchFormCategory = (category: 'asset' | 'liability') => {
    setFormCategory(category);
    if (category === 'asset') {
      setFormData((prev) => ({
        ...prev,
        account_type: prev.account_type === 'cash' ? 'cash' : 'bank',
        is_liability: false,
        credit_limit: '',
        billing_cycle_day: '',
        payment_due_day: '',
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        account_type: prev.account_type === 'loan' ? 'loan' : 'credit_card',
        is_liability: true,
        currency: 'THB',
        cost_exchange_rate: '',
      }));
    }
  };

  // เมื่อเปลี่ยนประเภทย่อยในแท็บ
  const handleAccountTypeChange = (newType: string) => {
    const isLiability = newType === 'credit_card' || newType === 'loan';
    setFormCategory(isLiability ? 'liability' : 'asset');
    setFormData((prev) => ({
      ...prev,
      account_type: newType,
      is_liability: isLiability,
      currency: isLiability ? 'THB' : prev.currency,
      cost_exchange_rate: isLiability ? '' : prev.cost_exchange_rate,
    }));
  };

  // เปิดฟอร์มสำหรับเพิ่มบัญชีใหม่
  const handleOpenAddForm = (initialCategory: 'asset' | 'liability' = 'asset') => {
    setEditingAccountId(null);
    setFormCategory(initialCategory);
    setFormData({
      ...initialFormState,
      account_type: initialCategory === 'asset' ? 'bank' : 'credit_card',
      is_liability: initialCategory === 'liability',
      currency: 'THB',
      cost_exchange_rate: '',
    });
    setIsFormOpen(true);
  };

  // เปิดฟอร์มสำหรับแก้ไขบัญชี
  const handleOpenEditForm = (acc: FinancialAccount) => {
    setEditingAccountId(acc.id);
    const isLiability = Boolean(acc.is_liability || acc.account_type === 'credit_card' || acc.account_type === 'loan');
    setFormCategory(isLiability ? 'liability' : 'asset');
    const accCurrency = (acc.currency || 'THB').toUpperCase();
    setFormData({
      account_name: acc.account_name || '',
      account_type: acc.account_type || (isLiability ? 'credit_card' : 'bank'),
      bank_name: acc.bank_name || '',
      account_number: acc.account_number || '',
      current_balance: acc.current_balance != null ? String(acc.current_balance) : '',
      credit_limit: acc.credit_limit != null && acc.credit_limit > 0 ? String(acc.credit_limit) : '',
      interest_rate: acc.interest_rate != null && acc.interest_rate > 0 ? String(acc.interest_rate) : '',
      billing_cycle_day: acc.billing_cycle_day != null ? String(acc.billing_cycle_day) : '',
      payment_due_day: acc.payment_due_day != null ? String(acc.payment_due_day) : '',
      is_liability: isLiability,
      currency: accCurrency,
      cost_exchange_rate: acc.cost_exchange_rate != null && accCurrency !== 'THB' ? String(acc.cost_exchange_rate) : '',
    });
    setIsFormOpen(true);
  };

  // ปิดฟอร์ม
  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingAccountId(null);
    setFormData(initialFormState);
    setFormCategory('asset');
  };

  // บันทึกสร้าง / แก้ไขบัญชี
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmittingAccount(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้');

      const isLiability = formCategory === 'liability';
      const balanceNum = parseFloat(formData.current_balance) || 0;
      const creditLimitNum = isLiability && formData.credit_limit ? parseFloat(formData.credit_limit) : 0;
      const interestRateNum = formData.interest_rate ? parseFloat(formData.interest_rate) : 0;
      const billingCycleDay = isLiability && formData.billing_cycle_day ? parseInt(formData.billing_cycle_day, 10) : null;
      const paymentDueDay = isLiability && formData.payment_due_day ? parseInt(formData.payment_due_day, 10) : null;

      const currencyUpper = isLiability ? 'THB' : (formData.currency || 'THB').toUpperCase();
      let finalCostFxRate = 1.0;

      if (!isLiability && currencyUpper !== 'THB') {
        const userProvidedRate = parseFloat(formData.cost_exchange_rate);
        if (!isNaN(userProvidedRate) && userProvidedRate > 0) {
          finalCostFxRate = userProvidedRate;
        } else {
          if (fxRates[currencyUpper] && fxRates[currencyUpper] > 0) {
            finalCostFxRate = fxRates[currencyUpper];
          } else {
            const { data: rateRow } = await supabase
              .from('currency_exchange_rates')
              .select('rate_to_thb')
              .eq('currency', currencyUpper)
              .maybeSingle();

            if (rateRow && Number(rateRow.rate_to_thb) > 0) {
              finalCostFxRate = Number(rateRow.rate_to_thb);
            }
          }
        }
      }

      const payload = {
        user_id: user.id,
        account_name: formData.account_name.trim(),
        account_type: formData.account_type,
        bank_name: formData.bank_name.trim() || null,
        account_number: formData.account_number.trim() || null,
        is_liability: isLiability,
        current_balance: balanceNum,
        credit_limit: creditLimitNum,
        interest_rate: interestRateNum,
        billing_cycle_day: billingCycleDay,
        payment_due_day: paymentDueDay,
        currency: currencyUpper,
        cost_exchange_rate: finalCostFxRate,
        updated_at: new Date().toISOString(),
      };

      if (editingAccountId) {
        const { error } = await supabase
          .from('financial_accounts')
          .update(payload)
          .eq('id', editingAccountId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('financial_accounts')
          .insert(payload);

        if (error) throw error;
      }

      handleCloseForm();
      await fetchAccounts();
      onCashFlowUpdated?.();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการบันทึกบัญชี: ' + err.message);
    } finally {
      setSubmittingAccount(false);
    }
  };

  // ลบบัญชี
  const handleDeleteAccount = async (id: string, name: string) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบบัญชี "${name}"?`)) return;
    try {
      const { error } = await supabase
        .from('financial_accounts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      if (editingAccountId === id) {
        handleCloseForm();
      }

      await fetchAccounts();
      onCashFlowUpdated?.();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการลบบัญชี: ' + err.message);
    }
  };

  // Helper สำหรับจัดรูปแบบเลขบัญชี
  const formatAccountNumber = (accNo: string | null | undefined) => {
    if (!accNo) return null;
    if (!hideAccountNumbers) return accNo;
    if (accNo.length <= 4) return `•••• ${accNo}`;
    const lastFour = accNo.slice(-4);
    return `••••-••••-${lastFour}`;
  };

  // Helper สำหรับจัดรูปแบบตัวเลขยอดเงิน (คำนึงถึง Privacy Mode)
  const formatMoney = (
    amount: number | null | undefined,
    options?: { minimumFractionDigits?: number; maximumFractionDigits?: number; prefix?: string; mask?: string }
  ) => {
    if (hideCashFlow) {
      return options?.mask ?? '฿••••••••';
    }
    const val = Number(amount ?? 0);
    const formatted = val.toLocaleString('th-TH', {
      minimumFractionDigits: options?.minimumFractionDigits ?? 2,
      maximumFractionDigits: options?.maximumFractionDigits ?? 2,
    });
    return `${options?.prefix ?? '฿'}${formatted}`;
  };

  // Helper ดึงไอคอนและสไตล์ตามประเภทบัญชี
  const getAccountTypeMeta = (type: string) => {
    switch (type) {
      case 'credit_card':
        return {
          name: 'บัตรเครดิต',
          icon: <CreditCard className="w-4 h-4 text-purple-600" />,
          bgColor: 'bg-purple-50 text-purple-700',
        };
      case 'loan':
        return {
          name: 'สินเชื่อ / ผ่อนชำระ',
          icon: <Receipt className="w-4 h-4 text-amber-600" />,
          bgColor: 'bg-amber-50 text-amber-700',
        };
      case 'cash':
        return {
          name: 'เงินสด',
          icon: <Wallet className="w-4 h-4 text-emerald-600" />,
          bgColor: 'bg-emerald-50 text-emerald-700',
        };
      case 'bank':
      default:
        return {
          name: 'บัญชีธนาคาร',
          icon: <Landmark className="w-4 h-4 text-sky-600" />,
          bgColor: 'bg-sky-50 text-sky-700',
        };
    }
  };

  // Helper แปลงยอดเงินในบัญชีเป็น THB (สำหรับ FCD และบัญชีต่างประเทศ)
  const getAccountBalanceInThb = (acc: FinancialAccount) => {
    const raw = Number(acc.current_balance || 0);
    const curr = (acc.currency || 'THB').toUpperCase();
    if (curr === 'THB') return raw;
    const rate = Number(acc.cost_exchange_rate || fxRates[curr] || 1.0);
    return raw * rate;
  };

  // คำนวณยอดสรุป (แปลงเป็น THB ตามสูตร Net Worth)
  const totalAssets = accounts
    .filter((a) => !a.is_liability)
    .reduce((sum, a) => sum + getAccountBalanceInThb(a), 0);

  const totalLiabilities = accounts
    .filter((a) => a.is_liability)
    .reduce((sum, a) => sum + getAccountBalanceInThb(a), 0);

  const netBalance = totalAssets - totalLiabilities;

  // จำนวนบัญชีแต่ละประเภท
  const assetAccountsCount = useMemo(() => accounts.filter((a) => !a.is_liability).length, [accounts]);
  const liabilityAccountsCount = useMemo(() => accounts.filter((a) => a.is_liability).length, [accounts]);

  // บัญชีที่ผ่านการกรองตามแท็บและคำค้นหา
  const filteredAccounts = useMemo(() => {
    let list = accounts;

    if (accountFilter === 'asset') {
      list = list.filter((a) => !a.is_liability);
    } else if (accountFilter === 'liability') {
      list = list.filter((a) => a.is_liability);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.account_name.toLowerCase().includes(q) ||
          (a.bank_name && a.bank_name.toLowerCase().includes(q)) ||
          (a.account_number && a.account_number.toLowerCase().includes(q)) ||
          (a.currency && a.currency.toLowerCase().includes(q))
      );
    }

    return list;
  }, [accounts, accountFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* หัวข้อหน้า */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
              จัดการกระแสเงินสด & บัญชี (Cash Flow)
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              ติดตามยอดเงินฝาก สภาพคล่องพร้อมใช้ บัญชีเงินตราต่างประเทศ (FCD) บัตรเครดิต และภาระหนี้สิน
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* ปุ่มซ่อน/แสดงกระแสเงินสด */}
            <button
              type="button"
              onClick={toggleHideCashFlow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition shadow-xs cursor-pointer"
              title={hideCashFlow ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'}
            >
              {hideCashFlow ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{hideCashFlow ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'}</span>
            </button>

            {/* ปุ่มซ่อน/แสดงเลขที่บัญชี */}
            <button
              type="button"
              onClick={toggleHideAccountNumbers}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition shadow-xs cursor-pointer"
              title={hideAccountNumbers ? 'แสดงเลขบัญชีเต็ม' : 'ซ่อนเลขที่บัญชี'}
            >
              {hideAccountNumbers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{hideAccountNumbers ? 'แสดงเลขบัญชี' : 'ซ่อนเลขบัญชี'}</span>
            </button>
          </div>
        </div>

        {/* ส่วนแสดงบัญชีและบัตรทั้งหมด */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
          {/* แถบด้านบนของกล่องบัญชี */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-800">บัญชีและบัตรทั้งหมด</h2>
              <span className="px-2 py-0.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-full">
                {accounts.length} บัญชี
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => handleOpenAddForm('asset')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition shadow-xs bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มบัญชีเงินฝาก</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenAddForm('liability')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition shadow-xs bg-purple-600 text-white hover:bg-purple-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มบัตร/สินเชื่อ</span>
              </button>
            </div>
          </div>

          {/* Quick Summary Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                สินทรัพย์คล่องมือ (Liquid Assets)
              </p>
              <p className="text-base sm:text-lg font-bold text-slate-800 mt-1">
                {formatMoney(totalAssets)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                หนี้สินบัตร / สินเชื่อ (Liabilities)
              </p>
              <p className="text-base sm:text-lg font-bold text-rose-600 mt-1">
                {formatMoney(totalLiabilities)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-500 inline-block"></span>
                ยอดสุทธิ (Net Liquid Balance)
              </p>
              <p className={`text-base sm:text-lg font-bold mt-1 ${netBalance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {formatMoney(netBalance)}
              </p>
            </div>
          </div>

          {/* Controls Bar: แท็บกรองประเภทบัญชี, ช่องค้นหา, และปุ่มสลับมุมมอง การ์ด/ตาราง */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold overflow-x-auto">
              <button
                type="button"
                onClick={() => setAccountFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  accountFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ทั้งหมด ({accounts.length})
              </button>
              <button
                type="button"
                onClick={() => setAccountFilter('asset')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  accountFilter === 'asset'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                <Landmark className="w-3.5 h-3.5 text-emerald-600" />
                <span>เงินฝาก & เงินสด ({assetAccountsCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setAccountFilter('liability')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  accountFilter === 'liability'
                    ? 'bg-white text-purple-800 shadow-xs'
                    : 'text-slate-600 hover:text-purple-700'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                <span>บัตร & สินเชื่อ ({liabilityAccountsCount})</span>
              </button>
            </div>

            {/* Search Bar & View Mode Toggle */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-60">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อบัญชี, ธนาคาร..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-100/90 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
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

              <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleViewMode('grid')}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="มุมมองการ์ด (Grid View)"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleViewMode('table')}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="มุมมองตารางย่อ (Compact Table View)"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ตารางแสดงการ์ดบัญชี / มุมมองตาราง */}
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              กำลังโหลดข้อมูลบัญชี...
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-medium">ยังไม่มีบัญชีการเงินในระบบ</p>
              <p className="text-xs text-slate-400">กดปุ่ม "+ เพิ่มบัญชีเงินฝาก" หรือ "+ เพิ่มบัตร/สินเชื่อ" ด้านบนเพื่อเริ่มต้นติดตามยอดเงิน</p>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Search className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-medium text-slate-600">ไม่พบบัญชีที่ตรงกับเงื่อนไขการค้นหา</p>
              <p className="text-xs text-slate-400">ลองค้นหาด้วยคำอื่น หรือสลับแท็บประเภทบัญชี</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setAccountFilter('all');
                }}
                className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-semibold underline cursor-pointer"
              >
                ล้างตัวกรองและคำค้นหา
              </button>
            </div>
          ) : viewMode === 'table' ? (
            /* Compact Table View สำหรับจัดการบัญชีจำนวนมาก 15-20+ บัญชี */
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                    <th className="py-3 px-3.5">บัญชี / สถาบันการเงิน</th>
                    <th className="py-3 px-3">ประเภท</th>
                    <th className="py-3 px-3 text-right">ยอดคงเหลือ / ค้างชำระ</th>
                    <th className="py-3 px-3">วงเงิน / ดอกเบี้ย / รอบบิล</th>
                    <th className="py-3 px-3 text-center w-20">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredAccounts.map((acc) => {
                    const meta = getAccountTypeMeta(acc.account_type);
                    const isDebt = acc.is_liability;
                    const creditLimitNum = Number(acc.credit_limit || 0);
                    const balanceNum = Number(acc.current_balance || 0);
                    const interestRateNum = Number(acc.interest_rate || 0);
                    const accCurrency = (acc.currency || 'THB').toUpperCase();
                    const isForeign = accCurrency !== 'THB';
                    const fxRate = Number(acc.cost_exchange_rate || fxRates[accCurrency] || 1.0);
                    const balanceThb = balanceNum * fxRate;

                    const hasCreditLimit = creditLimitNum > 0;
                    const remainingCredit = Math.max(0, creditLimitNum - balanceNum);
                    const usagePercent = hasCreditLimit ? Math.min(100, Math.max(0, (balanceNum / creditLimitNum) * 100)) : 0;
                    const usageBarColor = usagePercent > 80 ? 'bg-rose-500' : usagePercent > 50 ? 'bg-amber-500' : 'bg-emerald-500';

                    return (
                      <tr key={acc.id} className="hover:bg-slate-50/80 transition group">
                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className={`p-1.5 rounded-lg shrink-0 ${meta.bgColor}`}>
                              {meta.icon}
                            </span>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-800 text-xs sm:text-sm truncate" title={acc.account_name}>
                                {acc.account_name}
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                                {acc.bank_name && (
                                  <span className="font-medium text-slate-600 truncate max-w-[130px]" title={acc.bank_name}>
                                    {acc.bank_name}
                                  </span>
                                )}
                                {acc.bank_name && acc.account_number && <span>•</span>}
                                {acc.account_number && (
                                  <span className="font-mono">{formatAccountNumber(acc.account_number)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isDebt ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {isDebt ? 'หนี้สิน' : 'สินทรัพย์'}
                            </span>
                            {isForeign && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                FCD {accCurrency}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className={`font-bold text-xs sm:text-sm ${isDebt ? 'text-rose-600' : 'text-slate-900'}`}>
                            {hideCashFlow
                              ? `${accCurrency === 'THB' ? '฿' : getCurrencySymbol(accCurrency)}••••••••`
                              : `${getCurrencySymbol(accCurrency)}${balanceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </div>
                          {isForeign && (
                            <div className="text-[11px] font-medium text-slate-400 mt-0.5">
                              {hideCashFlow ? '≈ ฿••••••' : `≈ ฿${balanceThb.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="space-y-1 max-w-[200px]">
                            {hasCreditLimit && (
                              <div>
                                <div className="flex justify-between items-center text-[10px] text-slate-500 mb-0.5">
                                  <span>ใช้วงเงิน {hideCashFlow ? '••%' : `${usagePercent.toFixed(0)}%`}</span>
                                  <span className="text-slate-400">
                                    {formatMoney(remainingCredit, { minimumFractionDigits: 0, maximumFractionDigits: 0, mask: '฿••••' })}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${usageBarColor}`} style={{ width: `${usagePercent}%` }} />
                                </div>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1 items-center">
                              {interestRateNum > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 bg-indigo-50 rounded border border-indigo-100">
                                  <Percent className="w-2.5 h-2.5" />
                                  {interestRateNum.toFixed(2)}%
                                </span>
                              )}
                              {(acc.billing_cycle_day || acc.payment_due_day) && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-slate-500 bg-slate-100 rounded">
                                  <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                  {acc.billing_cycle_day ? `ตัดรอบ ${acc.billing_cycle_day}` : ''}
                                  {acc.billing_cycle_day && acc.payment_due_day ? ' • ' : ''}
                                  {acc.payment_due_day ? `จ่าย ${acc.payment_due_day}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditForm(acc)}
                              className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition cursor-pointer"
                              title="แก้ไขข้อมูล"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAccount(acc.id, acc.account_name)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="ลบบัญชีนี้"
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
          ) : (
            /* Grid View: การ์ดแต่ละบัญชี */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {filteredAccounts.map((acc) => {
                const meta = getAccountTypeMeta(acc.account_type);
                const isDebt = acc.is_liability;
                const creditLimitNum = Number(acc.credit_limit || 0);
                const balanceNum = Number(acc.current_balance || 0);
                const interestRateNum = Number(acc.interest_rate || 0);
                const accCurrency = (acc.currency || 'THB').toUpperCase();
                const isForeign = accCurrency !== 'THB';
                const fxRate = Number(acc.cost_exchange_rate || fxRates[accCurrency] || 1.0);
                const balanceThb = balanceNum * fxRate;

                // คำนวณ % วงเงินที่ใช้ไป สำหรับบัตร/สินเชื่อ
                const hasCreditLimit = creditLimitNum > 0;
                const remainingCredit = Math.max(0, creditLimitNum - balanceNum);
                const usagePercent = hasCreditLimit ? Math.min(100, Math.max(0, (balanceNum / creditLimitNum) * 100)) : 0;
                const usageBarColor = usagePercent > 80 ? 'bg-rose-500' : usagePercent > 50 ? 'bg-amber-500' : 'bg-emerald-500';

                return (
                  <div
                    key={acc.id}
                    className={`p-4 rounded-2xl border transition-all duration-200 hover:shadow-md relative group flex flex-col justify-between ${
                      isDebt
                        ? 'border-rose-100 bg-white hover:border-rose-200'
                        : 'border-slate-200/80 bg-white hover:border-emerald-200'
                    }`}
                  >
                    <div>
                      {/* แถวบน: ไอคอนประเภท, ธนาคาร, ป้ายสินทรัพย์/หนี้สิน, ปุ่มจัดการ */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`p-1.5 rounded-lg ${meta.bgColor}`}>
                            {meta.icon}
                          </span>
                          {acc.bank_name && (
                            <span className="px-2 py-0.5 text-[11px] font-semibold text-slate-700 bg-slate-100 rounded-md truncate max-w-[110px]" title={acc.bank_name}>
                              {acc.bank_name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {isForeign && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              FCD {accCurrency}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isDebt ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {isDebt ? 'หนี้สิน' : 'สินทรัพย์'}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleOpenEditForm(acc)}
                            className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition cursor-pointer"
                            title="แก้ไขข้อมูล"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAccount(acc.id, acc.account_name)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="ลบบัญชีนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* ชื่อบัญชี & เลขที่บัญชี */}
                      <div>
                        <div className="font-semibold text-slate-800 text-sm truncate" title={acc.account_name}>
                          {acc.account_name}
                        </div>
                        {acc.account_number && (
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {formatAccountNumber(acc.account_number)}
                          </div>
                        )}
                      </div>

                      {/* ยอดเงินคงเหลือ / ค้างชำระ */}
                      <div className="mt-2.5">
                        <span className="text-[11px] text-slate-400 block">
                          {isDebt ? 'ยอดค้างชำระ / ใช้ไป' : isForeign ? `ยอดคงเหลือ (${accCurrency})` : 'ยอดเงินคงเหลือ'}
                        </span>
                        <div
                          className={`text-lg font-bold tracking-tight ${
                            isDebt ? 'text-rose-600' : 'text-slate-900'
                          }`}
                        >
                          {hideCashFlow
                            ? `${accCurrency === 'THB' ? '฿' : getCurrencySymbol(accCurrency)}••••••••`
                            : `${getCurrencySymbol(accCurrency)}${balanceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </div>
                        {isForeign && (
                          <div className="text-xs font-medium text-slate-500 mt-0.5">
                            {hideCashFlow
                              ? '≈ ฿••••••'
                              : `≈ ฿${balanceThb.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            <span className="text-[10px] text-slate-400 ml-1.5 font-mono">
                              (@{fxRate.toFixed(4)})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* รายละเอียดเพิ่มเติม: วงเงิน, ดอกเบี้ย, รอบบิล */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-2">
                      {/* แถบความคืบหน้าวงเงิน (ถ้ามีระบุ credit_limit) */}
                      {hasCreditLimit && (
                        <div>
                          <div className="flex justify-between items-center text-[11px] text-slate-500 mb-1">
                            <span>วงเงินที่ใช้ ({hideCashFlow ? '••%' : `${usagePercent.toFixed(0)}%`})</span>
                            <span className="font-medium text-slate-700">
                              เหลือ {formatMoney(remainingCredit, { minimumFractionDigits: 0, maximumFractionDigits: 0, mask: '฿••••••' })}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${usageBarColor}`}
                              style={{ width: `${usagePercent}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                            <span>ใช้: {formatMoney(balanceNum, { minimumFractionDigits: 0, maximumFractionDigits: 0, mask: '฿••••••' })}</span>
                            <span>เต็ม: {formatMoney(creditLimitNum, { minimumFractionDigits: 0, maximumFractionDigits: 0, mask: '฿••••••' })}</span>
                          </div>
                        </div>
                      )}

                      {/* Badges ข้อมูลดอกเบี้ย และรอบบิล */}
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {interestRateNum > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 rounded-md border border-indigo-100">
                            <Percent className="w-2.5 h-2.5" />
                            <span>{interestRateNum.toFixed(2)}% ต่อปี</span>
                          </span>
                        )}

                        {(acc.billing_cycle_day || acc.payment_due_day) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 bg-slate-100 rounded-md">
                            <Calendar className="w-2.5 h-2.5 text-slate-400" />
                            <span>
                              {acc.billing_cycle_day ? `ตัดรอบ ${acc.billing_cycle_day}` : ''}
                              {acc.billing_cycle_day && acc.payment_due_day ? ' • ' : ''}
                              {acc.payment_due_day ? `จ่าย ${acc.payment_due_day}` : ''}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Datalist สถาบันการเงินยอดนิยม */}
      <datalist id="thai-banks-list">
        {THAI_BANKS.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>

      {/* Modal Pop-up Form สำหรับ เพิ่ม / แก้ไขบัญชีการเงิน */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${formCategory === 'liability' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {formCategory === 'liability' ? <CreditCard className="w-5 h-5" /> : <Landmark className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-800">
                    {editingAccountId ? 'แก้ไขข้อมูลบัญชี' : 'เพิ่มบัญชีการเงินใหม่'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {formCategory === 'liability' ? 'บัตรเครดิต / สินเชื่อหมุนเวียน' : 'บัญชีเงินฝากธนาคาร / เงินสด'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseForm}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                title="ปิดหน้าต่าง (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body & Form */}
            <form onSubmit={handleSaveAccount} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto space-y-5">
                {/* 1. สลับประเภทบัญชีหลัก (สินทรัพย์ vs หนี้สิน) */}
                <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => handleSwitchFormCategory('asset')}
                    className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                      formCategory === 'asset'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-600 hover:text-emerald-700'
                    }`}
                  >
                    <Landmark className="w-4 h-4 text-emerald-600" />
                    <span>บัญชีเงินฝาก & เงินสด (Assets)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchFormCategory('liability')}
                    className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                      formCategory === 'liability'
                        ? 'bg-white text-purple-800 shadow-xs'
                        : 'text-slate-600 hover:text-purple-700'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-purple-600" />
                    <span>บัตรเครดิต & สินเชื่อ (Liabilities)</span>
                  </button>
                </div>

                {/* 2. ฟอร์มสำหรับกลุ่มสินทรัพย์ (เงินฝาก / เงินสด) */}
                {formCategory === 'asset' && (
                  <div className="space-y-4">
                    {/* ตัวเลือก ประเภทย่อย: ธนาคาร หรือ เงินสด */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        ประเภทย่อย <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleAccountTypeChange('bank')}
                          className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                            formData.account_type === 'bank'
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Landmark className="w-3.5 h-3.5 text-sky-600" />
                          <span>บัญชีธนาคาร</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAccountTypeChange('cash')}
                          className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                            formData.account_type === 'cash'
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                          <span>เงินสด (Cash)</span>
                        </button>
                      </div>
                    </div>

                    {/* ชื่อบัญชี & สถาบันการเงิน */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          ชื่อบัญชี <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.account_name}
                          onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                          placeholder="เช่น ออมทรัพย์ K-eSavings, เงินสดฉุกเฉิน"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                        />
                      </div>

                      {formData.account_type === 'bank' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            ธนาคาร / สถาบันการเงิน
                          </label>
                          <input
                            type="text"
                            list="thai-banks-list"
                            value={formData.bank_name}
                            onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                            placeholder="พิมพ์เพื่อเลือกหรือระบุเอง เช่น KBank"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                          />
                        </div>
                      )}
                    </div>

                    {/* เลขที่บัญชี (ถ้ามี) */}
                    {formData.account_type === 'bank' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          เลขที่บัญชี (ถ้ามี)
                        </label>
                        <input
                          type="text"
                          value={formData.account_number}
                          onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                          placeholder="เช่น 123-4-56789-0 หรือ 4 ตัวท้าย"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                        />
                      </div>
                    )}

                    {/* สกุลเงิน (Currency) & อัตราแลกเปลี่ยนเริ่มต้น (Initial Exchange Rate) */}
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                            <Coins className="w-3.5 h-3.5 text-amber-600" />
                            <span>สกุลเงิน (Currency)</span>
                          </label>
                          <select
                            value={formData.currency}
                            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium"
                          >
                            {CURRENCY_OPTIONS.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.symbol} {c.code} - {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {formData.currency !== 'THB' && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              อัตราแลกเปลี่ยนเริ่มต้น (FX Rate to THB)
                            </label>
                            <input
                              type="number"
                              step="0.0001"
                              value={formData.cost_exchange_rate}
                              onChange={(e) => setFormData({ ...formData, cost_exchange_rate: e.target.value })}
                              placeholder={`เช่น ${fxRates[formData.currency] ? fxRates[formData.currency].toFixed(4) : '34.50'}`}
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">
                              * หากเว้นว่าง ระบบจะใช้อัตราปัจจุบัน (1 {formData.currency} = {fxRates[formData.currency] ? fxRates[formData.currency].toFixed(4) : '...'} THB)
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ยอดเงินคงเหลือ & อัตราดอกเบี้ย */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          ยอดเงินคงเหลือ ({formData.currency}) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={formData.current_balance}
                          onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                          placeholder="0.00"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-semibold"
                        />
                        {formData.currency !== 'THB' && formData.current_balance && (
                          <p className="text-xs text-slate-500 mt-1">
                            ≈ ฿{((parseFloat(formData.current_balance) || 0) * (parseFloat(formData.cost_exchange_rate) || fxRates[formData.currency] || 1.0)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          อัตราดอกเบี้ย (% ต่อปี)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.interest_rate}
                          onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                          placeholder="เช่น 1.50"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. ฟอร์มสำหรับกลุ่มหนี้สิน (บัตรเครดิต / สินเชื่อ) */}
                {formCategory === 'liability' && (
                  <div className="space-y-4">
                    {/* ประเภทย่อย: บัตรเครดิต หรือ สินเชื่อ */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        ประเภทย่อย <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleAccountTypeChange('credit_card')}
                          className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                            formData.account_type === 'credit_card'
                              ? 'border-purple-500 bg-purple-50 text-purple-900 ring-1 ring-purple-500'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                          <span>บัตรเครดิต (Credit Card)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAccountTypeChange('loan')}
                          className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                            formData.account_type === 'loan'
                              ? 'border-purple-500 bg-purple-50 text-purple-900 ring-1 ring-purple-500'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Receipt className="w-3.5 h-3.5 text-amber-600" />
                          <span>สินเชื่อ / กู้ยืม (Loan)</span>
                        </button>
                      </div>
                    </div>

                    {/* ชื่อบัตร / สินเชื่อ & ผู้ออกบัตร */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          ชื่อบัตร / สินเชื่อ <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.account_name}
                          onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                          placeholder="เช่น KBank Passion, Krungsri NOW"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          สถาบันการเงิน / ผู้ออกบัตร
                        </label>
                        <input
                          type="text"
                          list="thai-banks-list"
                          value={formData.bank_name}
                          onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                          placeholder="พิมพ์เพื่อเลือก เช่น KBank, KTC"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                        />
                      </div>
                    </div>

                    {/* เลขบัตร 4 ตัวท้าย */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        เลขบัตร / เลขสัญญา (ระบุ 4 ตัวท้าย)
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        value={formData.account_number}
                        onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                        placeholder="เช่น 1234"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white font-mono"
                      />
                    </div>

                    {/* ยอดค้างชำระ & วงเงิน */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          ยอดค้างชำระ / ใช้ไปแล้ว (บาท) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={formData.current_balance}
                          onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                          placeholder="0.00"
                          className="w-full px-3 py-2 text-sm border border-rose-300 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 bg-white font-semibold text-rose-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          วงเงินรวม (Credit Limit)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.credit_limit}
                          onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                          placeholder="เช่น 100000"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                        />
                      </div>
                    </div>

                    {/* ดอกเบี้ย, วันตัดรอบ, วันครบกำหนดชำระ */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          อัตราดอกเบี้ย (% ต่อปี)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.interest_rate}
                          onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                          placeholder="เช่น 16.00"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          วันสรุปยอด (รอบบิล วันที่)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={formData.billing_cycle_day}
                          onChange={(e) => setFormData({ ...formData, billing_cycle_day: e.target.value })}
                          placeholder="1 - 31"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          วันครบกำหนดชำระ (วันที่)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={formData.payment_due_day}
                          onChange={(e) => setFormData({ ...formData, payment_due_day: e.target.value })}
                          placeholder="1 - 31"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submittingAccount}
                  className={`px-5 py-2 text-xs sm:text-sm font-semibold text-white rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer ${
                    formCategory === 'liability'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {submittingAccount
                    ? 'กำลังบันทึก...'
                    : editingAccountId
                    ? 'บันทึกการแก้ไข'
                    : formCategory === 'liability'
                    ? 'เพิ่มบัตร/สินเชื่อ'
                    : 'เพิ่มบัญชีเงินฝาก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
