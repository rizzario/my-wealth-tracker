'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  Check,
  X,
  RotateCw,
  Loader2,
  Plus,
  Trash2,
  Calculator,
  AlertCircle,
  Building2,
  Wallet,
  TrendingDown,
  TrendingUp,
  Coins,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { CURRENCY_OPTIONS, getCurrencySymbol } from '@/lib/currency';
import { POPULAR_BROKERS } from './TradeTransactionsSection';
import {
  parseGoldSymbol,
  parseNumberWithSuffix,
  calculateGoldMetrics,
  THAI_BAHT_WEIGHT_GRAMS,
  TROY_OUNCE_IN_GRAMS,
} from '@/lib/gold';

export interface Holding {
  id: string;
  user_id?: string;
  symbol: string;
  broker?: string | null;
  volume: number;
  currency: string;
  initial_cost: number;
  present_price: number | null;
  exchange_rate?: number;
  cost_exchange_rate?: number;
  total_cost?: number;
  total_cost_thb?: number;
  total_present_price?: number;
  total_present_price_thb?: number;
  yield_percent?: number;
  updated_at?: string;
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

type SortField = 'symbol' | 'broker' | 'volume' | 'initial_cost' | 'present_price' | 'yield_percent';
type SortDirection = 'asc' | 'desc';

interface PortfolioTableProps {
  onHoldingsUpdated?: () => void;
}

interface HoldingFormData {
  symbol: string;
  broker: string;
  currency: string;
  volume: string;
  initial_cost: string;
  present_price: string;
  accountId: string;
  recordTrade: boolean;
}

const initialHoldingForm: HoldingFormData = {
  symbol: '',
  broker: 'BLS',
  currency: 'THB',
  volume: '',
  initial_cost: '',
  present_price: '',
  accountId: '',
  recordTrade: true,
};

export default function PortfolioTable({ onHoldingsUpdated }: PortfolioTableProps) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccountOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [updatingRowId, setUpdatingRowId] = useState<string | null>(null);
  const [fxRates, setFxRates] = useState<Record<string, number>>({ THB: 1.0 });

