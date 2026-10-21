import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { parseThaiBankSlipOcr, ParsedSlipRegexResult, KNOWN_BANKS } from '@/lib/slip-regex-parser';
import {
  matchMaskedNumber,
  matchFavoriteContact,
  fetchUserFavoriteContacts,
  saveUserFavoriteContact,
  deleteUserFavoriteContact,
  UserFavoriteContact,
} from '@/lib/favorite-contacts';

export const dynamic = 'force-dynamic';

interface AuthResult {
  authenticated: boolean;
  user: { id: string; email?: string } | null;
  supabase: any;
  authType: 'session' | 'jwt' | 'api_key' | 'unauthorized';
  errorMessage?: string;
}

/**
 * Helper to authenticate request across 3 distinct channels:
 * 1. Next.js Web: Cookie-based Supabase Session (auth.getUser())
 * 2. Expo Mobile: Supabase Access Token (JWT Bearer 'ey...') (auth.getUser(token))
 * 3. Apple Shortcuts: Pre-shared SLIP_INBOX_SECRET -> Bound to server's SLIP_INBOX_USER_ID
 */
async function authenticateRequest(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization') || '';
  const apiKeyHeader = req.headers.get('x-api-key') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || apiKeyHeader.trim();

  // 1. Apple Shortcuts: Pre-shared SLIP_INBOX_SECRET -> Bound strictly to server's SLIP_INBOX_USER_ID
  const expectedSecret = process.env.SLIP_INBOX_SECRET?.trim();
  const isShortcutToken = Boolean(
    expectedSecret &&
    token &&
    token === expectedSecret
  );

  if (isShortcutToken) {
    const userId = process.env.SLIP_INBOX_USER_ID?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!userId) {
      console.error('[slip-inbox] SLIP_INBOX_SECRET matched, but SLIP_INBOX_USER_ID is missing on the server.');
      return {
        authenticated: false,
        user: null,
        supabase: null,
        authType: 'unauthorized',
        errorMessage: 'Server configuration error: SLIP_INBOX_USER_ID is not configured in environment.',
      };
    }

    if (!serviceRoleKey) {
      console.error('[slip-inbox] SLIP_INBOX_SECRET matched, but SUPABASE_SERVICE_ROLE_KEY is missing on the server. Service role key is required for Apple Shortcuts to bypass RLS.');
      return {
        authenticated: false,
        user: null,
        supabase: null,
        authType: 'unauthorized',
        errorMessage: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for Apple Shortcuts flow.',
      };
    }

    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    return {
      authenticated: true,
      user: { id: userId },
      supabase: adminClient,
      authType: 'api_key',
    };
  }

  // 2. Expo Mobile: Check if Bearer token is a Supabase JWT Token (starts with 'ey')
  const serverClient = await createClient();
  if (token && token.startsWith('ey')) {
    const { data: { user: jwtUser } } = await serverClient.auth.getUser(token);
    if (jwtUser?.id) {
      // Create a Supabase client scoped to this user's JWT so RLS policies are natively respected
      const jwtClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        }
      );

      return {
        authenticated: true,
        user: jwtUser,
        supabase: jwtClient,
        authType: 'jwt',
      };
    }
  }

  // 3. Next.js Web: Check User Session (Browser cookie)
  const {
    data: { user: sessionUser },
  } = await serverClient.auth.getUser();

  if (sessionUser?.id) {
    return {
      authenticated: true,
      user: sessionUser,
      supabase: serverClient,
      authType: 'session',
    };
  }

  return {
    authenticated: false,
    user: null,
    supabase: serverClient,
    authType: 'unauthorized',
    errorMessage: 'Unauthorized: Valid Session cookie, Supabase JWT, or SLIP_INBOX_SECRET required.',
  };
}

/**
 * Robust Bank Matching Helper.
 * Checks bank code, aliases, account names, and regex patterns from KNOWN_BANKS.
 */
