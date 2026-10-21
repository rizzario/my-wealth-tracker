'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';

type SetupTab = 'cashflow' | 'holdings' | 'expenses';

export default function GettingStarted({ hasAccount, hasAssets, hasTransaction, onNavigate }: {
  hasAccount: boolean;
  hasAssets: boolean;
  hasTransaction: boolean;
  onNavigate: (tab: SetupTab) => void;
}) {
  const steps = [
    { tab: 'cashflow', title: 'เพิ่มบัญชีแรก', description: 'เพิ่มบัญชีธนาคาร เงินสด หรือบัตรเครดิต พร้อมยอดปัจจุบัน', done: hasAccount },
    { tab: 'holdings', title: 'เพิ่มการลงทุน (ถ้ามี)', description: 'เพิ่มหุ้น คริปโต ทอง หรือกองทุน · เงินฝากและ PVD อยู่ที่เมนูระยะยาว', done: hasAssets },
    { tab: 'expenses', title: 'บันทึกรายการแรก', description: 'บันทึกรายรับหรือรายจ่าย หรือสแกนสลิปแล้วตรวจข้อมูลก่อนยืนยัน', done: hasTransaction },
  ] as const;
  const complete = hasAccount && hasTransaction;
  return (
    <details className="rounded-2xl border border-emerald-200 bg-white" open={complete ? undefined : true}>
      <summary className="cursor-pointer rounded-2xl p-4 text-sm font-semibold text-emerald-900 sm:p-5">{complete ? 'คู่มือเริ่มต้นและเครื่องมือของคุณ' : 'เริ่มจัดการการเงินของคุณ'}<span className="ml-2 text-xs font-normal text-slate-500">{[hasAccount, hasTransaction].filter(Boolean).length}/2 ขั้นตอนหลัก</span></summary>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <p className="mb-4 text-sm leading-relaxed text-slate-600">เริ่มจากบัญชีและรายการแรก การลงทุนเพิ่มภายหลังได้ ความคืบหน้าจะแสดงตามข้อมูลที่คุณบันทึก</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {steps.map((step) => (
            <button key={step.tab} type="button" onClick={() => onNavigate(step.tab)} className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-50">
              {step.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-label="เสร็จแล้ว" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-label="ยังไม่ได้บันทึก" />}
              <span className="min-w-0"><strong className="block text-sm text-slate-900">{step.title}</strong><span className="mt-1 block text-xs leading-relaxed text-slate-500">{step.description}</span><span className="mt-3 flex items-center gap-1 text-xs font-semibold text-emerald-700">เปิดเมนู <ArrowRight size={14} aria-hidden="true" /></span></span>
            </button>
          ))}
        </div>
        <Link href="/welcome" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700 underline underline-offset-4">ดูวิธีใช้งานและความสามารถทั้งหมด</Link>
      </div>
    </details>
  );
}
