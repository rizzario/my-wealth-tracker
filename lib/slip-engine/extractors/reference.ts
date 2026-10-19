/**
 * lib/slip-engine/extractors/reference.ts
 *
 * Config-driven Reference / Transaction ID Extractor for Thai bank slips.
 * Handles multi-line lookaheads, ignores fee/currency intermediate lines,
 * strips trailing concatenated bank names, and accepts alphanumeric transaction codes.
 */

import { ReferenceRuleConfig } from '../types';
import { KNOWN_BANKS } from './accounts';

export function extractReferenceNumber(
  text: string,
  config: ReferenceRuleConfig | undefined,
  matchedRules: Record<string, string>
): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let bestRef: string | null = null;

  const defaultLabels = ['รหัสอ้างอิง', 'เลขที่อ้างอิง', 'หมายเลขอ้างอิง', 'เลขที่รายการ', 'รหัสธุรกรรม', 'transaction\\s*id', 'ref(?:\\s*no\\.?)?'];
  const labels = config?.labels && config.labels.length > 0 ? config.labels : defaultLabels;
  const labelRegex = new RegExp(`(?:${labels.join('|')})`, 'i');
  const labelPrefixRegex = new RegExp(`^(?:${labels.join('|')})\\s*[:=]?\\s*`, 'i');

  const lookahead = config?.lookaheadLines !== undefined ? config.lookaheadLines : 3;
  const skipPatterns = config?.skipPatterns || ['ค่าธรรมเนียม', 'บาท', 'thb', 'จำนวน', 'fee'];
  const skipRegex = new RegExp(`^(?:[0-9,.]+\\s*(?:บาท|thb)|${skipPatterns.join('|')})`, 'i');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (labelRegex.test(line)) {
      // 1. Same-line check
      const sameLine = line.replace(labelPrefixRegex, '').trim();
      const mSame = sameLine.match(/^([A-Za-z0-9\-_]{6,40})/);
      if (mSame) {
        if (!bestRef || mSame[1].length > bestRef.length) bestRef = mSame[1];
        if (bestRef.length >= 15) break;
      }

      // 2. Multi-line lookahead
      for (let j = i + 1; j < Math.min(i + 1 + lookahead, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (skipRegex.test(nextLine)) continue;

        let candidate = nextLine;
        if (config?.stripKnownBankNames !== false) {
          for (const b of KNOWN_BANKS) {
            candidate = candidate.replace(b.regex, '').trim();
          }
        }

        const mRef = candidate.match(/^([A-Za-z0-9\-_]{6,40})/);
        if (mRef && !/^(จำนวนเงิน|ค่าธรรมเนียม|จาก|ไปยัง|ไปที่|amount)/i.test(mRef[1])) {
          if (!bestRef || mRef[1].length > bestRef.length) bestRef = mRef[1];
          if (bestRef.length >= 15) break;
        }
      }
    }
  }

  if (bestRef) {
    matchedRules['reference_number'] = `Matched ref: ${bestRef}`;
    return bestRef;
  }

  // Global regex fallback
  const fallbackRegex = new RegExp(`(?:${labels.join('|')})\\s*[:=]?\\s*([A-Za-z0-9\\-_]{6,40})`, 'i');
  const match = text.match(fallbackRegex);
  if (match) {
    matchedRules['reference_number'] = `Matched ref fallback: ${match[1]}`;
    return match[1];
  }

  return null;
}
