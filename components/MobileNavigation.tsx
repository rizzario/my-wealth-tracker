'use client';

import { CreditCard, Landmark, LayoutDashboard, Receipt, TrendingUp } from 'lucide-react';

export type MobileTab = 'overview' | 'holdings' | 'trades' | 'analytics' | 'cash_pvd' | 'cashflow' | 'expenses';

const destinations = [
  { id: 'overview', label: 'ภาพรวม', icon: LayoutDashboard },
  { id: 'expenses', label: 'รับ-จ่าย', icon: Receipt },
  { id: 'cashflow', label: 'บัญชี', icon: CreditCard },
  { id: 'holdings', label: 'ลงทุน', icon: TrendingUp },
  { id: 'cash_pvd', label: 'ระยะยาว', icon: Landmark },
] as const;

export default function MobileNavigation({ activeTab, onNavigate, pendingCount }: {
  activeTab: MobileTab;
  onNavigate: (tab: MobileTab) => void;
  pendingCount: number;
}) {
  return (
    <nav aria-label="เมนูหลักบนมือถือ" className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white md:hidden">
      {destinations.map(({ id, label, icon: Icon }) => {
        const selected = activeTab === id || (id === 'holdings' && ['trades', 'analytics'].includes(activeTab));
        return (
          <button key={id} type="button" aria-current={selected ? 'page' : undefined}
            onClick={() => onNavigate(id)}
            className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${selected ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500'}`}>
            <span className="relative">
              <Icon className="h-5 w-5" aria-hidden="true" />
              {id === 'expenses' && pendingCount > 0 && <span className="absolute -right-3 -top-2 rounded-full bg-rose-600 px-1 text-[10px] text-white" aria-label={`${pendingCount} สลิปรอตรวจ`}>{pendingCount > 99 ? '99+' : pendingCount}</span>}
            </span>
            <span className="whitespace-nowrap">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
