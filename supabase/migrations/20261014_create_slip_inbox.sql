-- Migration: Create slip_inbox staging table
-- Purpose: Safely stage OCR slips from iPhone Shortcuts & Expo mobile apps before committing to expense_income_transactions

CREATE TABLE IF NOT EXISTS public.slip_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source VARCHAR(50) DEFAULT 'iphone_shortcut', -- 'iphone_shortcut' | 'expo_app' | 'manual_ocr' | 'regex_tuner'
  raw_text TEXT,
  amount NUMERIC(12, 2),
  transaction_date TIMESTAMPTZ DEFAULT now(),
  type VARCHAR(10) DEFAULT 'EXPENSE', -- 'EXPENSE' | 'INCOME' | 'TRANSFER'
  category VARCHAR(50) DEFAULT 'อื่นๆ',
  matched_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  matched_to_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  sender_bank VARCHAR(30),
  sender_account_masked VARCHAR(50),
  sender_name TEXT,
  receiver_bank VARCHAR(30),
  receiver_account_masked VARCHAR(50),
  receiver_name TEXT,
  reference_number VARCHAR(100),
  memo TEXT,
  confidence_score NUMERIC(3, 2) DEFAULT 1.0,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'approved' | 'dismissed'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.slip_inbox ENABLE ROW LEVEL SECURITY;

-- 1. Allow inserting slips from external sources (iPhone Shortcuts, webhooks, mobile apps)
DROP POLICY IF EXISTS "owner_all_slip_inbox" ON public.slip_inbox;
DROP POLICY IF EXISTS "allow_insert_slip_inbox" ON public.slip_inbox;
DROP POLICY IF EXISTS "owner_select_slip_inbox" ON public.slip_inbox;
DROP POLICY IF EXISTS "owner_manage_slip_inbox" ON public.slip_inbox;

CREATE POLICY "allow_insert_slip_inbox" ON public.slip_inbox
  FOR INSERT
  WITH CHECK (true);

-- 2. Allow authenticated user (or owner) to view pending slips in dashboard
CREATE POLICY "owner_select_slip_inbox" ON public.slip_inbox
  FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL OR auth.uid() IS NOT NULL);

-- 3. Allow user to update or delete their pending slips
CREATE POLICY "owner_manage_slip_inbox" ON public.slip_inbox
  FOR ALL
  USING (auth.uid() = user_id OR user_id IS NULL OR auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.uid() IS NOT NULL);

-- Performance index for active pending slips
CREATE INDEX IF NOT EXISTS idx_slip_inbox_user_status ON public.slip_inbox(user_id, status);
CREATE INDEX IF NOT EXISTS idx_slip_inbox_created_at ON public.slip_inbox(created_at DESC);
