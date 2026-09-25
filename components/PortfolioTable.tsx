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
} from 'lucide-react';
import { CURRENCY_OPTIONS, getCurrencySymbol } from '@/lib/currency';
import { POPULAR_BROKERS } from './TradeTransactionsSection';

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
  const [dipAddUnits, setDipAddUnits] = useState('');
  const [dipAddPrice, setDipAddPrice] = useState('');
  const [sellUnits, setSellUnits] = useState('');
  const [calcNotice, setCalcNotice] = useState<string | null>(null);

  // Pending calculator trade states for Edit mode
  const [recordDipTrade, setRecordDipTrade] = useState(true);
  const [pendingDipTrade, setPendingDipTrade] = useState<{ units: number; price: number } | null>(null);

  const [recordSellTrade, setRecordSellTrade] = useState(true);
  const [pendingSellTrade, setPendingSellTrade] = useState<{ units: number } | null>(null);

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
    const defaultBroker = 'BLS';
    setFormData({
      symbol: '',
      broker: defaultBroker,
      currency: 'THB',
      volume: '',
      initial_cost: '',
      present_price: '',
      accountId: brokerAccountMap[defaultBroker] || '',
      recordTrade: true,
    });
    setCalcMode('dip');
    setDipAddUnits('');
    setDipAddPrice('');
    setSellUnits('');
    setCalcNotice(null);
    setPendingDipTrade(null);
    setPendingSellTrade(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (holding: Holding) => {
    setModalMode('edit');
    setSelectedHolding(holding);
    const holdingBroker = holding.broker || 'BLS';
    setFormData({
      symbol: holding.symbol,
      broker: holdingBroker,
      currency: (holding.currency || 'THB').toUpperCase(),
      volume: holding.volume != null ? String(holding.volume) : '',
      initial_cost: holding.initial_cost != null ? String(holding.initial_cost) : '',
      present_price: holding.present_price != null ? String(holding.present_price) : '',
      accountId: brokerAccountMap[holdingBroker] || '',
      recordTrade: false,
    });
    setCalcMode('dip');
    setDipAddUnits('');
    setDipAddPrice('');
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
    setCalcNotice(null);
    setPendingDipTrade(null);
    setPendingSellTrade(null);
  };

  const handleBrokerChange = (newBroker: string) => {
    const boundAccId = brokerAccountMap[newBroker];
    setFormData((prev) => ({
      ...prev,
      broker: newBroker,
      accountId: boundAccId || prev.accountId,
    }));
  };

  // คำนวณซื้อถัวเฉลี่ย (Buy on Dip Calculator)
  const handleApplyDipCalc = () => {
    const curVol = parseFloat(formData.volume) || 0;
    const curCost = parseFloat(formData.initial_cost) || 0;
    const addVol = parseFloat(dipAddUnits);
    const addPrice = parseFloat(dipAddPrice);

    if (isNaN(addVol) || addVol <= 0) {
      alert('กรุณาระบุจำนวนหน่วยที่ซื้อเพิ่มที่ถูกต้อง (> 0)');
      return;
    }
    if (isNaN(addPrice) || addPrice < 0) {
      alert('กรุณาระบุราคาที่ซื้อเพิ่มที่ถูกต้อง (>= 0)');
      return;
    }

    const newVol = curVol + addVol;
    const newCost = (curVol * curCost + addVol * addPrice) / newVol;

    setFormData((prev) => ({
      ...prev,
      volume: String(newVol),
      initial_cost: String(parseFloat(newCost.toFixed(4))),
    }));

    setPendingDipTrade({ units: addVol, price: addPrice });
    setRecordDipTrade(true);

    setCalcNotice(
      `คำนวณสำเร็จ: ปรับจำนวนเป็น ${newVol.toLocaleString()} หน่วย, ต้นทุนเฉลี่ยใหม่ ${newCost.toFixed(4)} (พร้อมบันทึก BUY ${addVol.toLocaleString()} หุ้น)`
    );
    setDipAddUnits('');
    setDipAddPrice('');
  };

  // คำนวณลดจำนวนหุ้น (Stop Loss / Partial Sell Calculator)
  const handleApplySellCalc = () => {
    const curVol = parseFloat(formData.volume) || 0;
    const sold = parseFloat(sellUnits);

    if (isNaN(sold) || sold <= 0) {
      alert('กรุณาระบุจำนวนหน่วยที่ขายออกที่ถูกต้อง (> 0)');
      return;
    }
    if (sold > curVol) {
      alert(`จำนวนที่ขาย (${sold}) มากกว่าจำนวนที่ถือครองอยู่ (${curVol})`);
      return;
    }

    const newVol = Math.max(0, curVol - sold);

    setFormData((prev) => ({
      ...prev,
      volume: String(newVol),
    }));

    setPendingSellTrade({ units: sold });
    setRecordSellTrade(true);

    setCalcNotice(
      `คำนวณสำเร็จ: ปรับลดจำนวนคงเหลือเป็น ${newVol.toLocaleString()} หน่วย (พร้อมบันทึก SELL ${sold.toLocaleString()} หุ้น)`
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

          // ลดเงินสดคงเหลือใน financial_accounts
          if (formData.accountId) {
            const targetAcc = accounts.find((a) => a.id === formData.accountId);
            if (targetAcc) {
              const newBal = (Number(targetAcc.current_balance) || 0) - netThb;
              await supabase
                .from('financial_accounts')
                .update({ current_balance: newBal, updated_at: new Date().toISOString() })
                .eq('id', formData.accountId);
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
            reason: 'ซื้อถัวเฉลี่ย (Buy on Dip)',
            account_id: formData.accountId || null,
          };

          const { error: tErr } = await supabase.from('trade_transactions').insert(dipTradePayload);
          if (tErr && tErr.message?.includes('account_id')) {
            delete dipTradePayload.account_id;
            await supabase.from('trade_transactions').insert(dipTradePayload);
          }

          // ลดเงินสดใน financial_accounts
          if (formData.accountId) {
            const targetAcc = accounts.find((a) => a.id === formData.accountId);
            if (targetAcc) {
              const newBal = (Number(targetAcc.current_balance) || 0) - grossThb;
              await supabase
                .from('financial_accounts')
                .update({ current_balance: newBal, updated_at: new Date().toISOString() })
                .eq('id', formData.accountId);
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

          // เพิ่มเงินสดเข้า financial_accounts
          if (formData.accountId) {
            const targetAcc = accounts.find((a) => a.id === formData.accountId);
            if (targetAcc) {
              const newBal = (Number(targetAcc.current_balance) || 0) + grossThb;
              await supabase
                .from('financial_accounts')
                .update({ current_balance: newBal, updated_at: new Date().toISOString() })
                .eq('id', formData.accountId);
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
        className={`py-3 px-4 select-none cursor-pointer transition hover:bg-gray-100/80 ${
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
          <span className={isActive ? 'text-blue-600 font-bold' : 'text-gray-500'}>{label}</span>
          <span className={`transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400 opacity-40'}`}>
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
  const previewVol = parseFloat(formData.volume) || 0;
  const previewCost = parseFloat(formData.initial_cost) || 0;
  const previewPrice = formData.present_price !== '' ? parseFloat(formData.present_price) || 0 : previewCost;
  const previewTotalCost = previewVol * previewCost;
  const previewTotalPrice = previewVol * previewPrice;
  const previewPnl = previewTotalCost > 0 ? ((previewTotalPrice - previewTotalCost) / previewTotalCost) * 100 : 0;
  const previewCurrencySymbol = getCurrencySymbol(formData.currency);

  if (loadingData) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 text-center text-gray-500 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        <span>กำลังโหลดข้อมูลพอร์ตสินทรัพย์...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden space-y-0">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-gray-50/50">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Asset on Hand</h2>
          <p className="text-xs text-gray-500 mt-0.5">
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
            <tr className="border-b border-gray-100 bg-gray-50/80 text-gray-500 text-xs uppercase font-medium">
              {renderSortHeader('สินทรัพย์', 'symbol', 'left')}
              {renderSortHeader('โบรกเกอร์', 'broker', 'left')}
              {renderSortHeader('จำนวน', 'volume', 'right')}
              {renderSortHeader('ต้นทุนเฉลี่ย', 'initial_cost', 'right')}
              {renderSortHeader('ราคาตลาดล่าสุด', 'present_price', 'right')}
              {renderSortHeader('ผลตอบแทน (%)', 'yield_percent', 'right')}
              <th className="py-3 px-4 text-center text-xs uppercase font-semibold text-gray-500">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedHoldings.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-400">
                  <div className="space-y-2">
                    <AlertCircle className="w-8 h-8 mx-auto text-gray-300" />
                    <p className="text-sm font-medium">ยังไม่มีสินทรัพย์ในพอร์ต</p>
                    <p className="text-xs text-gray-400">
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
                        <span className="font-semibold text-gray-800">{item.symbol}</span>
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
                        <span className="text-gray-300 text-xs">-</span>
                      )}
                    </td>

                    {/* Volume: ถ้าไม่มีค่าให้ fallback เป็น 0 */}
                    <td className="py-3 px-4 text-right text-gray-600 font-mono">
                      {(item.volume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </td>

                    {/* Initial Cost */}
                    <td className="py-3 px-4 text-right text-gray-600 font-mono">
                      {item.initial_cost != null
                        ? `${currencyPrefix}${Number(item.initial_cost).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4,
                          })}`
                        : '-'}
                    </td>

                    {/* Present Price (Editable Inline หรือคลิกเปิด modal) */}
                    <td className="py-3 px-4 text-right font-semibold text-gray-600">
                      {isEditing ? (
                        <div
                          className="inline-flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="relative flex items-center">
                            <span className="text-xs text-gray-400 font-semibold mr-1">
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
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startInlineEditing(item)}
                          title="คลิกเพื่อแก้ไขราคาตลาดอย่างรวดเร็ว"
                          className="inline-flex items-center justify-end gap-1.5 font-semibold text-gray-700 hover:text-blue-600 cursor-pointer group py-0.5 px-1.5 -mr-1.5 rounded hover:bg-blue-50/60 transition"
                        >
                          <span className="font-mono">
                            {item.present_price != null
                              ? `${currencyPrefix}${Number(item.present_price).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 4,
                                })}`
                              : '-'}
                          </span>
                          <Pencil className="w-3 h-3 text-gray-300 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition" />
                        </button>
                      )}
                    </td>

                    {/* Yield % */}
                    <td
                      className={`py-3 px-4 text-right font-medium font-mono ${
                        (item.yield_percent ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {(item.yield_percent ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                      %
                    </td>

                    {/* Actions: Edit Modal (Volume/Cost/Price), Sync, Delete */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center justify-center gap-1">
                        {/* Edit Holding Details (Modal) */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(item)}
                          disabled={isRowLoading || isBulkUpdating || isSavingThisRow}
                          title="แก้ไขข้อมูลสินทรัพย์ (จำนวน, ต้นทุนเฉลี่ย, ซื้อถัวเฉลี่ย)"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition disabled:opacity-30 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {/* Sync Single Price from API */}
                        <button
                          type="button"
                          onClick={() => handleUpdateSingle(item.id)}
                          disabled={isRowLoading || isBulkUpdating || isSavingThisRow}
                          title="กดเพื่อดึงราคาล่าสุดจากตลาด (API)"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition disabled:opacity-30 cursor-pointer"
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
                          title="ลบสินทรัพย์ออกจากพอร์ต"
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition disabled:opacity-30 cursor-pointer"
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
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
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
                    placeholder="เช่น AAPL, NVDA, BTC, PTT"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-semibold uppercase disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    {modalMode === 'add' ? 'ใส่ชื่อย่อหุ้น หรือเหรียญคริปโต' : 'สัญลักษณ์อ้างอิงของสินทรัพย์'}
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
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
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
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
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
                    <option value="">-- ไม่ระบุบัญชี --</option>
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
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
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
                  <span className="text-[11px] text-slate-400 mt-0.5 block">หุ้น / เหรียญ</span>
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
                  <span className="text-[11px] text-slate-400 mt-0.5 block">ราคาซื้อเฉลี่ย</span>
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
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
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
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                            ซื้อเพิ่มกี่หน่วย (Units)
                          </label>
                          <input
                            type="number"
                            step="any"
                            placeholder="เช่น 50"
                            value={dipAddUnits}
                            onChange={(e) => setDipAddUnits(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                            ราคาที่ซื้อเพิ่ม ({previewCurrencySymbol})
                          </label>
                          <input
                            type="number"
                            step="any"
                            placeholder="เช่น 120.00"
                            value={dipAddPrice}
                            onChange={(e) => setDipAddPrice(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyDipCalc}
                          disabled={!dipAddUnits || !dipAddPrice}
                          className="w-full px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 cursor-pointer shadow-xs"
                        >
                          คำนวณ & ใส่ค่าให้อัตโนมัติ
                        </button>
                      </div>

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
                              บันทึกเป็น Trade BUY ({pendingDipTrade.units.toLocaleString()} หน่วย @ {previewCurrencySymbol}
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
                  <span className="text-xs sm:text-sm font-bold text-slate-800">
                    {previewCurrencySymbol}
                    {previewTotalCost.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">มูลค่าตลาดรวม</span>
                  <span className="text-xs sm:text-sm font-bold text-slate-800">
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
                    className={`text-xs sm:text-sm font-bold ${
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
    </div>
  );
}