function matchBank(
  slipBankCodeOrName: string | null | undefined,
  accBankName: string | null | undefined,
  accName: string | null | undefined
): boolean {
  if (!slipBankCodeOrName) return false;
  const slipBank = slipBankCodeOrName.trim().toUpperCase();
  const accBank = (accBankName || '').trim().toUpperCase();
  const accAccountName = (accName || '').trim().toUpperCase();

  // 1. Direct contains or equality
  if (accBank && (slipBank.includes(accBank) || accBank.includes(slipBank))) return true;
  if (accAccountName && (slipBank.includes(accAccountName) || accAccountName.includes(slipBank))) return true;

  // 2. Look up slip bank in KNOWN_BANKS
  const slipPattern = KNOWN_BANKS.find(
    (b) => b.code.toUpperCase() === slipBank || b.name.toUpperCase() === slipBank
  );
  if (slipPattern) {
    if (slipPattern.regex.test(accBankName || '') || slipPattern.regex.test(accName || '')) {
      return true;
    }
  }

  // 3. Look up account bank in KNOWN_BANKS
  const accPattern = KNOWN_BANKS.find(
    (b) => (accBankName && b.regex.test(accBankName)) || (accName && b.regex.test(accName))
  );
  if (accPattern) {
    if (accPattern.code.toUpperCase() === slipBank || accPattern.regex.test(slipBankCodeOrName)) {
      return true;
    }
  }

  return false;
}

/**
 * Helper to validate account ownership before recording transactions.
 * Queries financial_accounts by filtering strictly user_id = auth.user.id.
 * Rejects with false if any non-null account ID does not belong to the user.
 */
async function validateAccountOwnership(
  supabase: any,
  userId: string,
  accountIds: (string | null | undefined)[]
): Promise<{ valid: boolean; invalidId?: string; error?: string }> {
  const uniqueIds = Array.from(new Set(accountIds.filter((id): id is string => Boolean(id))));
  if (uniqueIds.length === 0) {
    return { valid: true };
  }

  const { data: ownedAccounts, error } = await supabase
    .from('financial_accounts')
    .select('id')
    .eq('user_id', userId)
    .in('id', uniqueIds);

  if (error) {
    return { valid: false, error: 'Failed to verify account ownership: ' + error.message };
  }

  const ownedSet = new Set((ownedAccounts || []).map((a: { id: string }) => a.id));
  for (const id of uniqueIds) {
    if (!ownedSet.has(id)) {
      return {
        valid: false,
        invalidId: id,
        error: `Account ownership violation: Account '${id}' does not belong to user '${userId}'`,
      };
    }
  }

  return { valid: true };
}

/**
 * Helper to check contact ownership before mutating or deleting.
 * Prevents cross-tenant contact modification, especially when using Service Role (Apple Shortcuts).
 */
async function checkContactOwnership(
  supabase: any,
  contactId: string,
  userId: string
): Promise<{ owned: boolean; status?: number; error?: string }> {
  const { data: contact, error } = await supabase
    .from('user_favorite_contacts')
    .select('id, user_id')
    .eq('id', contactId)
    .maybeSingle();

  if (error) {
    return { owned: false, status: 500, error: 'Database error: ' + error.message };
  }

  if (!contact) {
    return { owned: false, status: 404, error: `Favorite contact '${contactId}' not found` };
  }

  if (contact.user_id !== userId) {
    return { owned: false, status: 403, error: `Forbidden: Favorite contact '${contactId}' does not belong to user '${userId}'` };
  }

  return { owned: true };
}

/**
 * Smart matching against user's financial accounts.
 * Uses robust prefix+suffix decomposition for masked accounts (e.g. BBL 3-digit suffix '208-4-xxx978').
 * Strictly scoped to the authenticated user.
 */
