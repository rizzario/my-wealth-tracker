'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  TrendingUp,
  TrendingDown,
  Gift,
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Calendar,
  Filter,
  Wallet,
  Settings2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
  Building2,
  ArrowRightLeft,
  DollarSign,
  AlertCircle,
  Hash,
  ExternalLink,
} from 'lucide-react';
import { CURRENCY_OPTIONS, getCurrencySymbol } from '@/lib/currency';

export interface TradeTransaction {
  id: number | string;
  user_id?: string;
  broker: string;
  order_id?: string | null;
  trade_date: string;
  trade_year?: number;
  side: 'BUY' | 'SELL' | 'FREE' | string;
  stock_symbol: string;
  currency: string;
  units: number;
  unit_price: number;
  exchange_rate: number;
  gross_amount?: number | null;
  fee: number;
  withholding_tax: number;
  net_amount: number;
  gross_amount_thb?: number | null;
  fee_thb: number;
  net_amount_thb: number;
  reason?: string | null;
  account_id?: string | null;
  created_at?: string;
}

export interface FinancialAccountOption {
  id: string;
  account_name: string;
  bank_name?: string | null;
  account_type: string;
  currency?: string;
  current_balance: number;
  is_liability: boolean;
}

interface TradeTransactionsSectionProps {
  onTradesUpdated?: () => void;
}

// รายชื่อโบรกเกอร์ยอดนิยมในไทยและต่างประเทศ
export const POPULAR_BROKERS = [
  'BLS',
  'InnovestX',
  'Dime!',
  'KS',
  'Pi',
  'Liberator',
  'KGI',
  'SBI Thai',
  'Yuanta',
  'FNS',
  'Maybank',
  'IBKR',
  'Binance',
  'Webull',
  'อื่นๆ',
];

// ความกว้างคอลัมน์เริ่มต้น (px)
export const DEFAULT_TRADE_COL_WIDTHS = {
  date: 110,
  broker: 150,
  side: 90,
  symbol: 110,
  units: 110,
  price: 130,
  fee: 100,
  net: 130,
  reason: 180,
  actions: 80,
};

type TradeColKey = keyof typeof DEFAULT_TRADE_COL_WIDTHS;

