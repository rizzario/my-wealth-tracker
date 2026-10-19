import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';

export interface ParsedSlip {
  amount: number | null;
  transaction_date: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  category: string;
  sender_bank?: string | null;
  sender_account_masked?: string | null;
  sender_name?: string | null;
  receiver_bank?: string | null;
  receiver_account_masked?: string | null;
  receiver_name?: string | null;
  memo?: string | null;
  reference_number?: string | null;
  confidence_score?: number;
  raw_text?: string | null;
}

export interface SlipInboxItem extends ParsedSlip {
  id: string;
  source: string;
  status: 'pending' | 'approved' | 'dismissed';
  created_at: string;
}

// Supabase client singleton for mobile
export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

/**
 * Scan slip image using Cloudflare Worker with Meta Llama 3.2 Vision
 */
export async function scanSlipWithAI(base64Image: string): Promise<ParsedSlip> {
  const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

  const response = await fetch(CONFIG.WORKER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageBase64: cleanBase64,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudflare Worker error (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Worker did not return valid slip data');
  }

  const data = result.data;

  // Normalize amount
  let amount: number | null = null;
  if (typeof data.amount === 'number') {
    amount = Math.abs(data.amount);
  } else if (typeof data.amount === 'string') {
    const parsed = parseFloat(data.amount.replace(/,/g, ''));
    amount = isNaN(parsed) ? null : Math.abs(parsed);
  }

  // Normalize date
  let transactionDate = data.transaction_date || new Date().toISOString();
  if (typeof transactionDate === 'string') {
    // Buddhist Era correction (2568 -> 2025, 2569 -> 2026)
    transactionDate = transactionDate.replace(/^(\d{4})([-\/.].*)/, (_: string, y: string, rest: string) => {
      const yr = parseInt(y, 10);
      return yr > 2400 ? `${yr - 543}${rest}` : `${y}${rest}`;
    });
  }

  return {
    amount,
    transaction_date: transactionDate,
    type: ['EXPENSE', 'INCOME', 'TRANSFER'].includes(data.type) ? data.type : 'EXPENSE',
    category: data.category || 'อาหาร & เครื่องดื่ม',
    sender_bank: data.sender_bank || null,
    sender_account_masked: data.sender_account_masked || null,
    sender_name: data.sender_name || null,
    receiver_bank: data.receiver_bank || null,
    receiver_account_masked: data.receiver_account_masked || null,
    receiver_name: data.receiver_name || null,
    memo: data.memo || null,
    reference_number: data.reference_number || null,
    confidence_score: typeof data.confidence_score === 'number' ? data.confidence_score : 1.0,
    raw_text: data.raw_text || null,
  };
}

/**
 * Save parsed slip into Supabase slip_inbox staging table
 */
export async function saveSlipToInbox(slip: ParsedSlip): Promise<SlipInboxItem> {
  const payload = {
    source: CONFIG.SOURCE,
    amount: slip.amount,
    transaction_date: slip.transaction_date,
    type: slip.type,
    category: slip.category,
    sender_bank: slip.sender_bank,
    sender_account_masked: slip.sender_account_masked,
    sender_name: slip.sender_name,
    receiver_bank: slip.receiver_bank,
    receiver_account_masked: slip.receiver_account_masked,
    receiver_name: slip.receiver_name,
    reference_number: slip.reference_number,
    memo: slip.memo,
    confidence_score: slip.confidence_score ?? 1.0,
    raw_text: slip.raw_text,
    status: 'pending',
  };

  const { data, error } = await supabase
    .from('slip_inbox')
    .insert([payload])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save to slip_inbox: ${error.message}`);
  }

  return data as SlipInboxItem;
}

/**
 * Fetch pending slips from Supabase slip_inbox
 */
export async function fetchPendingSlips(): Promise<SlipInboxItem[]> {
  const { data, error } = await supabase
    .from('slip_inbox')
    .select('*')
    .ilike('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    throw new Error(`Failed to fetch pending slips: ${error.message}`);
  }

  return (data || []) as SlipInboxItem[];
}
