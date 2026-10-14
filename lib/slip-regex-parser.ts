/**
 * lib/slip-regex-parser.ts
 *
 * Universal Regular Expression & Heuristic Parser for Thai Bank Transfer Slips.
 * Designed to process raw OCR text from:
 * - Apple Shortcuts (iOS "Extract Text from Image" Vision OCR)
 * - Mobile OCR (Google ML Kit / Expo Go)
 * - Cloud & Server OCR fallbacks
 *
 * ZERO runtime dependencies: 100% portable across Next.js (Server & Browser)
 * and React Native / Expo Go with SQLite local-first.
 */

export interface ParsedSlipRegexResult {
  amount: number | null;
  transaction_date: string | null; // ISO format: YYYY-MM-DDTHH:mm:ss
  parsed_date_display: string | null; // Human-readable date
  parsed_time_display: string | null; // Human-readable time
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  category: string;
  sender_bank: string | null;
  sender_account_masked: string | null;
  sender_name: string | null;
  receiver_bank: string | null;
  receiver_account_masked: string | null;
  receiver_name: string | null;
  memo: string | null;
  reference_number: string | null;
  confidence_score: number; // 0.0 - 1.0
  matched_rules: Record<string, string>; // Debug tracing of which regex matched
  raw_text: string;
}

// Thai Month Mapping to 2-digit month string ('01' - '12')
const THAI_MONTH_MAP: Record<string, string> = {
  'ม.ค.': '01',
  'มกราคม': '01',
  'ก.พ.': '02',
  'กุมภาพันธ์': '02',
  'มี.ค.': '03',
  'มีนาคม': '03',
  'เม.ย.': '04',
  'เมษายน': '04',
  'พ.ค.': '05',
  'พฤษภาคม': '05',
  'มิ.ย.': '06',
  'มิถุนายน': '06',
  'ก.ค.': '07',
  'กรกฎาคม': '07',
  'ส.ค.': '08',
  'สิงหาคม': '08',
  'ก.ย.': '09',
  'กันยายน': '09',
  'ต.ค.': '10',
  'ตุลาคม': '10',
  'พ.ย.': '11',
  'พฤศจิกายน': '11',
  'ธ.ค.': '12',
  'ธันวาคม': '12',
  // English months fallback
  'jan': '01', 'january': '01',
  'feb': '02', 'february': '02',
  'mar': '03', 'march': '03',
  'apr': '04', 'april': '04',
  'may': '05',
  'jun': '06', 'june': '06',
  'jul': '07', 'july': '07',
  'aug': '08', 'august': '08',
  'sep': '09', 'september': '09',
  'oct': '10', 'october': '10',
  'nov': '11', 'november': '11',
  'dec': '12', 'december': '12',
};

// Known Bank signatures
interface BankPattern {
  code: string;
  name: string;
  regex: RegExp;
}

const KNOWN_BANKS: BankPattern[] = [
  { code: 'KBANK', name: 'กสิกรไทย', regex: /(?:กสิกรไทย|kbank|k\s*plus|kasikorn)/i },
  { code: 'SCB', name: 'ไทยพาณิชย์', regex: /(?:ไทยพาณิชย์|scb|scb\s*easy|siam\s*commercial)/i },
  { code: 'BBL', name: 'กรุงเทพ', regex: /(?:ธนาคารกรุงเทพ|กรุงเทพ|bangkok\s*bank|bbl)/i },
  { code: 'KTB', name: 'กรุงไทย', regex: /(?:กรุงไทย|krungthai|ktb|เป๋าตัง)/i },
  { code: 'BAY', name: 'กรุงศรีอยุธยา', regex: /(?:กรุงศรีอยุธยา|กรุงศรี|krungsri|bay|kma)/i },
  { code: 'TTB', name: 'ทหารไทยธนชาต', regex: /(?:ทหารไทยธนชาต|ทีทีบี|ttb|ttb\s*touch|tmb|thanachart)/i },
  { code: 'GSB', name: 'ออมสิน', regex: /(?:ออมสิน|gsb|mymo)/i },
  { code: 'TRUEMONEY', name: 'ทรูมันนี่', regex: /(?:ทรูมันนี่|truemoney|true\s*money|tmn)/i },
  { code: 'PROMPTPAY', name: 'พร้อมเพย์', regex: /(?:พร้อมเพย์|promptpay)/i },
  { code: 'DIME', name: 'ไดม์ (เกียรตินาคินภัทร)', regex: /(?:dime|เกียรตินาคินภัทร|kkp)/i },
  { code: 'UOB', name: 'ยูโอบี', regex: /(?:ยูโอบี|uob|tmrw)/i },
  { code: 'CIMB', name: 'ซีไอเอ็มบี', regex: /(?:ซีไอเอ็มบี|cimb)/i },
  { code: 'LHBANK', name: 'แลนด์ แอนด์ เฮ้าส์', regex: /(?:แลนด์\s*แอนด์\s*เฮ้าส์|lh\s*bank)/i },
  { code: 'INNOVESTX', name: 'อินโนเวสท์ เอกซ์', regex: /(?:innovestx|invx)/i },
  { code: 'SHOPEEPAY', name: 'ช้อปปี้เพย์', regex: /(?:shopeepay|shopee\s*pay)/i },
];

