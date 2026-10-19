/**
 * lib/slip-engine/extractors/accounts.ts
 *
 * Config-driven Account Extractor for Thai bank slips.
 * Handles masked account digits (x, X, *, #), G-Wallet IDs, and bank logo detection.
 */

import { AccountRuleConfig, BankCode } from '../types';

export const KNOWN_BANKS: { code: BankCode; name: string; regex: RegExp }[] = [
  { code: 'KBANK', name: 'กสิกรไทย', regex: /(?:กสิกรไทย|kbank|k\s*plus|k\+|kasikorn)/i },
  { code: 'SCB', name: 'ไทยพาณิชย์', regex: /(?:ไทยพาณิชย์|scb|scb\s*easy|siam\s*commercial)/i },
  { code: 'BBL', name: 'กรุงเทพ', regex: /(?:ธนาคารกรุงเทพ|bangkok\s*bank|\bbbl\b|bualuang|บัวหลวง)/i },
  { code: 'KTB', name: 'กรุงไทย', regex: /(?:กรุงไทย|ktb|krungthai)/i },
  { code: 'BAY', name: 'กรุงศรี', regex: /(?:กรุงศรี|bay|krungsri)/i },
  { code: 'TTB', name: 'ทีทีบี (ทหารไทยธนชาต)', regex: /(?:ทีทีบี|ttb|tmb|thanachart)/i },
  { code: 'GSB', name: 'ออมสิน', regex: /(?:ออมสิน|gsb)/i },
  { code: 'PROMPTPAY', name: 'พร้อมเพย์', regex: /(?:พร้อมเพย์|promptpay)/i },
  { code: 'TRUEMONEY', name: 'ทรูมันนี่', regex: /(?:ทรูมันนี่|truemoney|true\s*wallet)/i },
  { code: 'PAOTANG', name: 'เป๋าตัง (G-Wallet)', regex: /(?:เป๋าตัง|g-wallet|paotang)/i },
  { code: 'TUNGNGERN', name: 'ถุงเงิน', regex: /(?:ถุงเงิน|tung\s*ngern)/i },
];

export function extractAccounts(
  text: string,
  config: AccountRuleConfig | undefined,
  matchedRules: Record<string, string>
): { senderAccount: string | null; receiverAccount: string | null; accountIndices: number[] } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const accountsFound: string[] = [];
  const accountIndices: number[] = [];

  // G-Wallet ID check (Paotang)
  if (config?.gwalletEnabled || /g-wallet|paotang/i.test(text)) {
    const gwalletIdx = lines.findIndex((l) => /g-wallet\s*id|wallet\s*id/i.test(l));
    if (gwalletIdx !== -1) {
      let walletId = lines[gwalletIdx].replace(/g-wallet\s*id\s*[:=]?/i, '').trim();
      for (let k = gwalletIdx + 1; k < Math.min(gwalletIdx + 4, lines.length); k++) {
        const candidate = lines[k].trim();
        if (/^[*xX0-9\s]+$/.test(candidate) && candidate.length > 0) {
          walletId = (walletId ? walletId + ' ' : '') + candidate;
        } else {
          break;
        }
      }
      if (walletId && walletId.length >= 4) {
        accountsFound.push(walletId);
        accountIndices.push(gwalletIdx);
      }
    }
  }

  // Account Mask Pattern Matching
  const defaultAccRegex = /([0-9xX*#]{2,5}[-\s][0-9xX*#]{1,5}[-\s]?[0-9xX*#\-]*(?:[0-9]{3,4}|[0-9xX*#]+))/;
  const patterns = config?.maskPatterns && config.maskPatterns.length > 0
    ? config.maskPatterns.map((p) => new RegExp(p))
    : [defaultAccRegex];

  lines.forEach((line, idx) => {
    // Skip dates or transaction ref numbers
    if (/\d{4}-\d{2}-\d{2}|ref|รหัส|\d{1,2}\s*(?:ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย|ต\.ค|พ\.ย|ธ\.ค)|25[56789]\d|\d{2}:\d{2}/i.test(line)) return;

    for (const pat of patterns) {
      const match = line.match(pat);
      if (match) {
        const clean = match[1].trim();
        if (clean.length >= 6 && !accountsFound.includes(clean)) {
          accountsFound.push(clean);
          accountIndices.push(idx);
          break;
        }
      }
    }
  });

  const senderAccount = accountsFound[0] || null;
  const receiverAccount = accountsFound[1] || null;

  if (senderAccount) matchedRules['sender_account'] = `Found sender account: ${senderAccount}`;
  if (receiverAccount) matchedRules['receiver_account'] = `Found receiver account: ${receiverAccount}`;

  return { senderAccount, receiverAccount, accountIndices };
}

export function extractBanks(
  text: string,
  accountIndices: number[],
  intraBankSupported: boolean | undefined,
  matchedRules: Record<string, string>
): { senderBank: string | null; receiverBank: string | null } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let senderBank: string | null = null;
  let receiverBank: string | null = null;

  // Paired header support (BBL, SCB)
  const fromIdx = lines.findIndex((l) => /^(จาก|from|ผู้โอน)(?:[\s:=]|$|\b)/i.test(l));
  const toIdx = lines.findIndex((l) => /^(ไปยัง|ไปที่|เข้าบัญชี|to)(?:[\s:=]|$|\b)/i.test(l));
  const isPairedHeader = fromIdx !== -1 && toIdx !== -1 && Math.abs(fromIdx - toIdx) <= 2;

  if (isPairedHeader) {
    const startIndex = Math.max(fromIdx, toIdx) + 1;
    const bankHits: string[] = [];
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (/^(จำนวนเงิน|ค่าธรรมเนียม|รหัสอ้างอิง|หมายเลขอ้างอิง|เลขที่อ้างอิง|amount)/i.test(line)) break;
      for (const b of KNOWN_BANKS) {
        if (b.regex.test(line)) {
          bankHits.push(b.code);
          break;
        }
      }
    }
    if (bankHits.length >= 1) {
      senderBank = bankHits[0];
      matchedRules['sender_bank'] = `Matched 1st bank in paired layout: ${bankHits[0]}`;
    }
    if (bankHits.length >= 2) {
      receiverBank = bankHits[1];
      matchedRules['receiver_bank'] = `Matched 2nd bank in paired layout: ${bankHits[1]}`;
    }
  }

  // Account-relative bank detection (K PLUS intra-bank KBANK to KBANK)
  if (!receiverBank && accountIndices.length >= 2) {
    const secondAccIdx = accountIndices[1];
    for (let k = Math.max(0, secondAccIdx - 2); k <= Math.min(lines.length - 1, secondAccIdx + 2); k++) {
      if (k === secondAccIdx) continue;
      for (const b of KNOWN_BANKS) {
        if (b.regex.test(lines[k])) {
          receiverBank = b.code;
          matchedRules['receiver_bank'] = `Matched receiver bank near 2nd account: ${b.code}`;
          break;
        }
      }
      if (receiverBank) break;
    }
  }

  // Sequential Fallback
  if (!senderBank || !receiverBank) {
    for (const line of lines) {
      for (const b of KNOWN_BANKS) {
        if (b.regex.test(line)) {
          if (!senderBank) {
            senderBank = b.code;
            matchedRules['sender_bank'] = `Sequential 1st bank: ${b.code}`;
          } else if (!receiverBank && (intraBankSupported || senderBank !== b.code)) {
            receiverBank = b.code;
            matchedRules['receiver_bank'] = `Sequential 2nd bank: ${b.code}`;
          }
        }
      }
    }
  }

  return { senderBank, receiverBank };
}
