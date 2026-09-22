'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { calculateAccountInterest } from '@/lib/interestCalculator';
import { Eye, EyeOff } from 'lucide-react';

export interface CashPvdAsset {
  id: number;
  account_name: string;
  account_type: 'HIGH_YIELD' | 'FIXED_DEPOSIT' | 'PVD' | string;
  bank_name: string | null;
  account_number: string | null;
  current_balance: number;
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
  interest_payout_frequency: string | null;
  next_interest_payout_date: string | null;
  updated_at?: string;
}

interface CashAndPvdSectionProps {
  onCashPvdUpdated?: () => void;
}

export default function CashAndPvdSection({ onCashPvdUpdated }: CashAndPvdSectionProps = {}) {
  const [assets, setAssets] = useState<CashPvdAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabase = createClient();

  // State สำหรับการซ่อน/แสดงเลขที่บัญชี
  const [hideAllAccountNumbers, setHideAllAccountNumbers] = useState<boolean>(true);
  const [individualToggles, setIndividualToggles] = useState<Record<number, boolean>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hide_account_numbers');
      if (saved !== null) {
        setHideAllAccountNumbers(saved === 'true');
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

  const maskAccountNumber = (accNo: string) => {
    if (!accNo) return '';
    return accNo.replace(/\d/g, '•');
  };

  // 1. เพิ่ม state เก็บ ID ที่กำลังแก้ไข (null = โหมดเพิ่มใหม่, number = โหมดแก้ไข)
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    account_name: '',
    account_type: 'HIGH_YIELD',
    bank_name: '',
    account_number: '',
    current_balance: '',
    interest_rate: '1.50',
    base_interest_rate: '0.25',
    promo_interest_rate: '',
    promo_duration_days: '',
    deposit_start_date: '',
    maturity_date: '',
    pvd_employee_contrib: '',
    pvd_employer_contrib: '',
    is_liquid: true,
    is_tax_exempt: false,
    interest_payout_frequency: 'SEMI_ANNUAL',
  });

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
      console.error('Error fetching cash assets:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  // คำนวณวัน maturity_date อัตโนมัติเมื่อเลือก start date และ duration
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

  // บันทึก (เพิ่ม/แก้ไข) ข้อมูลบัญชี
  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
    setIsSubmitting(true);

    const isPvd = formData.account_type === 'PVD';
    const balance = isPvd
      ? (parseFloat(formData.pvd_employee_contrib) || 0) + (parseFloat(formData.pvd_employer_contrib) || 0)
      : parseFloat(formData.current_balance) || 0;

    const payload = {
      account_name: formData.account_name,
      account_type: formData.account_type,
      bank_name: formData.bank_name || null,
      account_number: formData.account_number || null,
      current_balance: balance,
      interest_rate: formData.interest_rate ? parseFloat(formData.interest_rate) : 0,
      base_interest_rate: formData.base_interest_rate ? parseFloat(formData.base_interest_rate) : 0.25,
      promo_interest_rate: formData.promo_interest_rate ? parseFloat(formData.promo_interest_rate) : null,
      promo_duration_days: formData.promo_duration_days ? parseInt(formData.promo_duration_days, 10) : null,
      deposit_start_date: formData.deposit_start_date || null,
      maturity_date: formData.maturity_date || null,
      pvd_employee_contrib: isPvd ? (parseFloat(formData.pvd_employee_contrib) || 0) : 0,
      pvd_employer_contrib: isPvd ? (parseFloat(formData.pvd_employer_contrib) || 0) : 0,
      is_liquid: isPvd || formData.account_type === 'FIXED_DEPOSIT' ? false : formData.is_liquid,
      is_tax_exempt: formData.is_tax_exempt,
      interest_payout_frequency: formData.interest_payout_frequency,
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

  // 2. ฟังก์ชันเปิด Modal แก้ไข พร้อมนำค่าเดิมของแถวนั้นมาหยอดลง Form
  const handleOpenEditModal = (item: CashPvdAsset) => {
    setEditingId(item.id);
    setFormData({
      account_name: item.account_name ?? '',
      account_type: item.account_type ?? 'HIGH_YIELD',
      bank_name: item.bank_name ?? '',
      account_number: item.account_number ?? '',
      current_balance: item.current_balance != null ? String(item.current_balance) : '',
      interest_rate: item.interest_rate != null ? String(item.interest_rate) : '1.50',
      base_interest_rate: item.base_interest_rate != null ? String(item.base_interest_rate) : '0.25',
      promo_interest_rate: item.promo_interest_rate != null ? String(item.promo_interest_rate) : '',
      promo_duration_days: item.promo_duration_days != null ? String(item.promo_duration_days) : '',
      deposit_start_date: item.deposit_start_date ?? '',
      maturity_date: item.maturity_date ?? '',
      pvd_employee_contrib: item.pvd_employee_contrib != null ? String(item.pvd_employee_contrib) : '',
      pvd_employer_contrib: item.pvd_employer_contrib != null ? String(item.pvd_employer_contrib) : '',
      is_liquid: item.is_liquid ?? true,
      is_tax_exempt: item.is_tax_exempt ?? false,
      interest_payout_frequency: item.interest_payout_frequency ?? 'SEMI_ANNUAL',
    });
    setIsModalOpen(true);
  };

  // 3. ฟังก์ชันเปิด Modal สำหรับเพิ่มใหม่
  const handleOpenCreateModal = () => {
    setEditingId(null);
    // Reset ค่าฟอร์มเป็นค่าเริ่มต้น
    setFormData({
      account_name: '',
      account_type: 'HIGH_YIELD',
      bank_name: '',
      account_number: '',
      current_balance: '',
      interest_rate: '1.50',
      base_interest_rate: '0.25',
      promo_interest_rate: '',
      promo_duration_days: '',
      deposit_start_date: '',
      maturity_date: '',
      pvd_employee_contrib: '',
      pvd_employer_contrib: '',
      is_liquid: true,
      is_tax_exempt: false,
      interest_payout_frequency: 'SEMI_ANNUAL',
    });
    setIsModalOpen(true);
  };

  // ลบบัญชี
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`คุณต้องการลบบัญชี "${name}" ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`)) return;

    try {
      const { error } = await supabase.from('cash_and_pvd_assets').delete().eq('id', id);
      if (error) throw error;
      setAssets((prev) => prev.filter((item) => item.id !== id));
      onCashPvdUpdated?.();
    } catch (err: any) {
      alert(`ลบไม่สำเร็จ: ${err.message}`);
    }
  };

  // คำนวณยอดเงินสดสภาพคล่อง, เงินฝากประจำ และ PVD ตามกฎการแบ่งประเภทบัญชี (AGENTS.md §3.0 & §3.5)
  const totalLiquidCash = assets
    .filter((a) => a.account_type !== 'PVD' && a.account_type !== 'FIXED_DEPOSIT' && a.is_liquid)
    .reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);

  const totalFixedDeposit = assets
    .filter((a) => a.account_type === 'FIXED_DEPOSIT')
    .reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);

  const totalPvd = assets
    .filter((a) => a.account_type === 'PVD')
    .reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);

  // คำนวณดอกเบี้ยสะสมงวดปัจจุบันรวมทุกบัญชี (Accrued to Date)
  const totalAccruedInterest = assets
    .filter((a) => a.account_type !== 'PVD')
    .reduce((sum, a) => {
      const activeRate = a.promo_interest_rate ?? a.interest_rate ?? 0;
      const res = calculateAccountInterest({
        balance: Number(a.current_balance) || 0,
        ratePercent: Number(activeRate),
        payoutFrequency: a.interest_payout_frequency || 'SEMI_ANNUAL',
        depositStartDate: a.deposit_start_date,
        maturityDate: a.maturity_date,
      });
      return sum + res.accruedToDate;
    }, 0);

  const estimatedAnnualInterest = assets
    .filter((a) => a.account_type !== 'PVD')
    .reduce((sum, a) => {
      const rate = a.promo_interest_rate ?? a.interest_rate ?? 0;
      return sum + ((Number(a.current_balance) || 0) * (rate / 100));
    }, 0);

  // คำนวณวันคงเหลือของโปรโมชัน
  const getPromoDaysLeft = (maturityDateStr: string | null) => {
    if (!maturityDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maturity = new Date(maturityDateStr);
    maturity.setHours(0, 0, 0, 0);
    const diffTime = maturity.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // กรองบัญชีที่โปรโมชันหมดอายุหรือใกล้หมด (<= 14 วัน)
  const expiringAccounts = assets.filter((item) => {
    if (!item.maturity_date) return false;
    const days = getPromoDaysLeft(item.maturity_date);
    return days !== null && days <= 14;
  });

  if (loading) {
    return <div className="p-6 text-center text-gray-500 bg-white rounded-xl border">กำลังโหลดข้อมูลเงินฝากและ PVD...</div>;
  }

  return (
    <div className="space-y-4">
      {/* 1. Alerts Banner (แสดงเมื่อมีบัญชีหมดโปรหรือใกล้ครบกำหนด) */}
      {expiringAccounts.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 font-bold text-base">⚠️ แจ้งเตือนโปรโมชันเงินฝาก:</span>
          </div>
          <div className="space-y-1 text-sm text-amber-900">
            {expiringAccounts.map((acc) => {
              const days = getPromoDaysLeft(acc.maturity_date);
              const isExpired = days !== null && days <= 0;
              return (
                <div key={acc.id} className="flex items-center justify-between">
                  <span>
                    <strong>{acc.account_name}</strong> ({acc.bank_name ?? 'ไม่ระบุธนาคาร'}):{' '}
                    {isExpired
                      ? 'โปรโมชันสิ้นสุดแล้ว! ดอกเบี้ยอาจปรับลงเป็นอัตราปกติ'
                      : `จะหมดโปรโมชันในอีก ${days} วัน (ครบกำหนด ${acc.maturity_date})`}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${isExpired ? 'bg-red-100 text-red-700' : 'bg-amber-200 text-amber-900'}`}>
                    {isExpired ? 'หมดโปรโมชัน' : `เหลือ ${days} วัน`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Top Summary Metrics Cards */}
      <div className={`grid grid-cols-1 ${totalFixedDeposit > 0 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase">เงินสดดอกเบี้ยสูง (High-Yield Cash)</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-1">
            ฿{totalLiquidCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-gray-400 mt-1">เงินฝากสภาพคล่องสูงเพื่อผลตอบแทน</p>
        </div>

        {totalFixedDeposit > 0 && (
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-500 font-medium uppercase">เงินฝากประจำ (Fixed Deposit)</p>
            <h3 className="text-2xl font-bold text-purple-600 mt-1">
              ฿{totalFixedDeposit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-xs text-gray-400 mt-1">เงินฝากประจำระยะยาวรอครบกำหนด</p>
          </div>
        )}

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase">กองทุนสำรองเลี้ยงชีพ (PVD)</p>
          <h3 className="text-2xl font-bold text-blue-600 mt-1">
            ฿{totalPvd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-gray-400 mt-1">สะสมส่วนตัว + สมทบจากนายจ้าง</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase">ดอกเบี้ยคาดการณ์รวมต่อปี (Est. Interest)</p>
          <h3 className="text-2xl font-bold text-emerald-600 mt-1">
            ฿{estimatedAnnualInterest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-gray-400 mt-1">เฉลี่ยเดือนละ ~฿{(estimatedAnnualInterest / 12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* 3. Account List Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-lg font-bold text-gray-800">เงินฝาก & กองทุนสำรองเลี้ยงชีพ (Cash & PVD)</h2>
            <p className="text-xs text-gray-500 mt-0.5">จัดการบัญชีธนาคาร ดอกเบี้ยเงินฝาก และยอดสะสมกองทุน</p>
          </div>

          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            <span>+</span> เพิ่มบัญชีใหม่
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 text-gray-500 text-xs uppercase font-medium">
                <th className="py-3 px-4">
                  <div className="inline-flex items-center gap-1.5">
                    <span>ชื่อบัญชี / ธนาคาร</span>
                    <button
                      type="button"
                      onClick={toggleHideAllAccountNumbers}
                      title={hideAllAccountNumbers ? 'แสดงเลขที่บัญชีทั้งหมด' : 'ซ่อนเลขที่บัญชีทั้งหมด'}
                      className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                      aria-label={hideAllAccountNumbers ? 'แสดงเลขที่บัญชีทั้งหมด' : 'ซ่อนเลขที่บัญชีทั้งหมด'}
                    >
                      {hideAllAccountNumbers ? (
                        <EyeOff className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </th>
                <th className="py-3 px-4">ประเภท</th>
                <th className="py-3 px-4 text-center">อัตราดอกเบี้ย</th>
                <th className="py-3 px-4 text-center">สถานะโปรโมชัน</th>
                <th className="py-3 px-4 text-right">ยอดคงเหลือ (บาท)</th>
                <th className="py-3 px-4 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-400">
                    ยังไม่มีรายการบัญชีเงินฝาก กด "+ เพิ่มบัญชีใหม่" เพื่อเริ่มต้น
                  </td>
                </tr>
              ) : (
                assets.map((item) => {
                  const daysLeft = getPromoDaysLeft(item.maturity_date);
                  const isRowHidden =
                    individualToggles[item.id] !== undefined
                      ? individualToggles[item.id]
                      : hideAllAccountNumbers;

                  return (
                    <tr key={item.id} className="hover:bg-blue-50/30 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-800">{item.account_name}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <span>{item.bank_name ?? 'ไม่ระบุ'}</span>
                          {item.account_number && (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <span>
                                ({isRowHidden ? maskAccountNumber(item.account_number) : item.account_number})
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleRowAccount(item.id)}
                                title={isRowHidden ? 'แสดงเลขที่บัญชี' : 'ซ่อนเลขที่บัญชี'}
                                className="p-0.5 text-gray-400 hover:text-blue-600 rounded transition cursor-pointer"
                                aria-label={isRowHidden ? 'แสดงเลขที่บัญชี' : 'ซ่อนเลขที่บัญชี'}
                              >
                                {isRowHidden ? (
                                  <EyeOff className="w-3 h-3 text-blue-500" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </button>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${
                          item.account_type === 'PVD'
                            ? 'bg-purple-100 text-purple-700'
                            : item.account_type === 'HIGH_YIELD'
                            ? 'bg-blue-100 text-blue-700'
                            : item.account_type === 'FIXED_DEPOSIT'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {item.account_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.account_type === 'PVD' ? (
                          <span className="text-gray-400 text-xs">-</span>
                        ) : (
                          <div className="font-medium text-emerald-600">
                            {item.promo_interest_rate ? `${item.promo_interest_rate}% (โปร)` : `${item.interest_rate ?? 0}%`}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {daysLeft !== null ? (
                          <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                            daysLeft <= 0
                              ? 'bg-red-100 text-red-700'
                              : daysLeft <= 14
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {daysLeft <= 0 ? 'หมดโปรโมชัน' : `เหลือ ${daysLeft} วัน`}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900">
                        ฿{Number(item.current_balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {item.account_type === 'PVD' && (
                          <div className="text-[11px] text-gray-400 font-normal">
                            (ตนเอง: ฿{Number(item.pvd_employee_contrib ?? 0).toLocaleString()} / นายจ้าง: ฿{Number(item.pvd_employer_contrib ?? 0).toLocaleString()})
                          </div>
                        )}
                      </td>
                      {/* 2. คอลัมน์จัดการในตาราง (tbody) */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition text-xs"
                            title="แก้ไขบัญชีนี้"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, item.account_name)}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition text-xs"
                            title="ลบบัญชีนี้"
                          >
                            🗑️
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

      {/* 4. Modal Form สำหรับเพิ่มบัญชี */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-gray-800">
                {editingId ? 'แก้ไขข้อมูลบัญชี' : 'เพิ่มบัญชีเงินฝาก / กองทุน'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">ชื่อเรียกบัญชี *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น KKP Dime! / กรุงศรี มีแต่ได้ / PVD บริษัท"
                    value={formData.account_name}
                    onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                    className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">ประเภทบัญชี *</label>
                  <select
                    value={formData.account_type}
                    onChange={(e) => setFormData({ ...formData, account_type: e.target.value })}
                    className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="HIGH_YIELD">HIGH_YIELD (เงินฝากดอกเบี้ยสูง / บัญชีพักเงิน)</option>
                    <option value="FIXED_DEPOSIT">FIXED_DEPOSIT (เงินฝากประจำ)</option>
                    <option value="PVD">PVD (กองทุนสำรองเลี้ยงชีพ)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">ชื่อธนาคาร / บลจ.</label>
                  <input
                    type="text"
                    placeholder="เช่น SCB, KBank, KKP, TTB"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                    💡 <strong>คำแนะนำการแบ่งหมวดหมู่:</strong> หน้านี้สำหรับสินทรัพย์ล็อก/พักเงินเพื่อผลตอบแทน หากเป็นบัญชีออมทรัพย์ที่ใช้จ่ายในชีวิตประจำวัน/บัตรเครดิต ให้บันทึกในแท็บ <strong>&quot;รับ-จ่าย (Cash Flow)&quot;</strong> เพื่อติดตามกระแสเงินสด
                  </p>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">เลขที่บัญชี (ไม่บังคับ)</label>
                  <input
                    type="text"
                    placeholder="เช่น 123-4-56789-0"
                    value={formData.account_number}
                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                    className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* แสดงฟิลด์เฉพาะ PVD */}
              {formData.account_type === 'PVD' ? (
                <div className="p-3 bg-purple-50 rounded-xl space-y-3 border border-purple-100">
                  <p className="text-xs font-bold text-purple-800">ข้อมูลกองทุนสำรองเลี้ยงชีพ (PVD)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">เงินสะสมส่วนตัว (บาท)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.pvd_employee_contrib}
                        onChange={(e) => setFormData({ ...formData, pvd_employee_contrib: e.target.value })}
                        className="w-full border rounded-lg p-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">เงินสมทบนายจ้าง (บาท)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.pvd_employer_contrib}
                        onChange={(e) => setFormData({ ...formData, pvd_employer_contrib: e.target.value })}
                        className="w-full border rounded-lg p-2 text-sm bg-white"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* บัญชีเงินฝากปกติ */
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">ยอดเงินฝากปัจจุบัน (บาท) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={formData.current_balance}
                      onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                      className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">อัตราดอกเบี้ยปกติ (% ต่อปี)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="1.50"
                        value={formData.interest_rate}
                        onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                        className="w-full border rounded-lg p-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">ดอกเบี้ยโปรโมชัน (% ต่อปี)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="เช่น 2.50"
                        value={formData.promo_interest_rate}
                        onChange={(e) => setFormData({ ...formData, promo_interest_rate: e.target.value })}
                        className="w-full border rounded-lg p-2 text-sm"
                      />
                    </div>
                  </div>

                  {/* ส่วนโปรโมชัน 90 วัน */}
                  <div className="p-3 bg-amber-50 rounded-xl space-y-3 border border-amber-100">
                    <p className="text-xs font-bold text-amber-800">ตั้งค่าโปรโมชันดอกเบี้ยพิเศษ / ฝากประจำ</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">วันที่เริ่มฝาก</label>
                        <input
                          type="date"
                          value={formData.deposit_start_date}
                          onChange={(e) => handlePromoDateChange(e.target.value, formData.promo_duration_days)}
                          className="w-full border rounded-lg p-2 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">ระยะเวลาโปรโมชัน (วัน)</label>
                        <input
                          type="number"
                          placeholder="เช่น 90"
                          value={formData.promo_duration_days}
                          onChange={(e) => handlePromoDateChange(formData.deposit_start_date, e.target.value)}
                          className="w-full border rounded-lg p-2 text-xs bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">วันครบกำหนด (Maturity Date)</label>
                      <input
                        type="date"
                        value={formData.maturity_date}
                        onChange={(e) => setFormData({ ...formData, maturity_date: e.target.value })}
                        className="w-full border rounded-lg p-2 text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
                {/* ...ปุ่ม Submit ด้านล่างสุด... */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'เพิ่มบัญชี'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}