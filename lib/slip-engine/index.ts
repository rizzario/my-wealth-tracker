/**
 * lib/slip-engine/index.ts
 *
 * Universal Bank-Specific Thai Slip Extraction Engine (Break by Bank).
 * Level 2 Architecture: Configurable Templates with Database / JSON Serialization.
 */

import { BankCode, BankSlipTemplate, ParsedSlipResult } from './types';
import { normalizeOcrText } from './normalizer';
import { detectBankCode, getTemplateForBank, BUILTIN_TEMPLATES, getAllDefaultTemplates } from './templates';
import { extractAmount } from './extractors/amount';
import { extractDateTime } from './extractors/datetime';
import { extractAccounts, extractBanks, KNOWN_BANKS } from './extractors/accounts';
import { extractNames } from './extractors/names';
import { extractReferenceNumber } from './extractors/reference';
import { extractMemo, inferCategoryAndType, CATEGORY_RULES } from './extractors/category';

export * from './types';
export * from './normalizer';
export * from './templates';
export * from './service';
export { KNOWN_BANKS, CATEGORY_RULES };

/**
 * Main Entry Point: Parse Thai Bank Slip with Bank-Specific Rule Templates.
 *
 * @param rawText - Raw OCR text from camera, gallery, or Shortcuts
 * @param customTemplates - Optional array of user-customized templates loaded from Supabase/SQLite
 */
export function parseThaiBankSlip(
  rawText: string,
  customTemplates?: BankSlipTemplate[]
): ParsedSlipResult {
  const normalized = normalizeOcrText(rawText);
  const matchedRules: Record<string, string> = {};

  // 1. Detect Bank Code
  const detectedBank = detectBankCode(normalized, customTemplates);
  matchedRules['bank_detected'] = `Detected Bank: ${detectedBank}`;

  // 2. Select Bank Template (Custom prioritized over Built-in)
  const template = getTemplateForBank(detectedBank, customTemplates);
  matchedRules['template_applied'] = `Applied Template: ${template.bankName} (${template.bankCode} v${template.version || 1})`;

  // 3. Extract Amount (using template rules)
  const amount = extractAmount(normalized, template.amountRules, matchedRules);

  // 4. Extract Date & Time
  const { iso, displayDate, displayTime } = extractDateTime(normalized, matchedRules);

  // 5. Extract Accounts (using template mask patterns & G-Wallet rules)
  const { senderAccount, receiverAccount, accountIndices } = extractAccounts(
    normalized,
    template.accountRules,
    matchedRules
  );

  // 6. Extract Banks (using intra-bank transfer settings)
  const { senderBank: detectedSenderBank, receiverBank } = extractBanks(
    normalized,
    accountIndices,
    template.intraBankSupported,
    matchedRules
  );
  // Ensure sender bank defaults to the template's detected bank if not found sequentially
  const senderBank = detectedSenderBank || (template.bankCode !== 'GENERIC' ? template.bankCode : null);

  // 7. Extract Sender & Receiver Names (using template-specific layout strategy)
  const { senderName, receiverName } = extractNames(
    normalized,
    accountIndices,
    template.nameRules,
    matchedRules
  );

  // 8. Extract Reference Number (using template lookahead & label rules)
  const referenceNumber = extractReferenceNumber(
    normalized,
    template.referenceRules,
    matchedRules
  );

  // 9. Extract Memo and Infer Category
  const memo = extractMemo(normalized, matchedRules);
  const { type, category } = inferCategoryAndType(normalized, receiverName, memo, matchedRules);

  // 10. Compute Confidence Score (0.0 - 1.0)
  let score = 0.0;
  if (amount !== null && amount > 0) score += 0.35;
  if (iso !== null) score += 0.25;
  if (senderBank || receiverBank) score += 0.15;
  if (senderAccount || receiverAccount) score += 0.10;
  if (referenceNumber) score += 0.10;
  if (receiverName || memo || senderName) score += 0.05;

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
    sender_name: senderName,
    receiver_bank: receiverBank,
    receiver_account_masked: receiverAccount,
    receiver_name: receiverName,
    memo,
    reference_number: referenceNumber,
    confidence_score: confidenceScore,
    matched_rules: matchedRules,
    template_used: template.bankCode,
    raw_text: normalized,
  };
}