// Keyword Rules for Auto Category Assignment
interface CategoryKeywordRule {
  category: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  keywords: string[];
}

const CATEGORY_RULES: CategoryKeywordRule[] = [
  {
    category: 'ชำระค่าบัตรเครดิต',
    type: 'TRANSFER',
    keywords: [
      'ชำระค่าบัตรเครดิต', 'ชำระบัตร', 'บัตรเครดิต', 'credit card', 'ktc', 'cardx',
      'aeon', 'central the 1', 'first choice', 'เฟิร์สช้อยส์', 'citibank', 'uob credit'
    ],
  },
  {
    category: 'โอนเงินระหว่างบัญชี',
    type: 'TRANSFER',
    keywords: ['โอนเงินระหว่างบัญชี', 'โอนให้ตัวเอง', 'โอนเข้าบัญชีตนเอง', 'ออมเงินตนเอง'],
  },
  {
    category: 'อาหาร & เครื่องดื่ม',
    type: 'EXPENSE',
    keywords: [
      'อาหาร', 'กาแฟ', 'cafe', 'coffee', 'อเมซอน', 'amazon', 'starbucks', 'เต่าบิน',
      'ชาตรามือ', 'สุกี้', 'ตี๋น้อย', 'mk', 'kfc', 'mcdonald', 'bar b q', 'หมูกระทะ',
      'ก๋วยเตี๋ยว', 'ข้าวมันไก่', 'ข้าวราดแกง', 'เบเกอรี่', 'bakery', 'restaurant',
      '7-eleven', 'เซเว่น', 'grabfood', 'lineman', 'foodpanda', 'shopeefood', 'น้ำดื่ม'
    ],
  },
  {
    category: 'เดินทาง & ค่าน้ำมัน',
    type: 'EXPENSE',
    keywords: [
      'ปั๊ม', 'น้ำมัน', 'ptt', 'ปตท', 'บางจาก', 'shell', 'caltex', 'esso', 'susco',
      'ทางด่วน', 'easy pass', 'm-pass', 'm-flow', 'bts', 'mrt', 'แอร์พอร์ตลิงก์',
      'รถไฟฟ้า', 'แท็กซี่', 'taxi', 'grab', 'bolt', 'line man taxi', 'ที่จอดรถ', 'ค่าจอด'
    ],
  },
  {
    category: 'ช้อปปิ้ง & ของใช้',
    type: 'EXPENSE',
    keywords: [
      'shopee', 'lazada', 'tiktok shop', 'uniqlo', 'zara', 'h&m', 'muji',
      'big c', 'lotus', 'cj express', 'tops', 'gourmet', 'watson', 'boots',
      'homepro', 'ikea', 'decathlon', 'mr.diy', 'ของใช้', 'เสื้อผ้า', 'อุปกรณ์'
    ],
  },
  {
    category: 'ค่าน้ำ / ค่าไฟ / อินเทอร์เน็ต',
    type: 'EXPENSE',
    keywords: [
      'กฟน', 'mea', 'กฟภ', 'pea', 'การไฟฟ้า', 'กปน', 'mwa', 'กปภ', 'pwa', 'การประปา',
      'ais', 'true', 'dtac', '3bb', 'nt', 'tot', 'cat', 'ค่าเน็ต', 'ค่าไฟ', 'ค่าน้ำ', 'ค่าโทรศัพท์'
    ],
  },
  {
    category: 'ที่พัก & ค่าเช่า',
    type: 'EXPENSE',
    keywords: ['ค่าเช่า', 'ค่าหอ', 'นิติบุคคล', 'คอนโด', 'ส่วนกลาง', 'หมู่บ้าน', 'rent', 'condo'],
  },
  {
    category: 'สุขภาพ & ยารักษาโรค',
    type: 'EXPENSE',
    keywords: [
      'โรงพยาบาล', 'รพ.', 'คลินิก', 'ทันตกรรม', 'ทำฟัน', 'ยา', 'เภสัช', 'pharmacy',
      'ตรวจสุขภาพ', 'แล็บ', 'lab', 'แว่นตา', 'ฟิตเนส', 'fitness'
    ],
  },
  {
    category: 'ประกันภัย',
    type: 'EXPENSE',
    keywords: [
      'aia', 'muang thai life', 'เมืองไทยประกัน', 'fwd', 'allianz', 'กรุงเทพประกันภัย',
      'ทิพยประกันภัย', 'วิริยะ', 'ประกันสุขภาพ', 'ประกันชีวิต', 'ประกันรถยนต์'
    ],
  },
  {
    category: 'ความบันเทิง & สตรีมมิ่ง',
    type: 'EXPENSE',
    keywords: [
      'netflix', 'spotify', 'youtube', 'disney', 'apple', 'google play', 'major',
      'sf cinema', 'ดูหนัง', 'คอนเสิร์ต', 'เกม', 'steam', 'playstation'
    ],
  },
  {
    category: 'เงินเดือน (Salary)',
    type: 'INCOME',
    keywords: ['เงินเดือน', 'salary', 'payroll', 'ค่าจ้าง'],
  },
  {
    category: 'ดอกเบี้ยเงินฝาก',
    type: 'INCOME',
    keywords: ['ดอกเบี้ย', 'interest', 'ดอกเบี้ยเงินฝาก'],
  },
];

