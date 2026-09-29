'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { calculateAccountInterest } from '@/lib/interestCalculator';
import {
  Eye,
  EyeOff,
  Building2,
  ShieldCheck,
  PiggyBank,
  TrendingUp,
  Percent,
  Calendar,
  AlertCircle,
  Clock,
  Sparkles,
  Info,
  Landmark,
  Search,
  Filter,
  CheckCircle2,
  Layers,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';

export type LongTermAssetType =
  | 'CORPORATE_BOND'
  | 'GOV_BOND'
  | 'SSF'
  | 'THAI_ESG'
  | 'RMF'
  | 'PVD'
  | 'FIXED_DEPOSIT'
  | 'HIGH_YIELD'
  | 'OTHER'
  | 'NORMAL_FUND'
  | string;

export interface CashPvdAsset {
  id: number;
  account_name: string;
  account_type: LongTermAssetType;
  bank_name: string | null;
  account_number: string | null;
  current_balance: number;
  cost_basis: number | null;
  pvd_employee_contrib: number | null;
  pvd_employer_contrib: number | null;
  interest_rate: number | null;
  base_interest_rate: number | null;
  promo_interest_rate: number | null;
  promo_duration_days: number | null;
  deposit_start_date: string | null;
  maturity_date: string | null;
  is_liquid: boolean | null;
  is_tax_exempt: boolean | null;
  tax_deductible: boolean | null;
  holding_period_years: number | null;
  interest_payout_frequency: string | null;
  next_interest_payout_date: string | null;
  notes: string | null;
  updated_at?: string;
}

interface CashAndPvdSectionProps {
  onCashPvdUpdated?: () => void;
}

type FilterCategory = 'ALL' | 'BONDS' | 'TAX_FUNDS' | 'PVD' | 'DEPOSITS' | 'OTHER';

export default function CashAndPvdSection({ onCashPvdUpdated }: CashAndPvdSectionProps = {}) {
  const [assets, setAssets] = useState<CashPvdAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const supabase = createClient();

  // State สำหรับการซ่อน/แสดงเลขที่บัญชี
  const [hideAllAccountNumbers, setHideAllAccountNumbers] = useState<boolean>(true);
  const [individualToggles, setIndividualToggles] = useState<Record<number, boolean>>({});

  // State สำหรับการซ่อน/แสดงยอดเงิน (Data Masking)
  const [hideBalances, setHideBalances] = useState<boolean>(false);
  const [individualBalanceToggles, setIndividualBalanceToggles] = useState<Record<number, boolean>>({});

  useEffect(() => {
    try {
      const savedAcc = localStorage.getItem('hide_account_numbers');
      if (savedAcc !== null) {
        setHideAllAccountNumbers(savedAcc === 'true');
      }
      const savedBalances = localStorage.getItem('hide_cash_pvd_balances');
      if (savedBalances !== null) {
        setHideBalances(savedBalances === 'true');
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleHideAllAccountNumbers = () => {
    setHideAllAccountNumbers((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('hide_account_numbers', String(next));
      } catch {
        // ignore
      }
      setIndividualToggles({});
      return next;
    });
  };

  const toggleRowAccount = (id: number) => {
    setIndividualToggles((prev) => {
      const currentIsHidden = prev[id] !== undefined ? prev[id] : hideAllAccountNumbers;
      return {
        ...prev,
        [id]: !currentIsHidden,
      };
    });
  };

  const toggleHideBalances = () => {
    setHideBalances((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('hide_cash_pvd_balances', String(next));
      } catch {
        // ignore
      }
      setIndividualBalanceToggles({});
      return next;
    });
  };

  const toggleRowBalance = (id: number) => {
    setIndividualBalanceToggles((prev) => {
      const currentIsHidden = prev[id] !== undefined ? prev[id] : hideBalances;
      return {
        ...prev,
        [id]: !currentIsHidden,
      };
    });
  };

  const maskAccountNumber = (accNo: string) => {
    if (!accNo) return '';
    return accNo.replace(/\d/g, '•');
  };

  // State เก็บ ID ที่กำลังแก้ไข (null = โหมดเพิ่มใหม่, number = โหมดแก้ไข)
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const initialFormState = {
    account_name: '',
    account_type: 'CORPORATE_BOND' as LongTermAssetType,
    bank_name: '',
    account_number: '',
    current_balance: '',
    cost_basis: '',
    interest_rate: '4.20',
    base_interest_rate: '0.25',
    promo_interest_rate: '',
    promo_duration_days: '',
    deposit_start_date: '',
    maturity_date: '',
    pvd_employee_contrib: '',
    pvd_employer_contrib: '',
    is_liquid: false,
    is_tax_exempt: false,
    tax_deductible: false,
    holding_period_years: '',
    interest_payout_frequency: 'SEMI_ANNUAL',
    next_interest_payout_date: '',
    notes: '',
  };

  const [formData, setFormData] = useState(initialFormState);

  // ดึงข้อมูลบัญชีจากตาราง cash_and_pvd_assets
  const fetchAssets = async () => {
    try {
      const { data, error } = await supabase
        .from('cash_and_pvd_assets')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;
      if (data) setAssets(data as CashPvdAsset[]);
    } catch (err: any) {
      console.error('Error fetching long-term assets:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  // เมื่อเปลี่ยนประเภทสินทรัพย์ ปรับค่าเริ่มต้นที่เหมาะสมอัตโนมัติ
  const handleAccountTypeChange = (newType: string) => {
    let defaults: Partial<typeof formData> = { account_type: newType };

    if (newType === 'CORPORATE_BOND' || newType === 'GOV_BOND') {
      defaults = {
        ...defaults,
        is_liquid: false,
        tax_deductible: false,
        interest_payout_frequency: 'SEMI_ANNUAL',
        interest_rate: formData.interest_rate || '4.00',
      };
    } else if (newType === 'THAI_ESG') {
      defaults = {
        ...defaults,
        is_liquid: false,
        tax_deductible: true,
        holding_period_years: '5',
        interest_rate: '0',
      };
      if (formData.deposit_start_date) {
        const start = new Date(formData.deposit_start_date);
        start.setFullYear(start.getFullYear() + 5);
        defaults.maturity_date = start.toISOString().split('T')[0];
      }
    } else if (newType === 'SSF') {
      defaults = {
        ...defaults,
        is_liquid: false,
        tax_deductible: true,
        holding_period_years: '10',
        interest_rate: '0',
      };
      if (formData.deposit_start_date) {
        const start = new Date(formData.deposit_start_date);
        start.setFullYear(start.getFullYear() + 10);
        defaults.maturity_date = start.toISOString().split('T')[0];
      }
    } else if (newType === 'RMF') {
      defaults = {
        ...defaults,
        is_liquid: false,
        tax_deductible: true,
        interest_rate: '0',
      };
    } else if (newType === 'PVD') {
      defaults = {
        ...defaults,
        is_liquid: false,
        tax_deductible: true,
        interest_rate: '0',
      };
    } else if (newType === 'FIXED_DEPOSIT') {
      defaults = {
        ...defaults,
        is_liquid: false,
        interest_rate: formData.interest_rate || '2.00',
      };
    } else if (newType === 'HIGH_YIELD') {
      defaults = {
        ...defaults,
        is_liquid: true,
        interest_rate: formData.interest_rate || '1.50',
      };
    } else if (newType === 'OTHER') {
      defaults = {
        ...defaults,
        is_liquid: false,
        tax_deductible: false,
        holding_period_years: '',
        deposit_start_date: '',
        maturity_date: '',
        interest_rate: formData.interest_rate || '0',
      };
    } else if (newType === 'NORMAL_FUND') {
      defaults = {
        ...defaults,
        is_liquid: true,
        interest_rate: formData.interest_rate || '0',
      };
    }

    setFormData((prev) => ({ ...prev, ...defaults }));
  };

  // คำนวณวัน maturity_date อัตโนมัติเมื่อเลือก start date และ duration สำหรับเงินฝากโปรโมชัน
  const handlePromoDateChange = (startDate: string, durationDays: string) => {
    let maturity = formData.maturity_date;
    if (startDate && durationDays) {
      const days = parseInt(durationDays, 10);
      if (!isNaN(days)) {
        const start = new Date(startDate);
        start.setDate(start.getDate() + days);
        maturity = start.toISOString().split('T')[0];
      }
    }
    setFormData((prev) => ({
      ...prev,
      deposit_start_date: startDate,
      promo_duration_days: durationDays,
      maturity_date: maturity,
    }));
  };

  // คำนวณวันครบกำหนดภาษีอัตโนมัติเมื่อกรอกวันเริ่มซื้อและจำนวนปีถือครอง
  const handleTaxStartDateChange = (startDate: string, yearsStr?: string) => {
    const years = parseInt(yearsStr ?? formData.holding_period_years, 10);
    let maturity = formData.maturity_date;
    if (startDate && !isNaN(years) && years > 0) {
      const start = new Date(startDate);
      start.setFullYear(start.getFullYear() + years);
      maturity = start.toISOString().split('T')[0];
    }
    setFormData((prev) => ({
      ...prev,
      deposit_start_date: startDate,
      maturity_date: maturity,
    }));
  };

  // บันทึก (เพิ่ม/แก้ไข) ข้อมูลสินทรัพย์
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);

      const isPvd = formData.account_type === 'PVD';
      const balance = isPvd
        ? (parseFloat(formData.pvd_employee_contrib) || 0) + (parseFloat(formData.pvd_employer_contrib) || 0)
        : parseFloat(formData.current_balance) || 0;

      const isBond = ['CORPORATE_BOND', 'GOV_BOND', 'BOND'].includes(formData.account_type);
      const isTaxFund = ['SSF', 'THAI_ESG', 'THAIESG', 'RMF'].includes(formData.account_type);
      const isFixed = formData.account_type === 'FIXED_DEPOSIT';
      const isNormalFund = formData.account_type === 'NORMAL_FUND';
      const isOther = formData.account_type === 'OTHER';

      const payload = {
        account_name: formData.account_name,
        account_type: formData.account_type,
        bank_name: formData.bank_name || null,
        account_number: formData.account_number || null,
        current_balance: balance,
        cost_basis: formData.cost_basis ? parseFloat(formData.cost_basis) : (isBond || isOther ? balance : 0),
        interest_rate: formData.interest_rate ? parseFloat(formData.interest_rate) : 0,
        base_interest_rate: formData.base_interest_rate ? parseFloat(formData.base_interest_rate) : 0.25,
        promo_interest_rate: formData.promo_interest_rate ? parseFloat(formData.promo_interest_rate) : null,
        promo_duration_days: formData.promo_duration_days ? parseInt(formData.promo_duration_days, 10) : null,
        deposit_start_date: formData.deposit_start_date || null,
        maturity_date: formData.maturity_date || null,
        pvd_employee_contrib: isPvd ? (parseFloat(formData.pvd_employee_contrib) || 0) : 0,
        pvd_employer_contrib: isPvd ? (parseFloat(formData.pvd_employer_contrib) || 0) : 0,
        is_liquid: isPvd || isFixed || isBond || isTaxFund || isNormalFund || isOther ? false : formData.is_liquid,
        is_tax_exempt: formData.is_tax_exempt,
        tax_deductible: isTaxFund || isPvd ? true : formData.tax_deductible,
        holding_period_years: formData.holding_period_years ? parseInt(formData.holding_period_years, 10) : null,
        interest_payout_frequency: formData.interest_payout_frequency,
        next_interest_payout_date: formData.next_interest_payout_date || null,
        notes: formData.notes || null,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        // โหมดแก้ไข: อัปเดตแถวเดิมตาม ID
        const { error } = await supabase
          .from('cash_and_pvd_assets')
          .update(payload)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        // โหมดเพิ่มใหม่
        const { error } = await supabase
          .from('cash_and_pvd_assets')
          .insert([payload]);

        if (error) throw error;
      }

      await fetchAssets();
      onCashPvdUpdated?.();
      setIsModalOpen(false);
      setEditingId(null);
    } catch (err: any) {
      alert(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ฟังก์ชันเปิด Modal แก้ไข
  const handleOpenEditModal = (item: CashPvdAsset) => {
    setEditingId(item.id);
    setFormData({
      account_name: item.account_name ?? '',
      account_type: item.account_type ?? 'CORPORATE_BOND',
      bank_name: item.bank_name ?? '',
      account_number: item.account_number ?? '',
      current_balance: item.current_balance != null ? String(item.current_balance) : '',
      cost_basis: item.cost_basis != null ? String(item.cost_basis) : '',
      interest_rate: item.interest_rate != null ? String(item.interest_rate) : '0',
      base_interest_rate: item.base_interest_rate != null ? String(item.base_interest_rate) : '0.25',
      promo_interest_rate: item.promo_interest_rate != null ? String(item.promo_interest_rate) : '',
      promo_duration_days: item.promo_duration_days != null ? String(item.promo_duration_days) : '',
      deposit_start_date: item.deposit_start_date ?? '',
      maturity_date: item.maturity_date ?? '',
      pvd_employee_contrib: item.pvd_employee_contrib != null ? String(item.pvd_employee_contrib) : '',
      pvd_employer_contrib: item.pvd_employer_contrib != null ? String(item.pvd_employer_contrib) : '',
      is_liquid: item.is_liquid ?? false,
      is_tax_exempt: item.is_tax_exempt ?? false,
      tax_deductible: item.tax_deductible ?? false,
      holding_period_years: item.holding_period_years != null ? String(item.holding_period_years) : '',
      interest_payout_frequency: item.interest_payout_frequency ?? 'SEMI_ANNUAL',
      next_interest_payout_date: item.next_interest_payout_date ?? '',
      notes: item.notes ?? '',
    });
    setIsModalOpen(true);
  };

  // ฟังก์ชันเปิด Modal สำหรับเพิ่มใหม่
  const handleOpenCreateModal = (defaultType: LongTermAssetType = 'CORPORATE_BOND') => {
    setEditingId(null);
    setFormData({
      ...initialFormState,
      account_type: defaultType,
    });
    setIsModalOpen(true);
  };

  // ลบบัญชี
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`คุณต้องการลบรายการ "${name}" ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`)) return;

    try {
      const { error } = await supabase.from('cash_and_pvd_assets').delete().eq('id', id);
      if (error) throw error;
      setAssets((prev) => prev.filter((item) => item.id !== id));
      onCashPvdUpdated?.();
    } catch (err: any) {
      alert(`ลบไม่สำเร็จ: ${err.message}`);
    }
  };

  // ----------------------------------------------------
  // การจัดกลุ่มและการคำนวณ Metrics เชิงลึก
  // ----------------------------------------------------
  const bondAssets = useMemo(() => {
    return assets.filter((a) => ['CORPORATE_BOND', 'GOV_BOND', 'BOND'].includes(a.account_type?.toUpperCase() || ''));
  }, [assets]);

  const taxFundAssets = useMemo(() => {
    return assets.filter((a) => ['SSF', 'THAI_ESG', 'THAIESG', 'RMF'].includes(a.account_type?.toUpperCase() || ''));
  }, [assets]);

  const pvdAssets = useMemo(() => {
    return assets.filter((a) => a.account_type?.toUpperCase() === 'PVD');
  }, [assets]);

  const depositAssets = useMemo(() => {
    return assets.filter((a) => ['FIXED_DEPOSIT', 'HIGH_YIELD'].includes(a.account_type?.toUpperCase() || ''));
  }, [assets]);

  const otherAssets = useMemo(() => {
    return assets.filter((a) => ['OTHER', 'NORMAL_FUND'].includes(a.account_type?.toUpperCase() || ''));
  }, [assets]);
  const totalOther = otherAssets.reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);

  // 1. ยอดรวมหุ้นกู้ & คูปอง
  const totalBonds = bondAssets.reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);
  const annualBondCoupons = bondAssets.reduce((sum, a) => {
    const rate = Number(a.interest_rate) || 0;
    return sum + (Number(a.current_balance) || 0) * (rate / 100);
  }, 0);
  const avgBondCouponRate = totalBonds > 0 ? (annualBondCoupons / totalBonds) * 100 : 0;

  // 2. ยอดรวมกองทุนลดหย่อนภาษี & กำไร/ขาดทุน
  const totalTaxFunds = taxFundAssets.reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);
  const totalTaxCostBasis = taxFundAssets.reduce((sum, a) => sum + (Number(a.cost_basis) || 0), 0);
  const taxFundsPL = totalTaxFunds - totalTaxCostBasis;
  const taxFundsYield = totalTaxCostBasis > 0 ? (taxFundsPL / totalTaxCostBasis) * 100 : 0;

  // 3. ยอดรวม PVD
  const totalPvd = pvdAssets.reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);
  const totalPvdEmployee = pvdAssets.reduce((sum, a) => sum + (Number(a.pvd_employee_contrib) || 0), 0);
  const totalPvdEmployer = pvdAssets.reduce((sum, a) => sum + (Number(a.pvd_employer_contrib) || 0), 0);

  // 4. ยอดเงินฝากประจำ & ดอกเบี้ย
  const totalFixedDeposit = depositAssets
    .filter((a) => a.account_type === 'FIXED_DEPOSIT')
    .reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);

  const totalHighYield = depositAssets
    .filter((a) => a.account_type === 'HIGH_YIELD')
    .reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);

  const annualDepositInterest = depositAssets.reduce((sum, a) => {
    const rate = a.promo_interest_rate ?? a.interest_rate ?? 0;
    return sum + ((Number(a.current_balance) || 0) * (Number(rate) / 100));
  }, 0);

  // ผลตอบแทนกระแสเงินสดคาดการณ์รวมต่อปี (คูปองหุ้นกู้ + ดอกเบี้ยเงินฝาก)
  const totalAnnualPassiveIncome = annualBondCoupons + annualDepositInterest;

  // กรองรายการที่จะแสดงในตารางตามหมวดหมู่และคำค้นหา
  const filteredAssets = useMemo(() => {
    return assets.filter((item) => {
      const type = item.account_type?.toUpperCase() || '';
      let matchCat = true;
      if (selectedFilter === 'BONDS') {
        matchCat = ['CORPORATE_BOND', 'GOV_BOND', 'BOND'].includes(type);
      } else if (selectedFilter === 'TAX_FUNDS') {
        matchCat = ['SSF', 'THAI_ESG', 'THAIESG', 'RMF'].includes(type);
      } else if (selectedFilter === 'PVD') {
        matchCat = type === 'PVD';
      } else if (selectedFilter === 'DEPOSITS') {
        matchCat = ['FIXED_DEPOSIT', 'HIGH_YIELD'].includes(type);
      } else if (selectedFilter === 'OTHER') {
        matchCat = ['OTHER', 'NORMAL_FUND'].includes(type);
      }

      if (!matchCat) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (item.account_name || '').toLowerCase().includes(q) ||
        (item.bank_name || '').toLowerCase().includes(q) ||
        (item.notes || '').toLowerCase().includes(q) ||
        (item.account_number || '').includes(q)
      );
    });
  }, [assets, selectedFilter, searchQuery]);

  // คำนวณวันคงเหลือ / สถานะครบกำหนด
  const getDaysLeft = (dateStr: string | null) => {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Helper แปลงข้อความสถานะครบกำหนด หรือปลดล็อกภาษี
  const formatMaturityOrLock = (item: CashPvdAsset) => {
    const type = item.account_type?.toUpperCase() || '';
    if (type === 'PVD') {
      return (
        <div>
          <span className="text-xs text-slate-500 font-medium">สะสมต่อเนื่อง</span>
          <div className="text-[11px] text-slate-500">เกษียณอายุการทำงาน</div>
        </div>
      );
    }

    if (type === 'SSF') {
      const days = getDaysLeft(item.maturity_date);
      const unlockYear = item.maturity_date ? new Date(item.maturity_date).getFullYear() : null;
      return (
        <div>
          <div className="text-xs font-semibold text-purple-700">
            {unlockYear ? `ครบเกณฑ์ปี ${unlockYear}` : 'ถือครอง 10 ปีปฏิทิน'}
          </div>
          <div className="text-[11px] text-slate-500">
            {days !== null ? (days <= 0 ? 'ครบกำหนดแล้ว (ขายได้)' : `เหลืออีก ~${Math.ceil(days / 365)} ปี (${days} วัน)`) : 'ไม่ระบุวันเริ่ม'}
          </div>
        </div>
      );
    }

    if (type === 'THAI_ESG') {
      const days = getDaysLeft(item.maturity_date);
      return (
        <div>
          <div className="text-xs font-semibold text-emerald-700">
            {item.maturity_date ? `ปลดล็อก ${item.maturity_date}` : 'ถือครอง 5 ปีเต็ม'}
          </div>
          <div className="text-[11px] text-slate-500">
            {days !== null ? (days <= 0 ? 'ครบกำหนดแล้ว (ขายได้)' : `เหลืออีก ${days} วัน`) : 'ไม่ระบุวันเริ่ม'}
          </div>
        </div>
      );
    }

    if (['CORPORATE_BOND', 'GOV_BOND', 'BOND', 'FIXED_DEPOSIT'].includes(type)) {
      if (!item.maturity_date) return <span className="text-xs text-slate-400">-</span>;
      const days = getDaysLeft(item.maturity_date);
      const isMatured = days !== null && days <= 0;
      return (
        <div>
          <div className="text-xs font-semibold text-slate-800">
            {item.maturity_date}
          </div>
          <span className={`inline-block text-[11px] px-1.5 py-0.2 rounded font-medium mt-0.5 ${
            isMatured
              ? 'bg-rose-100 text-rose-700'
              : days !== null && days <= 60
              ? 'bg-amber-100 text-amber-800 font-semibold'
              : 'text-slate-500'
          }`}>
            {isMatured ? 'ครบกำหนดไถ่ถอนแล้ว' : `เหลืออีก ${days} วัน`}
          </span>
        </div>
      );
    }

    if (type === 'OTHER' || type === 'NORMAL_FUND') {
      return (
        <div>
          <span className="text-xs text-slate-700 font-semibold">ไม่จำกัดระยะเวลา</span>
          <div className="text-[11px] text-slate-500">ไม่มีกำหนดถือครอง (No lock)</div>
        </div>
      );
    }

    // High Yield
    const days = getDaysLeft(item.maturity_date);
    if (days !== null) {
      return (
        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
          days <= 0 ? 'bg-red-100 text-red-700' : days <= 14 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
        }`}>
          {days <= 0 ? 'หมดโปรโมชัน' : `เหลือ ${days} วัน`}
        </span>
      );
    }

    return <span className="text-xs text-slate-400">-</span>;
  };

  // Helper Badge ประเภทสินทรัพย์
  const renderAssetBadge = (item: CashPvdAsset) => {
    const type = item.account_type?.toUpperCase() || '';
    if (type === 'CORPORATE_BOND') {
      return (
        <div className="inline-flex items-center gap-1.5 flex-wrap">
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-blue-100 text-blue-800 border border-blue-200">
            หุ้นกู้เอกชน
          </span>
          {item.notes && item.notes.trim() && (
            <span className="px-1.5 py-0.5 text-[11px] font-mono font-medium rounded bg-slate-100 text-slate-700 border border-slate-200">
              {item.notes}
            </span>
          )}
        </div>
      );
    }
    if (type === 'GOV_BOND') {
      return (
        <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
          พันธบัตร
        </span>
      );
    }
    if (type === 'THAI_ESG' || type === 'THAIESG') {
      return (
        <div className="inline-flex items-center gap-1">
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
            Thai ESG
          </span>
          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1 py-0.2 rounded border border-emerald-200">
            ลดหย่อนภาษี
          </span>
        </div>
      );
    }
    if (type === 'SSF') {
      return (
        <div className="inline-flex items-center gap-1">
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-purple-100 text-purple-800 border border-purple-200">
            SSF (10 ปี)
          </span>
          <span className="text-[10px] bg-purple-50 text-purple-700 px-1 py-0.2 rounded border border-purple-200">
            ลดหย่อนภาษี
          </span>
        </div>
      );
    }
    if (type === 'RMF') {
      return (
        <div className="inline-flex items-center gap-1">
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-teal-100 text-teal-800 border border-teal-200">
            RMF
          </span>
          <span className="text-[10px] bg-teal-50 text-teal-700 px-1 py-0.2 rounded border border-teal-200">
            ลดหย่อนภาษี
          </span>
        </div>
      );
    }
    if (type === 'PVD') {
      return (
        <div className="inline-flex items-center gap-1">
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-violet-100 text-violet-800 border border-violet-200">
            PVD สำรองเลี้ยงชีพ
          </span>
          <span className="text-[10px] bg-violet-50 text-violet-700 px-1 py-0.2 rounded border border-violet-200">
            ลดหย่อนภาษี
          </span>
        </div>
      );
    }
    if (type === 'FIXED_DEPOSIT') {
      return (
        <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-amber-100 text-amber-800 border border-amber-200">
          เงินฝากประจำ
        </span>
      );
    }
    if (type === 'HIGH_YIELD') {
      return (
        <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-sky-50 text-sky-800 border border-sky-200">
          เงินฝากดอกเบี้ยสูง
        </span>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-slate-100 text-slate-800 border border-slate-300">
          สินทรัพย์อื่นๆ
        </span>
        {item.notes && item.notes.trim() && (
          <span className="px-1.5 py-0.5 text-[11px] font-medium rounded bg-slate-50 text-slate-600 border border-slate-200">
            {item.notes}
          </span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
        กำลังโหลดข้อมูลสินทรัพย์ระยะยาว & ผลตอบแทนคงที่...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Header Information Banner & Section Title */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2 border border-indigo-200/80">
              <Landmark className="w-3.5 h-3.5 text-indigo-600" />
              <span>สินทรัพย์ระยะยาว & ผลตอบแทนคงที่ (Long-Term & Fixed Assets)</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              พอร์ตหุ้นกู้, กองทุนลดหย่อนภาษี & เงินฝากระยะยาว
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
              ติดตามสินทรัพย์ที่มีเงื่อนไขล็อกระยะเวลา หรือให้ผลตอบแทนดอกเบี้ยสม่ำเสมอ: หุ้นกู้ภาคเอกชน, พันธบัตร, กองทุน SSF / Thai ESG / RMF, PVD และเงินฝากประจำ
            </p>
          </div>

          <div className="flex items-center gap-2 sm:self-center">
            <button
              onClick={() => handleOpenCreateModal('CORPORATE_BOND')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition shadow-xs cursor-pointer whitespace-nowrap"
            >
              <span>+</span> เพิ่มสินทรัพย์ใหม่
            </button>
          </div>
        </div>
      </div>

      {/* 2. Top Summary Metrics Cards (4-Pillar Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: หุ้นกู้ & พันธบัตร */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500 uppercase flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" /> หุ้นกู้ & พันธบัตร (Bonds)
              </p>
              <button
                type="button"
                onClick={toggleHideBalances}
                title={hideBalances ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'}
                className="text-slate-500 hover:text-blue-600 p-1 -mr-1 rounded-md hover:bg-blue-50 transition cursor-pointer"
              >
                {hideBalances ? <EyeOff className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <h3 className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
              {hideBalances ? (
                <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••••</span>
              ) : (
                `฿${totalBonds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </h3>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{bondAssets.length} รายการ</span>
            <span className="font-semibold text-blue-700">
              {avgBondCouponRate > 0 ? `คูปองเฉลี่ย ${avgBondCouponRate.toFixed(2)}%` : '-'}
            </span>
          </div>
        </div>

        {/* Card 2: กองทุนลดหย่อนภาษี (SSF / Thai ESG / RMF) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> กองทุนลดหย่อนภาษี (SSF/ESG)
            </p>
            <h3 className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
              {hideBalances ? (
                <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••••</span>
              ) : (
                `฿${totalTaxFunds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </h3>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">ต้นทุน: {hideBalances ? '••••' : `฿${totalTaxCostBasis.toLocaleString()}`}</span>
            <span className={`font-semibold ${taxFundsPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {hideBalances ? '••••' : `${taxFundsPL >= 0 ? '+' : ''}฿${taxFundsPL.toLocaleString()} (${taxFundsYield.toFixed(1)}%)`}
            </span>
          </div>
        </div>

        {/* Card 3: กองทุนสำรองเลี้ยงชีพ (PVD), เงินฝากประจำ & สินทรัพย์อื่นๆ */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase flex items-center gap-1.5">
              <PiggyBank className="w-3.5 h-3.5 text-purple-600" /> PVD, ฝากประจำ & อื่นๆ
            </p>
            <h3 className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
              {hideBalances ? (
                <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••••</span>
              ) : (
                `฿${(totalPvd + totalFixedDeposit + totalOther).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </h3>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 truncate">
            {[
              totalPvd > 0 ? `PVD ฿${totalPvd.toLocaleString()}` : null,
              totalFixedDeposit > 0 ? `ฝากประจำ ฿${totalFixedDeposit.toLocaleString()}` : null,
              totalOther > 0 ? `อื่นๆ ฿${totalOther.toLocaleString()}` : null,
            ].filter(Boolean).join(' • ') || 'สินทรัพย์เพื่อการเกษียณและอื่นๆ'}
          </div>
        </div>

        {/* Card 4: ผลตอบแทนกระแสเงินสดคาดการณ์/ปี (Est. Passive Cash Yield) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> ดอกเบี้ย & คูปองรับต่อปี (Est.)
            </p>
            <h3 className="text-2xl font-bold font-mono tabular-nums text-emerald-600 mt-2">
              {hideBalances ? (
                <span className="tracking-widest font-mono text-emerald-400 select-none">฿••••••••</span>
              ) : (
                `฿${totalAnnualPassiveIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </h3>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            {hideBalances
              ? 'เฉลี่ยเดือนละ ~฿••••••'
              : `เฉลี่ยเดือนละ ~฿${(totalAnnualPassiveIncome / 12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
        </div>
      </div>

      {/* 3. Category Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap ${
              selectedFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            ทั้งหมด ({assets.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('BONDS')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap ${
              selectedFilter === 'BONDS'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>หุ้นกู้ & พันธบัตร ({bondAssets.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('TAX_FUNDS')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap ${
              selectedFilter === 'TAX_FUNDS'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>กองทุนลดหย่อนภาษี ({taxFundAssets.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('PVD')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap ${
              selectedFilter === 'PVD'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <PiggyBank className="w-3.5 h-3.5" />
            <span>กองทุนสำรองเลี้ยงชีพ PVD ({pvdAssets.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('DEPOSITS')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap ${
              selectedFilter === 'DEPOSITS'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>เงินฝากประจำ ({depositAssets.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('OTHER')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap ${
              selectedFilter === 'OTHER'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>สินทรัพย์อื่นๆ ({otherAssets.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาชื่อสินทรัพย์, บลจ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={toggleHideBalances}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition shadow-2xs cursor-pointer whitespace-nowrap"
            title={hideBalances ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'}
          >
            {hideBalances ? <Eye className="w-3.5 h-3.5 text-slate-500" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
            <span className="hidden md:inline">{hideBalances ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'}</span>
          </button>
        </div>
      </div>

      {/* 4. Asset List Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 text-xs uppercase font-semibold">
                <th className="py-3.5 px-4">
                  <div className="inline-flex items-center gap-1.5">
                    <span>ชื่อสินทรัพย์ / สถาบันผู้ออก</span>
                    <button
                      type="button"
                      onClick={toggleHideAllAccountNumbers}
                      title={hideAllAccountNumbers ? 'แสดงเลขทะเบียน/เลขที่บัญชีทั้งหมด' : 'ซ่อนเลขทั้งหมด'}
                      className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                    >
                      {hideAllAccountNumbers ? <EyeOff className="w-3.5 h-3.5 text-blue-600" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </th>
                <th className="py-3.5 px-4">ประเภทสินทรัพย์</th>
                <th className="py-3.5 px-4 text-center">อัตราผลตอบแทน / คูปอง</th>
                <th className="py-3.5 px-4 text-left">เงื่อนไขการถือครอง / ครบกำหนด</th>
                <th className="py-3.5 px-4 text-right">
                  <div className="inline-flex items-center justify-end gap-1.5 w-full">
                    <span>มูลค่าปัจจุบัน / เงินต้น</span>
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <p className="text-sm">ไม่พบรายการสินทรัพย์ในหมวดหมู่นี้</p>
                    <button
                      type="button"
                      onClick={() => handleOpenCreateModal('CORPORATE_BOND')}
                      className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
                    >
                      + เพิ่มรายการใหม่
                    </button>
                  </td>
                </tr>
              ) : (
                filteredAssets.map((item) => {
                  const isRowHidden =
                    individualToggles[item.id] !== undefined
                      ? individualToggles[item.id]
                      : hideAllAccountNumbers;
                  const isRowBalanceHidden =
                    individualBalanceToggles[item.id] !== undefined
                      ? individualBalanceToggles[item.id]
                      : hideBalances;

                  const type = item.account_type?.toUpperCase() || '';
                  const isBond = ['CORPORATE_BOND', 'GOV_BOND', 'BOND'].includes(type);
                  const isTaxFund = ['SSF', 'THAI_ESG', 'THAIESG', 'RMF'].includes(type);
                  const isPvd = type === 'PVD';
                  const isOther = type === 'OTHER' || type === 'NORMAL_FUND';

                  const cost = Number(item.cost_basis) || 0;
                  const current = Number(item.current_balance) || 0;
                  const pl = current - cost;
                  const plPercent = cost > 0 ? (pl / cost) * 100 : 0;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition">
                      {/* 1. ชื่อสินทรัพย์ / ผู้ออก */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{item.account_name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>{item.bank_name ?? 'ไม่ระบุผู้ออก/บลจ.'}</span>
                          {item.account_number && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500">
                              <span>
                                ({isRowHidden ? maskAccountNumber(item.account_number) : item.account_number})
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleRowAccount(item.id)}
                                title={isRowHidden ? 'แสดงเลขที่' : 'ซ่อนเลขที่'}
                                className="p-0.5 text-slate-500 hover:text-blue-600 rounded transition cursor-pointer"
                              >
                                {isRowHidden ? <EyeOff className="w-3 h-3 text-blue-500" /> : <Eye className="w-3 h-3" />}
                              </button>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. ประเภทสินทรัพย์ & Badge */}
                      <td className="py-3.5 px-4">
                        {renderAssetBadge(item)}
                      </td>

                      {/* 3. อัตราผลตอบแทน / คูปอง */}
                      <td className="py-3.5 px-4 text-center">
                        {isBond ? (
                          <div>
                            <span className="font-semibold text-blue-700">
                              {item.interest_rate != null ? `${Number(item.interest_rate).toFixed(2)}% ต่อปี` : '-'}
                            </span>
                            {item.interest_payout_frequency && (
                              <div className="text-[11px] text-slate-500">
                                {item.interest_payout_frequency === 'QUARTERLY'
                                  ? 'จ่ายทุก 3 เดือน'
                                  : item.interest_payout_frequency === 'SEMI_ANNUAL'
                                  ? 'จ่ายทุก 6 เดือน'
                                  : item.interest_payout_frequency === 'MONTHLY'
                                  ? 'จ่ายรายเดือน'
                                  : 'จ่ายรายปี'}
                              </div>
                            )}
                          </div>
                        ) : isTaxFund ? (
                          <div>
                            {cost > 0 ? (
                              <span className={`text-xs font-semibold ${pl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {pl >= 0 ? '+' : ''}{plPercent.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-slate-500 text-xs">กองทุนลดหย่อนภาษี</span>
                            )}
                          </div>
                        ) : isPvd ? (
                          <span className="text-xs text-slate-500">สิทธิลดหย่อนภาษี</span>
                        ) : isOther ? (
                          <div>
                            {Number(item.interest_rate) > 0 ? (
                              <span className="font-semibold text-emerald-600">
                                {Number(item.interest_rate).toFixed(2)}% ต่อปี
                              </span>
                            ) : cost > 0 && cost !== current ? (
                              <span className={`text-xs font-semibold ${pl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {pl >= 0 ? '+' : ''}{plPercent.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="font-semibold text-emerald-600">
                              {item.promo_interest_rate ? `${item.promo_interest_rate}% (โปร)` : `${item.interest_rate ?? 0}%`}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 4. เงื่อนไขการถือครอง / ครบกำหนด */}
                      <td className="py-3.5 px-4">
                        {formatMaturityOrLock(item)}
                      </td>

                      {/* 5. มูลค่าปัจจุบัน (และ P&L) */}
                      <td className="py-3.5 px-4 text-right font-semibold font-mono tabular-nums text-slate-900">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {isRowBalanceHidden ? (
                            <span className="tracking-widest font-mono text-slate-400 select-none">฿••••••••</span>
                          ) : (
                            <span>฿{Number(item.current_balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleRowBalance(item.id)}
                            title={isRowBalanceHidden ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'}
                            className="p-0.5 text-slate-500 hover:text-blue-600 rounded transition cursor-pointer"
                          >
                            {isRowBalanceHidden ? <EyeOff className="w-3 h-3 text-blue-500" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>

                        {/* Breakdown แสดงกำไรขาดทุน หรือ เงินสะสม PVD */}
                        {(isTaxFund || isOther) && cost > 0 && cost !== current && (
                          <div className="text-[11px] font-normal text-slate-500 font-mono tabular-nums">
                            {isRowBalanceHidden ? (
                              <span>ทุน: ฿••••••</span>
                            ) : (
                              <span>
                                ทุน: ฿{cost.toLocaleString()} ({pl >= 0 ? '+' : ''}฿{pl.toLocaleString()})
                              </span>
                            )}
                          </div>
                        )}

                        {isPvd && (
                          <div className="text-[11px] text-slate-500 font-normal font-mono tabular-nums">
                            {isRowBalanceHidden ? (
                              <span>ตนเอง: ฿•••• / นายจ้าง: ฿••••</span>
                            ) : (
                              <span>ตนเอง: ฿{Number(item.pvd_employee_contrib ?? 0).toLocaleString()} / นายจ้าง: ฿{Number(item.pvd_employer_contrib ?? 0).toLocaleString()}</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 6. ปุ่มจัดการ */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition text-xs cursor-pointer"
                            title="แก้ไขรายการนี้"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, item.account_name)}
                            className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition text-xs cursor-pointer"
                            title="ลบรายการนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Modal Form สำหรับเพิ่ม / แก้ไขสินทรัพย์ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingId ? 'แก้ไขข้อมูลสินทรัพย์' : 'เพิ่มสินทรัพย์ระยะยาว & ผลตอบแทนคงที่'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  บันทึกหุ้นกู้, พันธบัตร, กองทุนลดหย่อนภาษี (SSF/Thai ESG), PVD หรือเงินฝากประจำ
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {/* ประเภทสินทรัพย์ */}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ประเภทสินทรัพย์ *</label>
                  <select
                    value={formData.account_type}
                    onChange={(e) => handleAccountTypeChange(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50/50"
                  >
                    <optgroup label="ตราสารหนี้และพันธบัตร (Bonds)">
                      <option value="CORPORATE_BOND">หุ้นกู้ภาคเอกชน (Corporate Bond)</option>
                      <option value="GOV_BOND">พันธบัตรรัฐบาล / พันธบัตรออมทรัพย์ (Gov Bond)</option>
                    </optgroup>
                    <optgroup label="กองทุนลดหย่อนภาษี (Tax-Saving Funds)">
                      <option value="THAI_ESG">Thai ESG (กองทุนรวมไทยเพื่อความยั่งยืน - ถือ 5 ปี)</option>
                      <option value="SSF">SSF (กองทุนรวมเพื่อการออม - ถือ 10 ปีปฏิทิน)</option>
                      <option value="RMF">RMF (กองทุนรวมเพื่อการเลี้ยงชีพ - อายุ 55 ปี)</option>
                    </optgroup>
                    <optgroup label="กองทุนสำรองเลี้ยงชีพ (Provident Fund)">
                      <option value="PVD">PVD (กองทุนสำรองเลี้ยงชีพ)</option>
                    </optgroup>
                    <optgroup label="เงินฝากธนาคาร (Bank Deposits)">
                      <option value="FIXED_DEPOSIT">เงินฝากประจำ (Fixed Deposit)</option>
                      <option value="HIGH_YIELD">เงินฝากดอกเบี้ยสูง / บัญชีพักเงิน (High-Yield Cash)</option>
                    </optgroup>
                    <optgroup label="สินทรัพย์อื่นๆ (Other Assets)">
                      <option value="OTHER">สินทรัพย์อื่นๆ (Other Asset - ไม่มีกำหนดถือครอง)</option>
                    </optgroup>
                  </select>
                </div>

                {/* ชื่อเรียกสินทรัพย์ */}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {['CORPORATE_BOND', 'GOV_BOND'].includes(formData.account_type)
                      ? 'ชื่อรุ่นหุ้นกู้ / ตราสาร *'
                      : ['SSF', 'THAI_ESG', 'RMF'].includes(formData.account_type)
                      ? 'ชื่อกองทุนรวม *'
                      : formData.account_type === 'OTHER'
                      ? 'ชื่อสินทรัพย์ *'
                      : 'ชื่อเรียกบัญชี *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      ['CORPORATE_BOND', 'GOV_BOND'].includes(formData.account_type)
                        ? 'เช่น CPALL275A / หุ้นกู้ทรูมูฟ เอช'
                        : ['SSF', 'THAI_ESG', 'RMF'].includes(formData.account_type)
                        ? 'เช่น K-PRO-ThaiESG / SCBAM SSF'
                        : 'เช่น เงินฝากประจำ 12 เดือน KBank / PVD บริษัท'
                    }
                    value={formData.account_name}
                    onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* สถาบันผู้ออก / บลจ. */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {['CORPORATE_BOND', 'GOV_BOND'].includes(formData.account_type)
                      ? 'บริษัทผู้ออกตราสาร (Issuer)'
                      : ['SSF', 'THAI_ESG', 'RMF'].includes(formData.account_type)
                      ? 'บริษัทหลักทรัพย์จัดการกองทุน (บลจ.)'
                      : 'ชื่อธนาคาร / องค์กร'}
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น CPALL, PTT, SCBAM, บลจ.กสิกรไทย"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* เลขทะเบียน / เลขที่บัญชี */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {['CORPORATE_BOND', 'GOV_BOND'].includes(formData.account_type)
                      ? 'เลขอ้างอิงนายทะเบียน / พอร์ต'
                      : 'เลขที่บัญชี / เลขผู้ถือหน่วย'}
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น 123-456-7890 (ไม่บังคับ)"
                    value={formData.account_number}
                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* ฟิลด์เฉพาะ: หุ้นกู้ & พันธบัตร */}
              {['CORPORATE_BOND', 'GOV_BOND'].includes(formData.account_type) && (
                <div className="p-4 bg-blue-50/60 rounded-2xl space-y-3 border border-blue-100">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                    <Building2 className="w-4 h-4 text-blue-700" />
                    <span>ข้อมูลหุ้นกู้และอัตราคูปอง</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">มูลค่าหน้าตั๋ว / เงินต้น (บาท) *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="เช่น 100000"
                        value={formData.current_balance}
                        onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">อัตราดอกเบี้ยคูปอง (% ต่อปี) *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="เช่น 4.25"
                        value={formData.interest_rate}
                        onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">รอบการจ่ายคูปอง</label>
                      <select
                        value={formData.interest_payout_frequency}
                        onChange={(e) => setFormData({ ...formData, interest_payout_frequency: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-xs bg-white"
                      >
                        <option value="SEMI_ANNUAL">จ่ายทุก 6 เดือน (ปีละ 2 ครั้ง)</option>
                        <option value="QUARTERLY">จ่ายทุก 3 เดือน (ปีละ 4 ครั้ง)</option>
                        <option value="ANNUAL">จ่ายรายปี (ปีละ 1 ครั้ง)</option>
                        <option value="MONTHLY">จ่ายรายเดือน</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">วันครบกำหนดไถ่ถอน (Maturity)</label>
                      <input
                        type="date"
                        value={formData.maturity_date}
                        onChange={(e) => setFormData({ ...formData, maturity_date: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">วันจ่ายคูปองงวดถัดไป</label>
                      <input
                        type="date"
                        value={formData.next_interest_payout_date}
                        onChange={(e) => setFormData({ ...formData, next_interest_payout_date: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">อันดับความน่าเชื่อถือ (Credit Rating)</label>
                      <input
                        type="text"
                        placeholder="เช่น TRIS: A+ หรือ BBB+"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ฟิลด์เฉพาะ: กองทุนลดหย่อนภาษี (SSF, Thai ESG, RMF) */}
              {['SSF', 'THAI_ESG', 'RMF'].includes(formData.account_type) && (
                <div className="p-4 bg-emerald-50/60 rounded-2xl space-y-3 border border-emerald-100">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>ข้อมูลกองทุนลดหย่อนภาษี & ระยะเวลาถือครอง</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">มูลค่าประเมินปัจจุบัน (บาท) *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={formData.current_balance}
                        onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">เงินต้นที่ซื้อ (Cost Basis บาท)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="เช่น 100000"
                        value={formData.cost_basis}
                        onChange={(e) => setFormData({ ...formData, cost_basis: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">วันที่เริ่มซื้อ / ปีภาษีที่ซื้อ</label>
                      <input
                        type="date"
                        value={formData.deposit_start_date}
                        onChange={(e) => handleTaxStartDateChange(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl p-2 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">วันที่ครบกำหนดขายได้ตามกฎหมาย</label>
                      <input
                        type="date"
                        value={formData.maturity_date}
                        onChange={(e) => setFormData({ ...formData, maturity_date: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-xs bg-white"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-emerald-800 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
                    <span><strong>เงื่อนไขภาษี:</strong> Thai ESG ต้องถือ 5 ปีวันชนวัน • SSF ต้องถือ 10 ปีปฏิทิน • RMF ถือจนถึงอายุ 55 ปีบริบูรณ์และไม่น้อยกว่า 5 ปี</span>
                  </p>
                </div>
              )}

              {/* ฟิลด์เฉพาะ: PVD */}
              {formData.account_type === 'PVD' && (
                <div className="p-4 bg-purple-50/60 rounded-2xl space-y-3 border border-purple-100">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                    <PiggyBank className="w-4 h-4 text-purple-700" />
                    <span>ข้อมูลกองทุนสำรองเลี้ยงชีพ (PVD)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">เงินสะสมส่วนตัว (บาท)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.pvd_employee_contrib}
                        onChange={(e) => setFormData({ ...formData, pvd_employee_contrib: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">เงินสมทบนายจ้าง (บาท)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.pvd_employer_contrib}
                        onChange={(e) => setFormData({ ...formData, pvd_employer_contrib: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-sm bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ฟิลด์เฉพาะ: เงินฝากประจำ และ เงินฝากดอกเบี้ยสูง */}
              {['FIXED_DEPOSIT', 'HIGH_YIELD'].includes(formData.account_type) && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">ยอดเงินฝากปัจจุบัน (บาท) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={formData.current_balance}
                      onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">อัตราดอกเบี้ยปกติ (% ต่อปี)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="1.50"
                        value={formData.interest_rate}
                        onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">ดอกเบี้ยโปรโมชัน (% ต่อปี)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="เช่น 2.50"
                        value={formData.promo_interest_rate}
                        onChange={(e) => setFormData({ ...formData, promo_interest_rate: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-sm"
                      />
                    </div>
                  </div>

                  {/* โปรโมชัน / เงินฝากประจำ */}
                  <div className="p-3 bg-amber-50/70 rounded-xl space-y-3 border border-amber-100">
                    <p className="text-xs font-bold text-amber-900">ระยะเวลาโปรโมชัน / เงินฝากประจำ</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">วันที่เริ่มฝาก</label>
                        <input
                          type="date"
                          value={formData.deposit_start_date}
                          onChange={(e) => handlePromoDateChange(e.target.value, formData.promo_duration_days)}
                          className="w-full border border-slate-300 rounded-xl p-2 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">ระยะเวลาโปรโมชัน (วัน)</label>
                        <input
                          type="number"
                          placeholder="เช่น 90 หรือ 365"
                          value={formData.promo_duration_days}
                          onChange={(e) => handlePromoDateChange(formData.deposit_start_date, e.target.value)}
                          className="w-full border border-slate-300 rounded-xl p-2 text-xs bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">วันครบกำหนด (Maturity Date)</label>
                      <input
                        type="date"
                        value={formData.maturity_date}
                        onChange={(e) => setFormData({ ...formData, maturity_date: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ฟิลด์เฉพาะ: สินทรัพย์อื่นๆ (ไม่จำกัดเวลาถือครอง) */}
              {formData.account_type === 'OTHER' && (
                <div className="p-4 bg-slate-50/80 rounded-2xl space-y-3 border border-slate-200">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Landmark className="w-4 h-4 text-slate-700" />
                    <span>ข้อมูลสินทรัพย์อื่นๆ (ไม่จำกัดเวลาถือครอง / No Lock)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">มูลค่าประเมินปัจจุบัน (บาท) *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={formData.current_balance}
                        onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">ต้นทุนเงินลงทุนเริ่มต้น (Cost Basis บาท)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00 (ไม่บังคับ)"
                        value={formData.cost_basis}
                        onChange={(e) => setFormData({ ...formData, cost_basis: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">ผลตอบแทนคาดการณ์ / ปันผล (% ต่อปี)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="เช่น 3.00 (ไม่บังคับ)"
                        value={formData.interest_rate}
                        onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">บันทึกเพิ่มเติม / หมวดหมู่</label>
                      <input
                        type="text"
                        placeholder="เช่น หุ้นสหกรณ์, ทองคำแท่ง, ของสะสม, ที่ดิน"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="w-full border border-slate-300 rounded-xl p-2 text-xs bg-white"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    <span><strong>ไม่มีกำหนดระยะเวลาถือครอง:</strong> สินทรัพย์กลุ่มนี้ไม่มีกำหนดอายุหรือระยะเวลาล็อก (No holding period) สามารถถือครองเพื่อการลงทุนระยะยาวและประเมินมูลค่าได้ตามต้องการ</span>
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition shadow-xs cursor-pointer"
                >
                  {isSubmitting ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'เพิ่มสินทรัพย์'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}