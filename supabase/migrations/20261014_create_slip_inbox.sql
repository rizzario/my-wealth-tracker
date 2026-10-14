-- Migration: Create slip_inbox staging table
-- Purpose: Safely stage OCR slips from iPhone Shortcuts & Expo mobile apps before committing to expense_income_transactions

CREATE TABLE IF NOT EXISTS public.slip_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source VARCHAR(50) DEFAULT 'iphone_shortcut', -- 'iphone_shortcut' | 'expo_app' | 'manual_ocr' | 'web_upload'
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

-- Owner policy: user can view, insert, update, and delete their own staged slips
CREATE POLICY "owner_all_slip_inbox" ON public.slip_inbox
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Performance index for active pending slips
CREATE INDEX IF NOT EXISTS idx_slip_inbox_user_status ON public.slip_inbox(user_id, status);
CREATE INDEX IF NOT EXISTS idx_slip_inbox_created_at ON public.slip_inbox(created_at DESC);
