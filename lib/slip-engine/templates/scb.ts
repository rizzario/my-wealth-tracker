/**
 * lib/slip-engine/templates/scb.ts
 *
 * Bank Template Configuration for Siam Commercial Bank (SCB EASY).
 * Characteristics:
 * - Paired headers: "จาก" followed immediately by "ไปยัง"
 * - Supports Biller ID, Merchant code (รหัสร้านค้า), and APIC transaction codes
 * - High-precision alphanumeric transaction ID on the same line as "รหัสอ้างอิง:"
 */

import { BankSlipTemplate } from '../types';

export const SCB_TEMPLATE: BankSlipTemplate = {
  bankCode: 'SCB',
  bankName: 'ธนาคารไทยพาณิชย์ (SCB EASY)',
  description: 'โครงสร้างสลิป SCB EASY (หัวข้อคู่ จาก/ไปยัง, รองรับ Biller ID / ร้านค้า)',
  detectPatterns: [
    '(?:ไทยพาณิชย์|scb|scb\\s*easy|siam\\s*commercial)',
    '014', // Bank BOT code
  ],
  amountRules: {
    labels: ['จำนวนเงิน', 'ยอดเงิน', 'ยอดโอน', 'amount'],
    skipLabels: ['ค่าธรรมเนียม', 'fee', 'คงเหลือ'],
  },
  accountRules: {
    maskPatterns: [
      '([0-9xX*#]{3}-[0-9xX*#]{2,3}[0-9xX*#]{3,4}-[0-9])',
      '([0-9xX*#]{2,5}[-\\s][0-9xX*#]{1,5}[-\\s]?[0-9xX*#\\-]*(?:[0-9]{3,4}|[0-9xX*#]+))',
    ],
  },
  referenceRules: {
    labels: ['รหัสอ้างอิง', 'รหัสธุรกรรม', 'เลขที่อ้างอิง', 'ref'],
    lookaheadLines: 2,
    skipPatterns: ['ค่าธรรมเนียม', 'บาท'],
    stripKnownBankNames: false,
    alphanumericAllowed: true,
  },
  nameRules: {
    strategy: 'PAIRED_HEADER',
    senderLabels: ['จาก', 'from', 'ผู้โอน'],
    receiverLabels: ['ไปยัง', 'ไปที่', 'เข้าบัญชี', 'to'],
    pairedHeaderMaxGap: 2,
  },
  intraBankSupported: true,
  isActive: true,
  version: 1,
};
