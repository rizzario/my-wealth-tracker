import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { parseThaiBankSlipOcr, ParsedSlipRegexResult, KNOWN_BANKS } from '@/lib/slip-regex-parser';

export const dynamic = 'force-dynamic';

/**
 * Helper to authenticate request either via:
 * 1. Web session (cookies via createClient)
 * 2. Bearer token / API Key (from iPhone Shortcut or Expo Go)
 * 3. Supabase User JWT Access Token
 */
async function authenticateRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const apiKeyHeader = req.headers.get('x-api-key') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || apiKeyHeader.trim();

  // Create admin client if service role key is available
  const adminClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
    : null;

  // 1. Check User Session (Browser cookie)
  const serverClient = await createClient();
  const {
    data: { user: sessionUser },
  } = await serverClient.auth.getUser();

  if (sessionUser) {
    return {
      authenticated: true,
      user: sessionUser,
      supabase: adminClient || serverClient,
      authType: 'session' as const,
    };
  }

  // 2. Check if Bearer token is a Supabase JWT Token
  if (token && token.startsWith('ey')) {
    const { data: { user: jwtUser } } = await serverClient.auth.getUser(token);
    if (jwtUser) {
      return {
        authenticated: true,
        user: jwtUser,
        supabase: adminClient || serverClient,
        authType: 'jwt' as const,
      };
    }
  }

  // 3. Check API Secret Token (for iPhone Shortcut / Webhooks)
  const expectedSecret =
    process.env.SLIP_INBOX_SECRET ||
    process.env.CRON_SECRET ||
    'wealth_tracker_slip_secret_2026';

  const isTokenValid = Boolean(token && (token === expectedSecret || token === process.env.CRON_SECRET));

  if (isTokenValid) {
    const activeClient = adminClient || serverClient;
    const { data: profiles } = await activeClient.from('profiles').select('id').limit(1);
    const resolvedUserId = profiles?.[0]?.id || null;

    return {
      authenticated: true,
      user: resolvedUserId ? { id: resolvedUserId } : null,
      supabase: activeClient,
      authType: 'api_key' as const,
    };
  }

  // 4. Development bypass helper
  if (process.env.NODE_ENV === 'development') {
    const activeClient = adminClient || serverClient;
    const { data: profiles } = await activeClient.from('profiles').select('id').limit(1);
    const resolvedUserId = profiles?.[0]?.id || null;
    return {
      authenticated: true,
      user: resolvedUserId ? { id: resolvedUserId } : null,
      supabase: activeClient,
      authType: 'development' as const,
    };
  }

  return { authenticated: false, user: null, supabase: serverClient, authType: 'unauthorized' as const };
}

/**
 * Smart matching against user's financial accounts
 */
