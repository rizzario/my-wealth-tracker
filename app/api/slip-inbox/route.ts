import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { parseThaiBankSlipOcr, ParsedSlipRegexResult } from '@/lib/slip-regex-parser';

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
  const senderAccDigits = (slip.sender_account_masked || '').replace(/[^0-9]/g, '');

  for (const acc of accounts) {
    const accDigits = (acc.account_number || '').replace(/[^0-9]/g, '');
    const accBank = (acc.bank_name || '').toUpperCase();
    const accName = (acc.account_name || '').toUpperCase();

    const numberMatches =
      senderAccDigits.length >= 3 &&
      accDigits.length >= 3 &&
      (senderAccDigits.endsWith(accDigits.slice(-4)) || accDigits.endsWith(senderAccDigits.slice(-4)));

    const bankMatches =
      (senderBank && (accBank.includes(senderBank) || senderBank.includes(accBank))) ||
      (senderBank && accName.includes(senderBank));

    if (numberMatches || (bankMatches && !matchedAccountId)) {
      matchedAccountId = acc.id;
      if (numberMatches) break;
    }
  }

  // If TRANSFER or Credit card payment, match destination
  if (slip.type === 'TRANSFER' || slip.category === 'ชำระค่าบัตรเครดิต') {
    const receiverName = (slip.receiver_name || '').toUpperCase();
    const receiverBank = (slip.receiver_bank || '').toUpperCase();
    const receiverAccDigits = (slip.receiver_account_masked || '').replace(/[^0-9]/g, '');

    for (const acc of accounts) {
      if (acc.id === matchedAccountId) continue;

      const accDigits = (acc.account_number || '').replace(/[^0-9]/g, '');
      const accBank = (acc.bank_name || '').toUpperCase();
      const accName = (acc.account_name || '').toUpperCase();

      const numberMatches =
        receiverAccDigits.length >= 3 &&
        accDigits.length >= 3 &&
        (receiverAccDigits.endsWith(accDigits.slice(-4)) || accDigits.endsWith(receiverAccDigits.slice(-4)));

      const nameMatches =
        acc.is_liability &&
        (receiverName.includes(accBank) || receiverName.includes(accName));

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
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let query = auth.supabase
      .from('slip_inbox')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (auth.user?.id) {
      query = query.or(`user_id.eq.${auth.user.id},user_id.is.null`);
    }

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

    // Action 1: Approve an inbox item into expense_income_transactions
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

      // 1. Insert into expense_income_transactions (triggers automatic balance adjustment)
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

      // 2. Mark slip_inbox item as approved if id is provided
      if (id) {
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

    // Action 2: Ingest OCR Text from iPhone Shortcut
    const rawOcrText = body.text || body.raw_ocr || body.rawText || '';
    const source = body.source || 'iphone_shortcut';

    if (!rawOcrText && !body.amount) {
      return NextResponse.json(
        {
          error: 'Missing slip content',
          message: 'Provide "text" (raw OCR text from iPhone Shortcut) or structured slip data.',
        },
        { status: 400 }
      );
    }

    // Run Regex Parser
    const parsed: ParsedSlipRegexResult = rawOcrText
      ? parseThaiBankSlipOcr(rawOcrText)
      : {
          amount: parseFloat(body.amount) || null,
          transaction_date: body.transaction_date || new Date().toISOString(),
          parsed_date_display: body.date || null,
          parsed_time_display: body.time || null,
          type: body.type || 'EXPENSE',
          category: body.category || 'อื่นๆ',
          sender_bank: body.sender_bank || null,
          sender_account_masked: body.sender_account_masked || null,
          sender_name: body.sender_name || null,
          receiver_bank: body.receiver_bank || null,
          receiver_account_masked: body.receiver_account_masked || null,
          receiver_name: body.receiver_name || null,
          memo: body.memo || null,
          reference_number: body.reference_number || null,
          confidence_score: 1.0,
          matched_rules: {},
          raw_text: rawOcrText,
        };

    // Smart Match Accounts
    const { matchedAccountId, matchedToAccountId, accounts } = await matchAccounts(
      auth.supabase,
      auth.user?.id || null,
      parsed
    );

    // Build human-friendly memo / note
    const noteParts: string[] = [];
    if (parsed.receiver_name) noteParts.push(`ถึง: ${parsed.receiver_name}`);
    if (parsed.memo) noteParts.push(`[${parsed.memo}]`);
    if (parsed.reference_number) noteParts.push(`Ref: ${parsed.reference_number}`);
    const generatedNote = noteParts.join(' ');

    // Staging record object
    const inboxRecord = {
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
    };

    // Try saving to Supabase slip_inbox
    let savedRecord = null;
    let tableExists = true;

    try {
      const { data, error } = await auth.supabase
        .from('slip_inbox')
        .insert([inboxRecord])
        .select()
        .single();

      if (error) {
        if (error.message?.includes('schema cache') || error.message?.includes('does not exist')) {
          tableExists = false;
        } else {
          console.warn('Could not insert into slip_inbox table:', error.message);
        }
      } else {
        savedRecord = data;
      }
    } catch {
      tableExists = false;
    }

    return NextResponse.json({
      status: 'success',
      message: 'Slip parsed and passed to dashboard staging inbox',
      table_persisted: tableExists && Boolean(savedRecord),
      data: savedRecord || {
        id: `ephemeral_${Date.now()}`,
        ...inboxRecord,
        parsed_details: parsed,
      },
      parsed,
      notice: tableExists
        ? 'Slip safely staged in inbox. Review and approve in dashboard to update expense report.'
        : 'Slip parsed successfully. To persist incoming slips permanently in Supabase, execute the slip_inbox SQL migration.',
    });
  } catch (err: any) {
    console.error('Error in /api/slip-inbox:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE: Dismiss or delete an inbox slip item
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing slip id' }, { status: 400 });
    }

    const { error } = await auth.supabase
      .from('slip_inbox')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', auth.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: 'success', message: 'Item dismissed' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
