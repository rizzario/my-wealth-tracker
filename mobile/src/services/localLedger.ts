import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParsedSlipRegexResult } from './slip-regex-parser';

export interface LocalSlipRecord extends ParsedSlipRegexResult {
  id: string;
  saved_at: string;
}

const STORAGE_KEY = '@my_wealth_local_slips_v1';

/**
 * Save a parsed slip to local phone storage (100% offline, no cloud)
 */
export async function saveSlipLocally(slip: ParsedSlipRegexResult): Promise<LocalSlipRecord> {
  const existing = await getLocalSlips();
  const newRecord: LocalSlipRecord = {
    ...slip,
    id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    saved_at: new Date().toISOString(),
  };

  const updated = [newRecord, ...existing];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newRecord;
}

/**
 * Get all slips stored on the device
 */
export async function getLocalSlips(): Promise<LocalSlipRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalSlipRecord[];
  } catch {
    return [];
  }
}

/**
 * Delete a local slip from storage
 */
export async function deleteLocalSlip(id: string): Promise<void> {
  const existing = await getLocalSlips();
  const filtered = existing.filter((s) => s.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * Clear all local slips
 */
export async function clearAllLocalSlips(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
