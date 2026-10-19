/**
 * lib/slip-engine/types.ts
 *
 * Core Data Structures and Interfaces for Bank-Specific Slip Extraction (Break by Bank).
 * Supports JSON serialization for storage in Supabase / SQLite.
 */

export type BankCode =
  | 'KBANK'
  | 'SCB'
  | 'BBL'
  | 'PAOTANG'
  | 'TUNGNGERN'
  | 'KTB'
  | 'BAY'
  | 'TTB'
  | 'GSB'
  | 'PROMPTPAY'
  | 'TRUEMONEY'
  | 'DIME'
  | 'UOB'
  | 'GENERIC'
  | string;

export type NameExtractionStrategy =
  | 'PAIRED_HEADER'       // SCB, BBL: "จาก" and "ไปยัง/ไปที่" headers stacked together above names
  | 'ACCOUNT_RELATIVE'    // K PLUS: Sender above Account 1, Receiver above Account 2 (transfer) or below Account 1 (merchant)
  | 'LABEL_BASED'         // Traditional: Sender next to/below "จาก", Receiver next to/below "ไปยัง"
  | 'GWALLET_TUNGNGERN'   // Paotang: Sender above G-Wallet ID, Receiver below ถุงเงิน
  | 'HYBRID';             // Tries bank-specific first, falls back sequentially

export interface BankDetectRule {
  bankCode: BankCode;
  bankName: string;
  patterns: string[]; // Serialized regex strings, e.g. ["(?:กสิกรไทย|kbank|k\\s*plus|k\\+)", "004"]
}

export interface AmountRuleConfig {
  subsidyDiscountEnabled?: boolean; // e.g. Paotang ไทยช่วยไทย / คนละครึ่ง (Net paid after minus discount)
  labels?: string[];                // e.g. ["จำนวนเงิน", "ยอดเงิน", "ยอดโอน", "amount", "total"]
  skipLabels?: string[];            // e.g. ["ค่าธรรมเนียม", "fee", "คงเหลือ"]
}

export interface AccountRuleConfig {
  maskPatterns?: string[];          // Custom account mask regexes
  gwalletEnabled?: boolean;         // Check for G-Wallet ID block
}

export interface ReferenceRuleConfig {
  labels?: string[];                // e.g. ["รหัสอ้างอิง", "เลขที่อ้างอิง", "เลขที่รายการ", "ref"]
  lookaheadLines?: number;          // Up to N lines forward (default 3)
  skipPatterns?: string[];          // Lines to ignore when looking ahead (e.g. ["ค่าธรรมเนียม", "บาท"])
  stripKnownBankNames?: boolean;    // Strip trailing bank names concatenated by OCR (e.g. BBL)
  alphanumericAllowed?: boolean;    // Allow codes with letters like DQR (e.g. K PLUS DQR05334)
}

export interface NameRuleConfig {
  strategy: NameExtractionStrategy;
  senderLabels?: string[];          // e.g. ["จาก", "from", "ผู้โอน"]
  receiverLabels?: string[];        // e.g. ["ไปยัง", "ไปที่", "เข้าบัญชี", "to"]
  pairedHeaderMaxGap?: number;      // Maximum line distance between "จาก" and "ไปยัง" (default 2)
  accountRelative?: {
    senderLookbackLines?: number;   // Lines above 1st account to search (default 3)
    receiverLookbackLines?: number; // Lines above 2nd account to search (default 3)
    merchantLookaheadLines?: number;// Lines below 1st account to search (default 4)
  };
}

export interface BankSlipTemplate {
  id?: string;                      // DB UUID or static identifier
  bankCode: BankCode;
  bankName: string;
  description?: string;
  detectPatterns: string[];         // Regex strings to identify this bank from OCR text
  amountRules?: AmountRuleConfig;
  accountRules?: AccountRuleConfig;
  referenceRules?: ReferenceRuleConfig;
  nameRules: NameRuleConfig;
  intraBankSupported?: boolean;     // Can transfer to same bank (e.g. KBANK to KBANK)
  isActive?: boolean;
  version?: number;
}

export interface ParsedSlipResult {
  amount: number | null;
  transaction_date: string | null;   // ISO 8601 (YYYY-MM-DDTHH:mm:ss)
  parsed_date_display: string | null;// YYYY-MM-DD
  parsed_time_display: string | null;// HH:mm
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
  confidence_score: number;          // 0.0 - 1.0
  matched_rules: Record<string, string>; // Tracing log of matched regex/rules
  template_used: BankCode;           // Bank template that parsed this slip
  raw_text: string;
}
