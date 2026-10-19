/**
 * lib/slip-engine/service.ts
 *
 * Persistence service for Bank Slip Templates (Supabase & Local-First).
 * Allows users to fetch customized bank templates and save fine-tuned template overrides.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { BankCode, BankSlipTemplate } from './types';
import { getAllDefaultTemplates, BUILTIN_TEMPLATES } from './templates';

export async function fetchUserBankTemplates(
  supabase: SupabaseClient
): Promise<BankSlipTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('bank_slip_templates')
      .select('*')
      .eq('is_active', true);

    if (error || !data || data.length === 0) {
      return getAllDefaultTemplates();
    }

    // Merge custom templates over built-in defaults
    const templateMap: Record<string, BankSlipTemplate> = { ...BUILTIN_TEMPLATES };

    for (const row of data) {
      const config = row.template_config as Partial<BankSlipTemplate>;
      templateMap[row.bank_code] = {
        ...BUILTIN_TEMPLATES[row.bank_code],
        ...config,
        id: row.id,
        bankCode: row.bank_code,
        bankName: row.bank_name || config.bankName || row.bank_code,
        description: row.description || config.description,
        isActive: row.is_active,
      } as BankSlipTemplate;
    }

    return Object.values(templateMap);
  } catch (err) {
    console.warn('Failed to fetch custom bank templates from DB, using defaults:', err);
    return getAllDefaultTemplates();
  }
}

export async function saveUserBankTemplate(
  supabase: SupabaseClient,
  template: BankSlipTemplate
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('bank_slip_templates')
      .upsert(
        {
          bank_code: template.bankCode,
          bank_name: template.bankName,
          description: template.description || '',
          is_active: template.isActive !== false,
          template_config: template,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,bank_code' }
      );

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save template' };
  }
}

export async function resetBankTemplate(
  supabase: SupabaseClient,
  bankCode: BankCode
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('bank_slip_templates')
      .delete()
      .eq('bank_code', bankCode);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to reset template' };
  }
}