/**
 * Clean & normalize OCR text to avoid common optical character recognition pitfalls:
 * - Unifies spaces and line breaks
 * - Fixes common Thai OCR tone mark floating
 * - Cleans comma/period confusions where detectable
 */
export function normalizeOcrText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove zero-width spaces
    .replace(/[ \t]+/g, ' ') // collapse horizontal spaces
    .trim();
}

/**
 * Extract Amount from slip text.
 * Prioritizes explicit labels like "จำนวนเงิน", "ยอดเงิน", "ยอดโอน", "Amount", "THB".
 * Carefully filters out Fee (ค่าธรรมเนียม: 0.00) and Balance figures.
 */
export function extractAmount(text: string, matchedRules: Record<string, string>): number | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Pattern 1: Same line labeled amount (e.g. "จำนวนเงิน 150.00 บาท", "Amount: 1,250.00 THB")
  const sameLineRegex = /(?:จำนวนเงิน|ยอดโอน|ยอดเงิน|amount|total)\s*[:=]?\s*([0-9,]+\.[0-9]{2})/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip fee lines
    if (/ค่าธรรมเนียม|fee/i.test(line)) continue;

    const match = line.match(sameLineRegex);
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        matchedRules['amount'] = `Labeled same line: "${line}" -> ${val}`;
        return val;
      }
    }
  }

  // Pattern 2: Multi-line label followed by amount on the next line
  // Line i: "จำนวนเงิน" or "จำนวนเงิน (บาท)" or "Amount (THB)"
  // Line i+1: "150.00" or "1,250.00 บาท"
  for (let i = 0; i < lines.length - 1; i++) {
    const curr = lines[i];
    if (/ค่าธรรมเนียม|fee|คงเหลือ|balance/i.test(curr)) continue;

    if (/(?:จำนวนเงิน|ยอดเงิน|ยอดโอน|amount|total)/i.test(curr)) {
      const nextLine = lines[i + 1];
      const match = nextLine.match(/^([0-9,]+\.[0-9]{2})(?:\s*(?:บาท|thb))?$/i) ||
                    nextLine.match(/([0-9,]+\.[0-9]{2})/);
      if (match) {
        const val = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) {
          matchedRules['amount'] = `Multi-line labeled: "${curr}" + "${nextLine}" -> ${val}`;
          return val;
        }
      }
    }
  }

  // Pattern 3: Explicit currency suffix or prefix (e.g. "150.00 บาท", "฿150.00", "1,200.00 THB")
  const suffixRegex = /(?:฿\s*([0-9,]+\.[0-9]{2}))|([0-9,]+\.[0-9]{2})\s*(?:บาท|thb)/i;
  for (const line of lines) {
    if (/ค่าธรรมเนียม|fee|คงเหลือ|balance/i.test(line)) continue;
    const match = line.match(suffixRegex);
    if (match) {
      const rawNum = match[1] || match[2];
      const val = parseFloat(rawNum.replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        matchedRules['amount'] = `Currency symbol/suffix: "${line}" -> ${val}`;
        return val;
      }
    }
  }

  // Pattern 4: Fallback - look for positive decimal with 2 decimal places that isn't 0.00
  // and doesn't collide with dates/account numbers
  const decimalCandidates: { val: number; line: string }[] = [];
  for (const line of lines) {
    if (/ค่าธรรมเนียม|fee|คงเหลือ|balance/i.test(line)) continue;
    // Don't match account numbers with dashes or refs
    if (/ref|รหัสอ้างอิง|เลขที่รายการ|\d{4}-\d{2}-\d{2}/i.test(line)) continue;

    const matches = line.matchAll(/\b([0-9,]+\.[0-9]{2})\b/g);
    for (const m of matches) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        decimalCandidates.push({ val, line });
      }
    }
  }

  if (decimalCandidates.length > 0) {
    // Pick the highest candidate or first candidate
    const chosen = decimalCandidates[0];
    matchedRules['amount'] = `Fallback decimal match: "${chosen.line}" -> ${chosen.val}`;
    return chosen.val;
  }

  return null;
}