async function matchAccounts(
  supabase: any,
  userId: string | null,
  slip: {
    sender_bank?: string | null;
    sender_account_masked?: string | null;
    receiver_bank?: string | null;
    receiver_account_masked?: string | null;
    receiver_name?: string | null;
    type?: string;
    category?: string;
  }
) {
  if (!userId) {
    return { matchedAccountId: null, matchedToAccountId: null, accounts: [] };
  }

  const { data: accounts } = await supabase
    .from('financial_accounts')
    .select('id, account_name, bank_name, account_number, account_type, is_liability')
    .eq('user_id', userId);

  if (!accounts || accounts.length === 0) {
    return { matchedAccountId: null, matchedToAccountId: null, accounts: [] };
  }

  let matchedAccountId: string | null = null;
  let matchedToAccountId: string | null = null;

  let bestMatchScore = 0;

  for (const acc of accounts) {
    const accNumber = acc.account_number || '';

    // Digits match: robust masked number matching (handles 3-digit or 4-digit suffixes, hyphens, spaces)
    const numberMatches =
      matchMaskedNumber(slip.sender_account_masked, accNumber) ||
      matchMaskedNumber(accNumber, slip.sender_account_masked);

    // Bank match: via bank code, bank name, or bank pattern regex
    const bankMatches = matchBank(slip.sender_bank, acc.bank_name, acc.account_name);

    let score = 0;
    if (numberMatches && bankMatches) score = 100;
    else if (numberMatches) score = 85;
    else if (bankMatches && !acc.is_liability) score = 50;

    if (score > bestMatchScore) {
      bestMatchScore = score;
      matchedAccountId = acc.id;
    }
  }

  // If TRANSFER or Credit card payment, match destination account
  if (slip.type === 'TRANSFER' || slip.category === 'ชำระค่าบัตรเครดิต') {
    const receiverName = (slip.receiver_name || '').toUpperCase();

    for (const acc of accounts) {
      if (acc.id === matchedAccountId) continue;

      const accNumber = acc.account_number || '';
      const numberMatches =
        matchMaskedNumber(slip.receiver_account_masked, accNumber) ||
        matchMaskedNumber(accNumber, slip.receiver_account_masked);

      const bankMatches = matchBank(slip.receiver_bank, acc.bank_name, acc.account_name);
      const nameMatches =
        receiverName &&
        ((acc.bank_name && receiverName.includes(acc.bank_name.toUpperCase())) ||
         (acc.account_name && receiverName.includes(acc.account_name.toUpperCase())));

      if (numberMatches && (bankMatches || acc.is_liability)) {
        matchedToAccountId = acc.id;
        break;
      } else if (numberMatches || (bankMatches && acc.is_liability) || nameMatches) {
        matchedToAccountId = acc.id;
      }
    }
  }

  return { matchedAccountId, matchedToAccountId, accounts };
}