async function matchAccounts(supabase: any, userId: string | null, slip: ParsedSlipRegexResult) {
  if (!userId) return { matchedAccountId: null, matchedToAccountId: null, accounts: [] };

  const { data: accounts } = await supabase
    .from('financial_accounts')
    .select('id, account_name, bank_name, account_number, account_type, is_liability')
    .eq('user_id', userId);

  if (!accounts || accounts.length === 0) {
    return { matchedAccountId: null, matchedToAccountId: null, accounts: [] };
  }

  let matchedAccountId: string | null = null;
  let matchedToAccountId: string | null = null;

  const senderBank = (slip.sender_bank || '').toUpperCase();
  const senderBankPattern = KNOWN_BANKS.find((b) => b.code.toUpperCase() === senderBank);
  const senderAccDigits = (slip.sender_account_masked || '').replace(/[^0-9]/g, '');

  let bestMatchScore = 0;

  for (const acc of accounts) {
    const accDigits = (acc.account_number || '').replace(/[^0-9]/g, '');
    const accBank = (acc.bank_name || '').toUpperCase();
    const accName = (acc.account_name || '').toUpperCase();

    // Digits match: exact match or last 4 digits
    const numberMatches =
      senderAccDigits.length >= 3 &&
      accDigits.length >= 3 &&
      (senderAccDigits.endsWith(accDigits.slice(-4)) ||
       accDigits.endsWith(senderAccDigits.slice(-4)) ||
       senderAccDigits === accDigits);

    // Bank match: via bank code, bank name, or bank pattern regex
    const bankMatches =
      (senderBank && (accBank.includes(senderBank) || senderBank.includes(accBank))) ||
      (senderBank && accName.includes(senderBank)) ||
      (senderBankPattern &&
        (senderBankPattern.regex.test(acc.bank_name || '') ||
         senderBankPattern.regex.test(acc.account_name || '')));

    let score = 0;
    if (numberMatches && bankMatches) score = 100;
    else if (numberMatches) score = 80;
    else if (bankMatches && !acc.is_liability) score = 50;

    if (score > bestMatchScore) {
      bestMatchScore = score;
      matchedAccountId = acc.id;
    }
  }

  // If TRANSFER or Credit card payment, match destination
  if (slip.type === 'TRANSFER' || slip.category === 'ชำระค่าบัตรเครดิต') {
    const receiverName = (slip.receiver_name || '').toUpperCase();
    const receiverBank = (slip.receiver_bank || '').toUpperCase();
    const receiverBankPattern = KNOWN_BANKS.find((b) => b.code.toUpperCase() === receiverBank);
    const receiverAccDigits = (slip.receiver_account_masked || '').replace(/[^0-9]/g, '');

    for (const acc of accounts) {
      if (acc.id === matchedAccountId) continue;

      const accDigits = (acc.account_number || '').replace(/[^0-9]/g, '');
      const accBank = (acc.bank_name || '').toUpperCase();
      const accName = (acc.account_name || '').toUpperCase();

      const numberMatches =
        receiverAccDigits.length >= 3 &&
        accDigits.length >= 3 &&
        (receiverAccDigits.endsWith(accDigits.slice(-4)) ||
         accDigits.endsWith(receiverAccDigits.slice(-4)) ||
         receiverAccDigits === accDigits);

      const nameMatches =
        (receiverName && (receiverName.includes(accBank) || receiverName.includes(accName))) ||
        (receiverBankPattern &&
          (receiverBankPattern.regex.test(acc.bank_name || '') ||
           receiverBankPattern.regex.test(acc.account_name || '')));

      if (numberMatches || nameMatches) {
        matchedToAccountId = acc.id;
        break;
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
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Query pending slips (case-insensitive for 'pending' / 'Pending')
    let query = auth.supabase
      .from('slip_inbox')
      .select('*')
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

    return NextResponse.json({
      status: 'ok',
      data: inboxItems || [],
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
    if (!auth.authenticated) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Provide a valid User Session cookie or Authorization: Bearer <SLIP_INBOX_SECRET>',
        },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

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
        if (item.type === 'TRANSFER' && (!item.matched_account_id || !item.matched_to_account_id)) {
          return NextResponse.json(
            { error: `Transfer of ฿${item.amount} requires both source and destination accounts` },
            { status: 400 }
          );
        }
      }

      const payloads = itemsToApprove.map((item: any) => ({
        user_id: auth.user?.id || null,
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

      // Mark slip_inbox items as approved
      const idsToMark = itemsToApprove
        .map((i: any) => i.id)
        .filter((id: string) => id && !id.startsWith('ephemeral_'));

      if (idsToMark.length > 0) {
        await auth.supabase
          .from('slip_inbox')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .in('id', idsToMark);
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

      const txnPayload = {
        user_id: auth.user?.id || null,
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
          .eq('id', id);
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

      const { matchedAccountId, matchedToAccountId, accounts } = await matchAccounts(
        auth.supabase,
        auth.user?.id || null,
        parsed
      );

      const noteParts: string[] = [];
      if (parsed.receiver_name) noteParts.push(`ถึง: ${parsed.receiver_name}`);
      if (parsed.memo) noteParts.push(`[${parsed.memo}]`);
      if (parsed.reference_number) noteParts.push(`Ref: ${parsed.reference_number}`);
      const generatedNote = noteParts.join(' ');

      inboxRecordsToInsert.push({
        user_id: auth.user?.id || null,
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
    let savedRecords = null;
    let tableExists = true;

    try {
      const { data, error } = await auth.supabase
        .from('slip_inbox')
        .insert(inboxRecordsToInsert)
        .select();

      if (error) {
        if (error.message?.includes('schema cache') || error.message?.includes('does not exist')) {
          tableExists = false;
        } else {
          console.warn('Could not insert into slip_inbox table:', error.message);
        }
      } else {
        savedRecords = data;
      }
    } catch {
      tableExists = false;
    }

    return NextResponse.json({
      status: 'success',
      message: `Processed and staged ${inboxRecordsToInsert.length} slip(s) in inbox`,
      count: inboxRecordsToInsert.length,
      table_persisted: tableExists && Boolean(savedRecords),
      data: savedRecords || inboxRecordsToInsert.map((rec, idx) => ({ id: `ephemeral_${Date.now()}_${idx}`, ...rec })),
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
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    const isSoft =
      searchParams.get('action') === 'dismiss' ||
      searchParams.get('mode') === 'dismiss' ||
      searchParams.get('soft') === 'true';

    let error: any = null;

    if (isSoft) {
      // Soft-delete: update status to 'dismissed'
      const { error: updateError } = await auth.supabase
        .from('slip_inbox')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .in('id', validIds);
      error = updateError;
    } else {
      // Hard-delete: permanently remove from staging table
      const { error: deleteError } = await auth.supabase
        .from('slip_inbox')
        .delete()
        .in('id', validIds);
      error = deleteError;
    }

    if (error) {
      console.error('Failed to delete/dismiss slip_inbox items:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      status: 'success',
      message: isSoft
        ? `Successfully dismissed ${validIds.length} slip(s)`
        : `Successfully deleted ${validIds.length} slip(s)`,
      count: validIds.length,
    });
  } catch (err: any) {
    console.error('Error in DELETE /api/slip-inbox:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
