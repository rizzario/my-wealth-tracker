/**
 * lib/slip-engine/extractors/category.ts
 *
 * Expense/Income categorization and Memo extraction.
 */

export interface CategoryRule {
  category: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  keywords: string[];
}

export const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'อาหาร & เครื่องดื่ม',
    type: 'EXPENSE',
    keywords: [
      'คาเฟ่', 'cafe', 'กาแฟ', 'coffee', 'อาหาร', 'ชาบู', 'หมูกระทะ', 'shabu',
      'ก๋วยเตี๋ยว', 'ข้าวมันไก่', 'ข้าวราดแกง', 'ส้มตำ', 'ร้านอาหาร', 'restaurant',
      'เบเกอรี่', 'bakery', 'ขนม', 'ชานม', 'amazon', 'starbucks', 'เต่าบิน', 'บุญเติม',
      'เวนดิ้ง', 'vending', 'kfc', 'mcdonald', 'bar b q', 'สุกี้', 'ตี๋น้อย',
    ],
  },
  {
    category: 'เดินทาง & คมนาคม',
    type: 'EXPENSE',
    keywords: [
      'bts', 'mrt', 'แอร์พอร์ตลิงก์', 'รถไฟฟ้า', 'ขสมก', 'รถเมล์', 'แท็กซี่',
      'taxi', 'grab', 'lineman', 'bolt', 'เติมน้ำมัน', 'ปตท', 'ptt', 'bcp',
      'บางจาก', 'shell', 'caltex', 'ทางด่วน', 'm-flow', 'easy pass', 'm-pass',
      'ระบบขนส่งมวลชน', 'การรถไฟฟ้า',
    ],
  },
  {
    category: 'ช้อปปิ้ง & ซื้อของ',
    type: 'EXPENSE',
    keywords: [
      '7-eleven', 'เซเว่น', 'cj express', 'lotus', 'โลตัส', 'big c', 'บิ๊กซี',
      'tops', 'gourmet', 'makro', 'แม็คโคร', 'shopee', 'lazada', 'tiktok shop',
      'homepro', 'ikea', 'decathlon', 'mr.diy', 'ของใช้', 'เสื้อผ้า', 'อุปกรณ์',
    ],
  },
  {
    category: 'ค่าน้ำ / ค่าไฟ / อินเทอร์เน็ต',
    type: 'EXPENSE',
    keywords: [
      'กฟน', 'mea', 'กฟภ', 'pea', 'การไฟฟ้า', 'กปน', 'mwa', 'กปภ', 'pwa', 'การประปา',
      'ais', 'true', 'dtac', '3bb', 'nt', 'tot', 'cat', 'ค่าเน็ต', 'ค่าไฟ', 'ค่าน้ำ', 'ค่าโทรศัพท์',
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
      'ตรวจสุขภาพ', 'แล็บ', 'lab', 'แว่นตา', 'ฟิตเนส', 'fitness',
    ],
  },
  {
    category: 'ประกันภัย',
    type: 'EXPENSE',
    keywords: [
      'aia', 'muang thai life', 'เมืองไทยประกัน', 'fwd', 'allianz', 'กรุงเทพประกันภัย',
      'ทิพยประกันภัย', 'วิริยะ', 'ประกันสุขภาพ', 'ประกันชีวิต', 'ประกันรถยนต์',
    ],
  },
  {
    category: 'ความบันเทิง & สตรีมมิ่ง',
    type: 'EXPENSE',
    keywords: [
      'netflix', 'spotify', 'youtube', 'disney', 'apple', 'google play', 'major',
      'sf cinema', 'ดูหนัง', 'คอนเสิร์ต', 'เกม', 'steam', 'playstation',
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

  matchedRules['category'] = 'Default fallback: "อื่นๆ" (EXPENSE)';
  return {
    type: 'EXPENSE',
    category: 'อื่นๆ',
  };
}
