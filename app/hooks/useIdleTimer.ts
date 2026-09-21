// hooks/useIdleTimer.ts
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const TIMEOUT_MS = 15 * 60 * 1000; // 15 นาที

export function useIdleTimer() {
  const router = useRouter();
  const supabase = createClient();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      // 1. ดีดออกจากระบบ
      await supabase.auth.signOut();
      // 2. เคลียร์ State และพาไปหน้า Login
      router.push('/login?reason=idle_timeout');
      router.refresh();
    }, TIMEOUT_MS);
  };

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    
    // ผูก event listener
    events.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer(); // เริ่มนับเวลา

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, []);
}