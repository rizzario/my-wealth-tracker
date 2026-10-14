'use client';

import { useState, useMemo } from 'react';
import {
  X,
  Code2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Play,
  RotateCcw,
  Send,
  Sliders,
  ChevronDown,
  ChevronUp,
  Tag,
  Building2,
  Calendar,
  Clock,
  ArrowRightLeft,
  FileText,
  CreditCard,
  Hash,
  ExternalLink,
} from 'lucide-react';
import { parseThaiBankSlipOcr, ParsedSlipRegexResult } from '@/lib/slip-regex-parser';

interface SlipRegexTunerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSlipStaged?: () => void;
}

const SAMPLE_PRESETS: { name: string; bank: string; text: string }[] = [
  {
    name: 'กสิกรไทย (KBank) -> PromptPay กาแฟ',
    bank: 'KBANK',
    text: `โอนเงินสำเร็จ
14 ต.ค. 69 09:15 น.
นาย กิตติพงษ์
ธ.กสิกรไทย
xxx-x-x1234-x
ไปยัง
ร้าน อเมซอน คาเฟ่
พร้อมเพย์
081-xxx-5678
จำนวนเงิน
185.00 บาท
ค่าธรรมเนียม
0.00 บาท
รหัสอ้างอิง: 20261014KB987654
บันทึกช่วยจำ: กาแฟสดและขนมปัง`,
  },
  {
    name: 'ไทยพาณิชย์ (SCB) -> ปั๊มน้ำมัน PTT',
    bank: 'SCB',
    text: `โอนเงินสำเร็จ
12 ต.ค. 2569 - 18:30
จาก: SCB x-7890 นาย สมศักดิ์
ไปยัง: PTT Station สาขาพระราม 9
จำนวนเงิน 1,200.00 บาท
รหัสอ้างอิง: 20261012SCB001122
บันทึกช่วยจำ: เติมน้ำมันดีเซล`,
  },
  {
    name: 'กรุงเทพ (BBL) -> โอนระหว่างบัญชี',
    bank: 'BBL',
    text: `โอนเงินสำเร็จ
05 ต.ค. 2569 เวลา 14:20 น.
จากบัญชี ธนาคารกรุงเทพ xxx-x-xx123-x
เข้าบัญชี ธนาคารกสิกรไทย xxx-x-xx999-x
จำนวนเงิน 5,000.00 บาท
รหัสอ้างอิง: 20261005BBL556677
บันทึกช่วยจำ: โอนเงินระหว่างบัญชี ค่าใช้จ่ายส่วนตัว`,
  },
  {
    name: 'กรุงศรี (BAY) -> ชำระบัตรเครดิต KTC',
    bank: 'BAY',
    text: `โอนเงินสำเร็จ
28 ก.ย. 2569 20:10 น.
จาก: BAY ออมทรัพย์ xxx-x-x4567-x
ไปยัง: ชำระค่าบัตรเครดิต KTC Visa Platinum
จำนวนเงิน: 8,450.00 บาท
ค่าธรรมเนียม: 0.00 บาท
รหัสอ้างอิง: BAY20260928778899
บันทึกช่วยจำ: ปิดยอดบัตร KTC เดือนกันยายน`,
  },
  {
    name: 'ทรูมันนี่ (TrueMoney) -> 7-Eleven',
    bank: 'TRUEMONEY',
    text: `การโอนเงินสำเร็จ
10/10/2026 11:05
TrueMoney Wallet 089-xxx-4321
ไปยัง: เซเว่น อีเลฟเว่น สาขาอารีย์
ยอดเงิน ฿79.00
รหัสอ้างอิง: TMN99887766
บันทึก: ซื้อขนมปังและนม`,
  },
];