/**
 * GET: Fetch pending slips from slip_inbox
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.authenticated || !auth.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', message: auth.errorMessage || 'Unauthorized access' },
        { status: 401 }
      );
    }

    // Restriction: Shared secret (Apple Shortcuts) is write-only for slip ingestion
    if (auth.authType === 'api_key') {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Shared secret (Apple Shortcuts) is only authorized for slip ingestion. User session or JWT is required to view inbox.',
        },
        { status: 403 }
      );
    }

    // Query pending slips strictly filtered by user_id (defense-in-depth for both RLS & Service Role)
    let query = auth.supabase
      .from('slip_inbox')
      .select('*')
      .eq('user_id', auth.user.id)
      .ilike('status', 'pending')
      .order('created_at', { ascending: false });

    const { data: inboxItems, error } = await query;

    if (error) {
      // If table doesn't exist yet, return empty list with hint
      if (error.message?.includes('schema cache') || error.message?.includes('does not exist')) {
        return NextResponse.json({
          status: 'ok',
          data: [],
          table_ready: false,
          notice: 'Table slip_inbox has not been created yet in Supabase. Run migration SQL to persist items.',
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch user's favorite contacts to enrich slips
    const contacts = await fetchUserFavoriteContacts(auth.supabase, auth.user.id);

    // Fetch user accounts once to re-match any null matched_account_id (strictly scoped to user)
    const { data: accounts } = await auth.supabase
      .from('financial_accounts')
      .select('id, account_name, bank_name, account_number, account_type, is_liability')
      .eq('user_id', auth.user.id);

    // Enrich inbox items with matched contact info AND re-match account if null
    const enrichedItems = (inboxItems || []).map((item: any) => {
      const matched = matchFavoriteContact(contacts, item);

      // Auto-assign category if matched and currently 'อื่นๆ' or empty
      const resolvedCategory =
        matched?.default_category && (!item.category || item.category === 'อื่นๆ')
          ? matched.default_category
          : item.category || 'อื่นๆ';

      // Auto-match source account if currently null
      let resolvedAccountId = item.matched_account_id;
      if (!resolvedAccountId && accounts && accounts.length > 0) {
        let bestScore = 0;
        for (const acc of accounts) {
          const numberMatches =
            matchMaskedNumber(item.sender_account_masked, acc.account_number) ||
            matchMaskedNumber(acc.account_number, item.sender_account_masked);
          const bankMatches = matchBank(item.sender_bank, acc.bank_name, acc.account_name);
          let score = 0;
          if (numberMatches && bankMatches) score = 100;
          else if (numberMatches) score = 85;
          else if (bankMatches && !acc.is_liability) score = 50;
          if (score > bestScore) {
            bestScore = score;
            resolvedAccountId = acc.id;
          }
        }
      }

      return {
        ...item,
        category: resolvedCategory,
        matched_account_id: resolvedAccountId,
        matched_contact: matched
          ? {
              id: matched.id,
              nickname: matched.nickname,
              group_name: matched.group_name,
              icon: matched.icon,
              default_category: matched.default_category,
            }
          : null,
      };
    });

    return NextResponse.json({
      status: 'ok',
      data: enrichedItems,
      contacts: contacts || [],
      table_ready: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST: Ingest new slip from iPhone Shortcut or mobile app
 * Supports:
 * - { text: "raw ocr text", source: "iphone_shortcut" } -> Parsed via regex engine
 * - { action: "approve", id: "...", ... } -> Move to expense_income_transactions
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.authenticated || !auth.user?.id) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: auth.errorMessage || 'Provide a valid User Session cookie, JWT, or Authorization: Bearer <SLIP_INBOX_SECRET>',
        },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Restriction: Shared secret (Apple Shortcuts) is write-only for slip ingestion
    // Approvals, Contact Management, and Bulk Operations require User Session or JWT
    if (auth.authType === 'api_key' && body.action) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Shared secret (Apple Shortcuts) is only authorized for slip ingestion. User session or JWT is required to approve or manage data.',
        },
        { status: 403 }
      );
    }

    // Action: Save or Update a Favorite Contact
    if (body.action === 'save_contact') {
      if (!body.contact || !body.contact.nickname) {
        return NextResponse.json({ error: 'Contact nickname is required' }, { status: 400 });
      }

      // If updating an existing contact, verify ownership first (vital for Service Role)
      if (body.contact.id) {
        const ownership = await checkContactOwnership(auth.supabase, body.contact.id, auth.user!.id);
        if (!ownership.owned) {
          return NextResponse.json({ error: ownership.error }, { status: ownership.status || 403 });
        }
      }

      const saveRes = await saveUserFavoriteContact(auth.supabase, {
        ...body.contact,
        user_id: auth.user!.id, // Strictly server-resolved user identity
      });

      if (!saveRes.success) {
        return NextResponse.json({ error: saveRes.error }, { status: 400 });
      }

      return NextResponse.json({
        status: 'success',
        message: 'Favorite contact saved successfully',
        data: saveRes.data,
      });
    }

    // Action: Delete a Favorite Contact
    if (body.action === 'delete_contact') {
      const contactId = body.id || body.contact_id;
      if (!contactId) {
        return NextResponse.json({ error: 'Contact id is required' }, { status: 400 });
      }

      // Check ownership before deleting (crucial for Service Role requests)
      const ownership = await checkContactOwnership(auth.supabase, contactId, auth.user!.id);
      if (!ownership.owned) {
        return NextResponse.json({ error: ownership.error }, { status: ownership.status || 403 });
      }

      const delRes = await deleteUserFavoriteContact(auth.supabase, contactId, auth.user!.id);
      if (!delRes.success) {
        return NextResponse.json({ error: delRes.error }, { status: 400 });
      }

      return NextResponse.json({
        status: 'success',
        message: 'Favorite contact deleted successfully',
      });
    }

    // Action 1: Bulk Approve multiple inbox items into expense_income_transactions
    if (body.action === 'approve_bulk' || (body.action === 'approve' && Array.isArray(body.items))) {
      const itemsToApprove = body.items || [];
      if (itemsToApprove.length === 0) {
        return NextResponse.json({ error: 'No items provided to approve' }, { status: 400 });
      }

      // Validate items
      for (const item of itemsToApprove) {
        if (!item.amount || parseFloat(item.amount) <= 0) {
          return NextResponse.json(
            { error: `Item with amount ${item.amount} must be greater than 0` },
            { status: 400 }
          );
        }
        if (item.type === 'TRANSFER' && (!item.matched_account_id && !item.account_id || !item.matched_to_account_id && !item.to_account_id)) {
          return NextResponse.json(
            { error: `Transfer of ฿${item.amount} requires both source and destination accounts` },
            { status: 400 }
          );
        }
      }

      // Ownership Verification: Check that all source & destination accounts belong to auth.user.id
      const accountIdsToVerify = itemsToApprove.flatMap((item: any) => [
        item.matched_account_id || item.account_id,
        item.type === 'TRANSFER' ? item.matched_to_account_id || item.to_account_id : null,
      ]);

      const ownershipCheck = await validateAccountOwnership(auth.supabase, auth.user!.id, accountIdsToVerify);
      if (!ownershipCheck.valid) {
        return NextResponse.json(
          { error: 'Forbidden: Account ownership check failed', details: ownershipCheck.error },
          { status: 403 }
        );
      }

      const payloads = itemsToApprove.map((item: any) => ({
        user_id: auth.user!.id, // Strictly server-resolved user identity
        transaction_date: item.transaction_date || new Date().toISOString(),
        type: item.type || 'EXPENSE',
        transaction_type: (item.type || 'EXPENSE').toLowerCase(),
        category: (item.category || 'อื่นๆ').trim(),
        amount: parseFloat(item.amount) || 0,
        account_id: item.matched_account_id || item.account_id || null,
        to_account_id: item.type === 'TRANSFER' ? item.matched_to_account_id || item.to_account_id || null : null,
        note: item.memo || item.note ? (item.memo || item.note).trim() : null,
        is_historical: Boolean(item.is_historical),
      }));

      const { data: insertedTxns, error: insertError } = await auth.supabase
        .from('expense_income_transactions')
        .insert(payloads)
        .select();

      if (insertError) {
        return NextResponse.json(
          { error: 'Failed to insert transactions', details: insertError.message },
          { status: 500 }
        );
      }

      // Mark slip_inbox items as approved (scoped to user_id)
      const idsToMark = itemsToApprove
        .map((i: any) => i.id)
        .filter((id: string) => id && !id.startsWith('ephemeral_'));

      if (idsToMark.length > 0) {
        await auth.supabase
          .from('slip_inbox')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .in('id', idsToMark)
          .eq('user_id', auth.user!.id);
      }

      return NextResponse.json({
        status: 'success',
        message: `Successfully approved ${payloads.length} slips into expense transactions`,
        count: payloads.length,
        data: insertedTxns,
      });
    }

    // Action 2: Approve single inbox item into expense_income_transactions
    if (body.action === 'approve') {
      const {
        id,
        amount,
        transaction_date,
        type = 'EXPENSE',
        category = 'อื่นๆ',
        account_id,
        to_account_id,
        note,
        is_historical = false,
      } = body;

      if (!amount || parseFloat(amount) <= 0) {
        return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
      }

      if (type === 'TRANSFER' && (!account_id || !to_account_id)) {
        return NextResponse.json({ error: 'Transfers require both source and destination accounts' }, { status: 400 });
      }

      // Ownership Verification: Check that source & destination accounts belong to auth.user.id
      const accountIdsToVerify = [
        account_id,
        type === 'TRANSFER' ? to_account_id : null,
      ];

      const ownershipCheck = await validateAccountOwnership(auth.supabase, auth.user!.id, accountIdsToVerify);
      if (!ownershipCheck.valid) {
        return NextResponse.json(
          { error: 'Forbidden: Account ownership check failed', details: ownershipCheck.error },
          { status: 403 }
        );
      }

      const txnPayload = {
        user_id: auth.user!.id, // Strictly server-resolved user identity
        transaction_date: transaction_date || new Date().toISOString(),
        type,
        transaction_type: type.toLowerCase(),
        category: category.trim(),
        amount: parseFloat(amount),
        account_id: account_id || null,
        to_account_id: type === 'TRANSFER' ? to_account_id || null : null,
        note: note ? note.trim() : null,
        is_historical: Boolean(is_historical),
      };

      const { data: insertedTxn, error: insertError } = await auth.supabase
        .from('expense_income_transactions')
        .insert([txnPayload])
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ error: 'Failed to insert transaction', details: insertError.message }, { status: 500 });
      }

      if (id && !id.startsWith('ephemeral_')) {
        await auth.supabase
          .from('slip_inbox')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('user_id', auth.user!.id);
      }

      return NextResponse.json({
        status: 'success',
        message: 'Slip approved and saved to expense transactions',
        data: insertedTxn,
      });
    }

    // Action 3: Ingest OCR Slips (Supports Single Slip OR Batch Array of Slips)
    const isBatch =
      Array.isArray(body) ||
      Array.isArray(body.slips) ||
      Array.isArray(body.texts) ||
      Array.isArray(body.items);

    const rawSlipsList: (string | { text?: string; amount?: number; [k: string]: any })[] =
      Array.isArray(body)
        ? body
        : Array.isArray(body.slips)
        ? body.slips
        : Array.isArray(body.texts)
        ? body.texts
        : Array.isArray(body.items)
        ? body.items
        : [body];

    const defaultSource = body.source || 'iphone_shortcut';
    const inboxRecordsToInsert: any[] = [];

    // Fetch user contacts for auto-enrichment and classification
    const contacts = await fetchUserFavoriteContacts(auth.supabase, auth.user!.id);

    for (const rawItem of rawSlipsList) {
      const rawText =
        typeof rawItem === 'string'
          ? rawItem
          : rawItem.text || rawItem.raw_ocr || rawItem.rawText || '';

      const source = (typeof rawItem === 'object' && rawItem.source) || defaultSource;

      if (!rawText && (typeof rawItem !== 'object' || !rawItem.amount)) {
        continue;
      }

      const parsed: ParsedSlipRegexResult = rawText
        ? parseThaiBankSlipOcr(rawText)
        : {
            amount: typeof rawItem === 'object' && rawItem.amount != null ? Number(rawItem.amount) || null : null,
            transaction_date: typeof rawItem === 'object' ? rawItem.transaction_date || new Date().toISOString() : new Date().toISOString(),
            parsed_date_display: typeof rawItem === 'object' ? rawItem.date || null : null,
            parsed_time_display: typeof rawItem === 'object' ? rawItem.time || null : null,
            type: typeof rawItem === 'object' ? rawItem.type || 'EXPENSE' : 'EXPENSE',
            category: typeof rawItem === 'object' ? rawItem.category || 'อื่นๆ' : 'อื่นๆ',
            sender_bank: typeof rawItem === 'object' ? rawItem.sender_bank || null : null,
            sender_account_masked: typeof rawItem === 'object' ? rawItem.sender_account_masked || null : null,
            sender_name: typeof rawItem === 'object' ? rawItem.sender_name || null : null,
            receiver_bank: typeof rawItem === 'object' ? rawItem.receiver_bank || null : null,
            receiver_account_masked: typeof rawItem === 'object' ? rawItem.receiver_account_masked || null : null,
            receiver_name: typeof rawItem === 'object' ? rawItem.receiver_name || null : null,
            memo: typeof rawItem === 'object' ? rawItem.memo || null : null,
            reference_number: typeof rawItem === 'object' ? rawItem.reference_number || null : null,
            confidence_score: 1.0,
            matched_rules: {},
            raw_text: rawText,
          };

      // Check against user's favorite contacts (e.g. family, friends, payees)
      const matchedContact = matchFavoriteContact(contacts, parsed);
      if (matchedContact) {
        if (matchedContact.default_category) {
          parsed.category = matchedContact.default_category;
        }
        if (matchedContact.default_type) {
          parsed.type = matchedContact.default_type;
        }
      }

      const { matchedAccountId, matchedToAccountId, accounts } = await matchAccounts(
        auth.supabase,
        auth.user!.id,
        parsed
      );

      const noteParts: string[] = [];
      if (matchedContact) {
        noteParts.push(`[${matchedContact.icon || '💖'} ${matchedContact.nickname} (${matchedContact.group_name})]`);
      }
      if (parsed.receiver_name) noteParts.push(`ถึง: ${parsed.receiver_name}`);
      if (parsed.memo) noteParts.push(`[${parsed.memo}]`);
      if (parsed.reference_number) noteParts.push(`Ref: ${parsed.reference_number}`);
      const generatedNote = noteParts.join(' ');

      inboxRecordsToInsert.push({
        user_id: auth.user!.id, // Strictly server-resolved user identity
        source,
        raw_text: parsed.raw_text,
        amount: parsed.amount,
        transaction_date: parsed.transaction_date || new Date().toISOString(),
        type: parsed.type,
        category: parsed.category,
        matched_account_id: matchedAccountId || (accounts[0]?.id ? accounts[0].id : null),
        matched_to_account_id: matchedToAccountId,
        sender_bank: parsed.sender_bank,
        sender_account_masked: parsed.sender_account_masked,
        sender_name: parsed.sender_name,
        receiver_bank: parsed.receiver_bank,
        receiver_account_masked: parsed.receiver_account_masked,
        receiver_name: parsed.receiver_name,
        reference_number: parsed.reference_number,
        memo: generatedNote,
        confidence_score: parsed.confidence_score,
        status: 'pending',
      });
    }

    if (inboxRecordsToInsert.length === 0) {
      return NextResponse.json(
        {
          error: 'Missing slip content',
          message: 'Provide "text" or "slips" array (raw OCR text from iPhone Shortcut).',
        },
        { status: 400 }
      );
    }

    // Insert all into slip_inbox
    const { data: savedRecords, error: insertError } =
    await auth.supabase
      .from('slip_inbox')
      .insert(inboxRecordsToInsert)
      .select();

    if (insertError) {
      console.error('[slip-inbox] Insert failed:', {
        code: insertError.code,
        message: insertError.message,
      });

      return NextResponse.json(
        {
          status: 'error',
          error: 'Failed to persist slips',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'success',
      message: `Saved ${savedRecords.length} slip(s)`,
      count: savedRecords.length,
      table_persisted: true,
      data: savedRecords,
    });
  } catch (err: any) {
    console.error('Error in /api/slip-inbox:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE: Dismiss or delete inbox slip items (supports single & bulk)
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.authenticated || !auth.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', message: auth.errorMessage || 'Unauthorized access' },
        { status: 401 }
      );
    }

    // Restriction: Shared secret (Apple Shortcuts) is write-only for slip ingestion
    if (auth.authType === 'api_key') {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Shared secret (Apple Shortcuts) is only authorized for slip ingestion. User session or JWT is required to delete slips.',
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const ids: string[] = [];

    const idParam = searchParams.get('id');
    const idsParam = searchParams.get('ids');

    if (idParam) {
      ids.push(...idParam.split(',').map((s) => s.trim()).filter(Boolean));
    }
    if (idsParam) {
      ids.push(...idsParam.split(',').map((s) => s.trim()).filter(Boolean));
    }

    // Also check if ids are passed in the request body
    if (ids.length === 0) {
      try {
        const body = await req.json();
        if (body.id) {
          ids.push(String(body.id).trim());
        }
        if (Array.isArray(body.ids)) {
          ids.push(...body.ids.map((s: any) => String(s).trim()).filter(Boolean));
        }
      } catch {
        // Body might be empty, that's fine
      }
    }

    const validIds = Array.from(new Set(ids)).filter(
      (id) => id && !id.startsWith('ephemeral_')
    );

    if (validIds.length === 0) {
      return NextResponse.json({ error: 'Missing slip id or ids to delete' }, { status: 400 });
    }

    let affectedIds: { id: string }[] = [];
    let operationError: any = null;

    const isSoft =
      searchParams.get('action') === 'dismiss' ||
      searchParams.get('mode') === 'dismiss' ||
      searchParams.get('soft') === 'true';

    const { data, error } = await auth.supabase
      .from('slip_inbox')
      .delete()
      .in('id', validIds)
      .eq('user_id', auth.user!.id)
      .select('id');

    affectedIds = data ?? [];
    operationError = error;

    const affectedCount = affectedIds.length;

    if (affectedCount === 0) {
      return NextResponse.json(
        {
          status: 'not_found',
          message: 'No accessible slips matched the requested IDs',
          count: 0,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'success',
      message: isSoft
        ? `Successfully dismissed ${affectedCount} slip(s)`
        : `Successfully deleted ${affectedCount} slip(s)`,
      count: affectedCount,
    });
      
  } catch (err: any) {
    console.error('Error in DELETE /api/slip-inbox:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