/**
 * Extract Date and Time from slip text.
 * Handles:
 * - Thai months: "14 ต.ค. 69 09:15 น.", "14 ต.ค. 2569", "14 ตุลาคม 2568"
 * - Numeric dates: "14/10/2569", "14-10-2026", "2026-10-14 12:45:00"
 * - Buddhist Era (พ.ศ.) -> Christian Era (ค.ศ.) conversion
 */
export function extractDateTime(
  text: string,
  matchedRules: Record<string, string>
): {
  iso: string | null;
  displayDate: string | null;
  displayTime: string | null;
} {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Time extractor helper (e.g. "09:15 น.", "09:15:30", "14.30 น.")
  const timeRegex = /(?:เวลา\s*)?([012]?\d)[:.]([0-5]\d)(?:[:.]([0-5]\d))?\s*(?:น\.?|hrs?)?/i;

  let foundYear: number | null = null;
  let foundMonth: string | null = null; // '01'-'12'
  let foundDay: string | null = null; // '01'-'31'
  let foundHour = '12';
  let foundMin = '00';
  let foundSec = '00';

  // Strategy 1: Thai text date with month name (e.g. "14 ต.ค. 69", "14 ต.ค. 2569", "14 ตุลาคม 2568")
  const thaiMonthKeys = Object.keys(THAI_MONTH_MAP).join('|').replace(/\./g, '\\.');
  const thaiDateRegex = new RegExp(
    `(\\d{1,2})\\s*(${thaiMonthKeys})\\s*(\\d{2,4})`,
    'i'
  );

  for (const line of lines) {
    const match = line.match(thaiDateRegex);
    if (match) {
      const rawDay = parseInt(match[1], 10);
      const rawMonth = match[2].toLowerCase();
      let rawYear = parseInt(match[3], 10);

      if (rawDay >= 1 && rawDay <= 31) {
        foundDay = String(rawDay).padStart(2, '0');
        foundMonth = THAI_MONTH_MAP[rawMonth] || '01';

        // Convert Buddhist Era to Christian Era
        if (rawYear > 2400) {
          foundYear = rawYear - 543;
        } else if (rawYear >= 50 && rawYear <= 99) {
          // 2-digit BE (e.g. 68 -> 2568 -> 2025, 69 -> 2569 -> 2026)
          foundYear = 2500 + rawYear - 543;
        } else if (rawYear < 50) {
          // 2-digit CE (e.g. 26 -> 2026)
          foundYear = 2000 + rawYear;
        } else {
          foundYear = rawYear;
        }

        matchedRules['date'] = `Thai month match in "${line}": Day=${foundDay}, Month=${foundMonth}, Year=${foundYear}`;

        // Look for time in the same or adjacent line
        const tMatch = line.match(timeRegex);
        if (tMatch) {
          foundHour = tMatch[1].padStart(2, '0');
          foundMin = tMatch[2].padStart(2, '0');
          if (tMatch[3]) foundSec = tMatch[3].padStart(2, '0');
          matchedRules['time'] = `Time matched in same line: "${line}" -> ${foundHour}:${foundMin}:${foundSec}`;
        }
        break;
      }
    }
  }

  // Strategy 2: Numeric date (e.g. "14/10/2569", "14-10-2026", "2026/10/14", "2026-10-14")
  if (!foundYear) {
    const slashDateRegex = /(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})/;
    for (const line of lines) {
      // Avoid matching reference numbers or accounts
      if (/ref|รหัส|xxx/i.test(line)) continue;

      const match = line.match(slashDateRegex);
      if (match) {
        const p1 = parseInt(match[1], 10);
        const p2 = parseInt(match[2], 10);
        const p3 = parseInt(match[3], 10);

        let y = 0, m = 0, d = 0;
        if (p1 > 1000) {
          // YYYY-MM-DD
          y = p1; m = p2; d = p3;
        } else if (p3 > 1000 || p3 >= 50) {
          // DD-MM-YYYY
          d = p1; m = p2; y = p3;
        }

        if (y > 2400) y -= 543;
        else if (y >= 50 && y <= 99) y = 2500 + y - 543;

        if (y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          foundYear = y;
          foundMonth = String(m).padStart(2, '0');
          foundDay = String(d).padStart(2, '0');
          matchedRules['date'] = `Numeric date match in "${line}": ${foundYear}-${foundMonth}-${foundDay}`;

          const tMatch = line.match(timeRegex);
          if (tMatch) {
            foundHour = tMatch[1].padStart(2, '0');
            foundMin = tMatch[2].padStart(2, '0');
            if (tMatch[3]) foundSec = tMatch[3].padStart(2, '0');
            matchedRules['time'] = `Time matched in same line: "${line}" -> ${foundHour}:${foundMin}:${foundSec}`;
          }
          break;
        }
      }
    }
  }

  // Strategy 3: Search for separate time if not found yet
  if (!matchedRules['time']) {
    for (const line of lines) {
      const tMatch = line.match(timeRegex);
      if (tMatch) {
        foundHour = tMatch[1].padStart(2, '0');
        foundMin = tMatch[2].padStart(2, '0');
        if (tMatch[3]) foundSec = tMatch[3].padStart(2, '0');
        matchedRules['time'] = `Time separate match in "${line}" -> ${foundHour}:${foundMin}:${foundSec}`;
        break;
      }
    }
  }

  if (foundYear && foundMonth && foundDay) {
    const iso = `${foundYear}-${foundMonth}-${foundDay}T${foundHour}:${foundMin}:${foundSec}`;
    const displayDate = `${foundYear}-${foundMonth}-${foundDay}`;
    const displayTime = `${foundHour}:${foundMin}`;
    return { iso, displayDate, displayTime };
  }

  return { iso: null, displayDate: null, displayTime: null };
}

