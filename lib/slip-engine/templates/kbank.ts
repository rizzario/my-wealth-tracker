/**
 * lib/slip-engine/templates/kbank.ts
 *
 * Bank Template Configuration for Kasikornbank (K PLUS).
 * Characteristics:
 * - Omits "จาก" and "ไปยัง" headers
 * - Sender name is situated above Account 1
 * - Transfer receiver is situated above Account 2
 * - Merchant name is situated below Account 1
 * - Supports PromptPay DQR alphanumeric reference numbers (e.g. 016289131547DQR05334)
 * - Supports Intra-bank transfers (KBank to KBank)
 */

import { BankSlipTemplate } from '../types';

export const KBANK_TEMPLATE: BankSlipTemplate = {
  bankCode: 'KBANK',
  bankName: 'ธนาคารกสิกรไทย (K PLUS)',
  description: 'โครงสร้างสลิป K PLUS (ไม่มีหัวข้อ จาก/ไปยัง, อิงตำแหน่งจากเลขบัญชี)',
  detectPatterns: [
    '(?:กสิกรไทย|kbank|k\\s*plus|k\\+|kasikorn)',
    '004', // Bank BOT code
  ],
  amountRules: {
    labels: ['จำนวนเงิน', 'จำนวน', 'ยอดเงิน', 'ยอดโอน', 'amount'],
    skipLabels: ['ค่าธรรมเนียม', 'fee', 'คงเหลือ'],
  },
  accountRules: {
    maskPatterns: [
      '([0-9xX*#]{3}-[0-9xX*#]-[0-9xX*#]{5}-[0-9xX*#])',
      '([0-9xX*#]{2,5}[-\\s][0-9xX*#]{1,5}[-\\s]?[0-9xX*#\\-]*(?:[0-9]{3,4}|[0-9xX*#]+))',
    ],
  },
  referenceRules: {
    labels: ['เลขที่รายการ', 'รหัสอ้างอิง', 'เลขที่อ้างอิง', 'หมายเลขอ้างอิง', 'transaction\\s*id', 'ref'],
    lookaheadLines: 3,
    skipPatterns: ['ค่าธรรมเนียม', 'บาท', 'thb', 'จำนวน'],
    stripKnownBankNames: true,
    alphanumericAllowed: true,
  },
  nameRules: {
    strategy: 'ACCOUNT_RELATIVE',
    accountRelative: {
      senderLookbackLines: 3,
      receiverLookbackLines: 3,
      merchantLookaheadLines: 4,
    },
  },
  intraBankSupported: true,
  isActive: true,
  version: 1,
};
