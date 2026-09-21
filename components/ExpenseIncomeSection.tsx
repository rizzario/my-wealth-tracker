'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';

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
}

interface FinancialTransactionProps {
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
};

// รายชื่อสถาบันการเงินและธนาคารยอดนิยมในไทย
const THAI_BANKS = [
  'KBank (กสิกรไทย)',
  'SCB (ไทยพาณิชย์)',
  'BBL (กรุงเทพ)',
  'Krungsri (กรุงศรีอยุธยา)',
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

export default function CashflowPage({ onCashFlowUpdated }: FinancialTransactionProps) {
  const supabase = createClient();

  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form States บัญชี/บัตร (Add & Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AccountFormData>(initialFormState);
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [hideAccountNumbers, setHideAccountNumbers] = useState(true);
  const [hideCashFlow, setHideCashFlow] = useState(false);

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
    } catch {
      // ignore
    }
  }, []);

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

  // Form States บันทึกรายการ Transaction
  const [txType, setTxType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [category, setCategory] = useState('อาหาร');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submittingTx, setSubmittingTx] = useState(false);

  // ดึงบัญชีทั้งหมด
  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('*')
        .order('is_liability', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      const accountList = (data || []) as FinancialAccount[];
      setAccounts(accountList);
      if (accountList.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accountList[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching accounts:', err.message);
    }
  };

  // ดึงรายการธุรกรรมล่าสุด
  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('expense_income_transactions')
        .select('*')
        .order('transaction_date', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching transactions:', error.message);
        return;
      }
      setTransactions(data || []);
    } catch (err: any) {
      console.error('Error in fetchTransactions:', err.message);
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

  // เมื่อเปลี่ยนประเภทบัญชีในฟอร์ม ปรับสถานะ is_liability อัตโนมัติ
  const handleAccountTypeChange = (newType: string) => {
    const isLiability = newType === 'credit_card' || newType === 'loan';
    setFormData((prev) => ({
      ...prev,
      account_type: newType,
      is_liability: isLiability,
    }));
  };

  // เปิดฟอร์มสำหรับเพิ่มบัญชีใหม่
  const handleOpenAddForm = () => {
    setEditingAccountId(null);
    setFormData(initialFormState);
    setIsFormOpen(true);
  };

  // เปิดฟอร์มสำหรับแก้ไขบัญชี
  const handleOpenEditForm = (acc: FinancialAccount) => {
    setEditingAccountId(acc.id);
    setFormData({
      account_name: acc.account_name || '',
      account_type: acc.account_type || 'bank',
      bank_name: acc.bank_name || '',
      account_number: acc.account_number || '',
      current_balance: acc.current_balance != null ? String(acc.current_balance) : '',
      credit_limit: acc.credit_limit != null && acc.credit_limit > 0 ? String(acc.credit_limit) : '',
      interest_rate: acc.interest_rate != null && acc.interest_rate > 0 ? String(acc.interest_rate) : '',
      billing_cycle_day: acc.billing_cycle_day != null ? String(acc.billing_cycle_day) : '',
      payment_due_day: acc.payment_due_day != null ? String(acc.payment_due_day) : '',
      is_liability: acc.is_liability ?? false,
    });
    setIsFormOpen(true);
  };

  // ปิดฟอร์ม
  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingAccountId(null);
    setFormData(initialFormState);
  };

  // บันทึกสร้าง / แก้ไขบัญชี
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmittingAccount(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้');

      const balanceNum = parseFloat(formData.current_balance) || 0;
      const creditLimitNum = formData.credit_limit ? parseFloat(formData.credit_limit) : 0;
      const interestRateNum = formData.interest_rate ? parseFloat(formData.interest_rate) : 0;
      const billingCycleDay = formData.billing_cycle_day ? parseInt(formData.billing_cycle_day, 10) : null;
      const paymentDueDay = formData.payment_due_day ? parseInt(formData.payment_due_day, 10) : null;

      const payload = {
        user_id: user.id,
        account_name: formData.account_name.trim(),
        account_type: formData.account_type,
        bank_name: formData.bank_name.trim() || null,
        account_number: formData.account_number.trim() || null,
        is_liability: formData.is_liability,
        current_balance: balanceNum,
        credit_limit: creditLimitNum,
        interest_rate: interestRateNum,
        billing_cycle_day: billingCycleDay,
        payment_due_day: paymentDueDay,
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

      if (selectedAccountId === id) {
        setSelectedAccountId('');
      }
      if (editingAccountId === id) {
        handleCloseForm();
      }

      await fetchAccounts();
      onCashFlowUpdated?.();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการลบบัญชี: ' + err.message);
    }
  };

  // บันทึกรายการ Transaction
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) {
      alert('กรุณาเลือกบัญชีที่ใช้ทำรายการ');
      return;
    }

    try {
      setSubmittingTx(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้');

      const payload: any = {
        user_id: user.id,
        account_id: selectedAccountId,
        type: txType,
        transaction_type: txType.toLowerCase(),
        category,
        amount: parseFloat(amount) || 0,
        note,
        transaction_date: new Date().toISOString().split('T')[0],
      };

      const { error } = await supabase.from('expense_income_transactions').insert(payload);

      if (error) throw error;

      setAmount('');
      setNote('');
      await Promise.all([fetchAccounts(), fetchTransactions()]);
      onCashFlowUpdated?.();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmittingTx(false);
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

  // Helper สำหรับจัดรูปแบบตัวเลขยอดเงิน (คำนึงถึง Privacy Mode กระแสเงินสด)
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

  // คำนวณยอดสรุป
  const totalAssets = accounts
    .filter((a) => !a.is_liability)
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

  const totalLiabilities = accounts
    .filter((a) => a.is_liability)
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

  const netBalance = totalAssets - totalLiabilities;

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
              บันทึกรายรับ-รายจ่าย พร้อมติดตามยอดคงเหลือ บัตรเครดิต และสินเชื่อหมุนเวียน
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* ปุ่มซ่อน/แสดงกระแสเงินสด */}
            <button
              type="button"
              onClick={toggleHideCashFlow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition shadow-xs cursor-pointer"
              title={hideCashFlow ? 'แสดงยอดเงินกระแสเงินสด' : 'ซ่อนยอดเงินกระแสเงินสด'}
            >
              {hideCashFlow ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{hideCashFlow ? 'แสดงกระแสเงินสด' : 'ซ่อนกระแสเงินสด'}</span>
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

        {/* 1. ส่วนแสดงบัญชีและบัตรทั้งหมด */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
          {/* แถบด้านบนของกล่องบัญชี */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-800">บัญชีและบัตรทั้งหมด</h2>
              <span className="px-2 py-0.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-full">
                {accounts.length} บัญชี
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (isFormOpen) {
                  handleCloseForm();
                } else {
                  handleOpenAddForm();
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition shadow-xs ${
                isFormOpen
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isFormOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{isFormOpen ? 'ยกเลิก' : 'เพิ่มบัญชี/บัตร'}</span>
            </button>
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

          {/* ฟอร์ม เพิ่ม/แก้ไข บัญชี (Expandable) */}
          {isFormOpen && (
            <form
              onSubmit={handleSaveAccount}
              className="p-5 bg-linear-to-b from-slate-50 to-white rounded-2xl border border-slate-300/80 shadow-xs space-y-4 animate-in fade-in duration-200"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    {editingAccountId ? (
                      <>
                        <Pencil className="w-4 h-4 text-sky-600" />
                        <span>แก้ไขข้อมูลบัญชี / บัตร</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 text-emerald-600" />
                        <span>เพิ่มบัญชี / บัตรใหม่</span>
                      </>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    กรอกข้อมูลรายละเอียดของบัญชี ธนาคาร วงเงิน และอัตราดอกเบี้ย
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* หมวด 1: ข้อมูลพื้นฐาน */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">1. ข้อมูลทั่วไปของบัญชี</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      ชื่อบัญชี / ชื่อบัตร <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น KBank ออมทรัพย์, บัตร KTC Visa"
                      value={formData.account_name}
                      onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      ประเภทบัญชี <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formData.account_type}
                      onChange={(e) => handleAccountTypeChange(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="bank">🏦 บัญชีธนาคาร (Bank Asset)</option>
                      <option value="cash">💵 เงินสด / กระเป๋าเงิน (Cash Asset)</option>
                      <option value="credit_card">💳 บัตรเครดิต (Credit Card Liability)</option>
                      <option value="loan">📄 สินเชื่อ / บัตรกดเงินสด (Loan Liability)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      ธนาคาร / สถาบันการเงิน
                    </label>
                    <input
                      type="text"
                      list="thai-banks-list"
                      placeholder="เช่น KBank, SCB, KTC"
                      value={formData.bank_name}
                      onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <datalist id="thai-banks-list">
                      {THAI_BANKS.map((b) => (
                        <option key={b} value={b.split(' ')[0]} label={b} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      เลขที่บัญชี / เลขบัตร 4 หลัก
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น 123-4-56789-0 หรือ 4589"
                      value={formData.account_number}
                      onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* หมวด 2: ยอดเงิน, วงเงิน, ดอกเบี้ย */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">2. ยอดเงินและอัตราดอกเบี้ย</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {formData.is_liability ? 'ยอดค้างชำระ / ยอดใช้ไป (บาท)' : 'ยอดยกมา / เงินคงเหลือ (บาท)'}{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={formData.current_balance}
                      onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      วงเงินอนุมัติ / วงเงินบัตร (บาท)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00 (เฉพาะบัตร/สินเชื่อ)"
                      value={formData.credit_limit}
                      onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      อัตราดอกเบี้ย (% ต่อปี)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={formData.is_liability ? 'เช่น 16.00 หรือ 25.00' : 'เช่น 1.50'}
                      value={formData.interest_rate}
                      onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* หมวด 3: วันตัดรอบบิล & สถานะหนี้สิน (สำหรับบัตรเครดิต & สินเชื่อ) */}
              <div className="p-3.5 bg-slate-100/70 rounded-xl border border-slate-200 space-y-2.5">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-600" />
                  <span>รอบบิลและการจัดประเภทบัญชี</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      วันตัดรอบบัญชี (วันที่ 1 - 31)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="เช่น 15"
                      value={formData.billing_cycle_day}
                      onChange={(e) => setFormData({ ...formData, billing_cycle_day: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      วันครบกำหนดชำระ (วันที่ 1 - 31)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="เช่น 5"
                      value={formData.payment_due_day}
                      onChange={(e) => setFormData({ ...formData, payment_due_day: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="pt-2 sm:pt-4">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formData.is_liability}
                        onChange={(e) => setFormData({ ...formData, is_liability: e.target.checked })}
                        className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                      />
                      <span className="text-xs font-semibold text-slate-700">
                        นับเป็นหนี้สิน (Liability)
                      </span>
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {formData.is_liability
                        ? 'ยอดเงินจะถูกคำนวณเป็นภาระหนี้ระยะสั้น'
                        : 'ยอดเงินจะถูกคำนวณเป็นเงินสดคล่องมือ'}
                    </p>
                  </div>
                </div>
              </div>

              {/* ปุ่มบันทึก & ยกเลิก */}
              <div className="flex justify-end items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submittingAccount}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition disabled:opacity-50 shadow-xs"
                >
                  {submittingAccount
                    ? 'กำลังบันทึก...'
                    : editingAccountId
                    ? 'บันทึกการแก้ไข'
                    : 'บันทึกบัญชี'}
                </button>
              </div>
            </form>
          )}

          {/* ตารางแสดงการ์ดบัญชี */}
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              กำลังโหลดข้อมูลบัญชี...
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-medium">ยังไม่มีบัญชีการเงินในระบบ</p>
              <p className="text-xs text-slate-400">กดปุ่ม "+ เพิ่มบัญชี/บัตร" ด้านบนเพื่อเริ่มต้นติดตามยอดเงิน</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {accounts.map((acc) => {
                const meta = getAccountTypeMeta(acc.account_type);
                const isDebt = acc.is_liability;
                const creditLimitNum = Number(acc.credit_limit || 0);
                const balanceNum = Number(acc.current_balance || 0);
                const interestRateNum = Number(acc.interest_rate || 0);

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
                            className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"
                            title="แก้ไขข้อมูล"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAccount(acc.id, acc.account_name)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
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
                          {isDebt ? 'ยอดค้างชำระ / ใช้ไป' : 'ยอดเงินคงเหลือ'}
                        </span>
                        <div
                          className={`text-lg font-bold tracking-tight ${
                            isDebt ? 'text-rose-600' : 'text-slate-900'
                          }`}
                        >
                          {formatMoney(balanceNum)}
                        </div>
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

        {/* 2. Grid แถวล่าง: ซ้ายฟอร์มบันทึก, ขวารายการล่าสุดคู่กันสมดุล */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* ซ้าย: แบบฟอร์มบันทึก (1 คอลัมน์) */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-800">บันทึกรายการ</h2>

            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setTxType('EXPENSE')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                  txType === 'EXPENSE' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                รายจ่าย
              </button>
              <button
                type="button"
                onClick={() => setTxType('INCOME')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                  txType === 'INCOME' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                รายรับ
              </button>
            </div>

            <form onSubmit={handleCreateTransaction} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {txType === 'EXPENSE' ? 'จ่ายจากบัญชี / บัตร' : 'เข้าบัญชี'}
                </label>
                <select
                  required
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="" disabled>-- เลือกบัญชี --</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.bank_name ? `[${acc.bank_name}] ` : ''}{acc.account_name} ({acc.is_liability ? 'หนี้/บัตร' : 'สินทรัพย์'} • {formatMoney(acc.current_balance, { mask: '฿••••••' })})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">หมวดหมู่</label>
                <input
                  type="text"
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="เช่น อาหาร, เดินทาง, เงินเดือน"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">จำนวนเงิน (บาท)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">บันทึกช่วยจำ (Note)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={submittingTx || accounts.length === 0}
                className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-50 mt-2 shadow-xs"
              >
                {submittingTx ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
              </button>
            </form>
          </div>

          {/* ขวา: รายการบันทึกล่าสุด (2 คอลัมน์ประกบคู่กัน) */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-800">รายการบันทึกล่าสุด</h2>
            
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[460px]">
              {transactions.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">ยังไม่มีรายการบันทึก</p>
              ) : (
                transactions.map((tx) => {
                  const typeVal = String(tx.type || tx.transaction_type || '').toUpperCase();
                  const isIncome = typeVal === 'INCOME';

                  return (
                    <div key={tx.id} className="py-3 flex justify-between items-center text-sm hover:bg-slate-50/50 px-2 rounded-xl transition">
                      <div>
                        <p className="font-semibold text-slate-800">{tx.category}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {tx.transaction_date} {tx.note && `• ${tx.note}`}
                        </p>
                      </div>
                      <span className={`font-bold text-sm ${isIncome ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {hideCashFlow ? (
                          <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••</span>
                        ) : (
                          `${isIncome ? '+' : '-'}฿${Number(tx.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}