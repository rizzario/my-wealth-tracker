/**
 * lib/slip-engine/normalizer.ts
 *
 * Robust OCR Text Normalizer for Thai Bank Slips.
 * Resolves optical character recognition artifacts, zero-width spaces,
 * fullwidth characters, unicode dash variants, and homoglyphs.
 */

export function normalizeOcrText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
    .replace(/[ \t]+/g, ' ')               // Collapse horizontal spaces
    // Normalize x / X homoglyphs commonly output by OCR for masked accounts (Cyrillic, Greek, Math symbol, Fullwidth)
    .replace(/[\u0445\u00D7\uFF58\u03C7]/g, 'x')
    .replace(/[\u0425\uFF38\u03A7]/g, 'X')
    // Normalize fullwidth digits (０-９) to standard ASCII digits (0-9)
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    // Normalize unicode dashes / hyphens (−, –, —, ‒) to standard '-'
    .replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .trim();
}
