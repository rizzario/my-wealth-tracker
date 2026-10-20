/**
 * lib/slip-engine/templates/bbl.ts
 *
 * Bank Template Configuration for Bangkok Bank (BBL / Bualuang mBanking).
 * Characteristics:
 * - Uses paired headers: "จาก" followed immediately by "ไปที่"
 * - Sender candidate 1 and Receiver candidate 2 follow the paired header block
 * - 25-digit long unique reference number (e.g. 2026083011145124001067308)
 * - May concatenate "Bangkok Bank" to the reference number line in OCR
 * - Supports Intra-bank transfers (BBL to BBL)
 */

import { BankSlipTemplate } from '../types';

export const BBL_TEMPLATE: BankSlipTemplate = {
  bankCode: 'BBL',
  bankName: 'ธนาคารกรุงเทพ (Bangkok Bank)',
  description: 'โครงสร้างสลิป Bangkok Bank (หัวข้อคู่ จาก/ไปที่, เลขอ้างอิง 25 หลัก)',
  detectPatterns: [
    '(?:ธนาคารกรุงเทพ|bangkok\\s*bank|\\bbbl\\b|bualuang|บัวหลวง)',
    '002', // Bank BOT code
  ],
  amountRules: {
    labels: ['จำนวนเงิน', 'ยอดเงิน', 'ยอดโอน', 'amount'],
    skipLabels: ['ค่าธรรมเนียม', 'fee', 'คงเหลือ'],
  },
  accountRules: {
    maskPatterns: [
      '([0-9xX*#]{3}-[0-9xX*#]-[0-9xX*#]{6})',
      '([0-9xX*#]{2,5}[-\\s][0-9xX*#]{1,5}[-\\s]?[0-9xX*#\\-]*(?:[0-9]{3,4}|[0-9xX*#]+))',
    ],
  },
  referenceRules: {
    labels: ['เลขที่อ้างอิง', 'หมายเลขอ้างอิง', 'รหัสอ้างอิง', 'ref'],
    lookaheadLines: 2,
    skipPatterns: ['ค่าธรรมเนียม', 'บาท', 'thb'],
    stripKnownBankNames: true,
    alphanumericAllowed: false,
  },
  nameRules: {
    strategy: 'PAIRED_HEADER',
    senderLabels: ['จาก', 'from', 'ผู้โอน'],
    receiverLabels: ['ไปที่', 'ไปยัง', 'เข้าบัญชี'],
    pairedHeaderMaxGap: 2,
  },
  intraBankSupported: true,
  isActive: true,
  version: 1,
};
