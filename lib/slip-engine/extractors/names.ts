/**
 * lib/slip-engine/extractors/names.ts
 *
 * Config-driven Sender and Receiver Name Extractor for Thai bank slips.
 * Implements bank-specific layout strategies:
 * 1. PAIRED_HEADER (BBL, SCB)
 * 2. ACCOUNT_RELATIVE (K PLUS)
 * 3. GWALLET_TUNGNGERN (Paotang)
 * 4. LABEL_BASED (Traditional From/To)
 */

import { NameRuleConfig } from '../types';
import { KNOWN_BANKS } from './accounts';

export function extractNames(
  text: string,
  accountIndices: number[],
  config: NameRuleConfig,
  matchedRules: Record<string, string>
): { senderName: string | null; receiverName: string | null } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let senderName: string | null = null;
  let receiverName: string | null = null;

  const strategy = config.strategy;

  // -------------------------------------------------------------
  // STRATEGY 1: PAIRED_HEADER (BBL / SCB)
  // -------------------------------------------------------------
  if (strategy === 'PAIRED_HEADER' || strategy === 'HYBRID') {
    const fromIdx = lines.findIndex((l) => /^(จาก|from|ผู้โอน)(?:[\s:=]|$|\b)/i.test(l));
    const toIdx = lines.findIndex((l) => /^(ไปยัง|ไปที่|เข้าบัญชี|to)(?:[\s:=]|$|\b)/i.test(l));
    const maxGap = config.pairedHeaderMaxGap || 2;
    const isPairedHeader = fromIdx !== -1 && toIdx !== -1 && Math.abs(fromIdx - toIdx) <= maxGap;

    if (isPairedHeader) {
      const startIndex = Math.max(fromIdx, toIdx) + 1;
      const candidates: string[] = [];

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        if (/^(จำนวนเงิน|ค่าธรรมเนียม|รหัสอ้างอิง|หมายเลขอ้างอิง|เลขที่อ้างอิง|amount)/i.test(line)) break;

        const isAccountOrService = /^[0-9xX*#\-\s]+$/.test(line) || /promptpay|พร้อมเพย์|biller\s*id|รหัสร้านค้า|รหัสธุรกรรม|เลขที่อ้างอิง/i.test(line);
        const isBank = KNOWN_BANKS.some((b) => b.regex.test(line));
        if (!isAccountOrService && !isBank && line.length >= 2) {
          candidates.push(line);
        }
      }

      if (candidates.length >= 1) {
        senderName = candidates[0];
        matchedRules['sender_name'] = `Matched sender (paired layout): "${senderName}"`;
      }
      if (candidates.length >= 2) {
        receiverName = candidates[1];
        matchedRules['receiver_name'] = `Matched receiver (paired layout): "${receiverName}"`;
      }
    }
  }

  // -------------------------------------------------------------
  // STRATEGY 2: GWALLET_TUNGNGERN (Paotang)
  // -------------------------------------------------------------
  if (strategy === 'GWALLET_TUNGNGERN' || strategy === 'HYBRID') {
    // Sender: line above G-Wallet ID
    if (!senderName) {
      const gwalletIdx = lines.findIndex((l) => /g-wallet\s*id|wallet\s*id/i.test(l));
      if (gwalletIdx > 0) {
        for (let k = gwalletIdx - 1; k >= Math.max(0, gwalletIdx - 3); k--) {
          const line = lines[k];
          if (/^(g|wallet|โอนเงิน|ทำรายการสำเร็จ|รหัสอ้างอิง|\d{1,2}\s*(?:ม\.ค|ก\.พ|มี\.ค|ต\.ค))/i.test(line)) continue;
          if (line.length >= 2 && !/^[0-9xX*#\-:\s]+$/.test(line)) {
            senderName = line;
            matchedRules['sender_name'] = `Matched sender above G-Wallet ID: "${line}"`;
            break;
          }
        }
      }
    }

    // Receiver: Tungngern merchant line below "ถุงเงิน"
    if (!receiverName) {
      const tungngernIdx = lines.findIndex((l) => /^(ถุงเงิน|tung\s*ngern)/i.test(l));
      if (tungngernIdx !== -1) {
        for (let k = tungngernIdx + 1; k < Math.min(tungngernIdx + 4, lines.length); k++) {
          const candidate = lines[k].trim();
          if (/^(จำนวนเงิน|ค่าสินค้า|ค่าธรรมเนียม|รหัสอ้างอิง|สิทธิ)/i.test(candidate)) break;
          const isNotName = /^[0-9xX*#\-\s]+$/.test(candidate) || /promptpay|พร้อมเพย์|g-wallet/i.test(candidate);
          if (!isNotName && candidate.length >= 2) {
            receiverName = candidate;
            matchedRules['receiver_name'] = `Matched Tungngern merchant: "${candidate}"`;
            break;
          }
        }
      }
    }
  }

  // -------------------------------------------------------------
  // STRATEGY 3: ACCOUNT_RELATIVE (K PLUS)
  // -------------------------------------------------------------
  if (strategy === 'ACCOUNT_RELATIVE' || strategy === 'HYBRID') {
    const accConfig = config.accountRelative || {
      senderLookbackLines: 3,
      receiverLookbackLines: 3,
      merchantLookaheadLines: 4,
    };

    // Sender: Look upwards from Account 1
    if (!senderName && accountIndices.length > 0) {
      const firstAccIdx = accountIndices[0];
      for (let k = firstAccIdx - 1; k >= Math.max(0, firstAccIdx - (accConfig.senderLookbackLines || 3)); k--) {
        const l = lines[k];
        if (/^(โอนเงินสำเร็จ|ชำระเงินสำเร็จ|k\+|สำเร็จ|รายการสำเร็จ|\d{1,2}\s*(?:ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย|ต\.ค|พ\.ย|ธ\.ค))/i.test(l)) continue;
        if (KNOWN_BANKS.some((b) => b.regex.test(l))) continue;
        if (l.length >= 2 && !/^[0-9xX*#\-:\s]+$/.test(l)) {
          senderName = l;
          matchedRules['sender_name'] = `Matched sender above 1st account: "${l}"`;
          break;
        }
      }
    }

    // Receiver:
    // If 2 accounts -> Person transfer: look upwards from Account 2
    // If 1 account -> Merchant QR: look downwards from Account 1
    if (!receiverName && accountIndices.length > 0) {
      if (accountIndices.length >= 2) {
        const firstAccIdx = accountIndices[0];
        const secondAccIdx = accountIndices[1];
        for (let k = secondAccIdx - 1; k >= Math.max(firstAccIdx + 1, secondAccIdx - (accConfig.receiverLookbackLines || 3)); k--) {
          const l = lines[k];
          if (/^(k\+|verified)/i.test(l)) continue;
          if (KNOWN_BANKS.some((b) => b.regex.test(l))) continue;
          if (l.length >= 2 && !/^[0-9xX*#\-:\s]+$/.test(l)) {
            receiverName = l;
            matchedRules['receiver_name'] = `Matched receiver above 2nd account: "${l}"`;
            break;
          }
        }
      } else if (accountIndices.length === 1) {
        const firstAccIdx = accountIndices[0];
        for (let k = firstAccIdx + 1; k < Math.min(firstAccIdx + 1 + (accConfig.merchantLookaheadLines || 4), lines.length); k++) {
          const l = lines[k];
          if (/^(จำนวน|ค่าธรรมเนียม|ยอดเงิน|amount|fee|เลขที่รายการ|ref)/i.test(l)) break;
          if (/^[0-9xX*#\-:\s]+$/.test(l)) continue;
          if (KNOWN_BANKS.some((b) => b.regex.test(l))) continue;
          if (l.length >= 2) {
            receiverName = l;
            matchedRules['receiver_name'] = `Matched merchant below 1st account: "${l}"`;
            break;
          }
        }
      }
    }
  }

  // -------------------------------------------------------------
  // STRATEGY 4: LABEL_BASED (Traditional Fallback)
  // -------------------------------------------------------------
  // From / จาก / ผู้โอน
  if (!senderName) {
    const fromIdx = lines.findIndex((l) => /^(จาก|from|ผู้โอน)(?:[\s:=]|$|\b)/i.test(l));
    if (fromIdx !== -1) {
      const fromLine = lines[fromIdx].replace(/^(จาก|from|ผู้โอน)\s*[:=]?/i, '').trim();
      if (fromLine.length >= 2 && !/^[0-9xX*#\-:\s]+$/.test(fromLine) && !KNOWN_BANKS.some((b) => b.regex.test(fromLine))) {
        senderName = fromLine;
        matchedRules['sender_name'] = `Matched sender same line: "${fromLine}"`;
      } else {
        for (let k = fromIdx + 1; k < Math.min(fromIdx + 4, lines.length); k++) {
          const line = lines[k];
          if (/^(ไปยัง|ไปที่|เข้าบัญชี|to|จำนวนเงิน|amount)(?:[\s:=]|$|\b)/i.test(line)) break;
          if (KNOWN_BANKS.some((b) => b.regex.test(line))) continue;
          if (line.length >= 2 && !/^[0-9xX*#\-:\s]+$/.test(line)) {
            senderName = line;
            matchedRules['sender_name'] = `Matched sender below From: "${line}"`;
            break;
          }
        }
      }
    }
  }

  // To / ไปยัง / ไปที่ / ผู้รับ
  if (!receiverName) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/(?:ไปยัง|ไปที่|เข้าบัญชี|ผู้รับ(?:เงิน)?|(?:\bto\b))(?:[\s:=]|$|\b)\s*[:=]?\s*(.*)/i);
      if (match) {
        let candidate = match[1].trim();
        if (!candidate || candidate.length < 2) {
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const nextLine = lines[j].trim();
            if (/^(จำนวนเงิน|amount|ค่าธรรมเนียม)/i.test(nextLine)) break;
            const isNotName = /^[0-9xX*#\-\s]+$/.test(nextLine) || /promptpay|พร้อมเพย์/i.test(nextLine);
            if (!isNotName && nextLine.length >= 2) {
              candidate = nextLine;
              break;
            }
          }
        }
        if (candidate && !/^[0-9xX*#\-\s]+$/.test(candidate) && !/promptpay|พร้อมเพย์/i.test(candidate)) {
          receiverName = candidate;
          matchedRules['receiver_name'] = `Matched receiver: "${candidate}"`;
          break;
        }
      }
    }
  }

  return { senderName, receiverName };
}
