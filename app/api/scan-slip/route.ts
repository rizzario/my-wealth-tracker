import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60; // Allow up to 60s for vision model inference
export const dynamic = 'force-dynamic';

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

    // 2. Validate Gemini API Key
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'Configuration Error',
          message:
            'GEMINI_API_KEY is not defined in environment variables. Please add GEMINI_API_KEY to .env.local and Vercel.',
        },
        { status: 500 }
      );
    }

    // 3. Extract Image payload (support multipart/form-data or application/json base64)
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

    // 5. Initialize Google GenAI client
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

    // 6. Call Gemini Model with Multimodal Image and Structured Output
    const ALLOWED_MODELS = [
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
    ];

    const modelName = ALLOWED_MODELS.includes(requestedModel)
      ? requestedModel
      : (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite');

    const response = await ai.interactions.create({
      model: modelName,
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

    if (response.usage) {
      console.log(
        `[Gemini Scan (${modelName})] Tokens - Input: ${response.usage.total_input_tokens}, Output: ${response.usage.total_output_tokens}, Thoughts: ${response.usage.total_thought_tokens || 0}, Total: ${response.usage.total_tokens}`
      );
    }

    const parsedSlip = JSON.parse(outputText);

    // 7. Smart Matching against User's Accounts
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

    // 8. Determine if this slip is historical (transaction date earlier than today)
    let isHistoricalSuggested = false;
    if (parsedSlip.transaction_date) {
      try {
        const slipDate = new Date(parsedSlip.transaction_date);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // If slip date is before today, suggest is_historical: true to prevent altering live balance
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
        model_used: modelName,
      },
      usage: response.usage
        ? {
            model: modelName,
            input_tokens: response.usage.total_input_tokens,
            output_tokens: response.usage.total_output_tokens,
            thought_tokens: response.usage.total_thought_tokens || 0,
            total_tokens: response.usage.total_tokens,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Error in /api/scan-slip:', error);
    return NextResponse.json(
      {
        error: 'Scan Failed',
        message: error.message || 'Failed to process slip image with Gemini AI',
      },
      { status: 500 }
    );
  }
}
