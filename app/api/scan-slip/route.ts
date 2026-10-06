import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60; // Allow up to 60s for vision model inference
export const dynamic = 'force-dynamic';

// GET: Healthcheck & available model providers status
export async function GET() {
  const cfWorkerUrl = process.env.SLIP_SCANNER_WORKER_API_URL;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const isGeminiConfigured = Boolean(geminiKey && geminiKey !== 'your_gemini_api_key_here');

  let cfStatus: 'ok' | 'unreachable' | 'not_configured' = 'not_configured';
  if (cfWorkerUrl) {
    try {
      const cleanUrl = cfWorkerUrl.replace(/\/$/, '');
      const res = await fetch(`${cleanUrl}/health`, {
        signal: AbortSignal.timeout(4000),
      });
      cfStatus = res.ok ? 'ok' : 'unreachable';
    } catch {
      cfStatus = 'unreachable';
    }
  }

  return NextResponse.json({
    status: 'ok',
    providers: {
      cloudflare: {
        configured: Boolean(cfWorkerUrl),
        status: cfStatus,
        url: cfWorkerUrl || null,
        models: ['cloudflare-llama-3.2-11b-vision'],
      },
      gemini: {
        configured: isGeminiConfigured,
        models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.8-flash'],
      },
    },
  });
}

