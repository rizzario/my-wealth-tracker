/**
 * lib/slip-engine/templates/paotang.ts
 *
 * Bank Template Configuration for Krungthai Paotang (G-Wallet) & Tungngern.
 * Characteristics:
 * - Co-pay / Subsidy Net Amount calculation (e.g. ไทยช่วยไทย / คนละครึ่ง)
 * - G-Wallet ID format (**** ******* 3419) with sender name above G-Wallet ID
 * - Tungngern merchant identification (ถุงเงิน -> Merchant Name)
 * - 32-character hex transaction IDs (e.g. 5a909529f63b48afb988ab986e573330)
 */

import { BankSlipTemplate } from '../types';

export const PAOTANG_TEMPLATE: BankSlipTemplate = {
  bankCode: 'PAOTANG',
  bankName: 'เป๋าตัง (G-Wallet / ถุงเงิน)',
  description: 'โครงสร้างสลิปเป๋าตัง (โครงการรัฐ, G-Wallet ID, ร้านค้าถุงเงิน)',
  detectPatterns: [
    '(?:เป๋าตัง|g-wallet|paotang|ถุงเงิน|tung\\s*ngern)',
    '006', // Bank BOT code (KTB)
  ],
  amountRules: {
    subsidyDiscountEnabled: true,
    labels: ['จำนวนเงินที่ชำระ', 'ยอดชำระจริง', 'ยอดสุทธิ', 'จำนวนเงิน', 'ยอดเงิน'],
    skipLabels: ['ค่าธรรมเนียม', 'fee', 'คงเหลือ'],
  },
  accountRules: {
    gwalletEnabled: true,
    maskPatterns: [
      '([*xX0-9]{3,4}\\s+[*xX0-9]{5,7}\\s+[0-9]{4})',
      '([0-9xX*#]{2,5}[-\\s][0-9xX*#]{1,5}[-\\s]?[0-9xX*#\\-]*(?:[0-9]{3,4}|[0-9xX*#]+))',
    ],
  },
  referenceRules: {
    labels: ['รหัสอ้างอิง', 'เลขที่อ้างอิง', 'ref'],
    lookaheadLines: 2,
    skipPatterns: ['ค่าธรรมเนียม', 'บาท'],
    stripKnownBankNames: false,
    alphanumericAllowed: true,
  },
  nameRules: {
    strategy: 'GWALLET_TUNGNGERN',
  },
  intraBankSupported: false,
  isActive: true,
  version: 1,
};
