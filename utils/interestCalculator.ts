export interface InterestCalcParams {
  balance: number;
  ratePercent: number;
  payoutFrequency: 'MONTHLY' | 'SEMI_ANNUAL' | 'ANNUAL' | 'AT_MATURITY' | string;
  depositStartDate?: string | null;
  maturityDate?: string | null;
  isTaxExempt?: boolean; // รองรับภาษีหัก ณ ที่จ่าย 15%
}

function getPenultimateBusinessDay(year: number, monthIndex: number): Date {
  const date = new Date(year, monthIndex + 1, 0);
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  while (isWeekend(date)) {
    date.setDate(date.getDate() - 1);
  }
  date.setDate(date.getDate() - 1);
  while (isWeekend(date)) {
    date.setDate(date.getDate() - 1);
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

export function calculateAccountInterest({
  balance,
  ratePercent,
  payoutFrequency,
  depositStartDate,
  maturityDate,
  isTaxExempt = false,
}: InterestCalcParams) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  let lastPayoutDate: Date;
  let nextPayoutDate: Date;

  if (payoutFrequency === 'MONTHLY') {
    const thisMonthPayout = getPenultimateBusinessDay(currentYear, currentMonth);

    if (today > thisMonthPayout) {
      // จ่ายรอบของเดือนนี้ไปแล้ว กำหนดรอบใหม่เป็นของเดือนหน้า
      lastPayoutDate = thisMonthPayout;
      nextPayoutDate = getPenultimateBusinessDay(currentYear, currentMonth + 1);
    } else {
      // ยังไม่ถึงวันจ่ายของเดือนนี้
      lastPayoutDate = getPenultimateBusinessDay(currentYear, currentMonth - 1);
      nextPayoutDate = thisMonthPayout;
    }
  } else if (payoutFrequency === 'AT_MATURITY' && maturityDate) {
    lastPayoutDate = depositStartDate ? new Date(depositStartDate) : new Date(currentYear, 0, 1);
    nextPayoutDate = new Date(maturityDate);
  } else {
    // SEMI_ANNUAL: ปลาย มิ.ย. และ ปลาย ธ.ค.
    const juneEnd = new Date(currentYear, 5, 30);
    const decEnd = new Date(currentYear, 11, 31);

    if (today <= juneEnd) {
      lastPayoutDate = new Date(currentYear, 0, 1);
      nextPayoutDate = juneEnd;
    } else {
      lastPayoutDate = new Date(currentYear, 6, 1);
      nextPayoutDate = decEnd;
    }
  }

  // ปรับวันเริ่มต้นหากเปิดบัญชีระหว่างงวด
  let effectiveStartDate = lastPayoutDate;
  if (depositStartDate) {
    const openDate = new Date(depositStartDate);
    openDate.setHours(0, 0, 0, 0);
    if (openDate > lastPayoutDate) {
      effectiveStartDate = openDate;
    }
  }

  // คำนวณจำนวนวัน
  const daysAccrued = Math.max(
    0,
    Math.ceil((today.getTime() - effectiveStartDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  const totalDaysInCycle = Math.max(
    1,
    Math.ceil((nextPayoutDate.getTime() - effectiveStartDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  // คำนวณดอกเบี้ย (สูตรรายวัน 365 วัน)
  const dailyGrossInterest = (balance * (ratePercent / 100)) / 365;
  const grossAccrued = dailyGrossInterest * daysAccrued;
  const grossProjected = dailyGrossInterest * totalDaysInCycle;

  // ภาษีหัก ณ ที่จ่าย 15% (ถ้าไม่ได้ยกเว้นภาษี)
  const taxMultiplier = isTaxExempt ? 1.0 : 0.85;

  return {
    effectiveStartDate: effectiveStartDate.toISOString().split('T')[0],
    nextPayoutDate: nextPayoutDate.toISOString().split('T')[0],
    daysAccrued,
    totalDaysInCycle,
    grossAccrued: parseFloat(grossAccrued.toFixed(2)),
    accruedToDate: parseFloat((grossAccrued * taxMultiplier).toFixed(2)), // สุทธิหลังหักภาษี
    projectedAtPayout: parseFloat((grossProjected * taxMultiplier).toFixed(2)), // สุทธิที่จะได้รับจริงรอบถัดไป
    taxDeduction: parseFloat((grossProjected * (1 - taxMultiplier)).toFixed(2)),
  };
}