export default function TradeTransactionsSection({ onTradesUpdated }: TradeTransactionsSectionProps) {
  const supabase = createClient();

  const [trades, setTrades] = useState<TradeTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccountOption[]>([]);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({ THB: 1.0, USD: 33.5 });
  const [loading, setLoading] = useState(true);

  // Broker-to-Account Mapping state (persisted in localStorage)
  const [brokerAccountMap, setBrokerAccountMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('broker_account_mappings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('ALL');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'FREE'>('ALL');
  const [yearFilter, setYearFilter] = useState<string>('ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('trades_page_size');
      if (saved) return Number(saved);
    } catch {}
    return 20;
  });

  // Resizable Columns State
  const [colWidths, setColWidths] = useState<Record<TradeColKey, number>>(() => {
    try {
      const saved = localStorage.getItem('trades_col_widths');
      if (saved) return { ...DEFAULT_TRADE_COL_WIDTHS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_TRADE_COL_WIDTHS;
  });
  const [isResizing, setIsResizing] = useState(false);

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<number | string | null>(null);

  // Form Fields
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formBroker, setFormBroker] = useState('BLS');
  const [formAccountId, setFormAccountId] = useState('');
  const [formSaveAsDefault, setFormSaveAsDefault] = useState(true);
  const [formSide, setFormSide] = useState<'BUY' | 'SELL' | 'FREE'>('BUY');
  const [formSymbol, setFormSymbol] = useState('');
  const [formCurrency, setFormCurrency] = useState('THB');
  const [formUnits, setFormUnits] = useState('');
  const [formUnitPrice, setFormUnitPrice] = useState('');
  const [formExchangeRate, setFormExchangeRate] = useState('1.0');
  const [formFee, setFormFee] = useState('0');
  const [formWithholdingTax, setFormWithholdingTax] = useState('0');
  const [formReason, setFormReason] = useState('');
  const [formOrderId, setFormOrderId] = useState('');
  const [formSyncBalance, setFormSyncBalance] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Broker Accounts Settings Modal
  const [isBrokerSettingsOpen, setIsBrokerSettingsOpen] = useState(false);

  // ดึงข้อมูลบัญชีและรายการเทรด
  const fetchData = async () => {
    try {
      setLoading(true);

      // 1. ดึง financial_accounts
      const { data: accData } = await supabase
        .from('financial_accounts')
        .select('id, account_name, bank_name, account_type, currency, current_balance, is_liability')
        .order('account_name', { ascending: true });
      if (accData) setAccounts(accData as FinancialAccountOption[]);

      // 2. ดึง currency_exchange_rates
      const { data: fxData } = await supabase.from('currency_exchange_rates').select('currency, rate_to_thb');
      if (fxData && fxData.length > 0) {
        const rates: Record<string, number> = { THB: 1.0 };
        fxData.forEach((row) => {
          rates[row.currency] = Number(row.rate_to_thb);
        });
        setExchangeRates(rates);
      }

      // 3. ดึง trade_transactions
      const { data: tradeData, error: tradeErr } = await supabase
        .from('trade_transactions')
        .select('*')
        .order('trade_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (tradeErr) {
        console.error('Error fetching trade transactions:', tradeErr.message);
      } else {
        setTrades((tradeData || []) as TradeTransaction[]);
      }
    } catch (err: any) {
      console.error('Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // บันทึก Broker-to-Account Mapping ลง localStorage
  const saveBrokerAccountMapping = (broker: string, accountId: string) => {
    if (!broker) return;
    const updated = { ...brokerAccountMap, [broker]: accountId };
    setBrokerAccountMap(updated);
    try {
      localStorage.setItem('broker_account_mappings', JSON.stringify(updated));
    } catch {}
  };

  // ดึงปีทั้งหมดที่มีรายการเทรด เพื่อนำมาทำ Filter
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    trades.forEach((t) => {
      if (t.trade_date) {
        const y = new Date(t.trade_date).getFullYear();
        if (!isNaN(y)) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [trades]);

  // ดึงรายชื่อโบรกเกอร์ทั้งหมดที่มีการใช้งาน
  const availableBrokers = useMemo(() => {
    const list = new Set(POPULAR_BROKERS);
    trades.forEach((t) => {
      if (t.broker?.trim()) list.add(t.broker.trim());
    });
    return Array.from(list);
  }, [trades]);

  // คำนวณสรุปผลรวม (Metrics)
  const summaryMetrics = useMemo(() => {
    let totalBuyThb = 0;
    let totalSellThb = 0;
    let totalFeeThb = 0;
    let buyCount = 0;
    let sellCount = 0;

    trades.forEach((t) => {
      const netThb = Number(t.net_amount_thb || 0);
      const feeThb = Number(t.fee_thb || 0);
      totalFeeThb += feeThb;

      if (t.side === 'BUY') {
        totalBuyThb += netThb;
        buyCount++;
      } else if (t.side === 'SELL') {
        totalSellThb += netThb;
        sellCount++;
      }
    });

    const netCashFlow = totalSellThb - totalBuyThb; // ติดลบคือลงทุนเพิ่ม, บวกคือถอนกำไรออก

    return {
      totalBuyThb,
      totalSellThb,
      totalFeeThb,
      buyCount,
      sellCount,
      totalTrades: trades.length,
      netCashFlow,
    };
  }, [trades]);

  // กรองรายการเทรด
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchSymbol = (t.stock_symbol || '').toLowerCase().includes(q);
        const matchBroker = (t.broker || '').toLowerCase().includes(q);
        const matchReason = (t.reason || '').toLowerCase().includes(q);
        const matchOrderId = (t.order_id || '').toLowerCase().includes(q);
        if (!matchSymbol && !matchBroker && !matchReason && !matchOrderId) return false;
      }

      // 2. Broker Filter
      if (brokerFilter !== 'ALL' && t.broker !== brokerFilter) return false;

      // 3. Side Filter
      if (sideFilter !== 'ALL' && t.side !== sideFilter) return false;

      // 4. Year Filter
      if (yearFilter !== 'ALL' && t.trade_date) {
        const y = new Date(t.trade_date).getFullYear();
        if (String(y) !== yearFilter) return false;
      }

      // 5. Account Filter
      if (accountFilter !== 'ALL' && t.account_id !== accountFilter) return false;

      return true;
    });
  }, [trades, searchQuery, brokerFilter, sideFilter, yearFilter, accountFilter]);

  // Auto-reset page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, brokerFilter, sideFilter, yearFilter, accountFilter]);

  // Pagination Math
  const totalPages = Math.ceil(filteredTrades.length / pageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredTrades.length);
  const paginatedTrades = filteredTrades.slice(startIndex, endIndex);

  // Column Resizing Handlers
  const handleMouseDownResize = (colKey: TradeColKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = colWidths[colKey];

    const minWidths: Record<TradeColKey, number> = {
      date: 90,
      broker: 110,
      side: 70,
      symbol: 80,
      units: 80,
      price: 90,
      fee: 70,
      net: 100,
      reason: 120,
      actions: 60,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(minWidths[colKey] || 60, startWidth + deltaX);
      setColWidths((prev) => {
        const updated = { ...prev, [colKey]: newWidth };
        try {
          localStorage.setItem('trades_col_widths', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResetColumnWidths = () => {
    setColWidths(DEFAULT_TRADE_COL_WIDTHS);
    try {
      localStorage.removeItem('trades_col_widths');
    } catch {}
  };

  // เมื่อเปลี่ยนโบรกเกอร์ในฟอร์ม ให้สลับไปใช้บัญชีที่ผูกไว้กับโบรกเกอร์นั้นทันที
  const handleBrokerChange = (newBroker: string) => {
    setFormBroker(newBroker);
    const boundAccountId = brokerAccountMap[newBroker];
    if (boundAccountId) {
      setFormAccountId(boundAccountId);
    }
  };

  // เมื่อเปลี่ยนสกุลเงินในฟอร์ม ให้อัปเดต Exchange Rate อัตโนมัติ
  const handleCurrencyChange = (newCurr: string) => {
    setFormCurrency(newCurr);
    if (newCurr === 'THB') {
      setFormExchangeRate('1.0');
    } else if (exchangeRates[newCurr]) {
      setFormExchangeRate(String(exchangeRates[newCurr]));
    }
  };

  // เปิด Modal เพิ่มรายการ
  const handleOpenCreateModal = () => {
    setModalMode('create');
    setEditingId(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    const defaultBroker = 'BLS';
    setFormBroker(defaultBroker);
    setFormAccountId(brokerAccountMap[defaultBroker] || '');
    setFormSaveAsDefault(true);
    setFormSide('BUY');
    setFormSymbol('');
    setFormCurrency('THB');
    setFormUnits('');
    setFormUnitPrice('');
    setFormExchangeRate('1.0');
    setFormFee('0');
    setFormWithholdingTax('0');
    setFormReason('');
    setFormOrderId('');
    setFormSyncBalance(false);
    setIsModalOpen(true);
  };

  // เปิด Modal แก้ไขรายการ
  const handleOpenEditModal = (t: TradeTransaction) => {
    setModalMode('edit');
    setEditingId(t.id);
    setFormDate(t.trade_date);
    setFormBroker(t.broker);
    setFormAccountId(t.account_id || brokerAccountMap[t.broker] || '');
    setFormSaveAsDefault(false);
    setFormSide((t.side as any) || 'BUY');
    setFormSymbol(t.stock_symbol);
    setFormCurrency(t.currency || 'THB');
    setFormUnits(String(t.units));
    setFormUnitPrice(String(t.unit_price));
    setFormExchangeRate(String(t.exchange_rate || 1.0));
    setFormFee(String(t.fee || 0));
    setFormWithholdingTax(String(t.withholding_tax || 0));
    setFormReason(t.reason || '');
    setFormOrderId(t.order_id || '');
    setFormSyncBalance(false);
    setIsModalOpen(true);
  };

  // คำนวณยอด Gross & Net ในฟอร์มแบบเรียลไทม์
  const formCalculations = useMemo(() => {
    const u = parseFloat(formUnits) || 0;
    const p = parseFloat(formUnitPrice) || 0;
    const fx = parseFloat(formExchangeRate) || 1.0;
    const feeVal = parseFloat(formFee) || 0;
    const whtVal = parseFloat(formWithholdingTax) || 0;

    const gross = u * p;
    let net = gross;

    if (formSide === 'BUY') {
      net = gross + feeVal + whtVal;
    } else if (formSide === 'SELL') {
      net = Math.max(0, gross - feeVal - whtVal);
    } else {
      // FREE (Stock Dividend)
      net = feeVal + whtVal;
    }

    const grossThb = gross * fx;
    const feeThb = feeVal * fx;
    const netThb = net * fx;

    return { gross, net, grossThb, feeThb, netThb, fx };
  }, [formUnits, formUnitPrice, formExchangeRate, formFee, formWithholdingTax, formSide]);

  // บันทึกรายการใหม่ หรือ บันทึกการแก้ไข
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSymbol.trim()) {
      alert('กรุณาระบุสัญลักษณ์หุ้น/สินทรัพย์');
      return;
    }
    const unitsNum = parseFloat(formUnits);
    const priceNum = parseFloat(formUnitPrice);
    if (isNaN(unitsNum) || unitsNum <= 0) {
      alert('กรุณาระบุจำนวนหน่วยที่มากกว่า 0');
      return;
    }
    if (isNaN(priceNum) || priceNum < 0) {
      alert('กรุณาระบุราคาต่อหน่วยที่ถูกต้อง');
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();

      const payload: any = {
        broker: formBroker.trim(),
        order_id: formOrderId.trim() || null,
        trade_date: formDate,
        side: formSide,
        stock_symbol: formSymbol.trim().toUpperCase(),
        currency: formCurrency,
        units: unitsNum,
        unit_price: priceNum,
        exchange_rate: formCalculations.fx,
        gross_amount: formCalculations.gross,
        fee: parseFloat(formFee) || 0,
        withholding_tax: parseFloat(formWithholdingTax) || 0,
        net_amount: formCalculations.net,
        gross_amount_thb: formCalculations.grossThb,
        fee_thb: formCalculations.feeThb,
        net_amount_thb: formCalculations.netThb,
        reason: formReason.trim() || null,
        account_id: formAccountId || null,
      };

      if (user?.id) payload.user_id = user.id;

      // บันทึก default mapping ถ้าผู้ใช้เลือกไว้
      if (formSaveAsDefault && formBroker && formAccountId) {
        saveBrokerAccountMapping(formBroker, formAccountId);
      }

      let saveError: any = null;

      if (modalMode === 'create') {
        const { error } = await supabase.from('trade_transactions').insert(payload);
        saveError = error;
      } else {
        const { error } = await supabase.from('trade_transactions').update(payload).eq('id', editingId);
        saveError = error;
      }

      // ตรวจสอบกรณีฐานข้อมูลยังไม่ได้เพิ่มคอลัมน์ account_id
      if (saveError) {
        if (saveError.message?.includes('column trade_transactions.account_id does not exist')) {
          const retryWithoutAccount = confirm(
            '⚠️ ข้อควรทราบจากฐานข้อมูล:\n' +
            'ตาราง trade_transactions ใน Supabase ยังไม่มีคอลัมน์ account_id (ยังไม่ได้รัน SQL Migration)\n\n' +
            '👉 คำสั่ง SQL สำหรับเพิ่มคอลัมน์:\n' +
            'ALTER TABLE public.trade_transactions ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL;\n\n' +
            'คุณต้องการบันทึกข้อมูลการเทรดนี้โดย "ไม่บันทึก account_id ลง DB" ชั่วคราวก่อนหรือไม่? (ระบบจะยังคงจำการผูกบัญชีในเครื่องให้ตามปกติ)'
          );
          if (retryWithoutAccount) {
            delete payload.account_id;
            if (modalMode === 'create') {
              const { error: rErr } = await supabase.from('trade_transactions').insert(payload);
              if (rErr) throw rErr;
            } else {
              const { error: rErr } = await supabase.from('trade_transactions').update(payload).eq('id', editingId);
              if (rErr) throw rErr;
            }
          } else {
            return;
          }
        } else {
          throw saveError;
        }
      }

      // ถ้าเลือกให้ตัดเงิน/เพิ่มเงินในบัญชีที่ผูกโดยอัตโนมัติ
      if (formSyncBalance && formAccountId) {
        const targetAcc = accounts.find((a) => a.id === formAccountId);
        if (targetAcc) {
          const delta = formSide === 'BUY' ? -formCalculations.netThb : formSide === 'SELL' ? formCalculations.netThb : 0;
          if (delta !== 0) {
            const newBal = (Number(targetAcc.current_balance) || 0) + delta;
            await supabase
              .from('financial_accounts')
              .update({ current_balance: newBal, updated_at: new Date().toISOString() })
              .eq('id', formAccountId);
          }
        }
      }

      setIsModalOpen(false);
      await fetchData();
      onTradesUpdated?.();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ลบรายการเทรด
  const handleDeleteTrade = async (t: TradeTransaction) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายการ ${t.side} ${t.stock_symbol} (วันที่ ${t.trade_date})?`)) return;
    try {
      const { error } = await supabase.from('trade_transactions').delete().eq('id', t.id);
      if (error) throw error;
      await fetchData();
      onTradesUpdated?.();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการลบ: ' + err.message);
    }
  };

  // หาชื่อบัญชีที่ผูกไว้
  const getAccountLabel = (accountId?: string | null, brokerName?: string) => {
    const accId = accountId || (brokerName ? brokerAccountMap[brokerName] : null);
    if (!accId) return null;
    const acc = accounts.find((a) => a.id === accId);
    if (!acc) return null;
    return `${acc.bank_name ? `[${acc.bank_name}] ` : ''}${acc.account_name}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            <span>ประวัติการเทรด & บันทึกคำสั่งซื้อขาย (Trade Ledger)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            บันทึกประวัติการซื้อ-ขายหุ้น คริปโต กองทุน พร้อมเชื่อมโยงบัญชีการเงินที่ใช้ตัดเงิน/รับเงินตามแต่ละโบรกเกอร์
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {/* ปุ่มตั้งค่าผูกบัญชีประจำโบรกเกอร์ */}
          <button
            type="button"
            onClick={() => setIsBrokerSettingsOpen(true)}
            className="px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="ตั้งค่าผูกบัญชีการเงินประจำโบรกเกอร์ (เช่น BLS -> BBL ATS)"
          >
            <Settings2 className="w-3.5 h-3.5 text-slate-600" />
            <span>ผูกบัญชีโบรกเกอร์</span>
          </button>

          {/* ปุ่มเพิ่มรายการเทรดใหม่ */}
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="flex-1 sm:flex-none px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>บันทึก Trade ใหม่</span>
          </button>
        </div>
      </div>

      {/* 2. Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* ยอดซื้อรวม */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-emerald-100 text-emerald-700">
              <TrendingDown className="w-3.5 h-3.5 rotate-180" />
            </span>
            ยอดซื้อสะสม (BUY)
          </span>
          <p className="text-xl font-bold text-slate-900 mt-2">
            ฿{summaryMetrics.totalBuyThb.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">{summaryMetrics.buyCount} รายการซื้อ</p>
        </div>

        {/* ยอดขายรวม */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-rose-100 text-rose-700">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
            ยอดขายสะสม (SELL)
          </span>
          <p className="text-xl font-bold text-slate-900 mt-2">
            ฿{summaryMetrics.totalSellThb.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">{summaryMetrics.sellCount} รายการขาย</p>
        </div>

        {/* กระแสเงินสุทธิเข้า/ออกจากการเทรด */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-indigo-100 text-indigo-700">
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </span>
            กระแสเงินสดสุทธิ (Net Flow)
          </span>
          <p className={`text-xl font-bold mt-2 ${summaryMetrics.netCashFlow >= 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
            {summaryMetrics.netCashFlow >= 0 ? '+' : ''}฿{summaryMetrics.netCashFlow.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {summaryMetrics.netCashFlow >= 0 ? 'เงินสดรับมากกว่าเงินที่ซื้อ' : 'ยอดลงทุนสะสมสุทธิ'}
          </p>
        </div>

        {/* ค่าธรรมเนียมรวม */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-amber-100 text-amber-700">
              <DollarSign className="w-3.5 h-3.5" />
            </span>
            ค่าธรรมเนียมรวม (Fees)
          </span>
          <p className="text-xl font-bold text-amber-600 mt-2">
            ฿{summaryMetrics.totalFeeThb.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">รวมค่าคอมมิชชั่น & VAT</p>
        </div>

        {/* จำนวนธุรกรรมทั้งหมด */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs col-span-2 lg:col-span-1">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-slate-100 text-slate-700">
              <Hash className="w-3.5 h-3.5" />
            </span>
            จำนวนรายการ
          </span>
          <p className="text-xl font-bold text-slate-800 mt-2">{summaryMetrics.totalTrades} รายการ</p>
          <p className="text-[11px] text-slate-400 mt-0.5">ในประวัติการเทรดทั้งหมด</p>
        </div>
      </div>

      {/* 3. Filter Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* ช่องค้นหา */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาหุ้น, โบรกเกอร์, เลข Order, เหตุผล..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          {/* ฟิลเตอร์ประเภทคำสั่ง (Side) */}
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs">
            {(['ALL', 'BUY', 'SELL', 'FREE'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSideFilter(s)}
                className={`px-3 py-1 font-semibold rounded-lg transition cursor-pointer ${
                  sideFilter === s
                    ? s === 'BUY'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : s === 'SELL'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : s === 'FREE'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s === 'ALL' ? 'ทั้งหมด' : s === 'BUY' ? 'ซื้อ (BUY)' : s === 'SELL' ? 'ขาย (SELL)' : 'ปันผลหุ้น (FREE)'}
              </button>
            ))}
          </div>

          {/* ฟิลเตอร์โบรกเกอร์ */}
          <select
            value={brokerFilter}
            onChange={(e) => setBrokerFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="ALL">โบรกเกอร์ทั้งหมด</option>
            {availableBrokers.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {/* ฟิลเตอร์ปี */}
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="ALL">ทุกปี</option>
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>
                ปี {y}
              </option>
            ))}
          </select>

          {/* ฟิลเตอร์บัญชีการเงินที่ผูก */}
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white max-w-[200px] truncate"
          >
            <option value="ALL">บัญชีการเงินทั้งหมด</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bank_name ? `[${a.bank_name}] ` : ''}{a.account_name}
              </option>
            ))}
          </select>

          {/* ปุ่มรีเซ็ตคอลัมน์ */}
          <button
            type="button"
            onClick={handleResetColumnWidths}
            className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition flex items-center gap-1 cursor-pointer"
            title="รีเซ็ตความกว้างคอลัมน์ทั้งหมดเป็นค่าเริ่มต้น"
          >
            <RotateCcw className="w-3 h-3 text-slate-400" />
            <span className="hidden sm:inline">รีเซ็ตคอลัมน์</span>
          </button>
        </div>
      </div>

      {/* 4. Table Ledger */}
      <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden ${isResizing ? 'select-none' : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed text-xs">
            <colgroup>
              <col style={{ width: `${colWidths.date}px` }} />
              <col style={{ width: `${colWidths.broker}px` }} />
              <col style={{ width: `${colWidths.side}px` }} />
              <col style={{ width: `${colWidths.symbol}px` }} />
              <col style={{ width: `${colWidths.units}px` }} />
              <col style={{ width: `${colWidths.price}px` }} />
              <col style={{ width: `${colWidths.fee}px` }} />
              <col style={{ width: `${colWidths.net}px` }} />
              <col style={{ width: `${colWidths.reason}px` }} />
              <col style={{ width: `${colWidths.actions}px` }} />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold select-none">
                {/* วันที่ */}
                <th className="py-3 px-3 relative group">
                  <span>วันที่</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('date', e)}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-400/40 transition group-hover:bg-slate-200"
                  />
                </th>

                {/* โบรกเกอร์ & บัญชี */}
                <th className="py-3 px-3 relative group">
                  <span>โบรกเกอร์ / บัญชี</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('broker', e)}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-400/40 transition group-hover:bg-slate-200"
                  />
                </th>

                {/* ฝั่งคำสั่ง */}
                <th className="py-3 px-3 relative group text-center">
                  <span>ประเภท</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('side', e)}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-400/40 transition group-hover:bg-slate-200"
                  />
                </th>

                {/* สัญลักษณ์หุ้น */}
                <th className="py-3 px-3 relative group">
                  <span>สัญลักษณ์</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('symbol', e)}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-400/40 transition group-hover:bg-slate-200"
                  />
                </th>

                {/* จำนวนหน่วย */}
                <th className="py-3 px-3 relative group text-right">
                  <span>จำนวนหุ้น/หน่วย</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('units', e)}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-400/40 transition group-hover:bg-slate-200"
                  />
                </th>

                {/* ราคา/หน่วย */}
                <th className="py-3 px-3 relative group text-right">
                  <span>ราคา/หน่วย</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('price', e)}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-400/40 transition group-hover:bg-slate-200"
                  />
                </th>

                {/* ค่าธรรมเนียม */}
                <th className="py-3 px-3 relative group text-right">
                  <span>ค่าธรรมเนียม</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('fee', e)}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-400/40 transition group-hover:bg-slate-200"
                  />
                </th>

                {/* ยอดเงินสุทธิ */}
                <th className="py-3 px-3 relative group text-right">
                  <span>ยอดสุทธิ (THB)</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('net', e)}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-400/40 transition group-hover:bg-slate-200"
                  />
                </th>

                {/* เหตุผล / บันทึก */}
                <th className="py-3 px-3 relative group">
                  <span>เหตุผล / บันทึก</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('reason', e)}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-400/40 transition group-hover:bg-slate-200"
                  />
                </th>

                {/* เครื่องมือจัดการ */}
                <th className="py-3 px-3 text-center">
                  <span>จัดการ</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-sans">
                    กำลังโหลดข้อมูลการซื้อขาย...
                  </td>
                </tr>
              ) : paginatedTrades.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-sans">
                    {trades.length === 0 ? 'ยังไม่มีประวัติการซื้อขาย คลิก "+ บันทึก Trade ใหม่" เพื่อเริ่มต้น' : 'ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา'}
                  </td>
                </tr>
              ) : (
                paginatedTrades.map((t) => {
                  const isBuy = t.side === 'BUY';
                  const isSell = t.side === 'SELL';
                  const isFree = t.side === 'FREE';
                  const boundAccName = getAccountLabel(t.account_id, t.broker);
                  const currSym = getCurrencySymbol(t.currency);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition">
                      {/* วันที่ */}
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{t.trade_date}</td>

                      {/* โบรกเกอร์ & บัญชี */}
                      <td className="py-2.5 px-3 truncate" title={`${t.broker}${boundAccName ? ` (${boundAccName})` : ''}`}>
                        <div className="font-sans font-semibold text-slate-800">{t.broker}</div>
                        {boundAccName ? (
                          <div className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                            <Wallet className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span className="truncate">{boundAccName}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-300">ไม่ได้ผูกบัญชี</span>
                        )}
                      </td>

                      {/* ฝั่งคำสั่ง */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-sans ${
                            isBuy
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isSell
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {isBuy ? 'ซื้อ' : isSell ? 'ขาย' : 'ฟรี/ปันผล'}
                        </span>
                      </td>

                      {/* สัญลักษณ์ */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-bold text-slate-900 font-sans">{t.stock_symbol}</span>
                        {t.currency && t.currency !== 'THB' && (
                          <span className="ml-1 text-[10px] text-slate-400 font-sans">({t.currency})</span>
                        )}
                      </td>

                      {/* จำนวนหุ้น */}
                      <td className="py-2.5 px-3 text-right text-slate-700">
                        {Number(t.units).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                      </td>

                      {/* ราคาต่อหน่วย */}
                      <td className="py-2.5 px-3 text-right text-slate-700">
                        {currSym}{Number(t.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </td>

                      {/* ค่าธรรมเนียม */}
                      <td className="py-2.5 px-3 text-right text-slate-500 text-[11px]">
                        {Number(t.fee_thb || 0) > 0 ? `฿${Number(t.fee_thb).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                      </td>

                      {/* ยอดเงินสุทธิ */}
                      <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
                        <span className={isBuy ? 'text-emerald-700' : isSell ? 'text-rose-700' : 'text-blue-700'}>
                          {isBuy ? '-' : isSell ? '+' : ''}฿{Number(t.net_amount_thb || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* เหตุผล / บันทึก */}
                      <td className="py-2.5 px-3 text-slate-500 font-sans truncate" title={t.reason || t.order_id || ''}>
                        {t.reason || (t.order_id ? `#${t.order_id}` : '-')}
                      </td>

                      {/* เครื่องมือจัดการ */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap font-sans">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(t)}
                            className="p-1 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            title="แก้ไขรายการ"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTrade(t)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            title="ลบรายการ"
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

        {/* 5. Pagination Bar */}
        {filteredTrades.length > 0 && (
          <div className="p-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span>แสดง</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const s = Number(e.target.value);
                  setPageSize(s);
                  try {
                    localStorage.setItem('trades_page_size', String(s));
                  } catch {}
                }}
                className="px-2 py-1 text-xs border border-slate-300 rounded-lg outline-none bg-white font-medium cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>รายการต่อหน้า</span>
              <span className="text-slate-400">|</span>
              <span className="font-medium text-slate-700">
                แสดง {startIndex + 1} - {endIndex} จาก {filteredTrades.length} รายการ
              </span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1 font-sans">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={safeCurrentPage <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                  title="หน้าแรกสุด"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                  title="หน้าก่อนหน้า"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <span className="px-2.5 py-1 font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg">
                  {safeCurrentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                  title="หน้าถัดไป"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
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

      {/* 6. Modal: Add / Edit Trade Transaction */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col relative animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-800">
                  {modalMode === 'create' ? 'บันทึกการซื้อขายใหม่ (New Trade)' : 'แก้ไขรายการซื้อขาย'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitForm} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* สลับประเภท ซื้อ / ขาย / ปันผลหุ้น */}
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setFormSide('BUY')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    formSide === 'BUY' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5 rotate-180" />
                  <span>ซื้อ (BUY)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormSide('SELL')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    formSide === 'SELL' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>ขาย (SELL)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormSide('FREE')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    formSide === 'FREE' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Gift className="w-3.5 h-3.5" />
                  <span>ปันผลหุ้น (FREE)</span>
                </button>
              </div>

              {/* วันที่ และ โบรกเกอร์ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    วันที่ทำรายการ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    โบรกเกอร์ (Broker) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    list="popular-brokers-list"
                    value={formBroker}
                    onChange={(e) => handleBrokerChange(e.target.value)}
                    placeholder="เช่น BLS, InnovestX, Dime"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                  <datalist id="popular-brokers-list">
                    {availableBrokers.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* บัญชีการเงินที่ผูกกับโบรกเกอร์ (Account Binding) */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>บัญชีการเงินที่ผูก (Linked Financial Account)</span>
                  </label>
                  {brokerAccountMap[formBroker] && (
                    <span className="text-[10px] text-emerald-600 font-medium">ผูกกับ {formBroker} อัตโนมัติ</span>
                  )}
                </div>

                <select
                  value={formAccountId}
                  onChange={(e) => setFormAccountId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="">-- ไม่ระบุบัญชี --</option>
                  {accounts.map((acc) => {
                    const curr = (acc.currency || 'THB').toUpperCase();
                    return (
                      <option key={acc.id} value={acc.id}>
                        {acc.bank_name ? `[${acc.bank_name}] ` : ''}{acc.account_name} (คงเหลือ: ฿{Number(acc.current_balance || 0).toLocaleString()})
                      </option>
                    );
                  })}
                </select>

                <div className="flex items-center justify-between text-[11px] pt-1">
                  <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSaveAsDefault}
                      onChange={(e) => setFormSaveAsDefault(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>จำบัญชีนี้เป็นค่าเริ่มต้นสำหรับ {formBroker || 'โบรกเกอร์นี้'}</span>
                  </label>

                  <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer" title="ปรับยอดเงินคงเหลือในบัญชีนี้ตามยอดสุทธิของคำสั่งซื้อขาย">
                    <input
                      type="checkbox"
                      checked={formSyncBalance}
                      onChange={(e) => setFormSyncBalance(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>ปรับยอดเงินในบัญชีทันที</span>
                  </label>
                </div>
              </div>

              {/* สัญลักษณ์ และ สกุลเงิน */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    สัญลักษณ์หุ้น / เหรียญ (Symbol) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formSymbol}
                    onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                    placeholder="เช่น PTT, AAPL, BTC, SCB"
                    className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">สกุลเงิน</label>
                  <select
                    value={formCurrency}
                    onChange={(e) => handleCurrencyChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* จำนวนหุ้น และ ราคาต่อหน่วย */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    จำนวนหุ้น / หน่วย (Units) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.00000001"
                    required
                    value={formUnits}
                    onChange={(e) => setFormUnits(e.target.value)}
                    placeholder="เช่น 1000 หรือ 0.5"
                    className="w-full px-3 py-2 text-xs font-mono font-semibold border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ราคาต่อหน่วย (Unit Price) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={formUnitPrice}
                    onChange={(e) => setFormUnitPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs font-mono font-semibold border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>
              </div>

              {/* อัตราแลกเปลี่ยน (ถ้าไม่ใช่ THB) */}
              {formCurrency !== 'THB' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    อัตราแลกเปลี่ยน ({formCurrency} ➔ THB)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.0001"
                    required
                    value={formExchangeRate}
                    onChange={(e) => setFormExchangeRate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>
              )}

              {/* ค่าธรรมเนียม และ ภาษีหัก ณ ที่จ่าย */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ค่าธรรมเนียม + VAT ({getCurrencySymbol(formCurrency)})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={formFee}
                    onChange={(e) => setFormFee(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ภาษีหัก ณ ที่จ่าย (WHT)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={formWithholdingTax}
                    onChange={(e) => setFormWithholdingTax(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>
              </div>

              {/* สรุปยอดเงินคำนวณอัตโนมัติ */}
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-emerald-800 font-semibold block">ยอดสุทธิที่ต้องชำระ/ได้รับ (Net Amount)</span>
                  <span className="text-xs text-emerald-700">
                    Gross: {getCurrencySymbol(formCurrency)}{formCalculations.gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-emerald-900 block font-mono">
                    ฿{formCalculations.netThb.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  {formCurrency !== 'THB' && (
                    <span className="text-[11px] text-emerald-700 font-mono">
                      ({getCurrencySymbol(formCurrency)}{formCalculations.net.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                    </span>
                  )}
                </div>
              </div>

              {/* เหตุผลในการซื้อขาย และ เลขที่คำสั่ง */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">เหตุผล / กลยุทธ์ในการเทรด (Reason)</label>
                  <input
                    type="text"
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    placeholder="เช่น ซื้อ DCA รายเดือน, รับปันผล, Stop loss"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">เลข Order (ถ้ามี)</label>
                  <input
                    type="text"
                    value={formOrderId}
                    onChange={(e) => setFormOrderId(e.target.value)}
                    placeholder="ORD-12345"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {submitting ? 'กำลังบันทึก...' : modalMode === 'create' ? 'บันทึก Trade' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal: Broker Accounts Settings */}
      {isBrokerSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-800">ตั้งค่าผูกบัญชีการเงินประจำโบรกเกอร์</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsBrokerSettingsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <p className="text-xs text-slate-500 leading-relaxed">
                กำหนดว่าเมื่อเลือกโบรกเกอร์ใด ให้ดึงบัญชีการเงินใดจาก <code>financial_accounts</code> มาเป็นค่าเริ่มต้นให้อัตโนมัติ (เช่น <strong>BLS</strong> ➔ ผูกกับ <strong>[BBL] บัญชีออมทรัพย์ ATS</strong> หรือ <strong>BLS Cash Balance</strong>)
              </p>

              <div className="space-y-3 divide-y divide-slate-100">
                {availableBrokers.map((b) => {
                  const currentAccountId = brokerAccountMap[b] || '';
                  return (
                    <div key={b} className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-800 min-w-[90px]">{b}</span>
                      </div>
                      <select
                        value={currentAccountId}
                        onChange={(e) => saveBrokerAccountMapping(b, e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="">-- ไม่ได้ผูกบัญชี --</option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.bank_name ? `[${acc.bank_name}] ` : ''}{acc.account_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsBrokerSettingsOpen(false)}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition cursor-pointer shadow-xs"
                >
                  เสร็จสิ้น
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
