-- Migration: Create bank_slip_templates table
-- Purpose: Level 2 Bank-Specific Template Configuration for Break-by-Bank Slip Parsing

CREATE TABLE IF NOT EXISTS public.bank_slip_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_code VARCHAR(30) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  template_config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_bank_template_user UNIQUE (user_id, bank_code)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.bank_slip_templates ENABLE ROW LEVEL SECURITY;

-- Policies:
-- 1. Anyone authenticated can select their own templates or system default templates (where user_id IS NULL)
CREATE POLICY "owner_or_system_select_templates" ON public.bank_slip_templates
  FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- 2. User can insert their own custom bank templates
CREATE POLICY "owner_insert_templates" ON public.bank_slip_templates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3. User can update/delete their own custom bank templates
CREATE POLICY "owner_modify_templates" ON public.bank_slip_templates
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Performance index
CREATE INDEX IF NOT EXISTS idx_bank_templates_user_code ON public.bank_slip_templates(user_id, bank_code);