/**
 * Detect Sender & Receiver Bank
 */
export function extractBanks(
  text: string,
  matchedRules: Record<string, string>
): { senderBank: string | null; receiverBank: string | null } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let senderBank: string | null = null;
  let receiverBank: string | null = null;

  // Check labeled sections: "จาก" (From) and "ไปยัง" / "เข้าบัญชี" (To)
  let currentSection: 'from' | 'to' | null = null;

  for (const line of lines) {
    if (/(?:จาก|from|ผู้โอน)/i.test(line)) {
      currentSection = 'from';
    } else if (/(?:ไปยัง|เข้าบัญชี|ผู้รับ|to\b|receiver)/i.test(line)) {
      currentSection = 'to';
    }

    for (const bank of KNOWN_BANKS) {
      if (bank.regex.test(line)) {
        if (currentSection === 'from' && !senderBank) {
          senderBank = bank.code;
          matchedRules['sender_bank'] = `Matched "${bank.name}" (${bank.code}) in From section: "${line}"`;
        } else if (currentSection === 'to' && !receiverBank) {
          receiverBank = bank.code;
          matchedRules['receiver_bank'] = `Matched "${bank.name}" (${bank.code}) in To section: "${line}"`;
        }
      }
    }
  }

  // Fallback: search all lines sequentially if banks not determined by section
  if (!senderBank || !receiverBank) {
    for (const line of lines) {
      for (const bank of KNOWN_BANKS) {
        if (bank.regex.test(line)) {
          if (!senderBank) {
            senderBank = bank.code;
            matchedRules['sender_bank'] = `Sequential 1st bank matched: ${bank.code} in "${line}"`;
          } else if (!receiverBank && senderBank !== bank.code) {
            receiverBank = bank.code;
            matchedRules['receiver_bank'] = `Sequential 2nd bank matched: ${bank.code} in "${line}"`;
          }
        }
      }
    }
  }

  return { senderBank, receiverBank };
}

