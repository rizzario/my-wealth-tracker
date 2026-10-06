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
  Trash2,
  Plus,
  Eye,
  Loader2,
  CheckSquare,
  Square,
  ZoomIn,
  Cpu,
  Activity,
  CheckCircle2,
  Cloud,
  FlaskConical,
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

export interface StagedSlipItem {
  id: string; // client-side temp id
  file: File;
  previewUrl: string;
  status: 'pending' | 'scanning' | 'success' | 'error';
  errorMessage?: string;
  date: string;
  time: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  category: string;
  amount: string; // formatted string for inputs
  accountId: string;
  toAccountId: string;
  note: string;
  isHistorical: boolean;
  senderBank?: string;
  senderAccountMasked?: string;
  receiverName?: string;
  referenceNumber?: string;
  confidenceScore?: number;
  modelUsed?: string;
  selected: boolean;
}

// Helper to resize/compress slip image before uploading for OCR to dramatically reduce input tokens
function compressImageForOcr(file: File, maxDimension = 1200, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/')) return Promise.resolve(file);

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Skip resize if image is already compact
      if (width <= maxDimension && height <= maxDimension && file.size < 400 * 1024) {
        return resolve(file);
      }

      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(file);

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          resolve(blob || file);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export interface ScanModelOption {
  id: string;
  name: string;
  badge: string;
  provider: 'cloudflare' | 'google';
  description?: string;
}

export const AVAILABLE_MODELS: ScanModelOption[] = [
  {
    id: 'cloudflare-llama-3.2-11b-vision',
    name: 'Cloudflare Llama 3.2 Vision (11B)',
    badge: 'Workers AI ☁️ ฟรี',
    provider: 'cloudflare',
    description: 'Serverless Workers AI, ประมวลผลฟรี ไม่หักโควต้า Gemini',
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash-Lite',
    badge: 'ประหยัดสุด & เร็ว ⚡',
    provider: 'google',
    description: 'Google AI ค่าบริการต่ำ รวดเร็ว',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    badge: 'มาตรฐาน 🎯',
    provider: 'google',
    description: 'สมดุลทั้งความแม่นยำและความเร็ว',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    badge: 'รุ่นใหม่ล่าสุด 🚀',
    provider: 'google',
    description: 'โมเดลความฉลาดสูงสุด',
  },
];

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
  const additionalFileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<StagedSlipItem[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>('cloudflare-llama-3.2-11b-vision');

  // Connection & provider status
  const [providerStatus, setProviderStatus] = useState<{
    cloudflare?: { configured: boolean; status: string; url?: string };
    gemini?: { configured: boolean };
  } | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(false);
  const [statusTooltip, setStatusTooltip] = useState<string | null>(null);

  const checkProviderStatus = useCallback(async () => {
    try {
      setIsCheckingStatus(true);
      const res = await fetch('/api/scan-slip', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        setProviderStatus(data.providers);
      }
    } catch {
      // ignore
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);

  // Load preferred model from localStorage and check API providers
  useEffect(() => {
    try {
      const saved = localStorage.getItem('slip_scan_model') || localStorage.getItem('gemini_scan_model');
      if (saved && AVAILABLE_MODELS.some((m) => m.id === saved)) {
        setSelectedModel(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isOpen) {
      checkProviderStatus();
    }
  }, [isOpen, checkProviderStatus]);

  // Lightbox preview for zooming image
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);

  // Reset state when modal is opened/closed
  useEffect(() => {
    if (!isOpen) {
      // Clean up object URLs to prevent memory leaks
      items.forEach((item) => {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {}
      });
      setItems([]);
      setZoomedImage(null);
      setIsDragging(false);
      setIsSubmitting(false);
      setStatusTooltip(null);
    }
  }, [isOpen]);

  // Scan a single item through /api/scan-slip
  const scanSingleItem = useCallback(
    async (item: StagedSlipItem, model: string): Promise<Partial<StagedSlipItem>> => {
      const optimizedBlob = await compressImageForOcr(item.file);
      const formData = new FormData();
      formData.append('file', optimizedBlob, item.file.name.replace(/\.[^.]+$/, '.jpg'));
      formData.append('model', model);

      const res = await fetch('/api/scan-slip', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || result.error || 'ไม่สามารถสแกนสลิปได้');
      }

      const slip = result.data;

      // Parse Date & Time
      let parsedDate = new Date().toISOString().split('T')[0];
      let parsedTime = '12:00';

      if (slip.transaction_date) {
        try {
          const d = new Date(slip.transaction_date);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          parsedDate = `${yyyy}-${mm}-${dd}`;
          parsedTime = `${hh}:${min}`;
        } catch {
          // fallback
        }
      }

      // Build initial note
      const noteParts: string[] = [];
      if (slip.receiver_name) noteParts.push(`ถึง: ${slip.receiver_name}`);
      if (slip.memo) noteParts.push(`[${slip.memo}]`);
      if (slip.reference_number) noteParts.push(`Ref: ${slip.reference_number}`);

      return {
        status: 'success',
        date: parsedDate,
        time: parsedTime,
        type: slip.type || 'EXPENSE',
        category: slip.category || 'อาหาร & เครื่องดื่ม',
        amount: slip.amount != null ? String(slip.amount) : '',
        accountId: slip.matched_account_id || (accounts[0]?.id ? String(accounts[0].id) : ''),
        toAccountId: slip.matched_to_account_id || '',
        note: noteParts.join(' '),
        isHistorical: Boolean(slip.is_historical_suggested),
        senderBank: slip.sender_bank,
        senderAccountMasked: slip.sender_account_masked,
        receiverName: slip.receiver_name,
        referenceNumber: slip.reference_number,
        confidenceScore: slip.confidence_score,
        modelUsed: slip.model_used || model,
      };
    },
    [accounts]
  );

  // Queue runner: processes pending items with concurrency of 2
  const processQueue = useCallback(
    async (currentItems: StagedSlipItem[], model = selectedModel) => {
      const pendingItems = currentItems.filter((i) => i.status === 'pending');
      if (pendingItems.length === 0) return;

      const CONCURRENCY = 2;
      let index = 0;

      const runWorker = async () => {
        while (index < pendingItems.length) {
          const currentIndex = index++;
          const target = pendingItems[currentIndex];
          if (!target) break;

          // Set status to scanning
          setItems((prev) =>
            prev.map((it) => (it.id === target.id ? { ...it, status: 'scanning' } : it))
          );

          try {
            const updates = await scanSingleItem(target, model);
            setItems((prev) =>
              prev.map((it) => (it.id === target.id ? { ...it, ...updates } : it))
            );
          } catch (err: any) {
            setItems((prev) =>
              prev.map((it) =>
                it.id === target.id
                  ? {
                      ...it,
                      status: 'error',
                      errorMessage: err.message || 'สแกนไม่สำเร็จ',
                    }
                  : it
              )
            );
          }
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY, pendingItems.length) }, () =>
        runWorker()
      );
      await Promise.all(workers);
    },
    [scanSingleItem, selectedModel]
  );

  // Add multiple files into the staging queue
  const handleAddFiles = useCallback(
    (files: FileList | File[]) => {
      const fileList = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (fileList.length === 0) return;

      const newItems: StagedSlipItem[] = fileList.map((file) => ({
        id: `staged_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'pending',
        date: new Date().toISOString().split('T')[0],
        time: '12:00',
        type: 'EXPENSE',
        category: 'อาหาร & เครื่องดื่ม',
        amount: '',
        accountId: accounts[0]?.id ? String(accounts[0].id) : '',
        toAccountId: '',
        note: '',
        isHistorical: false,
        selected: true,
      }));

      setItems((prev) => {
        const combined = [...prev, ...newItems];
        // Trigger queue processing
        setTimeout(() => processQueue(combined, selectedModel), 50);
        return combined;
      });
    },
    [accounts, processQueue, selectedModel]
  );

  // Support Clipboard Paste (Ctrl + V)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const itemsList = e.clipboardData?.items;
      if (!itemsList) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < itemsList.length; i++) {
        if (itemsList[i].type.startsWith('image/')) {
          const file = itemsList[i].getAsFile();
          if (file) pastedFiles.push(file);
        }
      }

      if (pastedFiles.length > 0) {
        handleAddFiles(pastedFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, handleAddFiles]);

  // Generate a realistic mock Thai bank slip on HTML canvas for instant testing
  const generateMockSlipFile = (): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 820;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve(new File([''], 'mock-slip.jpg', { type: 'image/jpeg' }));
      }

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Header Banner (Kasikorn Green)
      ctx.fillStyle = '#107C41';
      ctx.fillRect(0, 0, canvas.width, 130);

      // Header Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('โอนเงินสำเร็จ (Transfer Successful)', 300, 55);

      ctx.font = '18px sans-serif';
      ctx.fillText('ธนาคารกสิกรไทย (KASIKORNBANK)', 300, 95);

      // Amount Section
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText('฿ 185.00', 300, 220);

      ctx.fillStyle = '#64748b';
      ctx.font = '16px sans-serif';
      ctx.fillText('จำนวนเงิน (Amount)', 300, 255);

      // Separator Line
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, 285);
      ctx.lineTo(560, 285);
      ctx.stroke();

      // Transaction Details (Key - Value)
      ctx.textAlign = 'left';
      const drawRow = (label: string, value: string, y: number) => {
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(label, 50, y);
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = '#1e293b';
        ctx.fillText(value, 230, y);
      };

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      drawRow('วันที่ / Date:', `${dateStr} 12:45`, 335);
      drawRow('จาก / From:', 'นาย กิตติพงษ์ (xxx-x-x1234-x)', 390);
      drawRow('ธนาคารต้นทาง:', 'KBANK', 440);
      drawRow('ไปยัง / To:', 'ร้าน อเมซอน คาเฟ่ (PromptPay)', 495);
      drawRow('เลขบัญชีปลายทาง:', 'xxx-xxx-5678', 545);
      drawRow('บันทึกช่วยจำ:', 'ค่ากาแฟสดและขนมปัง', 600);
      drawRow('รหัสอ้างอิง (Ref):', '20261006KB987654', 655);

      // Footer
      ctx.fillStyle = '#107C41';
      ctx.fillRect(0, 775, canvas.width, 45);
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('สลิปตัวอย่างสำหรับทดสอบระบบ AI Slip Scanner', 300, 803);

      canvas.toBlob(
        (blob) => {
          const file = new File([blob || new Blob()], `mock_slip_${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });
          resolve(file);
        },
        'image/jpeg',
        0.9
      );
    });
  };

  const handleTestWithMockSlip = async () => {
    const mockFile = await generateMockSlipFile();
    handleAddFiles([mockFile]);
  };

  // Retry scanning an item
  const handleRetryItem = (item: StagedSlipItem) => {
    const updated = items.map((i) =>
      i.id === item.id ? { ...i, status: 'pending' as const, errorMessage: undefined } : i
    );
    setItems(updated);
    processQueue(updated, selectedModel);
  };

  // Delete an item from the staging list
  const handleDeleteItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {}
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  // Update item field
  const handleUpdateItem = (id: string, field: keyof StagedSlipItem, value: any) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  // Bulk Actions
  const handleToggleSelectAll = () => {
    const allSelected = items.every((i) => i.selected);
    setItems((prev) => prev.map((i) => ({ ...i, selected: !allSelected })));
  };

  const handleBulkSetHistorical = (val: boolean) => {
    setItems((prev) => prev.map((i) => ({ ...i, isHistorical: val })));
  };

  // Bulk Submit to Supabase
  const handleBulkSubmit = async () => {
    const validSelected = items.filter(
      (i) => i.selected && i.status === 'success' && parseFloat(i.amount) > 0
    );

    if (validSelected.length === 0) {
      alert('กรุณาเลือกรายการที่สแกนสำเร็จและมียอดเงินมากกว่า 0 อย่างน้อย 1 รายการ');
      return;
    }

    // Validate TRANSFER accounts
    for (const item of validSelected) {
      if (item.type === 'TRANSFER') {
        if (!item.accountId) {
          alert(`รายการยอด ฿${item.amount} (${item.note || 'โอนเงิน'}): กรุณาเลือกบัญชีต้นทาง`);
          return;
        }
        if (!item.toAccountId) {
          alert(`รายการยอด ฿${item.amount} (${item.note || 'โอนเงิน'}): กรุณาเลือกบัญชีปลายทาง`);
          return;
        }
        if (item.accountId === item.toAccountId) {
          alert(`รายการยอด ฿${item.amount}: บัญชีต้นทางและปลายทางต้องไม่ใช่บัญชีเดียวกัน`);
          return;
        }
      }
    }

    try {
      setIsSubmitting(true);

      const payloads = validSelected.map((item) => {
        const fullDateTime = item.time ? `${item.date}T${item.time}:00` : `${item.date}T12:00:00`;
        return {
          account_id: item.accountId || null,
          to_account_id: item.type === 'TRANSFER' ? item.toAccountId || null : null,
          type: item.type,
          transaction_type: item.type.toLowerCase(),
          category: item.category.trim(),
          amount: parseFloat(item.amount) || 0,
          note: item.note.trim() || null,
          transaction_date: fullDateTime,
          is_historical: item.isHistorical,
        };
      });

      const { error } = await supabase.from('expense_income_transactions').insert(payloads);
      if (error) throw error;

      onTransactionSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving bulk slip transactions:', err);
      alert(`ไม่สามารถบันทึกรายการได้: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Stats
  const totalCount = items.length;
  const successCount = items.filter((i) => i.status === 'success').length;
  const scanningCount = items.filter((i) => i.status === 'scanning' || i.status === 'pending').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const selectedCount = items.filter((i) => i.selected && i.status === 'success').length;
  const selectedTotalAmount = items
    .filter((i) => i.selected && i.status === 'success')
    .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

  const activeModel = AVAILABLE_MODELS.find((m) => m.id === selectedModel) || AVAILABLE_MODELS[0];
  const isCfModel = activeModel.provider === 'cloudflare';
  const cfStatus = providerStatus?.cloudflare?.status;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-7xl max-h-[96vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <span>AI สแกนสลิปหลายรายการ (Bulk Scan & Staging)</span>
              </h2>
              <p className="text-xs text-slate-500">
                รองรับทั้ง Cloudflare Workers AI (Llama 3.2 Vision) และ Google Gemini
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap">
            {/* Model Selector Dropdown */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200/90 shadow-2xs rounded-xl px-2.5 py-1.5">
              {isCfModel ? (
                <Cloud className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              ) : (
                <Cpu className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              )}
              <label htmlFor="slip-model-select" className="text-[11px] font-medium text-slate-500 hidden md:inline shrink-0">
                โมเดล:
              </label>
              <select
                id="slip-model-select"
                value={selectedModel}
                onChange={(e) => {
                  const newModel = e.target.value;
                  setSelectedModel(newModel);
                  try {
                    localStorage.setItem('slip_scan_model', newModel);
                    localStorage.setItem('gemini_scan_model', newModel);
                  } catch {}
                }}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer pr-1"
                title="เลือกโมเดล AI สำหรับประมวลผลสลิป"
              >
                <optgroup label="Cloudflare Workers AI (ฟรี)">
                  {AVAILABLE_MODELS.filter((m) => m.provider === 'cloudflare').map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.badge})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Google Gemini">
                  {AVAILABLE_MODELS.filter((m) => m.provider === 'google').map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.badge})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Provider Status Indicator / Refresh */}
            <button
              type="button"
              onClick={checkProviderStatus}
              disabled={isCheckingStatus}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-2xs cursor-pointer"
              title="ตรวจสอบสถานะการเชื่อมต่อ API"
            >
              {isCheckingStatus ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
              ) : isCfModel ? (
                cfStatus === 'ok' ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200 shrink-0" />
                ) : cfStatus === 'unreachable' ? (
                  <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-rose-200 shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-200 shrink-0" />
                )
              ) : providerStatus?.gemini?.configured ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200 shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-200 shrink-0" />
              )}
              <span className="hidden sm:inline">
                {isCheckingStatus
                  ? 'กำลังเช็ค...'
                  : isCfModel
                  ? cfStatus === 'ok'
                    ? 'Worker พร้อม'
                    : 'เช็ค Worker'
                  : providerStatus?.gemini?.configured
                  ? 'Gemini พร้อม'
                  : 'เช็ค API'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* VIEW A: No items yet -> Large Drag & Drop Box */}
          {items.length === 0 ? (
            <div className="space-y-4 max-w-2xl mx-auto py-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files) handleAddFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3.5 ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50/60 scale-[0.99]'
                    : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50/70 bg-white'
                }`}
              >
                <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-600 shadow-xs">
                  <UploadCloud className="w-10 h-10" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-bold text-slate-800">
                    ลากรูปสลิปมาวางที่นี่ หรือคลิกเพื่อเลือกหลายไฟล์
                  </p>
                  <p className="text-xs text-slate-500">
                    เลือกสลิปพร้อมกันได้หลายรูป (JPG, PNG, WEBP) ระบบจะสแกนและนำมาพักในตารางให้ตรวจทาน
                  </p>
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-lg">
                      💡 กด Ctrl + V เพื่อวางรูปจากคลิปบอร์ดได้ทันที
                    </span>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleAddFiles(e.target.files);
                  }}
                />
              </div>

              {/* Instant Test Button & Tips */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <FlaskConical className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>ไม่มีสลิปในเครื่องตอนนี้? ทดลองทดสอบความสามารถของระบบได้ทันที</span>
                </div>
                <button
                  type="button"
                  onClick={handleTestWithMockSlip}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-100/90 hover:bg-emerald-200 border border-emerald-300 rounded-xl transition shadow-2xs shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>🧪 ทดสอบด้วยสลิปตัวอย่าง</span>
                </button>
              </div>

              {/* Tips Banner */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 space-y-1.5">
                <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-emerald-600" />
                  <span>ระบบพักข้อมูลชั่วคราว (Temporary Staging Table):</span>
                </p>
                <p>
                  เมื่ออัปโหลดสลิป ข้อมูลจะถูกจัดเก็บไว้ในตารางจำลองบนหน้าจอนี้ก่อน คุณสามารถแก้ไข ยอดเงิน หมวดหมู่ บัญชี หรือลบรายการที่ไม่ถูกต้องออกได้ตามสะดวก ก่อนกดบันทึกจริงเข้าฐานข้อมูล
                </p>
                <div className="pt-1 text-[11px] text-slate-500 flex items-center gap-2">
                  <span className="font-medium text-slate-700">โมเดลที่เลือก:</span>
                  <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-semibold text-slate-800">
                    {activeModel.name}
                  </span>
                  <span>— {activeModel.description}</span>
                </div>
              </div>
            </div>
          ) : (
            /* VIEW B: Staging Table & Toolbar */
            <div className="space-y-3.5">
              {/* Toolbar & Progress Bar */}
              <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                  >
                    {items.every((i) => i.selected) ? (
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>{items.every((i) => i.selected) ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => additionalFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-xl transition shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ เพิ่มรูปสลิป</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestWithMockSlip}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition shadow-2xs cursor-pointer"
                    title="สร้างสลิปจำลองสำหรับทดสอบ"
                  >
                    <FlaskConical className="w-3.5 h-3.5 text-emerald-600" />
                    <span>+ สลิปตัวอย่าง</span>
                  </button>

                  <input
                    ref={additionalFileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handleAddFiles(e.target.files);
                    }}
                  />

                  {/* Bulk Historical Toggles */}
                  <div className="flex items-center gap-1 pl-1">
                    <button
                      type="button"
                      onClick={() => handleBulkSetHistorical(true)}
                      className="px-2.5 py-1 text-[11px] font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition cursor-pointer"
                      title="ตั้งค่าให้ทุกรายการเป็นสลิปย้อนหลัง (ไม่ปรับยอดเงินคงเหลือปัจจุบัน)"
                    >
                      เปิดย้อนหลังทั้งหมด
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkSetHistorical(false)}
                      className="px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
                    >
                      ปิดย้อนหลังทั้งหมด
                    </button>
                  </div>
                </div>

                {/* Progress / Status Metrics */}
                <div className="flex items-center gap-3 text-xs">
                  {scanningCount > 0 ? (
                    <div className="flex items-center gap-2 text-emerald-700 font-semibold animate-pulse">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      <span>กำลังสแกน {scanningCount} รูป...</span>
                    </div>
                  ) : (
                    <span className="font-semibold text-slate-700">
                      สแกนเสร็จสิ้น ({successCount}/{totalCount} รายการ)
                      {errorCount > 0 && <span className="text-rose-600 ml-1">ผิดพลาด {errorCount}</span>}
                    </span>
                  )}
                  <div className="h-4 w-[1px] bg-slate-300 hidden sm:block" />
                  <div className="font-bold text-slate-900 bg-white px-3 py-1 rounded-xl border border-slate-200 shadow-2xs">
                    เลือก {selectedCount} รายการ • รวม ฿{selectedTotalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Staging Data Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                <div className="overflow-x-auto max-h-[55vh]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-slate-500 font-semibold text-[11px] select-none">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">เลือก</th>
                        <th className="py-2.5 px-2 w-16 text-center">รูปสลิป</th>
                        <th className="py-2.5 px-3 w-40">วันที่ & เวลา</th>
                        <th className="py-2.5 px-3 w-28">ประเภท</th>
                        <th className="py-2.5 px-3 w-40">หมวดหมู่</th>
                        <th className="py-2.5 px-3 w-32">จำนวนเงิน (฿)</th>
                        <th className="py-2.5 px-3 w-48">บัญชีที่ใช้</th>
                        <th className="py-2.5 px-3 min-w-[200px]">บันทึกช่วยจำ (Note)</th>
                        <th className="py-2.5 px-3 w-28 text-center">สลิปย้อนหลัง</th>
                        <th className="py-2.5 px-2 w-12 text-center">ลบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item, idx) => {
                        const isSuccess = item.status === 'success';
                        const isScanning = item.status === 'scanning' || item.status === 'pending';
                        const isError = item.status === 'error';

                        return (
                          <tr
                            key={item.id}
                            className={`transition hover:bg-slate-50/70 ${
                              !item.selected ? 'opacity-50 bg-slate-50/40' : isError ? 'bg-rose-50/30' : ''
                            }`}
                          >
                            {/* 1. Checkbox */}
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={(e) => handleUpdateItem(item.id, 'selected', e.target.checked)}
                                disabled={!isSuccess}
                                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer disabled:opacity-30"
                              />
                            </td>

                            {/* 2. Slip Thumbnail with Zoom */}
                            <td className="py-2.5 px-2 text-center">
                              <div
                                onClick={() =>
                                  setZoomedImage({
                                    url: item.previewUrl,
                                    title: item.note || `สลิปที่ ${idx + 1}`,
                                  })
                                }
                                className="relative w-12 h-14 mx-auto rounded-lg overflow-hidden border border-slate-200 cursor-pointer group shadow-2xs"
                                title="คลิกเพื่อดูรูปขยาย"
                              >
                                <img
                                  src={item.previewUrl}
                                  alt="Slip"
                                  className="w-full h-full object-cover group-hover:scale-105 transition"
                                />
                                <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-white">
                                  <ZoomIn className="w-3.5 h-3.5" />
                                </div>
                              </div>
                            </td>

                            {/* 3. Date & Time */}
                            <td className="py-2.5 px-3">
                              {isScanning ? (
                                <div className="flex items-center gap-1.5 text-slate-400">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>กำลังอ่าน...</span>
                                </div>
                              ) : isError ? (
                                <span className="text-rose-600 font-medium">สแกนไม่สำเร็จ</span>
                              ) : (
                                <div className="space-y-1">
                                  <input
                                    type="date"
                                    value={item.date}
                                    onChange={(e) => handleUpdateItem(item.id, 'date', e.target.value)}
                                    className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg outline-none focus:border-emerald-500 bg-white"
                                  />
                                  <input
                                    type="time"
                                    value={item.time}
                                    onChange={(e) => handleUpdateItem(item.id, 'time', e.target.value)}
                                    className="w-full px-2 py-0.5 text-[11px] border border-slate-200 rounded-lg outline-none focus:border-emerald-500 bg-white text-slate-600"
                                  />
                                </div>
                              )}
                            </td>

                            {/* 4. Type */}
                            <td className="py-2.5 px-3">
                              {isSuccess && (
                                <select
                                  value={item.type}
                                  onChange={(e) =>
                                    handleUpdateItem(
                                      item.id,
                                      'type',
                                      e.target.value as 'EXPENSE' | 'INCOME' | 'TRANSFER'
                                    )
                                  }
                                  className={`w-full px-2 py-1 text-xs font-semibold rounded-lg border outline-none ${
                                    item.type === 'EXPENSE'
                                      ? 'border-rose-200 bg-rose-50/70 text-rose-700'
                                      : item.type === 'INCOME'
                                      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-700'
                                      : 'border-indigo-200 bg-indigo-50/70 text-indigo-700'
                                  }`}
                                >
                                  <option value="EXPENSE">รายจ่าย</option>
                                  <option value="INCOME">รายรับ</option>
                                  <option value="TRANSFER">โอนเงิน</option>
                                </select>
                              )}
                            </td>

                            {/* 5. Category */}
                            <td className="py-2.5 px-3">
                              {isSuccess && (
                                <select
                                  value={item.category}
                                  onChange={(e) => handleUpdateItem(item.id, 'category', e.target.value)}
                                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg outline-none focus:border-emerald-500 bg-white"
                                >
                                  {(item.type === 'EXPENSE'
                                    ? expenseCategories
                                    : item.type === 'INCOME'
                                    ? incomeCategories
                                    : transferCategories
                                  ).map((cat) => (
                                    <option key={cat} value={cat}>
                                      {cat}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>

                            {/* 6. Amount */}
                            <td className="py-2.5 px-3">
                              {isSuccess && (
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">฿</span>
                                  <input
                                    type="number"
                                    step="any"
                                    value={item.amount}
                                    onChange={(e) => handleUpdateItem(item.id, 'amount', e.target.value)}
                                    placeholder="0.00"
                                    className="w-full pl-5 pr-2 py-1 text-xs font-bold font-mono text-slate-900 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 bg-white text-right"
                                  />
                                </div>
                              )}
                            </td>

                            {/* 7. Accounts */}
                            <td className="py-2.5 px-3">
                              {isSuccess && (
                                <div className="space-y-1">
                                  <select
                                    value={item.accountId}
                                    onChange={(e) => handleUpdateItem(item.id, 'accountId', e.target.value)}
                                    className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg outline-none focus:border-emerald-500 bg-white"
                                  >
                                    <option value="">-- ไม่ระบุบัญชี --</option>
                                    {accounts.map((acc) => (
                                      <option key={acc.id} value={acc.id}>
                                        {acc.account_name} ({acc.bank_name || acc.account_type})
                                      </option>
                                    ))}
                                  </select>

                                  {item.type === 'TRANSFER' && (
                                    <select
                                      value={item.toAccountId}
                                      onChange={(e) => handleUpdateItem(item.id, 'toAccountId', e.target.value)}
                                      className="w-full px-2 py-0.5 text-[11px] border border-indigo-200 rounded-lg outline-none focus:border-indigo-500 bg-indigo-50/50 text-indigo-800"
                                    >
                                      <option value="">➔ บัญชีปลายทาง</option>
                                      {accounts.map((acc) => (
                                        <option key={acc.id} value={acc.id}>
                                          ➔ {acc.account_name} ({acc.bank_name || acc.account_type})
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* 8. Note & Model Badge */}
                            <td className="py-2.5 px-3">
                              {isSuccess && (
                                <div className="space-y-1">
                                  <input
                                    type="text"
                                    value={item.note}
                                    onChange={(e) => handleUpdateItem(item.id, 'note', e.target.value)}
                                    placeholder="บันทึกช่วยจำ..."
                                    className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg outline-none focus:border-emerald-500 bg-white"
                                  />
                                  {item.modelUsed && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                      <span
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-mono ${
                                          item.modelUsed.includes('cloudflare') || item.modelUsed.includes('@cf')
                                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        }`}
                                      >
                                        {item.modelUsed.includes('cloudflare') || item.modelUsed.includes('@cf')
                                          ? '☁️ Workers AI'
                                          : '⚡ Gemini'}
                                      </span>
                                      {item.senderBank && (
                                        <span className="font-semibold text-slate-600">
                                          [{item.senderBank}]
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {isError && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-rose-600 truncate">{item.errorMessage}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRetryItem(item)}
                                    className="text-xs font-semibold text-emerald-700 hover:underline shrink-0 cursor-pointer"
                                  >
                                    ลองใหม่
                                  </button>
                                </div>
                              )}
                            </td>

                            {/* 9. Historical Switch */}
                            <td className="py-2.5 px-3 text-center">
                              {isSuccess && (
                                <label className="relative inline-flex items-center cursor-pointer" title="สลิปย้อนหลัง: ไม่ปรับยอดเงินคงเหลือปัจจุบัน">
                                  <input
                                    type="checkbox"
                                    checked={item.isHistorical}
                                    onChange={(e) => handleUpdateItem(item.id, 'isHistorical', e.target.checked)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500" />
                                </label>
                              )}
                            </td>

                            {/* 10. Delete Button */}
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title="ลบสลิปนี้ออกจากตาราง"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {items.length > 0 && (
          <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
            <div className="text-xs text-slate-500 hidden sm:block">
              ตรวจสอบข้อมูลในตารางให้ถูกต้อง จากนั้นกดยืนยันเพื่อบันทึกลงบัญชีจริง
            </div>
            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleBulkSubmit}
                disabled={isSubmitting || selectedCount === 0 || scanningCount > 0}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition shadow-xs cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>กำลังบันทึก {selectedCount} รายการ...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>บันทึก {selectedCount} รายการที่เลือก</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Image Preview Modal */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col"
          >
            <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-xs font-semibold text-slate-700 truncate">{zoomedImage.title}</span>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 overflow-auto flex items-center justify-center bg-slate-900/5">
              <img src={zoomedImage.url} alt="Slip Full" className="max-h-[75vh] w-auto object-contain rounded-lg shadow-sm" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