export default function SlipRegexTunerModal({
  isOpen,
  onClose,
  onSlipStaged,
}: SlipRegexTunerModalProps) {
  const [inputText, setInputText] = useState(SAMPLE_PRESETS[0].text);
  const [copiedJson, setCopiedJson] = useState(false);
  const [isSendingToInbox, setIsSendingToInbox] = useState(false);
  const [showDebugRules, setShowDebugRules] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Reactive parsing using our regular expression parser
  const parsedResult: ParsedSlipRegexResult = useMemo(() => {
    return parseThaiBankSlipOcr(inputText);
  }, [inputText]);

  if (!isOpen) return null;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(parsedResult, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleSendToInbox = async () => {
    try {
      setIsSendingToInbox(true);
      setStatusMessage(null);

      const res = await fetch('/api/slip-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          source: 'regex_tuner',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to stage slip');

      setStatusMessage('ส่งเข้ากล่องสลิปรอตรวจ (Slip Inbox) สำเร็จแล้ว!');
      onSlipStaged?.();
      setTimeout(() => {
        setStatusMessage(null);
      }, 3000);
    } catch (err: any) {
      alert(`ไม่สามารถส่งเข้า Inbox ได้: ${err.message}`);
    } finally {
      setIsSendingToInbox(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">
                  Slip OCR Regex Playground & Tuner
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700">
                  v1.0 Zero-Dependency
                </span>
              </div>
              <p className="text-xs text-slate-500">
                ทดสอบ Regular Expression ถอดข้อความสลิปจาก iPhone Shortcuts หรือ Mobile App แบบ Realtime
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Sample Preset Buttons */}
          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <span>เลือกตัวอย่างสลิปธนาคารไทย:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInputText(preset.text)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition cursor-pointer ${
                    inputText === preset.text
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Main Grid: Left = Raw Textarea, Right = Extracted Results */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Raw Text Input */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Code2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>ข้อความ OCR ดิบ (Raw OCR Slip Text):</span>
                </label>
                <button
                  type="button"
                  onClick={() => setInputText('')}
                  className="text-[11px] text-slate-400 hover:text-rose-600 transition cursor-pointer"
                >
                  ล้างข้อความ
                </button>
              </div>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="วางข้อความที่ได้จาก iPhone Shortcuts หรือ OCR..."
                rows={14}
                className="w-full flex-1 p-3 font-mono text-xs text-slate-800 bg-slate-900/5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden resize-none leading-relaxed"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Tip: สามารถก็อปปี้ข้อความสลิปจริงจาก iPhone มาวางเพื่อทดสอบการจับ regex ได้ทันที
              </p>
            </div>

            {/* Right: Realtime Parsed Extraction Results */}
            <div className="flex flex-col bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800">
                    ผลลัพธ์การสกัดข้อมูล (Parsed Output)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                      parsedResult.confidence_score >= 0.8
                        ? 'bg-emerald-100 text-emerald-700'
                        : parsedResult.confidence_score >= 0.5
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    ความมั่นใจ: {Math.round(parsedResult.confidence_score * 100)}%
                  </span>
                </div>
              </div>

              {/* Amount Highlight Card */}
              <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-medium">ยอดเงิน (Amount)</span>
                  <div className="text-xl font-bold text-slate-900 flex items-baseline gap-1">
                    <span>
                      {parsedResult.amount !== null
                        ? `฿${parsedResult.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
                        : 'ไม่พบยอดเงิน'}
                    </span>
                    <span className="text-xs font-normal text-slate-500">THB</span>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-md ${
                      parsedResult.type === 'TRANSFER'
                        ? 'bg-indigo-100 text-indigo-800'
                        : parsedResult.type === 'INCOME'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {parsedResult.type}
                  </span>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {parsedResult.category}
                  </div>
                </div>
              </div>

              {/* Grid Details */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Date & Time */}
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>วันที่และเวลา:</span>
                  </div>
                  <div className="font-semibold text-slate-800">
                    {parsedResult.parsed_date_display || '-'} {parsedResult.parsed_time_display || ''}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {parsedResult.transaction_date || 'ไม่พบวันที่'}
                  </div>
                </div>

                {/* Sender Bank & Account */}
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    <span>ธนาคารต้นทาง:</span>
                  </div>
                  <div className="font-semibold text-slate-800">
                    {parsedResult.sender_bank || 'ไม่ระบุ'}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {parsedResult.sender_account_masked || '-'}
                  </div>
                </div>

                {/* Receiver Bank & Name */}
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                    <CreditCard className="w-3 h-3 text-slate-400" />
                    <span>ปลายทาง / ผู้รับ:</span>
                  </div>
                  <div className="font-semibold text-slate-800 truncate" title={parsedResult.receiver_name || ''}>
                    {parsedResult.receiver_name || parsedResult.receiver_bank || 'ไม่ระบุ'}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {parsedResult.receiver_account_masked || parsedResult.receiver_bank || '-'}
                  </div>
                </div>

                {/* Reference Number */}
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                    <Hash className="w-3 h-3 text-slate-400" />
                    <span>รหัสอ้างอิง (Ref):</span>
                  </div>
                  <div className="font-mono font-medium text-slate-700 truncate" title={parsedResult.reference_number || ''}>
                    {parsedResult.reference_number || '-'}
                  </div>
                </div>
              </div>

              {/* Memo Note */}
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs">
                <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <FileText className="w-3 h-3 text-slate-400" />
                  <span>บันทึกช่วยจำ (Memo):</span>
                </div>
                <div className="font-medium text-slate-800">
                  {parsedResult.memo || <span className="text-slate-400 italic">ไม่มีบันทึกช่วยจำ</span>}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSendToInbox}
                  disabled={isSendingToInbox || !parsedResult.amount}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition shadow-xs cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSendingToInbox ? 'กำลังส่ง...' : '📥 ส่งเข้ากล่องสลิป (Stage in Inbox)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer"
                  title="คัดลอกผลลัพธ์เป็น JSON"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? 'คัดลอกแล้ว' : 'JSON'}</span>
                </button>
              </div>

              {statusMessage && (
                <div className="p-2 text-xs text-center font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg animate-in fade-in">
                  ✓ {statusMessage}
                </div>
              )}
            </div>
          </div>

          {/* Regex Debug Rules Accordion */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
            <button
              type="button"
              onClick={() => setShowDebugRules((p) => !p)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100/80 transition text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-500" />
                <span>การทำงานของ Regular Expression ที่จับได้ (Matched Rule Traces)</span>
              </div>
              {showDebugRules ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showDebugRules && (
              <div className="p-3.5 border-t border-slate-200 space-y-2 text-xs font-mono bg-white">
                {Object.entries(parsedResult.matched_rules).length > 0 ? (
                  Object.entries(parsedResult.matched_rules).map(([field, ruleDesc]) => (
                    <div key={field} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 pb-1.5 border-b border-slate-100 last:border-none">
                      <span className="font-semibold text-indigo-600 shrink-0 w-36">
                        [{field}]:
                      </span>
                      <span className="text-slate-700 break-all">{ruleDesc}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-400 italic">ยังไม่มีกฎใดตรงกับข้อความที่ป้อน</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
