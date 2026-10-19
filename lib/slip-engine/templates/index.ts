/**
 * lib/slip-engine/templates/index.ts
 *
 * Central Registry of Built-in Bank Slip Templates.
 */

import { BankCode, BankSlipTemplate } from '../types';
import { KBANK_TEMPLATE } from './kbank';
import { BBL_TEMPLATE } from './bbl';
import { SCB_TEMPLATE } from './scb';
import { PAOTANG_TEMPLATE } from './paotang';
import { GENERIC_TEMPLATE } from './generic';

export const BUILTIN_TEMPLATES: Record<string, BankSlipTemplate> = {
  KBANK: KBANK_TEMPLATE,
  BBL: BBL_TEMPLATE,
  SCB: SCB_TEMPLATE,
  PAOTANG: PAOTANG_TEMPLATE,
  GENERIC: GENERIC_TEMPLATE,
};

/**
 * Returns a list of all active built-in bank templates.
 */
export function getAllDefaultTemplates(): BankSlipTemplate[] {
  return [
    KBANK_TEMPLATE,
    BBL_TEMPLATE,
    SCB_TEMPLATE,
    PAOTANG_TEMPLATE,
    GENERIC_TEMPLATE,
  ];
}

/**
 * Detect bank code from OCR text using template detectPatterns.
 */
export function detectBankCode(
  text: string,
  customTemplates?: BankSlipTemplate[]
): BankCode {
  const templates = customTemplates && customTemplates.length > 0
    ? [...customTemplates, ...getAllDefaultTemplates()]
    : getAllDefaultTemplates();

  for (const t of templates) {
    if (t.bankCode === 'GENERIC') continue;
    for (const pattern of t.detectPatterns) {
      const rx = new RegExp(pattern, 'i');
      if (rx.test(text)) {
        return t.bankCode;
      }
    }
  }

  return 'GENERIC';
}

/**
 * Lookup template by BankCode with custom template priority.
 */
export function getTemplateForBank(
  bankCode: BankCode,
  customTemplates?: BankSlipTemplate[]
): BankSlipTemplate {
  if (customTemplates) {
    const custom = customTemplates.find((t) => t.bankCode === bankCode && t.isActive !== false);
    if (custom) return custom;
  }

  return BUILTIN_TEMPLATES[bankCode] || GENERIC_TEMPLATE;
}
