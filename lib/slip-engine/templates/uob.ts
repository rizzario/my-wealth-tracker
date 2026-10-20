/**
 * lib/slip-engine/templates/generic.ts
 *
 * Universal Fallback Template for unspecialized or generic Thai bank slips
 * (BAY, KTB, TTB, GSB, TrueMoney, PromptPay, etc.).
 */

import { BankSlipTemplate } from '../types';

export const UOB_TEMPLATE: BankSlipTemplate = {
  bankCode: 'UOB',
  bankName: 'ธนาคารยูโอบี (UOB)',
  description: 'โครงสร้างสลิปธนาคารยูโอบี (UOB)',
  detectPatterns: [
    '(?:ยูโอบี|UOB\\*sTMRW|\\buob\\b|uob\\s*bank|ธนาคารยูโอบี)',
    '024', // Bank BOT code
  ],
  amountRules: {
    subsidyDiscountEnabled: false,
    labels: ['จำนวนเงิน', 'ยอดเงิน', 'ยอดโอน', 'amount', 'total'],
    skipLabels: ['ค่าธรรมเนียม', 'fee', 'คงเหลือ'],
  },
  accountRules: {
    maskPatterns: [
      '([0-9xX*#]{2,5}[-\\s][0-9xX*#]{1,5}[-\\s]?[0-9xX*#\\-]*(?:[0-9]{3,4}|[0-9xX*#]+))',
      '([0-9xX*#]{4} [0-9xX*#]{4} [0-9xX*#]{4} [0-9xX*#]{4})',
    ],
  },
  referenceRules: {
    labels: ['รหัสอ้างอิง', 'เลขที่อ้างอิง', 'หมายเลขอ้างอิง', 'เลขที่รายการ', 'ref'],
    lookaheadLines: 2,
    skipPatterns: ['ค่าธรรมเนียม', 'บาท'],
    stripKnownBankNames: true,
    alphanumericAllowed: true,
  },
  nameRules: {
    strategy: 'LABEL_BASED',
    senderLabels: ['จาก', 'from', 'ผู้โอน'],
    receiverLabels: ['ไปยัง', 'ไปที่', 'เข้าบัญชี', 'ผู้รับ', 'to'],
    pairedHeaderMaxGap: 2,
  },
  intraBankSupported: false,
  isActive: true,
  version: 1,
};