/**
 * Extract Masked Account Numbers (e.g. xxx-x-x1234-x, 08x-xxx-5678)
 */
export function extractAccounts(
  text: string,
  matchedRules: Record<string, string>
): { senderAccount: string | null; receiverAccount: string | null } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Pattern for masked account numbers (with 'x' or 'X' or digits)
  const accRegex = /([0-9xX]{2,5}[-\s][0-9xX]{1,5}[-\s]?[0-9xX\-]*(?:[0-9]{3,4}|[0-9xX]+))/;
  const accountsFound: string[] = [];

  for (const line of lines) {
    // Avoid date patterns or reference numbers
    if (/\d{4}-\d{2}-\d{2}|ref|รหัส/i.test(line)) continue;

    const match = line.match(accRegex);
    if (match) {
      const clean = match[1].trim();
      // Ensure it contains at least 6 characters and has an 'x' or multiple digits
      if (clean.length >= 6 && !accountsFound.includes(clean)) {
        accountsFound.push(clean);
      }
    }
  }

  const senderAccount = accountsFound[0] || null;
  const receiverAccount = accountsFound[1] || null;

  if (senderAccount) matchedRules['sender_account'] = `Found: ${senderAccount}`;
  if (receiverAccount) matchedRules['receiver_account'] = `Found: ${receiverAccount}`;

  return { senderAccount, receiverAccount };
}

/**
 * Extract Reference Number / Transaction ID
 */
export function extractReferenceNumber(
  text: string,
  matchedRules: Record<string, string>
): string | null {
  const refRegex = /(?:รหัสอ้างอิง|เลขที่รายการ|transaction\s*id|ref(?:\s*no\.?)?)\s*[:=]?\s*([A-Za-z0-9\-_]{8,40})/i;
  const match = text.match(refRegex);
  if (match) {
    matchedRules['reference_number'] = `Matched ref: ${match[1]}`;
    return match[1];
  }
  return null;
}

/**
 * Extract Memo / Note (บันทึกช่วยจำ)
 */