  // Broker-to-Account Mapping state (persisted in localStorage)
  const [brokerAccountMap, setBrokerAccountMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('broker_account_mappings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('symbol');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Inline present_price editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPriceInput, setEditPriceInput] = useState<string>('');
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [formData, setFormData] = useState<HoldingFormData>(initialHoldingForm);
  const [submittingHolding, setSubmittingHolding] = useState(false);

  // Buy on Dip & Stop Loss calculator helper states
  const [calcMode, setCalcMode] = useState<'dip' | 'sell'>('dip');
  const [dipInputMode, setDipInputMode] = useState<'units' | 'budget'>('units');
  const [dipAddUnits, setDipAddUnits] = useState('');
  const [dipAddPrice, setDipAddPrice] = useState('');
  const [dipBudget, setDipBudget] = useState('');
  const [sellUnits, setSellUnits] = useState('');
  const [calcNotice, setCalcNotice] = useState<string | null>(null);

  // Pending calculator trade states for Edit mode
  const [recordDipTrade, setRecordDipTrade] = useState(true);
  const [pendingDipTrade, setPendingDipTrade] = useState<{ units: number; price: number; reason?: string } | null>(null);

  const [recordSellTrade, setRecordSellTrade] = useState(true);
  const [pendingSellTrade, setPendingSellTrade] = useState<{ units: number } | null>(null);

  // Dedicated Sell Modal states (สำหรับขายสินทรัพย์ / ขายทั้งหมด 100%)
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [sellTargetHolding, setSellTargetHolding] = useState<Holding | null>(null);
  const [sellVolumeInput, setSellVolumeInput] = useState('');
  const [sellPriceInput, setSellPriceInput] = useState('');
  const [sellFeeInput, setSellFeeInput] = useState('0');
  const [sellAccountId, setSellAccountId] = useState('');
  const [sellDate, setSellDate] = useState('');
  const [sellNote, setSellNote] = useState('');
  const [submittingSell, setSubmittingSell] = useState(false);

  const supabase = createClient();

  // ดึงข้อมูลพอร์ตล่าสุดจาก Supabase (มี RLS กรองตาม user_id อัตโนมัติ)
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

  // ดึงบัญชีการเงิน financial_accounts
  const fetchAccounts = async () => {
    try {
      const { data } = await supabase
        .from('financial_accounts')
        .select('id, account_name, bank_name, account_type, currency, current_balance, is_liability')
        .order('account_name', { ascending: true });
      if (data) setAccounts(data as FinancialAccountOption[]);
    } catch (err: any) {
      console.error('Fetch accounts error:', err);
    }
  };

  // บันทึก Broker-to-Account Mapping ลง localStorage
  const saveBrokerAccountMapping = (broker: string, accountId: string) => {
    if (!broker || !accountId) return;
    const updated = { ...brokerAccountMap, [broker]: accountId };
    setBrokerAccountMap(updated);
    try {
      localStorage.setItem('broker_account_mappings', JSON.stringify(updated));
    } catch {}
  };

  // ดึงอัตราแลกเปลี่ยนล่าสุดสำหรับใช้เป็นค่าตั้งต้น
  const fetchFxRates = async () => {
    try {
      const { data } = await supabase.from('currency_exchange_rates').select('currency, rate_to_thb');
      if (data && data.length > 0) {
        const map: Record<string, number> = { THB: 1.0 };
        for (const item of data) {
          if (item.currency) map[item.currency.toUpperCase()] = Number(item.rate_to_thb);
        }
        setFxRates(map);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchHoldings();
    fetchAccounts();
    fetchFxRates();
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
      if (sortField === 'broker') {
        const brkA = (a.broker || '').toUpperCase();
        const brkB = (b.broker || '').toUpperCase();
        const cmp = brkA.localeCompare(brkB);
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

  // --- Inline Price Editing Handlers ---
  const startInlineEditing = (item: Holding) => {
    setEditingId(item.id);
    setEditPriceInput(item.present_price != null ? String(item.present_price) : '');
  };

  const cancelInlineEditing = () => {
    setEditingId(null);
    setEditPriceInput('');
  };

  const handleSaveInlinePrice = async (id: string) => {
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

  // --- Add / Edit Modal Handlers ---
  const handleOpenAddModal = () => {
    setModalMode('add');
    setSelectedHolding(null);
    fetchAccounts();
    const defaultBroker = 'BLS';
    const savedMapped = brokerAccountMap[defaultBroker];
    const defaultCashAcc = accounts.find((a) => !a.is_liability) || accounts[0];
    const initialAccId = savedMapped || defaultCashAcc?.id || '';

    setFormData({
      symbol: '',
      broker: defaultBroker,
      currency: 'THB',
      volume: '',
      initial_cost: '',
      present_price: '',
      accountId: initialAccId,
      recordTrade: true,
    });
    setCalcMode('dip');
    setDipInputMode('units');
    setDipAddUnits('');
    setDipAddPrice('');
    setDipBudget('');
    setSellUnits('');
    setCalcNotice(null);
    setPendingDipTrade(null);
    setPendingSellTrade(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (holding: Holding) => {
    setModalMode('edit');
    setSelectedHolding(holding);
    fetchAccounts();
    const holdingBroker = holding.broker || 'BLS';
    const savedMapped = brokerAccountMap[holdingBroker];
    const defaultCashAcc = accounts.find((a) => !a.is_liability) || accounts[0];
    const initialAccId = savedMapped || defaultCashAcc?.id || '';

    setFormData({
      symbol: holding.symbol,
      broker: holdingBroker,
      currency: (holding.currency || 'THB').toUpperCase(),
      volume: holding.volume != null ? String(holding.volume) : '',
      initial_cost: holding.initial_cost != null ? String(holding.initial_cost) : '',
      present_price: holding.present_price != null ? String(holding.present_price) : '',
      accountId: initialAccId,
      recordTrade: false,
    });
    setCalcMode('dip');
    setDipInputMode('units');
    setDipAddUnits('');
    setDipAddPrice(
      holding.present_price != null && Number(holding.present_price) > 0
        ? String(holding.present_price)
        : holding.initial_cost != null
        ? String(holding.initial_cost)
        : ''
    );
    setDipBudget('');
    setSellUnits('');
    setCalcNotice(null);
    setPendingDipTrade(null);
    setPendingSellTrade(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedHolding(null);
    setFormData(initialHoldingForm);
    setDipInputMode('units');
    setDipAddUnits('');
    setDipAddPrice('');
    setDipBudget('');
    setSellUnits('');
    setCalcNotice(null);
    setPendingDipTrade(null);
    setPendingSellTrade(null);
  };

  const handleBrokerChange = (newBroker: string) => {
    const boundAccId = brokerAccountMap[newBroker];
    setFormData((prev) => ({
      ...prev,
      broker: newBroker,
      accountId: boundAccId !== undefined ? boundAccId : prev.accountId,
    }));
  };

  // --- Dedicated Sell Modal Handlers (สำหรับขายสินทรัพย์ / ขายทั้งหมด 100%) ---
  const handleOpenSellModal = (holding: Holding) => {
    setSellTargetHolding(holding);
    fetchAccounts();
    const holdingBroker = holding.broker || 'BLS';
    const mappedAccId = brokerAccountMap[holdingBroker];
    const defaultCashAcc = accounts.find((a) => !a.is_liability) || accounts[0];
    const initialAccId = mappedAccId || defaultCashAcc?.id || '';

    // ตั้งค่าเริ่มต้นเป็นการขายทั้งหมด (100%)
    setSellVolumeInput(holding.volume != null ? String(holding.volume) : '');
    setSellPriceInput(
      holding.present_price != null && Number(holding.present_price) > 0
        ? String(holding.present_price)
        : holding.initial_cost != null
        ? String(holding.initial_cost)
        : ''
    );
    setSellFeeInput('0');
    setSellAccountId(initialAccId);
    setSellDate(new Date().toISOString().split('T')[0]);
    setSellNote('ขายทำกำไร / ขายปิดสถานะ');
    setIsSellModalOpen(true);
  };

  const handleCloseSellModal = () => {
    setIsSellModalOpen(false);
    setSellTargetHolding(null);
    setSellVolumeInput('');
    setSellPriceInput('');
    setSellFeeInput('0');
    setSellAccountId('');
    setSellDate('');
    setSellNote('');
  };

  // คำนวณซื้อถัวเฉลี่ย (Buy on Dip Calculator)
  const handleApplyDipCalc = () => {
    const curVol = parseFloat(formData.volume) || 0;
    const curCost = parseFloat(formData.initial_cost) || 0;
    const addPrice = parseNumberWithSuffix(dipAddPrice);

    if (isNaN(addPrice) || addPrice < 0) {
      alert('กรุณาระบุราคาที่ซื้อเพิ่มที่ถูกต้อง (>= 0)');
      return;
    }

    let addVol = 0;
    if (dipInputMode === 'budget') {
      const budget = parseNumberWithSuffix(dipBudget);
      if (isNaN(budget) || budget <= 0) {
        alert('กรุณาระบุงบประมาณที่ซื้อที่ถูกต้อง (> 0)');
        return;
      }
      if (addPrice <= 0) {
        alert('กรุณาระบุราคาที่ซื้อเพิ่มเพื่อคำนวณจำนวนหน่วย');
        return;
      }
      addVol = budget / addPrice;
    } else {
      addVol = parseNumberWithSuffix(dipAddUnits);
      if (isNaN(addVol) || addVol <= 0) {
        alert('กรุณาระบุจำนวนหน่วยที่ซื้อเพิ่มที่ถูกต้อง (> 0)');
        return;
      }
    }

    const newVol = curVol + addVol;
    const newCost = (curVol * curCost + addVol * addPrice) / (newVol || 1);

    // ตรวจสอบว่าเป็นสินทรัพย์ทองคำหรือไม่ เพื่อจัด format ข้อความและหน่วยให้แม่นยำ
    const goldConfig = parseGoldSymbol(formData.symbol);
    let tradeReason = 'ซื้อถัวเฉลี่ย (Buy on Dip)';
    if (goldConfig) {
      const goldMetrics = calculateGoldMetrics(goldConfig, addVol, addPrice);
      if (goldConfig.unit === 'BAHT') {
        tradeReason = `ซื้อถัวเฉลี่ยทองคำ ${addVol.toLocaleString(undefined, { maximumFractionDigits: 4 })} บาททอง (≈ ${goldMetrics.grams.toFixed(3)}g) @ ฿${addPrice.toLocaleString()}`;
      } else if (goldConfig.unit === 'G') {
        tradeReason = `ซื้อถัวเฉลี่ยทองคำ ${addVol.toLocaleString(undefined, { maximumFractionDigits: 3 })} กรัม (≈ ${goldMetrics.bahtWeight.toFixed(4)} บาททอง) @ ฿${addPrice.toLocaleString()}/g`;
      } else if (goldConfig.unit === 'OZ') {
        tradeReason = `ซื้อถัวเฉลี่ยทองคำ ${addVol.toLocaleString(undefined, { maximumFractionDigits: 4 })} oz t @ $${addPrice.toLocaleString()}`;
      }
    }

    // Format volume ให้สอดคล้องกับสินทรัพย์ที่มีทศนิยมละเอียด
    const formattedNewVol = goldConfig || ['BTC', 'ETH', 'SOL'].includes(formData.symbol.toUpperCase())
      ? parseFloat(newVol.toFixed(6))
      : parseFloat(newVol.toFixed(4));

    setFormData((prev) => ({
      ...prev,
      volume: String(formattedNewVol),
      initial_cost: String(parseFloat(newCost.toFixed(4))),
    }));

    setPendingDipTrade({ units: addVol, price: addPrice, reason: tradeReason });
    setRecordDipTrade(true);

    const costDiff = newCost - curCost;
    const costDiffStr = costDiff >= 0 ? `+${costDiff.toFixed(2)}` : `${costDiff.toFixed(2)}`;

    setCalcNotice(
      goldConfig
        ? `คำนวณสำเร็จ: ปรับจำนวนเป็น ${formattedNewVol.toLocaleString()} หน่วย, ต้นทุนเฉลี่ยใหม่ ${newCost.toFixed(2)} (${costDiffStr}) พร้อมบันทึก BUY`
        : `คำนวณสำเร็จ: ปรับจำนวนเป็น ${formattedNewVol.toLocaleString()} หน่วย, ต้นทุนเฉลี่ยใหม่ ${newCost.toFixed(4)} (${costDiffStr}) พร้อมบันทึก BUY`
    );
    setDipAddUnits('');
    setDipBudget('');
  };

  // คำนวณลดจำนวนหุ้น (Stop Loss / Partial Sell Calculator)
  const handleApplySellCalc = () => {
    const curVol = parseFloat(formData.volume) || 0;
    const sold = parseNumberWithSuffix(sellUnits);

    if (isNaN(sold) || sold <= 0) {
      alert('กรุณาระบุจำนวนหน่วยที่ขายออกที่ถูกต้อง (> 0)');
      return;
    }
    if (sold > curVol) {
      alert(`จำนวนที่ขาย (${sold}) มากกว่าจำนวนที่ถือครองอยู่ (${curVol})`);
      return;
    }

    const newVol = Math.max(0, curVol - sold);
    const formattedNewVol = ['BTC', 'ETH', 'SOL'].includes(formData.symbol.toUpperCase()) || parseGoldSymbol(formData.symbol)
      ? parseFloat(newVol.toFixed(6))
      : parseFloat(newVol.toFixed(4));

    setFormData((prev) => ({
      ...prev,
      volume: String(formattedNewVol),
    }));

    setPendingSellTrade({ units: sold });
    setRecordSellTrade(true);

    setCalcNotice(
      `คำนวณสำเร็จ: ปรับลดจำนวนคงเหลือเป็น ${formattedNewVol.toLocaleString()} หน่วย (พร้อมบันทึก SELL ${sold.toLocaleString()} หุ้น)`
    );
    setSellUnits('');
  };

  // บันทึกเพิ่ม หรือแก้ไขข้อมูลสินทรัพย์ลง Supabase
  const handleSaveHolding = async (e: React.FormEvent) => {
    e.preventDefault();

    const sym = formData.symbol.trim().toUpperCase();
    if (!sym) {
      alert('กรุณาระบุสัญลักษณ์สินทรัพย์');
      return;
    }

    const vol = parseFloat(formData.volume);
    if (isNaN(vol) || vol < 0) {
      alert('กรุณาระบุจำนวนหน่วยที่ถูกต้อง (>= 0)');
      return;
    }

    const cost = parseFloat(formData.initial_cost);
    if (isNaN(cost) || cost < 0) {
      alert('กรุณาระบุต้นทุนเฉลี่ยที่ถูกต้อง (>= 0)');
      return;
    }

    const price = formData.present_price !== '' ? parseFloat(formData.present_price) : cost;
    if (isNaN(price) || price < 0) {
      alert('กรุณาระบุราคาตลาดที่ถูกต้อง (>= 0)');
      return;
    }

    const curr = (formData.currency || 'THB').toUpperCase();
    const rateToThb = fxRates[curr] || 1.0;

    try {
      setSubmittingHolding(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้');

      if (modalMode === 'add') {
        const payload: Record<string, any> = {
          user_id: user.id,
          symbol: sym,
          broker: formData.broker.trim() || null,
          currency: curr,
          volume: vol,
          initial_cost: cost,
          present_price: price,
          exchange_rate: rateToThb,
          updated_at: new Date().toISOString(),
        };

        let inserted: any = null;

        const { data: insData, error: insError } = await supabase
          .from('portfolio_holdings')
          .insert(payload)
          .select()
          .single();

        if (insError) {
          if (insError.message?.includes('column portfolio_holdings.broker does not exist')) {
            delete payload.broker;
            const { data: retryData, error: retryError } = await supabase
              .from('portfolio_holdings')
              .insert(payload)
              .select()
              .single();
            if (retryError) {
              if (retryError.code === '23505') {
                throw new Error(`สินทรัพย์ "${sym}" มีอยู่ในพอร์ตแล้ว หากต้องการซื้อถัวเฉลี่ย กรุณากดแก้ไขที่รายการเดิม`);
              }
              throw retryError;
            }
            inserted = retryData;
          } else if (insError.code === '23505') {
            throw new Error(`สินทรัพย์ "${sym}" มีอยู่ในพอร์ตแล้ว หากต้องการซื้อถัวเฉลี่ย กรุณากดแก้ไขที่รายการเดิม`);
          } else {
            throw insError;
          }
        } else {
          inserted = insData;
        }

        // ตรวจสอบกรณีไม่ได้เลือกบัญชีการเงินสำหรับตัดเงินสด
        if (formData.recordTrade && !formData.accountId && accounts.length > 0) {
          const proceedWithoutAccount = window.confirm(
            '⚠️ คุณยังไม่ได้เลือก "บัญชีการเงินที่ใช้ซื้อ"\n\n' +
            '• หากต้องการให้ระบบ "หักเงินสดออกจากกระเป๋า/บัญชีธนาคาร" กรุณากด "ยกเลิก" แล้วเลือกบัญชีการเงิน\n' +
            '• หากต้องการบันทึกพอร์ตโดย "ไม่หักเงินสด" (กรณีบันทึกข้อมูลย้อนหลัง) กด "ตกลง" เพื่อดำเนินการต่อ'
          );
          if (!proceedWithoutAccount) {
            setSubmittingHolding(false);
            return;
          }
        }

        // บันทึกรายการลงใน trade_transactions และหักเงินสดจาก financial_accounts
        if (formData.recordTrade && vol > 0) {
          const gross = vol * cost;
          const grossThb = gross * rateToThb;
          const netThb = grossThb;

          const tradePayload: any = {
            user_id: user.id,
            broker: formData.broker.trim() || 'BLS',
            trade_date: new Date().toISOString().split('T')[0],
            side: 'BUY',
            stock_symbol: sym,
            currency: curr,
            units: vol,
            unit_price: cost,
            exchange_rate: rateToThb,
            gross_amount: gross,
            fee: 0,
            withholding_tax: 0,
            net_amount: gross,
            gross_amount_thb: grossThb,
            fee_thb: 0,
            net_amount_thb: netThb,
            reason: 'เพิ่มสินทรัพย์ใหม่เข้าพอร์ต (New Holding)',
            account_id: formData.accountId || null,
          };

          const { error: tradeErr } = await supabase.from('trade_transactions').insert(tradePayload);
          if (tradeErr) {
            if (tradeErr.message?.includes('column trade_transactions.account_id does not exist')) {
              delete tradePayload.account_id;
              await supabase.from('trade_transactions').insert(tradePayload);
            } else {
              console.warn('Could not record trade transaction:', tradeErr.message);
            }
          }

          // ลดเงินสดคงเหลือใน financial_accounts พร้อมแปลงสกุลเงินให้ถูกต้อง
          if (formData.accountId) {
            const targetAcc = accounts.find((a) => a.id === formData.accountId);
            if (targetAcc) {
              const accCurr = (targetAcc.currency || 'THB').toUpperCase();
              let deductAmount = netThb;
              if (accCurr === curr) {
                deductAmount = gross;
              } else if (accCurr !== 'THB') {
                const accRateToThb = fxRates[accCurr] || 1.0;
                deductAmount = accRateToThb > 0 ? netThb / accRateToThb : netThb;
              }

              const newBal = (Number(targetAcc.current_balance) || 0) - deductAmount;
              const { error: accErr } = await supabase
                .from('financial_accounts')
                .update({ current_balance: newBal, updated_at: new Date().toISOString() })
                .eq('id', formData.accountId);

              if (accErr) {
                console.error('Failed to deduct financial account balance:', accErr);
                alert(`แจ้งเตือน: บันทึกสินทรัพย์สำเร็จ แต่ไม่สามารถหักเงินจากบัญชีได้: ${accErr.message}`);
              }
            }
          }
        }

        // จำบัญชีเริ่มต้นสำหรับโบรกเกอร์นี้
        if (formData.broker && formData.accountId) {
          saveBrokerAccountMapping(formData.broker, formData.accountId);
        }

        handleCloseModal();
        await fetchHoldings();
        await fetchAccounts();
        onHoldingsUpdated?.();

        // ลองซิงค์ราคาตลาดจาก API อัตโนมัติหลังเพิ่มสินทรัพย์
        if (inserted?.id) {
          fetch(`/api/update-prices?id=${inserted.id}`)
            .then(() => {
              fetchHoldings();
              onHoldingsUpdated?.();
            })
            .catch(() => {});
        }
      } else {
        if (!selectedHolding) return;

        const updatePayload: Record<string, any> = {
          broker: formData.broker.trim() || null,
          currency: curr,
          volume: vol,
          initial_cost: cost,
          present_price: price,
          exchange_rate: rateToThb,
          updated_at: new Date().toISOString(),
        };

        const { error: updErr } = await supabase
          .from('portfolio_holdings')
          .update(updatePayload)
          .eq('id', selectedHolding.id);

        if (updErr) {
          if (updErr.message?.includes('column portfolio_holdings.broker does not exist')) {
            delete updatePayload.broker;
            const { error: retryErr } = await supabase
              .from('portfolio_holdings')
              .update(updatePayload)
              .eq('id', selectedHolding.id);
            if (retryErr) throw retryErr;
          } else {
            throw updErr;
          }
        }

        // จัดการบันทึกประวัติการซื้อถัวเฉลี่ย (Buy on Dip)
        if (recordDipTrade && pendingDipTrade && pendingDipTrade.units > 0) {
          const gross = pendingDipTrade.units * pendingDipTrade.price;
          const grossThb = gross * rateToThb;
          const dipTradePayload: any = {
            user_id: user.id,
            broker: formData.broker.trim() || selectedHolding.broker || 'BLS',
            trade_date: new Date().toISOString().split('T')[0],
            side: 'BUY',
            stock_symbol: sym,
            currency: curr,
            units: pendingDipTrade.units,
            unit_price: pendingDipTrade.price,
            exchange_rate: rateToThb,
            gross_amount: gross,
            fee: 0,
            withholding_tax: 0,
            net_amount: gross,
            gross_amount_thb: grossThb,
            fee_thb: 0,
            net_amount_thb: grossThb,
            reason: pendingDipTrade.reason || 'ซื้อถัวเฉลี่ย (Buy on Dip)',
            account_id: formData.accountId || null,
          };

          const { error: tErr } = await supabase.from('trade_transactions').insert(dipTradePayload);
          if (tErr && tErr.message?.includes('account_id')) {
            delete dipTradePayload.account_id;
            await supabase.from('trade_transactions').insert(dipTradePayload);
          }

          // ลดเงินสดใน financial_accounts พร้อมแปลงสกุลเงินให้ถูกต้อง
          if (formData.accountId) {
            const targetAcc = accounts.find((a) => a.id === formData.accountId);
            if (targetAcc) {
              const accCurr = (targetAcc.currency || 'THB').toUpperCase();
              let deductAmount = grossThb;
              if (accCurr === curr) {
                deductAmount = gross;
              } else if (accCurr !== 'THB') {
                const accRateToThb = fxRates[accCurr] || 1.0;
                deductAmount = accRateToThb > 0 ? grossThb / accRateToThb : grossThb;
              }

              const newBal = (Number(targetAcc.current_balance) || 0) - deductAmount;
              const { error: accErr } = await supabase
                .from('financial_accounts')
                .update({ current_balance: newBal, updated_at: new Date().toISOString() })
                .eq('id', formData.accountId);

              if (accErr) {
                console.error('Failed to deduct financial account balance:', accErr);
              }
            }
          }
        }

        // จัดการบันทึกประวัติการขายลดจำนวน (Stop Loss / Partial Sell)
        if (recordSellTrade && pendingSellTrade && pendingSellTrade.units > 0) {
          const sellPrice = price > 0 ? price : cost;
          const gross = pendingSellTrade.units * sellPrice;
          const grossThb = gross * rateToThb;
          const sellTradePayload: any = {
            user_id: user.id,
            broker: formData.broker.trim() || selectedHolding.broker || 'BLS',
            trade_date: new Date().toISOString().split('T')[0],
            side: 'SELL',
            stock_symbol: sym,
            currency: curr,
            units: pendingSellTrade.units,
            unit_price: sellPrice,
            exchange_rate: rateToThb,
            gross_amount: gross,
            fee: 0,
            withholding_tax: 0,
            net_amount: gross,
            gross_amount_thb: grossThb,
            fee_thb: 0,
            net_amount_thb: grossThb,
            reason: 'ลดจำนวน / ตัดขาดทุน (Stop Loss / Sell)',
            account_id: formData.accountId || null,
          };

          const { error: tErr } = await supabase.from('trade_transactions').insert(sellTradePayload);
          if (tErr && tErr.message?.includes('account_id')) {
            delete sellTradePayload.account_id;
            await supabase.from('trade_transactions').insert(sellTradePayload);
          }

          // เพิ่มเงินสดเข้า financial_accounts พร้อมแปลงสกุลเงินให้ถูกต้อง
          if (formData.accountId) {
            const targetAcc = accounts.find((a) => a.id === formData.accountId);
            if (targetAcc) {
              const accCurr = (targetAcc.currency || 'THB').toUpperCase();
              let creditAmount = grossThb;
              if (accCurr === curr) {
                creditAmount = gross;
              } else if (accCurr !== 'THB') {
                const accRateToThb = fxRates[accCurr] || 1.0;
                creditAmount = accRateToThb > 0 ? grossThb / accRateToThb : grossThb;
              }

              const newBal = (Number(targetAcc.current_balance) || 0) + creditAmount;
              const { error: accErr } = await supabase
                .from('financial_accounts')
                .update({ current_balance: newBal, updated_at: new Date().toISOString() })
                .eq('id', formData.accountId);

              if (accErr) {
                console.error('Failed to credit financial account balance:', accErr);
              }
            }
          }
        }

        if (formData.broker && formData.accountId) {
          saveBrokerAccountMapping(formData.broker, formData.accountId);
        }

        handleCloseModal();
        await fetchHoldings();
        await fetchAccounts();
        onHoldingsUpdated?.();
      }
    } catch (err: any) {
      console.error('Save holding error:', err);
      alert(`ไม่สามารถบันทึกข้อมูลสินทรัพย์ได้: ${err?.message || 'เกิดข้อผิดพลาด'}`);
    } finally {
      setSubmittingHolding(false);
    }
  };

  // ดำเนินการขายสินทรัพย์ (Sell Modal Handler - รองรับทั้งขายบางส่วน และขายทั้งหมด 100%)
  const handleConfirmSell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellTargetHolding) return;

    const holdingVol = Number(sellTargetHolding.volume) || 0;
    const units = parseFloat(sellVolumeInput);
    if (isNaN(units) || units <= 0) {
      alert('กรุณาระบุจำนวนหน่วยที่ต้องการขายที่ถูกต้อง (> 0)');
      return;
    }
    if (units > holdingVol) {
      alert(`จำนวนที่ต้องการขาย (${units.toLocaleString()}) มากกว่าจำนวนที่ถือครองอยู่ (${holdingVol.toLocaleString()})`);
      return;
    }

    const price = parseFloat(sellPriceInput);
    if (isNaN(price) || price < 0) {
      alert('กรุณาระบุราคาขายที่ถูกต้อง (>= 0)');
      return;
    }

    const fee = parseFloat(sellFeeInput) || 0;
    const curr = (sellTargetHolding.currency || 'THB').toUpperCase();
    const rateToThb = fxRates[curr] || Number(sellTargetHolding.exchange_rate) || 1.0;
    const grossAmount = units * price;
    const netAmount = Math.max(0, grossAmount - fee);
    const grossAmountThb = grossAmount * rateToThb;
    const netAmountThb = netAmount * rateToThb;
    const isFullSell = units >= holdingVol;
    const remainingUnits = Math.max(0, holdingVol - units);

    try {
      setSubmittingSell(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้');

      // 1. บันทึกรายการขาย SELL ลงใน trade_transactions
      const sellTradePayload: any = {
        user_id: user.id,
        broker: sellTargetHolding.broker || 'BLS',
        trade_date: sellDate || new Date().toISOString().split('T')[0],
        side: 'SELL',
        stock_symbol: sellTargetHolding.symbol,
        currency: curr,
        units: units,
        unit_price: price,
        exchange_rate: rateToThb,
        gross_amount: grossAmount,
        fee: fee,
        withholding_tax: 0,
        net_amount: netAmount,
        gross_amount_thb: grossAmountThb,
        fee_thb: fee * rateToThb,
        net_amount_thb: netAmountThb,
        reason: sellNote || (isFullSell ? 'ขายทั้งหมดปิดสถานะ' : 'ขายทำกำไร'),
        account_id: sellAccountId || null,
      };

      const { error: tradeErr } = await supabase.from('trade_transactions').insert(sellTradePayload);
      if (tradeErr) {
        if (tradeErr.message?.includes('column trade_transactions.account_id does not exist')) {
          delete sellTradePayload.account_id;
          await supabase.from('trade_transactions').insert(sellTradePayload);
        } else {
          console.warn('Could not record sell trade transaction:', tradeErr.message);
        }
      }

      // 2. เติมเงินสดเข้า financial_accounts
      if (sellAccountId) {
        const targetAcc = accounts.find((a) => a.id === sellAccountId);
        if (targetAcc) {
          const accCurr = (targetAcc.currency || 'THB').toUpperCase();
          let creditAmount = netAmountThb;
          if (accCurr === curr) {
            creditAmount = netAmount;
          } else if (accCurr !== 'THB') {
            const accRateToThb = fxRates[accCurr] || 1.0;
            creditAmount = accRateToThb > 0 ? netAmountThb / accRateToThb : netAmountThb;
          }

          const newBal = (Number(targetAcc.current_balance) || 0) + creditAmount;
          const { error: accErr } = await supabase
            .from('financial_accounts')
            .update({ current_balance: newBal, updated_at: new Date().toISOString() })
            .eq('id', sellAccountId);

          if (accErr) {
            console.error('Failed to credit financial account:', accErr);
            alert(`คำเตือน: บันทึกการขายสำเร็จ แต่ไม่สามารถเพิ่มเงินเข้าบัญชีได้: ${accErr.message}`);
          }
        }
      }

      // 3. ปรับปรุงพอร์ตการลงทุน (portfolio_holdings)
      if (isFullSell) {
        // ขายหมด 100% -> ลบแถวออกจาก portfolio_holdings เพื่อปิดสถานะอย่างสมบูรณ์
        const { error: delErr } = await supabase
          .from('portfolio_holdings')
          .delete()
          .eq('id', sellTargetHolding.id);
        if (delErr) throw delErr;
      } else {
        // ขายบางส่วน -> ปรับลดจำนวนหน่วยคงเหลือ
        const { error: updErr } = await supabase
          .from('portfolio_holdings')
          .update({
            volume: remainingUnits,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sellTargetHolding.id);
        if (updErr) throw updErr;
      }

      // 4. บันทึก Broker-to-Account Mapping
      if (sellTargetHolding.broker && sellAccountId) {
        saveBrokerAccountMapping(sellTargetHolding.broker, sellAccountId);
      }

      handleCloseSellModal();
      await fetchHoldings();
      await fetchAccounts();
      onHoldingsUpdated?.();
    } catch (err: any) {
      console.error('Sell holding error:', err);
      alert(`ไม่สามารถทำรายการขายได้: ${err?.message || 'เกิดข้อผิดพลาด'}`);
    } finally {
      setSubmittingSell(false);
    }
  };

  // ลบสินทรัพย์ออกจากพอร์ต
  const handleDeleteHolding = async (item: Holding) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบสินทรัพย์ "${item.symbol}" ออกจากพอร์ต?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('portfolio_holdings')
        .delete()
        .eq('id', item.id);

      if (error) throw error;

      await fetchHoldings();
      onHoldingsUpdated?.();
    } catch (err: any) {
      console.error('Delete holding error:', err);
      alert(`ไม่สามารถลบสินทรัพย์ได้: ${err?.message || 'เกิดข้อผิดพลาด'}`);
    }
  };

  const renderSortHeader = (label: string, field: SortField, align: 'left' | 'right' | 'center' = 'left') => {
    const isActive = sortField === field;
    return (
      <th
        key={field}
        className={`py-3 px-4 select-none cursor-pointer transition hover:bg-slate-100/80 ${
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
          <span className={isActive ? 'text-blue-600 font-bold' : 'text-slate-500'}>{label}</span>
          <span className={`transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400 opacity-40'}`}>
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

  // Live Calculations for the Modal Form Preview
  const previewVol = parseNumberWithSuffix(formData.volume);
  const previewCost = parseNumberWithSuffix(formData.initial_cost);
  const previewPrice = formData.present_price !== '' ? parseNumberWithSuffix(formData.present_price) : previewCost;
  const previewTotalCost = previewVol * previewCost;
  const previewTotalPrice = previewVol * previewPrice;
  const previewPnl = previewTotalCost > 0 ? ((previewTotalPrice - previewTotalCost) / previewTotalCost) * 100 : 0;
  const previewCurrencySymbol = getCurrencySymbol(formData.currency);

  // ตรวจจับสินทรัพย์ทองคำสำหรับแบบฟอร์มปัจจุบัน
  const activeGoldConfig = useMemo(() => {
    return parseGoldSymbol(formData.symbol);
  }, [formData.symbol]);

  // ตัวเลขราคาและหน่วยที่คำนวณแบบยืดหยุ่น (รองรับตัวย่อ เช่น 66.5k, 15k)
  const parsedDipAddPrice = useMemo(() => {
    return parseNumberWithSuffix(dipAddPrice);
  }, [dipAddPrice]);

  const parsedDipAddUnits = useMemo(() => {
    if (dipInputMode === 'budget') {
      const budget = parseNumberWithSuffix(dipBudget);
      const price = parsedDipAddPrice;
      return price > 0 ? budget / price : 0;
    }
    return parseNumberWithSuffix(dipAddUnits);
  }, [dipInputMode, dipBudget, dipAddUnits, parsedDipAddPrice]);

  // คำนวณรายละเอียดราคาทองคำสำหรับ Buy on Dip แบบ Real-time
  const liveDipGoldMetrics = useMemo(() => {
    if (!activeGoldConfig || parsedDipAddUnits <= 0 || parsedDipAddPrice <= 0) return null;
    return calculateGoldMetrics(activeGoldConfig, parsedDipAddUnits, parsedDipAddPrice);
  }, [activeGoldConfig, parsedDipAddUnits, parsedDipAddPrice]);

  // คำนวณผลกระทบต่อพอร์ต (DCA Impact) สำหรับ Buy on Dip แบบ Real-time
  const liveDipDcaImpact = useMemo(() => {
    if (parsedDipAddUnits <= 0 || parsedDipAddPrice <= 0) return null;
    const curVol = parseFloat(formData.volume) || 0;
    const curCost = parseFloat(formData.initial_cost) || 0;
    const newVol = curVol + parsedDipAddUnits;
    const newCost = (curVol * curCost + parsedDipAddUnits * parsedDipAddPrice) / (newVol || 1);
    const diff = newCost - curCost;
    const percentDiff = curCost > 0 ? (diff / curCost) * 100 : 0;
    return {
      curVol,
      curCost,
      newVol,
      newCost,
      diff,
      percentDiff,
    };
  }, [formData.volume, formData.initial_cost, parsedDipAddUnits, parsedDipAddPrice]);

  // คำนวณรายละเอียดทองคำสำหรับหน้าต่างเพิ่มสินทรัพย์ (Add Holding Modal)
  const liveAddGoldMetrics = useMemo(() => {
    if (!activeGoldConfig) return null;
    const vol = parseNumberWithSuffix(formData.volume);
    const cost = parseNumberWithSuffix(formData.initial_cost);
    if (vol <= 0 || cost <= 0) return null;
    return calculateGoldMetrics(activeGoldConfig, vol, cost);
  }, [activeGoldConfig, formData.volume, formData.initial_cost]);

  if (loadingData) {
    return (
      <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200 text-center text-slate-500 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        <span>กำลังโหลดข้อมูลพอร์ตสินทรัพย์...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden space-y-0">
      {/* Header */}
      <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-slate-50/50">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Asset on Hand</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            พอร์ตหุ้น คริปโต และสินทรัพย์ลงทุน • เพิ่ม/ลบสินทรัพย์ ปรับต้นทุนเฉลี่ย (Buy on dip) หรือตัดขาดทุน (Stop loss)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {/* ปุ่มเพิ่มสินทรัพย์ */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>เพิ่มสินทรัพย์</span>
          </button>

          {/* ปุ่มอัปเดตราคาตลาดทั้งหมด */}
          <button
            type="button"
            onClick={handleUpdateAll}
            disabled={isBulkUpdating || updatingRowId !== null || savingRowId !== null}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isBulkUpdating ? 'animate-spin' : ''}`} />
            {isBulkUpdating ? 'กำลังซิงค์ราคาตลาด...' : 'อัปเดตราคาตลาดทั้งหมด'}
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 text-xs uppercase font-medium">
              {renderSortHeader('สินทรัพย์', 'symbol', 'left')}
              {renderSortHeader('โบรกเกอร์', 'broker', 'left')}
              {renderSortHeader('จำนวน', 'volume', 'right')}
              {renderSortHeader('ต้นทุนเฉลี่ย', 'initial_cost', 'right')}
              {renderSortHeader('ราคาตลาดล่าสุด', 'present_price', 'right')}
              {renderSortHeader('ผลตอบแทน (%)', 'yield_percent', 'right')}
              <th className="py-3 px-4 text-center text-xs uppercase font-semibold text-slate-500">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedHoldings.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  <div className="space-y-2">
                    <AlertCircle className="w-8 h-8 mx-auto text-slate-400" />
                    <p className="text-sm font-medium">ยังไม่มีสินทรัพย์ในพอร์ต</p>
                    <p className="text-xs text-slate-500">
                      กดปุ่ม "+ เพิ่มสินทรัพย์" เพื่อเริ่มต้นบันทึกหุ้น คริปโต หรือสินทรัพย์ที่ถือครอง
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedHoldings.map((item) => {
                const isRowLoading = updatingRowId === item.id;
                const isSavingThisRow = savingRowId === item.id;
                const isEditing = editingId === item.id;
                const currencyPrefix = getCurrencySymbol(item.currency);

                return (
                  <tr key={item.id} className="hover:bg-blue-50/30 transition">
                    {/* Symbol */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800">{item.symbol}</span>
                        {item.currency && item.currency !== 'THB' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {item.currency}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Broker */}
                    <td className="py-3 px-4 text-left">
                      {item.broker ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <Building2 className="w-3 h-3 text-amber-500" />
                          {item.broker}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">-</span>
                      )}
                    </td>

                    {/* Volume: ถ้าไม่มีค่าให้ fallback เป็น 0 */}
                    <td className="py-3 px-4 text-right text-slate-600 font-mono tabular-nums">
                      {(item.volume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </td>

                    {/* Initial Cost */}
                    <td className="py-3 px-4 text-right text-slate-600 font-mono tabular-nums">
                      {item.initial_cost != null
                        ? `${currencyPrefix}${Number(item.initial_cost).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4,
                          })}`
                        : '-'}
                    </td>

                    {/* Present Price (Editable Inline หรือคลิกเปิด modal) */}
                    <td className="py-3 px-4 text-right font-semibold text-slate-600">
                      {isEditing ? (
                        <div
                          className="inline-flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="relative flex items-center">
                            <span className="text-xs text-slate-500 font-semibold mr-1">
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
                                if (e.key === 'Enter') handleSaveInlinePrice(item.id);
                                if (e.key === 'Escape') cancelInlineEditing();
                              }}
                              disabled={isSavingThisRow}
                              placeholder="0.00"
                              className="w-24 px-2 py-1 text-right text-xs font-semibold border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-inner"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSaveInlinePrice(item.id)}
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
                            onClick={cancelInlineEditing}
                            disabled={isSavingThisRow}
                            title="ยกเลิก (Esc)"
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startInlineEditing(item)}
                          title="คลิกเพื่อแก้ไขราคาตลาดอย่างรวดเร็ว"
                          className="inline-flex items-center justify-end gap-1.5 font-semibold text-slate-700 hover:text-blue-600 cursor-pointer group py-0.5 px-1.5 -mr-1.5 rounded hover:bg-blue-50/60 transition"
                        >
                          <span className="font-mono tabular-nums">
                            {item.present_price != null
                              ? `${currencyPrefix}${Number(item.present_price).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 4,
                                })}`
                              : '-'}
                          </span>
                          <Pencil className="w-3 h-3 text-slate-300 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition" />
                        </button>
                      )}
                    </td>

                    {/* Yield % */}
                    <td
                      className={`py-3 px-4 text-right font-medium font-mono tabular-nums ${
                        (item.yield_percent ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {(item.yield_percent ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                      %
                    </td>

                    {/* Actions: Sell, Edit Modal (Volume/Cost/Price), Sync, Delete */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center justify-center gap-1.5">
                        {/* Sell Holding Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenSellModal(item)}
                          disabled={isRowLoading || isBulkUpdating || isSavingThisRow}
                          title="ขายสินทรัพย์ / ขายทั้งหมดปิดสถานะ (Sell)"
                          className="px-2.5 py-1 text-xs font-bold text-rose-700 hover:text-white hover:bg-rose-600 bg-rose-50 border border-rose-200 rounded-lg transition disabled:opacity-30 cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                        >
                          <TrendingDown className="w-3.5 h-3.5" />
                          <span>ขาย</span>
                        </button>

                        {/* Edit Holding Details (Modal) */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(item)}
                          disabled={isRowLoading || isBulkUpdating || isSavingThisRow}
                          title="แก้ไขข้อมูลสินทรัพย์ (จำนวน, ต้นทุนเฉลี่ย, ซื้อถัวเฉลี่ย)"
                          className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition disabled:opacity-30 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {/* Sync Single Price from API */}
                        <button
                          type="button"
                          onClick={() => handleUpdateSingle(item.id)}
                          disabled={isRowLoading || isBulkUpdating || isSavingThisRow}
                          title="กดเพื่อดึงราคาล่าสุดจากตลาด (API)"
                          className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition disabled:opacity-30 cursor-pointer"
                        >
                          <RotateCw
                            className={`w-3.5 h-3.5 ${isRowLoading ? 'animate-spin text-blue-600' : ''}`}
                          />
                        </button>

                        {/* Delete Holding */}
                        <button
                          type="button"
                          onClick={() => handleDeleteHolding(item)}
                          disabled={isRowLoading || isBulkUpdating || isSavingThisRow}
                          title="ลบสินทรัพย์ออกจากพอร์ต (กรณีบันทึกผิด ไม่ใช่การขาย)"
                          className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-30 cursor-pointer"
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

      {/* Add / Edit Holding Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {modalMode === 'add' ? 'เพิ่มสินทรัพย์ในพอร์ต' : `แก้ไขสินทรัพย์: ${selectedHolding?.symbol}`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {modalMode === 'add'
                    ? 'บันทึกหุ้น, คริปโต หรือกองทุนที่ถือครองเพื่อติดตามพอร์ต'
                    : 'ปรับปรุงจำนวน, ต้นทุนเฉลี่ย (Buy on dip), หรือลดจำนวนหุ้น (Stop loss)'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-slate-500 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveHolding} className="p-5 overflow-y-auto space-y-4">
              {/* สัญลักษณ์ และ สกุลเงิน */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    สัญลักษณ์สินทรัพย์ (Symbol) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={modalMode === 'edit'}
                    placeholder="เช่น AAPL, BTC, GOLD (G), GOLD 965 (G)"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-semibold uppercase disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    {modalMode === 'add'
                      ? 'ใส่ชื่อย่อหุ้น, คริปโต หรือทองคำ: GOLD (G), GOLD (OZ), GOLD 965 (G)'
                      : 'สัญลักษณ์อ้างอิงของสินทรัพย์'}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    สกุลเงิน (Currency)
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
                  >
                    {CURRENCY_OPTIONS.map((curr) => (
                      <option key={curr.code} value={curr.code}>
                        {curr.code} - {curr.name} ({curr.symbol})
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    สกุลเงินที่ใช้ซื้อขายสินทรัพย์นี้
                  </span>
                </div>
              </div>

              {/* โบรกเกอร์ และ บัญชีการเงินที่ผูก */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>โบรกเกอร์ (Broker)</span>
                  </label>
                  <input
                    type="text"
                    list="popular-brokers-list-portfolio"
                    placeholder="เช่น BLS, InnovestX, Dime"
                    value={formData.broker}
                    onChange={(e) => handleBrokerChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                  <datalist id="popular-brokers-list-portfolio">
                    {POPULAR_BROKERS.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    โบรกเกอร์หรือกระดานเทรดที่ถือครอง
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>บัญชีการเงินที่ผูก (Linked Account)</span>
                  </label>
                  <select
                    value={formData.accountId}
                    onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
                  >
                    <option value="">-- ไม่หักเงินสด (บันทึกข้อมูลย้อนหลัง) --</option>
                    {accounts.map((acc) => {
                      const curr = (acc.currency || 'THB').toUpperCase();
                      return (
                        <option key={acc.id} value={acc.id}>
                          {acc.bank_name ? `[${acc.bank_name}] ` : ''}
                          {acc.account_name} ({Number(acc.current_balance || 0).toLocaleString()} {curr})
                        </option>
                      );
                    })}
                  </select>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    {formData.broker && brokerAccountMap[formData.broker]
                      ? `ผูกกับ ${formData.broker} อัตโนมัติ`
                      : 'เลือกบัญชีเพื่อใช้หักเงินสดเมื่อมีรายการซื้อ'}
                  </span>
                </div>
              </div>

              {/* ซิงค์รายการซื้อ (BUY) และตัดเงินสดเมื่อเพิ่มสินทรัพย์ใหม่ */}
              {modalMode === 'add' && (
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/80">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.recordTrade}
                      onChange={(e) => setFormData({ ...formData, recordTrade: e.target.checked })}
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-blue-900 block">
                        บันทึกเป็นรายการซื้อ (BUY) ใน Trade Transactions อัตโนมัติ
                      </span>
                      <span className="text-[11px] text-blue-700 block">
                        สร้างประวัติการซื้อในประวัติ Trade ทันที
                        {formData.accountId
                          ? ' และหักเงินสดออกจากบัญชีการเงินที่เลือกโดยอัตโนมัติ'
                          : ' (เลือกบัญชีการเงินด้านบนหากต้องการให้หักเงินสดคงเหลือ)'}
                      </span>
                    </div>
                  </label>
                </div>
              )}

              {/* Add Mode: สรุปการหักเงินสดออกจากกระเป๋า (Live Preview) */}
              {modalMode === 'add' && formData.recordTrade && (
                <div>
                  {formData.accountId ? (
                    (() => {
                      const targetAcc = accounts.find((a) => a.id === formData.accountId);
                      if (!targetAcc) return null;
                      const vol = parseFloat(formData.volume) || 0;
                      const cost = parseFloat(formData.initial_cost) || 0;
                      const curr = (formData.currency || 'THB').toUpperCase();
                      const rateToThb = fxRates[curr] || 1.0;
                      const gross = vol * cost;
                      const grossThb = gross * rateToThb;
                      const accCurr = (targetAcc.currency || 'THB').toUpperCase();
                      let deductAmount = grossThb;
                      if (accCurr === curr) {
                        deductAmount = gross;
                      } else if (accCurr !== 'THB') {
                        const accRateToThb = fxRates[accCurr] || 1.0;
                        deductAmount = accRateToThb > 0 ? grossThb / accRateToThb : grossThb;
                      }
                      const curBal = Number(targetAcc.current_balance) || 0;
                      const remainingBal = curBal - deductAmount;
                      const isNegative = remainingBal < 0;

                      return (
                        <div
                          className={`p-3 rounded-xl border text-xs transition-colors ${
                            isNegative
                              ? 'bg-amber-50/90 border-amber-300 text-amber-900'
                              : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              <Wallet className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                              <div className="space-y-0.5">
                                <span className="font-bold block">
                                  ตัดเงินจากบัญชี: {targetAcc.bank_name ? `[${targetAcc.bank_name}] ` : ''}
                                  {targetAcc.account_name}
                                </span>
                                <span className="text-[11px] block opacity-90">
                                  ยอดตัดเงิน: -
                                  {deductAmount.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}{' '}
                                  {accCurr} • ยอดคงเหลือใหม่:{' '}
                                  <span className={`font-bold ${isNegative ? 'text-amber-700' : 'text-emerald-700'}`}>
                                    {remainingBal.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}{' '}
                                    {accCurr}
                                  </span>
                                </span>
                              </div>
                            </div>
                            {isNegative && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900 shrink-0">
                                ยอดจะติดลบ
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>
                        ไม่ได้เลือกบัญชี: ระบบจะไม่หักเงินสดออกจากกระเป๋า (เหมาะสำหรับบันทึกข้อมูลพอร์ตย้อนหลัง)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Gold Asset Detection Banner & Breakdown (Add/Edit) */}
              {activeGoldConfig && (
                <div className="p-3 bg-gradient-to-r from-amber-50 to-yellow-50/70 border border-amber-200/90 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">👑</span>
                      <div>
                        <span className="text-xs font-bold text-amber-950 block">{activeGoldConfig.label}</span>
                        <span className="text-[10px] text-amber-700">ตรวจพบสินทรัพย์ทองคำมาตรฐาน</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full shrink-0">
                      หน่วย: {activeGoldConfig.unit === 'BAHT' ? 'บาททองคำ (15.244g)' : activeGoldConfig.unit === 'G' ? 'กรัม (g)' : 'ทรอยออนซ์ (oz)'}
                    </span>
                  </div>

                  {liveAddGoldMetrics && (
                    <div className="grid grid-cols-3 gap-1.5 text-center bg-white/80 p-2 rounded-lg border border-amber-200/60 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block">น้ำหนักรวม</span>
                        <span className="font-bold font-mono text-amber-950">
                          {liveAddGoldMetrics.bahtWeight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </span>
                        <span className="text-[9px] text-amber-700 block">บาททอง</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">กรัมสุทธิ</span>
                        <span className="font-bold font-mono text-amber-950">
                          {liveAddGoldMetrics.grams.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 4 })}
                        </span>
                        <span className="text-[9px] text-amber-700 block">กรัม (g)</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">เทียบเท่าสลึง</span>
                        <span className="font-bold font-mono text-amber-950">
                          {liveAddGoldMetrics.salung.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </span>
                        <span className="text-[9px] text-amber-700 block">สลึง</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* จำนวนที่ถือครอง, ต้นทุนเฉลี่ย, ราคาตลาด */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    จำนวนหน่วย (Volume) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={formData.volume}
                    onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  />
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    {activeGoldConfig?.unit === 'BAHT'
                      ? 'บาททองคำ (15.244g)'
                      : activeGoldConfig?.unit === 'G'
                      ? 'กรัม (g)'
                      : activeGoldConfig?.unit === 'OZ'
                      ? 'ทรอยออนซ์ (oz)'
                      : 'หุ้น / เหรียญ'}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ต้นทุนเฉลี่ยต่อหน่วย ({previewCurrencySymbol}) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={formData.initial_cost}
                    onChange={(e) => setFormData({ ...formData, initial_cost: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  />
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    {activeGoldConfig?.unit === 'BAHT'
                      ? 'ราคาเฉลี่ยต่อน้ำหนัก 1 บาททอง'
                      : activeGoldConfig?.unit === 'G'
                      ? 'ราคาเฉลี่ยต่อ 1 กรัม'
                      : 'ราคาซื้อเฉลี่ย'}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ราคาตลาดล่าสุด ({previewCurrencySymbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={formData.present_price}
                    onChange={(e) => setFormData({ ...formData, present_price: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  />
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    {modalMode === 'add' ? 'เว้นว่าง = เท่ากับต้นทุน' : 'ราคาตลาดปัจจุบัน'}
                  </span>
                </div>
              </div>

              {/* Buy on Dip & Stop Loss Helper Widget (แสดงเฉพาะโหมด Edit) */}
              {modalMode === 'edit' && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-blue-600" />
                      เครื่องมือช่วยคำนวณ (DCA / Buy on Dip / Stop Loss)
                    </span>

                    <div className="flex rounded-lg bg-slate-200/70 p-0.5 text-[11px] font-semibold self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setCalcMode('dip');
                          setCalcNotice(null);
                        }}
                        className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                          calcMode === 'dip' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ซื้อถัวเฉลี่ย (Buy on Dip)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCalcMode('sell');
                          setCalcNotice(null);
                        }}
                        className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                          calcMode === 'sell' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ลดจำนวน (Stop Loss / ขาย)
                      </button>
                    </div>
                  </div>

                  {calcMode === 'dip' ? (
                    <div className="space-y-3">
                      {/* Mode Toggle: By Units vs By Budget */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setDipInputMode('units')}
                            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer flex items-center gap-1 ${
                              dipInputMode === 'units'
                                ? 'bg-white text-blue-700 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <span>🪙</span>
                            <span>
                              ระบุจำนวนหน่วย ({activeGoldConfig?.unit === 'BAHT' ? 'บาททอง' : activeGoldConfig?.unit === 'G' ? 'กรัม' : 'Units'})
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDipInputMode('budget')}
                            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer flex items-center gap-1 ${
                              dipInputMode === 'budget'
                                ? 'bg-white text-blue-700 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <span>💵</span>
                            <span>ระบุงบเงิน (Budget)</span>
                          </button>
                        </div>

                        {/* Quick Market Price Button */}
                        {(formData.present_price || selectedHolding?.present_price) && (
                          <button
                            type="button"
                            onClick={() => {
                              const p = formData.present_price || selectedHolding?.present_price;
                              if (p) setDipAddPrice(String(p));
                            }}
                            className="text-[10px] font-semibold text-blue-700 hover:text-blue-900 bg-blue-100/70 hover:bg-blue-200/80 px-2 py-1 rounded-md transition cursor-pointer shrink-0"
                          >
                            ⚡ ใช้ราคาตลาด ({previewCurrencySymbol}
                            {Number(formData.present_price || selectedHolding?.present_price).toLocaleString()})
                          </button>
                        )}
                      </div>

                      {/* Gold Quick Weight Presets (if asset is Gold) */}
                      {activeGoldConfig && (
                        <div className="flex items-center gap-1.5 flex-wrap bg-amber-50/80 p-2 rounded-lg border border-amber-200/70">
                          <span className="text-[10px] text-amber-900 font-bold shrink-0">
                            น้ำหนักด่วน:
                          </span>
                          {activeGoldConfig.unit === 'BAHT' ? (
                            <>
                              {[
                                { label: '+0.25 (1 สลึง)', val: 0.25 },
                                { label: '+0.5 (2 สลึง)', val: 0.5 },
                                { label: '+1 บาท', val: 1 },
                                { label: '+2 บาท', val: 2 },
                                { label: '+5 บาท', val: 5 },
                              ].map((preset) => (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => {
                                    setDipInputMode('units');
                                    setDipAddUnits(String(preset.val));
                                  }}
                                  className="text-[10px] font-medium bg-white hover:bg-amber-100 text-amber-950 px-2 py-0.5 rounded-md border border-amber-300/80 transition cursor-pointer shadow-xs"
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </>
                          ) : activeGoldConfig.unit === 'G' ? (
                            <>
                              {[
                                { label: '+1g', val: 1 },
                                { label: '+3.811g (1 สลึง)', val: 3.811 },
                                { label: '+7.622g (2 สลึง)', val: 7.622 },
                                { label: '+15.244g (1 บาท)', val: 15.244 },
                              ].map((preset) => (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => {
                                    setDipInputMode('units');
                                    setDipAddUnits(String(preset.val));
                                  }}
                                  className="text-[10px] font-medium bg-white hover:bg-amber-100 text-amber-950 px-2 py-0.5 rounded-md border border-amber-300/80 transition cursor-pointer shadow-xs"
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </>
                          ) : null}
                        </div>
                      )}

                      {/* Main Input Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                        {dipInputMode === 'units' ? (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                              ซื้อเพิ่มกี่หน่วย ({activeGoldConfig?.unit === 'BAHT' ? 'บาททองคำ' : activeGoldConfig?.unit === 'G' ? 'กรัม' : 'Units'})
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder={activeGoldConfig?.unit === 'BAHT' ? 'เช่น 0.2292 หรือ 1' : 'เช่น 50'}
                              value={dipAddUnits}
                              onChange={(e) => setDipAddUnits(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 font-mono font-medium"
                            />
                            {dipAddUnits && dipAddUnits.toLowerCase().match(/[kmb]/) && (
                              <span className="text-[10px] text-blue-600 font-medium block mt-0.5">
                                💡 {dipAddUnits} = {parseNumberWithSuffix(dipAddUnits).toLocaleString()}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                              งบเงินที่ต้องการซื้อ ({previewCurrencySymbol})
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="เช่น 15000 หรือ 15.2k"
                              value={dipBudget}
                              onChange={(e) => setDipBudget(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 font-mono font-medium"
                            />
                            {dipBudget && dipBudget.toLowerCase().match(/[kmb]/) && (
                              <span className="text-[10px] text-blue-600 font-medium block mt-0.5">
                                💡 {dipBudget} = ฿{parseNumberWithSuffix(dipBudget).toLocaleString()}
                              </span>
                            )}
                          </div>
                        )}

                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                            ราคาที่ซื้อเพิ่ม ({previewCurrencySymbol})
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder={activeGoldConfig ? 'เช่น 66.5k หรือ 66,500' : 'เช่น 120.00'}
                            value={dipAddPrice}
                            onChange={(e) => setDipAddPrice(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 font-mono font-medium"
                          />
                          {dipAddPrice && dipAddPrice.toLowerCase().match(/[kmb]/) && (
                            <span className="text-[10px] text-blue-600 font-medium block mt-0.5">
                              💡 {dipAddPrice} = {previewCurrencySymbol}{parseNumberWithSuffix(dipAddPrice).toLocaleString()}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={handleApplyDipCalc}
                          disabled={
                            (dipInputMode === 'units' ? !dipAddUnits : !dipBudget) || !dipAddPrice
                          }
                          className="w-full px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 cursor-pointer shadow-xs"
                        >
                          คำนวณ & ใส่ค่าให้อัตโนมัติ
                        </button>
                      </div>

                      {/* Live Gold Conversion Details (Shown when price & units/budget are filled) */}
                      {activeGoldConfig && liveDipGoldMetrics && (
                        <div className="p-3 rounded-xl bg-gradient-to-br from-amber-50/90 via-amber-100/40 to-yellow-50/80 border border-amber-300/80 shadow-xs space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-amber-200/80 pb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-base">👑</span>
                              <div>
                                <span className="text-xs font-bold text-amber-950 block">
                                  {activeGoldConfig.label}
                                </span>
                                <span className="text-[10px] text-amber-700">
                                  คำนวณราคาทองคำ & น้ำหนักมาตรฐาน
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-amber-800 block">ยอดเงินที่ซื้อ (Total Cost)</span>
                              <span className="text-sm font-bold font-mono text-amber-950">
                                ฿{liveDipGoldMetrics.totalCashThb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          {/* Weight Breakdown */}
                          <div className="grid grid-cols-3 gap-2 text-center bg-white/70 backdrop-blur-xs p-2 rounded-lg border border-amber-200/60">
                            <div>
                              <span className="text-[10px] text-slate-500 block">บาททองคำ</span>
                              <span className="text-xs font-bold font-mono text-amber-950">
                                {liveDipGoldMetrics.bahtWeight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                              </span>
                              <span className="text-[9px] text-amber-700 block">บาท</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 block">น้ำหนักสุทธิ</span>
                              <span className="text-xs font-bold font-mono text-amber-950">
                                {liveDipGoldMetrics.grams.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 4 })}
                              </span>
                              <span className="text-[9px] text-amber-700 block">กรัม (g)</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 block">เทียบเท่าสลึง</span>
                              <span className="text-xs font-bold font-mono text-amber-950">
                                {liveDipGoldMetrics.salung.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                              </span>
                              <span className="text-[9px] text-amber-700 block">สลึง</span>
                            </div>
                          </div>

                          {/* Rate Equivalents Breakdown */}
                          <div className="grid grid-cols-3 gap-2 text-center bg-white/70 backdrop-blur-xs p-2 rounded-lg border border-amber-200/60">
                            <div>
                              <span className="text-[10px] text-slate-500 block">ราคา/บาททอง</span>
                              <span className="text-xs font-bold font-mono text-slate-900">
                                ฿{liveDipGoldMetrics.pricePerBaht.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 block">ราคา/สลึง</span>
                              <span className="text-xs font-bold font-mono text-slate-900">
                                ฿{liveDipGoldMetrics.pricePerSalung.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 block">ราคา/กรัม</span>
                              <span className="text-xs font-bold font-mono text-slate-900">
                                ฿{liveDipGoldMetrics.pricePerGram.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          {/* DCA Portfolio Impact */}
                          {liveDipDcaImpact && (
                            <div className="p-2 rounded-lg bg-amber-100/60 border border-amber-200/80 flex flex-wrap items-center justify-between text-xs gap-1.5">
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-amber-800 font-semibold block">ผลกระทบต่อพอร์ต (DCA Impact)</span>
                                <span className="text-[11px] text-slate-700 font-mono block">
                                  จำนวน: {liveDipDcaImpact.curVol.toLocaleString(undefined, { maximumFractionDigits: 4 })} ➜{' '}
                                  <strong className="text-amber-950">{liveDipDcaImpact.newVol.toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong> หน่วย
                                </span>
                              </div>
                              <div className="text-right space-y-0.5">
                                <span className="text-[10px] text-amber-800 font-semibold block">ต้นทุนเฉลี่ยใหม่</span>
                                <span className="text-xs font-bold font-mono text-amber-950">
                                  {previewCurrencySymbol}{liveDipDcaImpact.newCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                                  <span className={`text-[10px] font-semibold ${liveDipDcaImpact.diff >= 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                                    ({liveDipDcaImpact.diff >= 0 ? '+' : ''}{liveDipDcaImpact.diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                  </span>
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* General Non-Gold Live Preview */}
                      {!activeGoldConfig && parsedDipAddUnits > 0 && parsedDipAddPrice > 0 && (
                        <div className="p-2.5 bg-blue-50/70 rounded-lg border border-blue-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-blue-700 font-medium block">ยอดเงินที่ต้องใช้ (Total Cost)</span>
                            <span className="font-bold font-mono text-blue-950 text-sm">
                              {previewCurrencySymbol}{(parsedDipAddUnits * parsedDipAddPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          {liveDipDcaImpact && (
                            <div className="text-right">
                              <span className="text-[10px] text-blue-700 font-medium block">ต้นทุนเฉลี่ยหลังซื้อ</span>
                              <span className="font-bold font-mono text-blue-950">
                                {previewCurrencySymbol}{liveDipDcaImpact.newCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}{' '}
                                <span className={`text-[10px] font-semibold ${liveDipDcaImpact.diff >= 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
                                  ({liveDipDcaImpact.diff >= 0 ? '+' : ''}{liveDipDcaImpact.diff.toFixed(2)})
                                </span>
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {pendingDipTrade && (
                        <div className="p-2.5 bg-blue-50/80 rounded-lg border border-blue-200">
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={recordDipTrade}
                              onChange={(e) => setRecordDipTrade(e.target.checked)}
                              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                            />
                            <span className="text-[11px] font-medium text-blue-900 leading-relaxed">
                              บันทึกเป็น Trade BUY ({pendingDipTrade.units.toLocaleString(undefined, { maximumFractionDigits: 4 })} หน่วย @ {previewCurrencySymbol}
                              {pendingDipTrade.price.toLocaleString()})
                              {formData.accountId
                                ? ' และหักเงินสดจากบัญชีที่ผูกอัตโนมัติ'
                                : ' (เลือกบัญชีการเงินด้านบนหากต้องการให้หักเงินสด)'}
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                            จำนวนหน่วยที่ขายออก / Stop loss (Units)
                          </label>
                          <input
                            type="number"
                            step="any"
                            placeholder="เช่น 30"
                            value={sellUnits}
                            onChange={(e) => setSellUnits(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-rose-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleApplySellCalc}
                          disabled={!sellUnits}
                          className="w-full px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition disabled:opacity-50 cursor-pointer shadow-xs"
                        >
                          ลดจำนวน & ใส่ค่าให้อัตโนมัติ
                        </button>
                      </div>

                      {pendingSellTrade && (
                        <div className="p-2.5 bg-rose-50/80 rounded-lg border border-rose-200">
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={recordSellTrade}
                              onChange={(e) => setRecordSellTrade(e.target.checked)}
                              className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 h-3.5 w-3.5 cursor-pointer"
                            />
                            <span className="text-[11px] font-medium text-rose-900 leading-relaxed">
                              บันทึกเป็น Trade SELL ({pendingSellTrade.units.toLocaleString()} หน่วย)
                              {formData.accountId
                                ? ' และเพิ่มเงินสดกลับเข้าบัญชีที่ผูกอัตโนมัติ'
                                : ' (เลือกบัญชีการเงินด้านบนหากต้องการให้เพิ่มเงินสดกลับเข้าบัญชี)'}
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {calcNotice && (
                    <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 p-2 rounded-lg flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{calcNotice}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Live Preview Box */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 grid grid-cols-3 gap-2 text-center">
                <div>
                  <span className="text-[11px] text-slate-500 block">มูลค่าต้นทุนรวม</span>
                  <span className="text-xs sm:text-sm font-bold font-mono tabular-nums text-slate-800">
                    {previewCurrencySymbol}
                    {previewTotalCost.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">มูลค่าตลาดรวม</span>
                  <span className="text-xs sm:text-sm font-bold font-mono tabular-nums text-slate-800">
                    {previewCurrencySymbol}
                    {previewTotalPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">ผลตอบแทนคาดการณ์</span>
                  <span
                    className={`text-xs sm:text-sm font-bold font-mono tabular-nums ${
                      previewPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {previewPnl >= 0 ? '+' : ''}
                    {previewPnl.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="flex justify-end items-center gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submittingHolding}
                  className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-semibold transition disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {submittingHolding ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : modalMode === 'add' ? (
                    'บันทึกสินทรัพย์'
                  ) : (
                    'บันทึกการแก้ไข'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sell Modal (ขายสินทรัพย์ / ขายทั้งหมด 100% ปิดสถานะ) */}
      {isSellModalOpen && sellTargetHolding && (() => {
        const holdingVol = Number(sellTargetHolding.volume) || 0;
        const holdingCost = Number(sellTargetHolding.initial_cost) || 0;
        const curr = (sellTargetHolding.currency || 'THB').toUpperCase();
        const currPrefix = getCurrencySymbol(curr);
        const rateToThb = fxRates[curr] || Number(sellTargetHolding.exchange_rate) || 1.0;

        const units = parseFloat(sellVolumeInput) || 0;
        const price = parseFloat(sellPriceInput) || 0;
        const fee = parseFloat(sellFeeInput) || 0;

        const isFullSell = units >= holdingVol && holdingVol > 0;
        const remainingUnits = Math.max(0, holdingVol - units);

        const gross = units * price;
        const net = Math.max(0, gross - fee);
        const netThb = net * rateToThb;

        const costSold = units * holdingCost;
        const realizedPnl = net - costSold;
        const realizedPnlYield = costSold > 0 ? (realizedPnl / costSold) * 100 : 0;

        const targetAcc = accounts.find((a) => a.id === sellAccountId);
        let creditAmount = netThb;
        let accCurr = 'THB';
        if (targetAcc) {
          accCurr = (targetAcc.currency || 'THB').toUpperCase();
          if (accCurr === curr) {
            creditAmount = net;
          } else if (accCurr !== 'THB') {
            const accRateToThb = fxRates[accCurr] || 1.0;
            creditAmount = accRateToThb > 0 ? netThb / accRateToThb : netThb;
          }
        }
        const curAccBal = targetAcc ? Number(targetAcc.current_balance || 0) : 0;
        const projectedAccBal = curAccBal + creditAmount;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100 bg-rose-50/70">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600">
                    <TrendingDown className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <span>ขายสินทรัพย์: {sellTargetHolding.symbol}</span>
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-white text-rose-700 border border-rose-200">
                        {curr}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      ขายทำกำไร หรือขายทั้งหมด 100% เพื่อปิดสถานะและรับเงินเข้ากระเป๋า
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseSellModal}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-rose-100/50 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <form onSubmit={handleConfirmSell} className="p-5 overflow-y-auto space-y-4">
                {/* Current Position Snapshot */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-500 block">จำนวนที่ถือครอง</span>
                    <span className="font-bold text-slate-800 font-mono">
                      {holdingVol.toLocaleString(undefined, { maximumFractionDigits: 6 })} หุ้น
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">ต้นทุนเฉลี่ย</span>
                    <span className="font-bold text-slate-800 font-mono">
                      {currPrefix}{holdingCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">ราคาตลาดล่าสุด</span>
                    <span className="font-bold text-slate-800 font-mono">
                      {currPrefix}
                      {Number(sellTargetHolding.present_price || holdingCost).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">โบรกเกอร์</span>
                    <span className="font-bold text-slate-800">
                      {sellTargetHolding.broker || '-'}
                    </span>
                  </div>
                </div>

                {/* Quick Proportion Selectors */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      เลือกสัดส่วนที่ต้องการขาย:
                    </label>
                    {isFullSell && (
                      <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        ⚡ ขายทั้งหมด 100% (ปิดสถานะ)
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: '25%', ratio: 0.25 },
                      { label: '50%', ratio: 0.5 },
                      { label: '75%', ratio: 0.75 },
                      { label: 'ขายหมด 100%', ratio: 1.0 },
                    ].map((btn) => {
                      const computedVal = Number((holdingVol * btn.ratio).toFixed(6));
                      const isSelected = btn.ratio === 1.0 ? isFullSell : Math.abs(units - computedVal) < 0.000001;
                      return (
                        <button
                          key={btn.label}
                          type="button"
                          onClick={() => {
                            setSellVolumeInput(btn.ratio === 1.0 ? String(holdingVol) : String(computedVal));
                          }}
                          className={`py-1.5 px-2 text-xs font-bold rounded-xl border transition cursor-pointer ${
                            isSelected
                              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
                          }`}
                        >
                          {btn.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Inputs: Sell Volume & Sell Price */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      จำนวนหน่วยที่จะขาย <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      max={holdingVol}
                      min={0.00000001}
                      placeholder="0.00"
                      value={sellVolumeInput}
                      onChange={(e) => setSellVolumeInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
                    />
                    <span className="text-[11px] text-slate-500 mt-0.5 block">
                      {isFullSell ? (
                        <span className="text-rose-600 font-semibold">ขายหมดทั้งพอร์ต (คงเหลือ 0 หุ้น)</span>
                      ) : (
                        <span>คงเหลือหลังขาย: {remainingUnits.toLocaleString(undefined, { maximumFractionDigits: 6 })} หุ้น</span>
                      )}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ราคาที่ขายต่อหน่วย ({currPrefix}) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      min={0}
                      placeholder="0.00"
                      value={sellPriceInput}
                      onChange={(e) => setSellPriceInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
                    />
                    <span className="text-[11px] text-slate-500 mt-0.5 block">
                      ราคาต่อหุ้นที่ทำรายการขายจริง
                    </span>
                  </div>
                </div>

                {/* Inputs: Fee & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ค่าธรรมเนียม / ภาษี ({currPrefix})
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      placeholder="0.00"
                      value={sellFeeInput}
                      onChange={(e) => setSellFeeInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                    />
                    <span className="text-[11px] text-slate-500 mt-0.5 block">
                      ค่าคอมมิชชั่นโบรกเกอร์ (ถ้ามี)
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      วันที่ทำรายการ
                    </label>
                    <input
                      type="date"
                      required
                      value={sellDate}
                      onChange={(e) => setSellDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                    />
                    <span className="text-[11px] text-slate-500 mt-0.5 block">
                      วันที่บันทึกรายการขาย
                    </span>
                  </div>
                </div>

                {/* Destination Account Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>รับเงินสดเข้ากระเป๋า / บัญชีการเงิน (Destination Account)</span>
                  </label>
                  <select
                    value={sellAccountId}
                    onChange={(e) => setSellAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-rose-500 font-medium cursor-pointer"
                  >
                    <option value="">-- ไม่ระบุบัญชี (ไม่เพิ่มเงินสดเข้ากระเป๋า) --</option>
                    {accounts.map((acc) => {
                      const aCurr = (acc.currency || 'THB').toUpperCase();
                      return (
                        <option key={acc.id} value={acc.id}>
                          {acc.bank_name ? `[${acc.bank_name}] ` : ''}
                          {acc.account_name} ({Number(acc.current_balance || 0).toLocaleString()} {aCurr})
                        </option>
                      );
                    })}
                  </select>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    ระบบจะนำเงินสุทธิที่ได้จากการขายโอนเข้าบัญชีนี้โดยอัตโนมัติ
                  </span>
                </div>

                {/* Live Realized Profit & Wallet Credit Preview */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-2.5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[11px] text-slate-500 block">รับเงินสุทธิ</span>
                      <span className="font-bold text-slate-800 font-mono text-sm block">
                        {currPrefix}
                        {net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {curr !== 'THB' && (
                        <span className="text-[10px] text-slate-500">
                          ~฿{netThb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-[11px] text-slate-500 block">กำไร/ขาดทุนรับรู้ (Realized)</span>
                      <span
                        className={`font-bold font-mono text-sm block ${
                          realizedPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {realizedPnl >= 0 ? '+' : ''}
                        {currPrefix}
                        {realizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span
                        className={`text-[10px] font-semibold ${
                          realizedPnlYield >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {realizedPnlYield >= 0 ? '+' : ''}
                        {realizedPnlYield.toFixed(2)}%
                      </span>
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <span className="text-[11px] text-slate-500 block">สถานะในพอร์ตหลังขาย</span>
                      {isFullSell ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 mt-0.5">
                          ปิดสถานะ 100%
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 mt-0.5">
                          คงเหลือ {remainingUnits.toLocaleString()} หุ้น
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Wallet Credit Preview Note */}
                  {targetAcc && net > 0 && (
                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs text-emerald-900 bg-emerald-50/70 p-2 rounded-lg border border-emerald-200/80">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <span className="font-semibold block">
                            โอนเงินเข้า: {targetAcc.bank_name ? `[${targetAcc.bank_name}] ` : ''}
                            {targetAcc.account_name}
                          </span>
                          <span className="text-[11px] text-emerald-700 block">
                            ยอดเงินเข้า: +{creditAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {accCurr}
                            {' '}(ยอดคงเหลือใหม่: {projectedAccBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {accCurr})
                          </span>
                        </div>
                      </div>
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    </div>
                  )}

                  {isFullSell && (
                    <div className="text-[11px] text-slate-500 bg-white p-2 rounded-lg border border-slate-200/80">
                      💡 <strong>ข้อสังเกต:</strong> เมื่อขายครบ 100% ระบบจะบันทึกประวัติการขาย (SELL) ในบันทึกการเทรด และนำสินทรัพย์ออกจากตารางพอร์ตให้อัตโนมัติ (ไม่จำเป็นต้องกดปุ่มลบถังขยะ)
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-end items-center gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCloseSellModal}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={submittingSell}
                    className="px-5 py-2 text-white bg-rose-600 hover:bg-rose-700 rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    {submittingSell ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>กำลังบันทึกการขาย...</span>
                      </>
                    ) : (
                      <>
                        <TrendingDown className="w-3.5 h-3.5" />
                        <span>{isFullSell ? 'ยืนยันขายทั้งหมด (100%)' : `ยืนยันการขาย (${units.toLocaleString()} หุ้น)`}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