// JSON Schema for Gemini Structured Output
const slipAnalysisSchema = {
  type: 'object',
  properties: {
    amount: {
      type: 'number',
      description: 'The transaction amount in THB (e.g. 150.00). Must be positive.',
    },
    transaction_date: {
      type: 'string',
      description: 'The date and time of the transaction in ISO 8601 format (YYYY-MM-DDTHH:mm:ss). If Buddhist Era year is shown (e.g. 2568, 2569), convert to Christian Era (e.g. 2025, 2026).',
    },
    type: {
      type: 'string',
      enum: ['EXPENSE', 'INCOME', 'TRANSFER'],
      description: 'Transaction type: EXPENSE (outgoing payment/buy), INCOME (received money), or TRANSFER (between accounts/credit card payment).',
    },
    category: {
      type: 'string',
      enum: [
        'อาหาร & เครื่องดื่ม',
        'ช้อปปิ้ง',
        'เดินทาง',
        'ค่าน้ำ-ค่าไฟ-เน็ต',
        'ค่าที่พัก & คอนโด',
        'บันเทิง & ท่องเที่ยว',
        'สุขภาพ & ประกัน',
        'การศึกษา',
        'ลงทุน & ออมเงิน',
        'โอนเงินระหว่างบัญชี',
        'ชำระค่าบัตรเครดิต',
        'อื่นๆ',
      ],
      description: 'Best matching expense/income category based on merchant name, receiver, and memo.',
    },
    sender_bank: {
      type: 'string',
      description: 'Sender bank name or abbreviation in uppercase (e.g. KBANK, SCB, BBL, TTB, KTB, BAY, GSB, TRUEMONEY, DIME, INNOVESTX).',
    },
    sender_account_masked: {
      type: 'string',
      description: 'Sender account number masked, e.g. xxx-x-x1234-x or last 4 digits.',
    },
    sender_name: {
      type: 'string',
      description: 'Name of the sender as shown on the slip.',
    },
    receiver_bank: {
      type: 'string',
      description: 'Receiver bank name or abbreviation (e.g. KBANK, SCB, PROMPTPAY).',
    },
    receiver_account_masked: {
      type: 'string',
      description: 'Receiver account or PromptPay number as shown on the slip.',
    },
    receiver_name: {
      type: 'string',
      description: 'Name of the receiver or merchant/shop name.',
    },
    memo: {
      type: 'string',
      description: 'Note, memo, or description written by sender on the slip (บันทึกช่วยจำ), if any.',
    },
    reference_number: {
      type: 'string',
      description: 'Transaction reference number (เลขที่รายการ / รหัสอ้างอิง), if visible.',
    },
    confidence_score: {
      type: 'number',
      description: 'Confidence score from 0.0 to 1.0 of the slip readability and extraction accuracy.',
    },
  },
  required: ['amount', 'transaction_date', 'type', 'category', 'sender_bank', 'receiver_name'],
};

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: User session required' }, { status: 401 });
    }

    // 2. Extract Image payload (support multipart/form-data or application/json base64)
    let base64Data = '';
    let mimeType = 'image/jpeg';
    let requestedModel = '';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'No image file uploaded' }, { status: 400 });
      }
      requestedModel = (formData.get('model') as string) || '';
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      base64Data = buffer.toString('base64');
      mimeType = file.type || 'image/jpeg';
    } else {
      const body = await req.json();
      if (!body.image) {
        return NextResponse.json({ error: 'Image data missing from request' }, { status: 400 });
      }
      requestedModel = body.model || '';
      base64Data = body.image.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      if (body.mimeType) mimeType = body.mimeType;
    }

    // 3. Determine provider & model
    const isCloudflare =
      requestedModel.startsWith('cloudflare') ||
      requestedModel.startsWith('cf-') ||
      requestedModel === 'llama-3.2-11b-vision';

    // 4. Fetch user's financial accounts for smart matching
    const { data: accounts } = await supabase
      .from('financial_accounts')
      .select('id, account_name, bank_name, account_number, account_type, is_liability')
      .eq('user_id', user.id);

    const userAccountsContext = (accounts || [])
      .map(
        (a) =>
          `- ID: ${a.id} | Name: "${a.account_name}" | Bank: "${a.bank_name || ''}" | Number: "${a.account_number || ''}" | Type: ${a.account_type} | Liability: ${a.is_liability}`
      )
      .join('\n');

    let parsedSlip: any = null;
    let modelNameUsed = '';
    let usageData: any = null;

    if (isCloudflare) {
      // --- Cloudflare Workers AI Flow ---
      const workerUrl = process.env.SLIP_SCANNER_WORKER_API_URL;
      if (!workerUrl) {
        return NextResponse.json(
          {
            error: 'Configuration Error',
            message:
              'SLIP_SCANNER_WORKER_API_URL is not defined in environment variables. Please add SLIP_SCANNER_WORKER_API_URL to .env.local and Vercel.',
          },
          { status: 500 }
        );
      }

      const cleanUrl = workerUrl.replace(/\/$/, '');
      const cfResponse = await fetch(cleanUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data }),
      });

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        return NextResponse.json(
          {
            error: 'Cloudflare Worker Scan Failed',
            message: `Worker returned status ${cfResponse.status}: ${errorText}`,
          },
          { status: 502 }
        );
      }

      const cfResult = await cfResponse.json();
      if (!cfResult.success || !cfResult.data) {
        return NextResponse.json(
          {
            error: 'Cloudflare Worker Scan Failed',
            message: cfResult.error || 'Worker did not return valid data',
          },
          { status: 502 }
        );
      }

      parsedSlip = cfResult.data;
      modelNameUsed = cfResult.model || 'cloudflare-llama-3.2-11b-vision';
      usageData = cfResult.usage
        ? {
            model: modelNameUsed,
            input_tokens: cfResult.usage.prompt_tokens,
            output_tokens: cfResult.usage.completion_tokens,
            total_tokens: cfResult.usage.total_tokens,
          }
        : null;
    } else {
      // --- Google Gemini Flow ---
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        return NextResponse.json(
          {
            error: 'Configuration Error',
            message:
              'GEMINI_API_KEY is not defined or is placeholder. Please configure GEMINI_API_KEY or select Cloudflare Workers AI model.',
          },
          { status: 500 }
        );
      }

      const ai = new GoogleGenAI({ apiKey });

      const promptText = `
You are an expert OCR & financial auditor AI specialized in Thai bank transfer slips (สลิปโอนเงิน ธนาคารไทย), QR PromptPay, credit card slips, and receipt vouchers.

Analyze this Thai bank slip image accurately and extract all financial details according to the provided schema.

Rules:
1. Date & Time: Convert Thai Buddhist Era (พ.ศ.) to Christian Era (ค.ศ. เช่น 2568 -> 2025, 2569 -> 2026). Ensure full ISO-8601 timestamp (YYYY-MM-DDTHH:mm:ss). If seconds are not shown, use :00.
2. Amount: Extract the exact transfer amount in THB (e.g. 120.00). Do not include fees unless specified.
3. Category: Select the best fit among standard categories. If merchant is clearly food/drink/restaurant, select "อาหาร & เครื่องดื่ม". If transportation/fuel/tollway, select "เดินทาง". If utility/internet/mobile, select "ค่าน้ำ-ค่าไฟ-เน็ต".
4. Memo / Note: Extract the sender's memo (บันทึกช่วยจำ) if present.
5. Reference Number: Extract the transaction ref / QR ref code if visible.

User's Financial Accounts List:
${userAccountsContext}
`;

      const ALLOWED_MODELS = [
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-3.8-flash',
        'gemini-3.5-flash-lite',
      ];

      modelNameUsed = ALLOWED_MODELS.includes(requestedModel)
        ? requestedModel
        : (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite');

      const response = await ai.interactions.create({
        model: modelNameUsed,
        input: [
          { type: 'text', text: promptText },
          {
            type: 'image',
            data: base64Data,
            mime_type: mimeType,
          },
        ],
        generation_config: {
          thinking_level: 'low',
          max_output_tokens: 800,
        },
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: slipAnalysisSchema,
        },
      });

      const outputText = response.output_text;
      if (!outputText) {
        return NextResponse.json(
          { error: 'Gemini returned an empty response. The slip could not be parsed.' },
          { status: 502 }
        );
      }

      parsedSlip = JSON.parse(outputText);
      usageData = response.usage
        ? {
            model: modelNameUsed,
            input_tokens: response.usage.total_input_tokens,
            output_tokens: response.usage.total_output_tokens,
            thought_tokens: response.usage.total_thought_tokens || 0,
            total_tokens: response.usage.total_tokens,
          }
        : null;
    }

    // --- Normalization & Sanitization ---
    if (parsedSlip.amount && typeof parsedSlip.amount === 'string') {
      parsedSlip.amount = parseFloat(parsedSlip.amount.replace(/,/g, '')) || 0;
    }

    if (parsedSlip.transaction_date && parsedSlip.transaction_time && !parsedSlip.transaction_date.includes('T')) {
      parsedSlip.transaction_date = `${parsedSlip.transaction_date}T${parsedSlip.transaction_time}:00`;
    }

    if (!parsedSlip.type || !['EXPENSE', 'INCOME', 'TRANSFER'].includes(parsedSlip.type)) {
      parsedSlip.type = 'EXPENSE';
    }

    if (!parsedSlip.category) {
      parsedSlip.category = 'อื่นๆ';
    }

    // --- Smart Matching against User's Accounts ---
    let matchedAccountId: string | null = null;
    let matchedToAccountId: string | null = null;

    if (accounts && accounts.length > 0) {
      const senderBank = (parsedSlip.sender_bank || '').toUpperCase();
      const senderAcc = (parsedSlip.sender_account_masked || '').replace(/[^0-9]/g, '');

      // Try matching source account by account number digits or bank name
      for (const acc of accounts) {
        const accDigits = (acc.account_number || '').replace(/[^0-9]/g, '');
        const accBank = (acc.bank_name || '').toUpperCase();
        const accName = (acc.account_name || '').toUpperCase();

        const numberMatches =
          senderAcc.length >= 3 &&
          accDigits.length >= 3 &&
          (senderAcc.endsWith(accDigits.slice(-4)) || accDigits.endsWith(senderAcc.slice(-4)));

        const bankMatches =
          (senderBank && (accBank.includes(senderBank) || senderBank.includes(accBank))) ||
          (senderBank && accName.includes(senderBank));

        if (numberMatches || (bankMatches && !matchedAccountId)) {
          matchedAccountId = acc.id;
          if (numberMatches) break; // Strong match by number takes precedence
        }
      }

      // If it's a TRANSFER or Credit Card payment, try matching destination account
      if (parsedSlip.type === 'TRANSFER' || parsedSlip.category === 'ชำระค่าบัตรเครดิต') {
        const receiverName = (parsedSlip.receiver_name || '').toUpperCase();
        const receiverBank = (parsedSlip.receiver_bank || '').toUpperCase();
        const receiverAcc = (parsedSlip.receiver_account_masked || '').replace(/[^0-9]/g, '');

        for (const acc of accounts) {
          if (acc.id === matchedAccountId) continue;

          const accDigits = (acc.account_number || '').replace(/[^0-9]/g, '');
          const accBank = (acc.bank_name || '').toUpperCase();
          const accName = (acc.account_name || '').toUpperCase();

          const numberMatches =
            receiverAcc.length >= 3 &&
            accDigits.length >= 3 &&
            (receiverAcc.endsWith(accDigits.slice(-4)) || accDigits.endsWith(receiverAcc.slice(-4)));

          const nameMatches =
            acc.is_liability &&
            (receiverName.includes(accBank) || receiverName.includes(accName));

          if (numberMatches || nameMatches) {
            matchedToAccountId = acc.id;
            break;
          }
        }
      }
    }

    // --- Determine if this slip is historical (transaction date earlier than today) ---
    let isHistoricalSuggested = false;
    if (parsedSlip.transaction_date) {
      try {
        const slipDate = new Date(parsedSlip.transaction_date);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        if (slipDate < todayStart) {
          isHistoricalSuggested = true;
        }
      } catch {
        // ignore date parsing error
      }
    }

    return NextResponse.json({
      status: 'success',
      data: {
        ...parsedSlip,
        matched_account_id: matchedAccountId,
        matched_to_account_id: matchedToAccountId,
        is_historical_suggested: isHistoricalSuggested,
        model_used: modelNameUsed,
      },
      usage: usageData,
    });
  } catch (error: any) {
    console.error('Error in /api/scan-slip:', error);
    return NextResponse.json(
      {
        error: 'Scan Failed',
        message: error.message || 'Failed to process slip image',
      },
      { status: 500 }
    );
  }
}