export function extractMemo(
  text: string,
  matchedRules: Record<string, string>
): string | null {
  const memoRegex = /(?:บันทึกช่วยจำ|บันทึก|memo|note)\s*[:=]?\s*([^\n\r]+)/i;
  const match = text.match(memoRegex);
  if (match) {
    const cleaned = match[1].trim();
    if (cleaned && cleaned.length > 0 && !/^\s*[-_.]+\s*$/.test(cleaned)) {
      matchedRules['memo'] = `Matched memo: "${cleaned}"`;
      return cleaned;
    }
  }
  return null;
}

/**
 * Extract Receiver / Merchant Name
 */
export function extractReceiverName(
  text: string,
  matchedRules: Record<string, string>
): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if line contains "ไปยัง" or "ผู้รับ" or "To:"
    const match = line.match(/(?:ไปยัง|เข้าบัญชี|ผู้รับ(?:เงิน)?|to\b)\s*[:=]?\s*(.*)/i);
    if (match) {
      let candidate = match[1].trim();
      // If candidate on same line is empty or too short, look at next line
      if (!candidate || candidate.length < 2) {
        if (i + 1 < lines.length) {
          candidate = lines[i + 1].trim();
        }
      }
      // Filter out account numbers or bank names
      if (candidate && !/^[0-9xX\-\s]+$/.test(candidate) && !/promptpay|พร้อมเพย์/i.test(candidate)) {
        matchedRules['receiver_name'] = `Matched receiver: "${candidate}"`;
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Infer Transaction Type and Category from Text & Keywords
 */
export function inferCategoryAndType(
  text: string,
  receiverName: string | null,
  memo: string | null,
  matchedRules: Record<string, string>
): { type: 'EXPENSE' | 'INCOME' | 'TRANSFER'; category: string } {
  const corpus = `${text} ${receiverName || ''} ${memo || ''}`.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (corpus.includes(kw.toLowerCase())) {
        matchedRules['category'] = `Matched category "${rule.category}" via keyword "${kw}"`;
        return {
          type: rule.type,
          category: rule.category,
        };
      }
    }
  }

  // Fallback defaults
  matchedRules['category'] = 'Default fallback: "อื่นๆ" (EXPENSE)';
  return {
    type: 'EXPENSE',
    category: 'อื่นๆ',
  };
}

/**
 * Main Entry Point: Parse Thai Bank Slip OCR Text
 */
export function parseThaiBankSlipOcr(rawText: string): ParsedSlipRegexResult {
  const normalized = normalizeOcrText(rawText);
  const matchedRules: Record<string, string> = {};

  const amount = extractAmount(normalized, matchedRules);
  const { iso, displayDate, displayTime } = extractDateTime(normalized, matchedRules);
  const { senderBank, receiverBank } = extractBanks(normalized, matchedRules);
  const { senderAccount, receiverAccount } = extractAccounts(normalized, matchedRules);
  const referenceNumber = extractReferenceNumber(normalized, matchedRules);
  const memo = extractMemo(normalized, matchedRules);
  const receiverName = extractReceiverName(normalized, matchedRules);
  const { type, category } = inferCategoryAndType(normalized, receiverName, memo, matchedRules);

  // Calculate confidence score (0.0 - 1.0) based on fields detected
  let score = 0.0;
  if (amount !== null && amount > 0) score += 0.35;
  if (iso !== null) score += 0.25;
  if (senderBank || receiverBank) score += 0.15;
  if (senderAccount || receiverAccount) score += 0.10;
  if (referenceNumber) score += 0.10;
  if (receiverName || memo) score += 0.05;

  const confidenceScore = Math.min(1.0, Math.round(score * 100) / 100);

  return {
    amount,
    transaction_date: iso,
    parsed_date_display: displayDate,
    parsed_time_display: displayTime,
    type,
    category,
    sender_bank: senderBank,
    sender_account_masked: senderAccount,
    sender_name: null,
    receiver_bank: receiverBank,
    receiver_account_masked: receiverAccount,
    receiver_name: receiverName,
    memo,
    reference_number: referenceNumber,
    confidence_score: confidenceScore,
    matched_rules: matchedRules,
    raw_text: normalized,
  };
}
