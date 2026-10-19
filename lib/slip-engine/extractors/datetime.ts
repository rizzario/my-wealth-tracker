/**
 * lib/slip-engine/extractors/datetime.ts
 *
 * Universal Date and Time Extractor for Thai bank slips.
 * Handles Buddhist Era (พ.ศ. -> ค.ศ.), 2-digit and 4-digit years,
 * Thai month abbreviations (ม.ค. - ธ.ค.), and standard ISO conversions.
 */

const THAI_MONTH_MAP: Record<string, string> = {
  'ม.ค.': '01', 'มกราคม': '01',
  'ก.พ.': '02', 'กุมภาพันธ์': '02',
  'มี.ค.': '03', 'มีนาคม': '03',
  'เม.ย.': '04', 'เมษายน': '04',
  'พ.ค.': '05', 'พฤษภาคม': '05',
  'มิ.ย.': '06', 'มิถุนายน': '06',
  'ก.ค.': '07', 'กรกฎาคม': '07',
  'ส.ค.': '08', 'สิงหาคม': '08',
  'ก.ย.': '09', 'กันยายน': '09',
  'ต.ค.': '10', 'ตุลาคม': '10',
  'พ.ย.': '11', 'พฤศจิกายน': '11',
  'ธ.ค.': '12', 'ธันวาคม': '12',
};

const THAI_MONTH_REGEX =
  /(?:(\d{1,2})\s*(ม\.ค\.|มกราคม|ก\.พ\.|กุมภาพันธ์|มี\.ค\.|มีนาคม|เม\.ย\.|เมษายน|พ\.ค\.|พฤษภาคม|มิ\.ย\.|มิถุนายน|ก\.ค\.|กรกฎาคม|ส\.ค\.|สิงหาคม|ก\.ย\.|กันยายน|ต\.ค\.|ตุลาคม|พ\.ย\.|พฤศจิกายน|ธ\.ค\.|ธันวาคม|ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย|ต\.ค|พ\.ย|ธ\.ค)\s*(?:พ\.ศ\.\s*)?(\d{2,4}))/i;

const NUMERIC_DATE_REGEX =
  /(?:(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4}))/;

const TIME_REGEX =
  /(?:(?:เวลา|time)?\s*([012]?\d)[:.]([0-5]\d)(?:[:.]([0-5]\d))?\s*(?:น\.|hrs?|pm|am)?)/i;

export function extractDateTime(
  text: string,
  matchedRules: Record<string, string>
): { iso: string | null; displayDate: string | null; displayTime: string | null } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let year: number | null = null;
  let month: string | null = null;
  let day: string | null = null;
  let timeStr: string | null = null;

  for (const line of lines) {
    if (!year || !month || !day) {
      const thaiMatch = line.match(THAI_MONTH_REGEX);
      if (thaiMatch) {
        day = thaiMatch[1].padStart(2, '0');
        const rawMonth = thaiMatch[2].endsWith('.') ? thaiMatch[2] : `${thaiMatch[2]}.`;
        month = THAI_MONTH_MAP[rawMonth] || THAI_MONTH_MAP[thaiMatch[2]] || '01';
        let rawYear = parseInt(thaiMatch[3], 10);
        if (rawYear > 2400) {
          year = rawYear - 543;
        } else if (rawYear >= 50 && rawYear <= 99) {
          year = rawYear + 2500 - 543;
        } else if (rawYear < 50) {
          year = 2000 + rawYear;
        } else {
          year = rawYear;
        }
        matchedRules['date'] = `Thai month match in "${line}": Day=${day}, Month=${month}, Year=${year}`;
      }

      if (!year) {
        const numMatch = line.match(NUMERIC_DATE_REGEX);
        if (numMatch) {
          day = numMatch[1].padStart(2, '0');
          month = numMatch[2].padStart(2, '0');
          let rawYear = parseInt(numMatch[3], 10);
          if (rawYear > 2400) {
            year = rawYear - 543;
          } else if (rawYear >= 50 && rawYear <= 99) {
            year = rawYear + 2500 - 543;
          } else {
            year = rawYear < 100 ? 2000 + rawYear : rawYear;
          }
          matchedRules['date'] = `Numeric date match in "${line}": ${year}-${month}-${day}`;
        }
      }
    }

    if (!timeStr) {
      const timeMatch = line.match(TIME_REGEX);
      if (timeMatch && timeMatch[1] && timeMatch[2]) {
        const hh = timeMatch[1].padStart(2, '0');
        const mm = timeMatch[2].padStart(2, '0');
        const ss = timeMatch[3] ? timeMatch[3].padStart(2, '0') : '00';
        timeStr = `${hh}:${mm}:${ss}`;
        matchedRules['time'] = `Time matched in "${line}": ${timeStr}`;
      }
    }

    if (year && month && day && timeStr) break;
  }

  if (!timeStr) timeStr = '12:00:00';

  if (year && month && day) {
    const iso = `${year}-${month}-${day}T${timeStr}`;
    const displayDate = `${year}-${month}-${day}`;
    const displayTime = timeStr.slice(0, 5);
    return { iso, displayDate, displayTime };
  }

  return { iso: null, displayDate: null, displayTime: null };
}
