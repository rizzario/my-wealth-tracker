-- Migration: Create user_favorite_contacts table
-- Purpose: Store user's favorite contacts / family / payees for automatic slip enrichment,
-- friendly display names (e.g. "คุณแม่"), group tags (e.g. "Family"), and auto-categorization.

CREATE TABLE IF NOT EXISTS public.user_favorite_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname VARCHAR(100) NOT NULL,               -- e.g. "คุณแม่", "คุณพ่อ", "ภรรยา", "พี่ชาย"
  group_name VARCHAR(50) NOT NULL DEFAULT 'Family', -- e.g. "Family", "Friends", "Work", "Shop"
  icon VARCHAR(30) DEFAULT 'heart',              -- e.g. "heart", "home", "user", "briefcase", "coffee"
  default_category VARCHAR(50) DEFAULT 'ให้ครอบครัว', -- Category to auto-assign on matched slip
  default_type VARCHAR(10) DEFAULT 'EXPENSE',    -- 'EXPENSE' | 'INCOME' | 'TRANSFER'
  
  -- Matching Criteria against Slip OCR Text
  matched_names TEXT[] NOT NULL DEFAULT '{}',   -- e.g. ARRAY['ปราณี', 'นางปราณี กิตติรุ่งเจริญ']
  matched_accounts TEXT[] DEFAULT '{}',         -- e.g. ARRAY['211-0-xxx988', '2110xxx988', '988']
  bank_code VARCHAR(30),                         -- Optional bank filter e.g. 'BBL', 'KBANK', 'SCB'
  
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_favorite_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: User can only see and manage their own favorite contacts
DROP POLICY IF EXISTS "owner_all_favorite_contacts" ON public.user_favorite_contacts;
CREATE POLICY "owner_all_favorite_contacts" ON public.user_favorite_contacts
  FOR ALL
  USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_fav_contacts_user ON public.user_favorite_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_fav_contacts_group ON public.user_favorite_contacts(user_id, group_name);
