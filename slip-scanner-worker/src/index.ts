export interface Env {
  AI: any;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // 2. Agree endpoint to accept Meta Llama 3.2 license
    if (url.pathname === '/agree' || url.searchParams.get('agree') === 'true') {
      try {
        const agreeRes = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
          prompt: 'agree',
        });
        return Response.json(
          { success: true, message: 'Agreed to Llama 3.2 license', details: agreeRes },
          { headers: corsHeaders }
        );
      } catch (err: any) {
        return Response.json(
          { success: false, error: err.message },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // 3. Health check
    if (url.pathname === '/health' || (request.method === 'GET' && url.pathname === '/')) {
      return Response.json(
        {
          status: 'ok',
          worker: 'slip-scanner-worker',
          model: '@cf/meta/llama-3.2-11b-vision-instruct',
        },
        { headers: corsHeaders }
      );
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    try {
      // Receive imageBase64 or image from body
      const body = (await request.json()) as {
        imageBase64?: string;
        image?: string;
        prompt?: string;
        agree?: boolean;
      };

      if (body.agree === true) {
        try {
          const agreeRes = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
            prompt: 'agree',
          });
          return Response.json(
            { success: true, agreed: true, response: agreeRes },
            { headers: corsHeaders }
          );
        } catch (agErr: any) {
          return Response.json(
            { success: false, error: agErr.message },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      const rawBase64 = body.imageBase64 || body.image;
      if (!rawBase64) {
        return Response.json(
          { error: 'No imageBase64 provided' },
          { status: 400, headers: corsHeaders }
        );
      }

      // Clean base64 data url
      const cleanBase64 = rawBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

      // Convert base64 to byte array for Workers AI Vision
      const binaryString = atob(cleanBase64);
      const imageBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        imageBytes[i] = binaryString.charCodeAt(i);
      }

      const prompt = `You are an expert Thai banking OCR & financial assistant. Analyze this Thai bank transfer slip, QR PromptPay slip, or payment receipt image carefully.
Extract the details into a valid JSON object with the following fields:
- amount: number (e.g. 150.00, transaction amount in THB, strictly positive)
- transaction_date: string (ISO-8601 YYYY-MM-DDTHH:mm:ss. Note: convert Thai Buddhist year like 2567/2568/2569 to Christian year 2024/2025/2026. If time seconds are missing, use 00)
- type: string (one of "EXPENSE", "INCOME", "TRANSFER")
- category: string (one of "อาหาร & เครื่องดื่ม", "ช้อปปิ้ง", "เดินทาง", "ค่าน้ำ-ค่าไฟ-เน็ต", "ค่าที่พัก & คอนโด", "บันเทิง & ท่องเที่ยว", "สุขภาพ & ประกัน", "การศึกษา", "ลงทุน & ออมเงิน", "โอนเงินระหว่างบัญชี", "ชำระค่าบัตรเครดิต", "อื่นๆ")
- sender_bank: string (e.g. KBANK, SCB, KTB, BBL, TTB, BAY, GSB)
- sender_account_masked: string (masked sender account e.g. xxx-1234)
- sender_name: string (sender name if available)
- receiver_bank: string (receiver bank or PROMPTPAY)
- receiver_account_masked: string (receiver account or promptpay number)
- receiver_name: string (receiver or merchant name)
- memo: string (sender note/บันทึกช่วยจำ if available)
- reference_number: string (transaction reference number or QR ref)
- confidence_score: number (between 0.0 and 1.0)

Return ONLY the raw JSON object. Do not wrap in markdown or backticks.`;

      let aiResponse: any;
      try {
        aiResponse = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
          prompt,
          image: [...imageBytes],
          max_tokens: 600,
        });
      } catch (runErr: any) {
        const errMsg = runErr?.message || String(runErr);
        if (errMsg.includes('5016') || errMsg.toLowerCase().includes('agree')) {
          try {
            await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt: 'agree' });
          } catch {}
          // Retry inference
          aiResponse = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
            prompt,
            image: [...imageBytes],
            max_tokens: 600,
          });
        } else {
          throw runErr;
        }
      }

      let parsedData: any = null;
      const usage: any = aiResponse?.usage || null;

      if (aiResponse && typeof aiResponse.response === 'object' && aiResponse.response !== null) {
        parsedData = aiResponse.response;
      } else {
        let rawText = '';
        if (typeof aiResponse === 'string') {
          rawText = aiResponse;
        } else if (aiResponse && typeof aiResponse.response === 'string') {
          rawText = aiResponse.response;
        } else if (aiResponse && typeof aiResponse.description === 'string') {
          rawText = aiResponse.description;
        } else if (aiResponse && typeof aiResponse.text === 'string') {
          rawText = aiResponse.text;
        } else if (aiResponse && typeof aiResponse.result === 'string') {
          rawText = aiResponse.result;
        } else {
          rawText = JSON.stringify(aiResponse || '');
        }

        rawText = rawText.trim();
        // Clean up markdown fences
        rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

        const jsonStart = rawText.indexOf('{');
        const jsonEnd = rawText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          rawText = rawText.substring(jsonStart, jsonEnd + 1);
        }

        try {
          parsedData = JSON.parse(rawText);
          if (parsedData && parsedData.response && typeof parsedData.response === 'object') {
            parsedData = parsedData.response;
          }
        } catch {
          parsedData = { raw_output: rawText, response_type: typeof aiResponse };
        }
      }

      // Sanitize fields
      if (parsedData.amount && typeof parsedData.amount === 'string') {
        parsedData.amount = parseFloat(parsedData.amount.replace(/,/g, '')) || 0;
      }
      if (!parsedData.type) {
        parsedData.type = 'EXPENSE';
      }
      if (!parsedData.category) {
        parsedData.category = 'อื่นๆ';
      }

      return Response.json(
        {
          success: true,
          data: parsedData,
          usage: usage,
          model: '@cf/meta/llama-3.2-11b-vision-instruct',
        },
        { headers: corsHeaders }
      );
    } catch (err: any) {
      return Response.json(
        { success: false, error: err.message || 'Worker processing failed' },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};