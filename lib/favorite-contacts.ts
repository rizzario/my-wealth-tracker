/**
 * lib/favorite-contacts.ts
 *
 * Directory & Matching Service for User Favorite Contacts (Family, Friends, Work, Payees).
 * Binds contacts to user_id, auto-enriches slips with friendly nicknames (e.g. "คุณแม่"),
 * auto-assigns categories (e.g. "ให้ครอบครัว"), and handles robust masked account matching.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface UserFavoriteContact {
  id: string;
  user_id?: string | null;
  nickname: string;
  group_name: string; // e.g. 'Family', 'Friends', 'Work', 'Shop'
  icon?: string;
  default_category?: string; // e.g. 'ให้ครอบครัว'
  default_type?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  matched_names: string[];
  matched_accounts: string[];
  bank_code?: string | null;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Robust Masked Account Matching Helper.
 * Correctly matches accounts even when:
 * - Unmasked suffix is 3 digits (e.g. BBL "208-4-xxx978" -> prefix "2084", suffix "978")
 * - Slip account has hyphens or spaces
 * - Target account in financial_accounts is full 10 digits (e.g. "208-4-123978" or "2084123978")
 * - Target account in financial_accounts is already masked or just suffix (e.g. "978")
 */
export function matchMaskedNumber(slipMasked: string | null | undefined, targetAccNumber: string | null | undefined): boolean {
  if (!slipMasked || !targetAccNumber) return false;

  const cleanSlip = slipMasked.trim();
  const cleanTarget = targetAccNumber.trim();
  const targetDigits = cleanTarget.replace(/[^0-9]/g, '');
  const slipDigits = cleanSlip.replace(/[^0-9]/g, '');

  if (targetDigits.length < 3) return false;

  // 1. Exact digits match
  if (targetDigits === slipDigits) return true;

  // 2. Decompose slip masked pattern by mask characters [xX*#]
  // e.g. "208-4-xxx978" -> parts: ["2084", "978"]
  const parts = cleanSlip
    .split(/[xX*#]+/)
    .map((p) => p.replace(/[^0-9]/g, ''))
    .filter(Boolean);

  if (parts.length >= 2) {
    const prefix = parts[0];
    const suffix = parts[parts.length - 1];

    // Must start with prefix and end with suffix
    if (prefix.length >= 2 && suffix.length >= 2) {
      if (targetDigits.startsWith(prefix) && targetDigits.endsWith(suffix)) {
        return true;
      }
    }
  } else if (parts.length === 1) {
    const part = parts[0];
    if (part.length >= 3 && (targetDigits.endsWith(part) || targetDigits.startsWith(part))) {
      return true;
    }
  }

  // 3. Fallback: Trailing suffix match (last 3-4 digits)
  if (parts.length > 0) {
    const lastPart = parts[parts.length - 1];
    if (lastPart.length >= 3 && targetDigits.endsWith(lastPart)) {
      return true;
    }
  }

  return false;
}

/**
 * Match a parsed slip against user's favorite contacts.
 * Checks receiver_name, receiver_account_masked, or sender_name/account.
 */
export function matchFavoriteContact(
  contacts: UserFavoriteContact[],
  slip: {
    receiver_name?: string | null;
    receiver_account_masked?: string | null;
    receiver_bank?: string | null;
    sender_name?: string | null;
    sender_account_masked?: string | null;
    sender_bank?: string | null;
  }
): UserFavoriteContact | null {
  if (!contacts || contacts.length === 0) return null;

  const receiverName = (slip.receiver_name || '').trim().toLowerCase();
  const receiverAcc = (slip.receiver_account_masked || '').trim();
  const receiverBank = (slip.receiver_bank || '').trim().toUpperCase();

  const senderName = (slip.sender_name || '').trim().toLowerCase();
  const senderAcc = (slip.sender_account_masked || '').trim();
  const senderBank = (slip.sender_bank || '').trim().toUpperCase();

  let bestContact: UserFavoriteContact | null = null;
  let highestScore = 0;

  for (const contact of contacts) {
    let score = 0;

    // Optional bank check
    const contactBank = (contact.bank_code || '').trim().toUpperCase();
    const bankMatchesReceiver = !contactBank || contactBank === receiverBank;
    const bankMatchesSender = !contactBank || contactBank === senderBank;

    // 1. Check Receiver Account Match (Highest precision)
    if (receiverAcc && bankMatchesReceiver) {
      for (const matchedAcc of contact.matched_accounts || []) {
        if (matchMaskedNumber(receiverAcc, matchedAcc) || matchMaskedNumber(matchedAcc, receiverAcc)) {
          score += 100;
          break;
        }
      }
    }

    // 2. Check Receiver Name Match
    if (receiverName && bankMatchesReceiver) {
      for (const rawPattern of contact.matched_names || []) {
        const pattern = rawPattern.trim().toLowerCase();
        if (pattern.length >= 2 && (receiverName.includes(pattern) || pattern.includes(receiverName))) {
          score += 80;
          break;
        }
      }
    }

    // 3. Check Sender Account Match (for incoming slips / transfers)
    if (senderAcc && bankMatchesSender) {
      for (const matchedAcc of contact.matched_accounts || []) {
        if (matchMaskedNumber(senderAcc, matchedAcc) || matchMaskedNumber(matchedAcc, senderAcc)) {
          score += 90;
          break;
        }
      }
    }

    // 4. Check Sender Name Match
    if (senderName && bankMatchesSender) {
      for (const rawPattern of contact.matched_names || []) {
        const pattern = rawPattern.trim().toLowerCase();
        if (pattern.length >= 2 && (senderName.includes(pattern) || pattern.includes(senderName))) {
          score += 70;
          break;
        }
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestContact = contact;
    }
  }

  return highestScore >= 70 ? bestContact : null;
}

export const DEFAULT_SYSTEM_FAVORITE_CONTACTS: UserFavoriteContact[] = [
  {
    id: 'default_mother',
    nickname: 'คุณแม่',
    group_name: 'Family',
    icon: '💖',
    default_category: 'ให้ครอบครัว',
    default_type: 'EXPENSE',
    matched_names: ['นางสมหญิง ใจดี', 'สมหญิง ใจดี', 'สมหญิง', 'SOMYING'],
    matched_accounts: ['211-0-xxx988', '2110xxx988', 'xxx988', '988'],
    bank_code: 'BBL',
    note: 'คนโปรดครอบครัวเริ่มต้นของระบบ',
  },
];

/**
 * Fetch all favorite contacts for a given user from Supabase.
 * Strictly scoped to user_id. Returns in-code defaults if user has no contacts.
 */
export async function fetchUserFavoriteContacts(
  supabase: SupabaseClient,
  userId?: string | null
): Promise<UserFavoriteContact[]> {
  if (!userId) {
    return DEFAULT_SYSTEM_FAVORITE_CONTACTS;
  }

  try {
    const { data, error } = await supabase
      .from('user_favorite_contacts')
      .select('*')
      .eq('user_id', userId)
      .order('group_name', { ascending: true })
      .order('nickname', { ascending: true });

    if (error) {
      // If table doesn't exist yet, return default system contacts gracefully
      if (error.message?.includes('does not exist')) return DEFAULT_SYSTEM_FAVORITE_CONTACTS;
      console.warn('Failed to fetch favorite contacts:', error.message);
      return DEFAULT_SYSTEM_FAVORITE_CONTACTS;
    }

    const userContacts = (data as UserFavoriteContact[]) || [];
    if (userContacts.length === 0) {
      return DEFAULT_SYSTEM_FAVORITE_CONTACTS;
    }

    return userContacts;
  } catch (err: any) {
    console.warn('Error fetching favorite contacts:', err?.message);
    return DEFAULT_SYSTEM_FAVORITE_CONTACTS;
  }
}

/**
 * Save or update a favorite contact in Supabase.
 */
export async function saveUserFavoriteContact(
  supabase: SupabaseClient,
  contact: Omit<UserFavoriteContact, 'id'> & { id?: string }
): Promise<{ success: boolean; data?: UserFavoriteContact; error?: string }> {
  try {
    const payload = {
      ...contact,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (contact.id) {
      let query = supabase
        .from('user_favorite_contacts')
        .update(payload)
        .eq('id', contact.id);

      if (contact.user_id) {
        query = query.eq('user_id', contact.user_id);
      }

      result = await query.select().single();
    } else {
      result = await supabase
        .from('user_favorite_contacts')
        .insert([payload])
        .select()
        .single();
    }

    if (result.error) throw result.error;
    return { success: true, data: result.data as UserFavoriteContact };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save favorite contact' };
  }
}

/**
 * Delete a favorite contact by ID with optional owner verification.
 */
export async function deleteUserFavoriteContact(
  supabase: SupabaseClient,
  contactId: string,
  userId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    let query = supabase
      .from('user_favorite_contacts')
      .delete()
      .eq('id', contactId);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { error } = await query;
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete contact' };
  }
}
