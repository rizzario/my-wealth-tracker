/**
 * lib/slip-engine/extractors/amount.ts
 *
 * Config-driven Amount Extractor for Thai bank slips.
 * Applies template-specific subsidy/discount rules, labels, and currency patterns.
 */

import { AmountRuleConfig } from '../types';

export function extractAmount(
  text: string,
  config: AmountRuleConfig | undefined,
  matchedRules: Record<string, string>
): number | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Strategy 1: Government Co-pay / Subsidy (e.g. Paotang ไทยช่วยไทย, คนละครึ่ง)
  if (config?.subsidyDiscountEnabled || /(?:จำนวนเงินที่ชำระ|ยอดชำระจริง|ยอดสุทธิ|net\s*paid)/i.test(text)) {
    const currencyLines = lines.filter(
      (l) => /(?:บาท|thb|฿)/i.test(l) && !/ค่าธรรมเนียม|fee|คงเหลือ/i.test(l)
    );
    const hasDiscountLine = currencyLines.some((l) => /^[-–—]|[-–—]\s*[0-9]/.test(l));
    if (hasDiscountLine && currencyLines.length >= 2) {
      for (let i = currencyLines.length - 1; i >= 0; i--) {
        const cl = currencyLines[i];
        if (!/^[-–—]|[-–—]\s*[0-9]/.test(cl)) {
          const m = cl.match(/([0-9,]+(?:\.[0-9]{2})?)\s*(?:บาท|thb)/i) || cl.match(/฿\s*([0-9,]+(?:\.[0-9]{2})?)/);
          if (m) {
            const val = parseFloat(m[1].replace(/,/g, ''));
            if (!isNaN(val) && val > 0) {
              matchedRules['amount'] = `Subsidy / Net Paid amount detected: "${cl}" -> ${val}`;
              return val;
            }
          }
        }
      }
    }
  }

  // Strategy 2: Same-line labeled amount
  const labels = config?.labels && config.labels.length > 0
    ? config.labels.join('|')
    : 'จำนวนเงินที่ชำระ|จำนวนเงิน|ยอดโอน|ยอดเงิน|amount|total';
  const sameLineRegex = new RegExp(`(?:${labels})\\s*[:=]?\\s*([0-9,]+(?:\\.[0-9]{2})?)`, 'i');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/ค่าธรรมเนียม|fee|^[-–—]|[-–—]\s*[0-9]/i.test(line)) continue;

    const match = line.match(sameLineRegex);
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        matchedRules['amount'] = `Same-line labeled: "${line}" -> ${val}`;
        return val;
      }
    }
  }

  // Strategy 3: Multi-line label followed by currency amount on subsequent line
  const labelHeaderRegex = new RegExp(`^(?:${labels})\\s*[:=]?$`, 'i');
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (labelHeaderRegex.test(line)) {
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const nextLine = lines[j];
        if (/ค่าธรรมเนียม|fee/i.test(nextLine)) break;
        const numMatch = nextLine.match(/^([0-9,]+(?:\.[0-9]{2})?)(?:\s*(?:บาท|thb|th|฿))?$/i)
          || nextLine.match(/([0-9,]+(?:\.[0-9]{2})?)/);
        if (numMatch) {
          const val = parseFloat(numMatch[1].replace(/,/g, ''));
          if (!isNaN(val) && val > 0) {
            matchedRules['amount'] = `Multi-line labeled: "${line}" + "${nextLine}" -> ${val}`;
            return val;
          }
        }
      }
    }
  }

  // Strategy 4: Explicit currency unit suffix (e.g. "500.00 บาท", "1,250.00 THB")
  const currencySuffixRegex = /([0-9,]+(?:\.[0-9]{2})?)\s*(?:บาท|thb|฿)/i;
  for (const line of lines) {
    if (/ค่าธรรมเนียม|fee|คงเหลือ|เลขที่|รหัส|ref|^[-–—]/i.test(line)) continue;
    const match = line.match(currencySuffixRegex);
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        matchedRules['amount'] = `Currency suffix: "${line}" -> ${val}`;
        return val;
      }
    }
  }

  // Strategy 5: Standalone decimal amount
  const standaloneDecimalRegex = /^([0-9,]+\.[0-9]{2})$/;
  for (const line of lines) {
    if (/ค่าธรรมเนียม|fee|คงเหลือ|ref|รหัส/i.test(line)) continue;
    const match = line.match(standaloneDecimalRegex);
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        matchedRules['amount'] = `Standalone decimal: "${line}" -> ${val}`;
        return val;
      }
    }
  }

  return null;
}
