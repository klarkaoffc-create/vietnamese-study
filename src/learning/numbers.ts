/**
 * Vietnamese number words, dates and times. Pure functions used by the
 * generators and by tests.
 *
 * Forms follow the lessons (Bài 3, 4, 9). Where the standard language has an
 * alternative that the lesson did not teach (mốt, tư, linh/lẻ, ngàn), the
 * alternative is returned as an accepted variant, never silently substituted.
 */

export const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

export interface NumberWords {
  /** Form taught in the lessons (shown as the model answer). */
  primary: string;
  /** All accepted spellings, primary first. */
  accepted: string[];
  /** Polish note about alternatives, if any. */
  note?: string;
}

function tensUnits(n: number, variantsOut: Set<string>): string[] {
  // n in 0..99, returns list of accepted renderings (lesson form first)
  if (n < 10) return [DIGITS[n]];
  if (n < 20) {
    const u = n - 10;
    if (u === 0) return ['mười'];
    if (u === 5) return ['mười lăm'];
    return [`mười ${DIGITS[u]}`];
  }
  const t = Math.floor(n / 10);
  const u = n % 10;
  const base = `${DIGITS[t]} mươi`;
  if (u === 0) return [base];
  if (u === 5) return [`${base} lăm`];
  if (u === 1) {
    variantsOut.add('mốt');
    return [`${base} một`, `${base} mốt`];
  }
  if (u === 4) {
    variantsOut.add('tư');
    return [`${base} bốn`, `${base} tư`];
  }
  return [`${base} ${DIGITS[u]}`];
}

/** Numbers 0–9999. */
export function numberToWords(n: number): NumberWords {
  if (!Number.isInteger(n) || n < 0 || n > 9999) throw new Error(`numberToWords supports 0..9999, got ${n}`);
  const variants = new Set<string>();
  let forms: string[];
  if (n < 100) {
    forms = tensUnits(n, variants);
  } else if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const head = `${DIGITS[h]} trăm`;
    if (rest === 0) forms = [head];
    else if (rest < 10) {
      variants.add('linh');
      forms = [`${head} linh ${DIGITS[rest]}`, `${head} lẻ ${DIGITS[rest]}`];
    } else forms = tensUnits(rest, variants).map((r) => `${head} ${r}`);
  } else {
    const th = Math.floor(n / 1000);
    const rest = n % 1000;
    const heads = [`${DIGITS[th]} nghìn`, `${DIGITS[th]} ngàn`];
    variants.add('ngàn');
    if (rest === 0) forms = heads;
    else {
      const h = Math.floor(rest / 100);
      const r2 = rest % 100;
      let tails: string[];
      if (h === 0) {
        // e.g. 2026 → không trăm hai mươi sáu (lesson also allows dropping "trăm")
        const tu = r2 < 10 && r2 > 0 ? [`linh ${DIGITS[r2]}`, `lẻ ${DIGITS[r2]}`] : tensUnits(r2, variants);
        tails = tu.flatMap((t) => [`không trăm ${t}`, `không ${t}`]);
        if (r2 < 10 && r2 > 0) variants.add('linh');
      } else {
        const hh = `${DIGITS[h]} trăm`;
        if (r2 === 0) tails = [hh];
        else if (r2 < 10) {
          variants.add('linh');
          tails = [`${hh} linh ${DIGITS[r2]}`, `${hh} lẻ ${DIGITS[r2]}`];
        } else tails = tensUnits(r2, variants).map((t) => `${hh} ${t}`);
      }
      forms = heads.flatMap((hd) => tails.map((t) => `${hd} ${t}`));
    }
  }
  const notes: string[] = [];
  if (variants.has('mốt')) notes.push('W standardzie 21, 31… kończą się na „mốt” (hai mươi mốt); lekcja podaje „hai mươi một”.');
  if (variants.has('tư')) notes.push('Przy 24, 34… spotyka się też „tư” (hai mươi tư).');
  if (variants.has('linh')) notes.push('Zero w dziesiątkach czyta się „linh” (północ) / „lẻ” (południe): 105 = một trăm linh năm – tej formy nie było w lekcji.');
  if (variants.has('ngàn')) notes.push('„nghìn” (północ) = „ngàn” (południe).');
  return { primary: forms[0], accepted: Array.from(new Set(forms)), note: notes.length ? notes.join(' ') : undefined };
}

/** Digit-by-digit reading (phone numbers). */
export function digitsToWords(digits: string): string {
  return digits
    .replace(/\D/g, '')
    .split('')
    .map((d) => DIGITS[Number(d)])
    .join(' ');
}

/** Year reading: full number plus digit-by-digit (lesson: "hai không hai sáu"). */
export function yearToWords(year: number): NumberWords {
  const w = numberToWords(year);
  const digitForm = digitsToWords(String(year));
  return { primary: w.primary, accepted: [...w.accepted, digitForm], note: w.note };
}

export const WEEKDAYS_PL = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
export const WEEKDAYS_VI = ['Chủ Nhật', 'thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy'];

export const MONTHS_PL = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
export const MONTHS_PL_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
export const MONTHS_VI = ['tháng Một', 'tháng Hai', 'tháng Ba', 'tháng Tư', 'tháng Năm', 'tháng Sáu', 'tháng Bảy', 'tháng Tám', 'tháng Chín', 'tháng Mười', 'tháng Mười Một', 'tháng Mười Hai'];

export function monthToWords(month: number): string[] {
  const forms = [MONTHS_VI[month - 1]];
  if (month === 1) forms.push('tháng Giêng');
  if (month === 4) forms.push('tháng Bốn');
  return forms;
}

/** ngày D tháng M năm Y – accepted in words and digits. */
export function dateToWords(day: number, month: number, year: number): NumberWords {
  const d = numberToWords(day);
  const m = monthToWords(month);
  const y = yearToWords(year);
  const accepted: string[] = [];
  for (const dd of [...d.accepted, String(day)]) {
    for (const mm of [...m, `tháng ${month}`]) {
      for (const yy of [...y.accepted, String(year)]) {
        accepted.push(`ngày ${dd} ${mm} năm ${yy}`);
      }
    }
  }
  return { primary: `ngày ${d.primary} ${m[0]} năm ${y.primary}`, accepted: Array.from(new Set(accepted)), note: d.note ?? y.note };
}

export type DayPart = 'sáng' | 'trưa' | 'chiều' | 'tối' | 'đêm';

/** Day parts accepted for a 24 h hour; first is the model answer. */
export function dayPartsFor(hour24: number): DayPart[] {
  if (hour24 >= 1 && hour24 <= 3) return ['đêm', 'sáng'];
  if (hour24 >= 4 && hour24 <= 10) return ['sáng'];
  if (hour24 === 11) return ['trưa', 'sáng'];
  if (hour24 === 12) return ['trưa'];
  if (hour24 >= 13 && hour24 <= 17) return ['chiều'];
  if (hour24 === 18) return ['tối', 'chiều'];
  if (hour24 >= 19 && hour24 <= 22) return ['tối'];
  return ['đêm', 'tối'];
}

/** "5 giờ 20 phút chiều" and accepted variants. */
export function timeToWords(hour24: number, minute: number): NumberWords {
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const hw = numberToWords(h12);
  const mw = minute > 0 ? numberToWords(minute) : null;
  const parts = dayPartsFor(hour24);
  const hours = [...hw.accepted, String(h12)];
  const minutes = mw ? [...mw.accepted, String(minute)] : [];
  const accepted: string[] = [];
  for (const h of hours) {
    for (const p of parts) {
      if (!mw) {
        accepted.push(`${h} giờ ${p}`);
      } else {
        for (const m of minutes) {
          accepted.push(`${h} giờ ${m} phút ${p}`);
          accepted.push(`${h} giờ ${m} ${p}`);
        }
      }
    }
    // also without a day part (lesson: "Bây giờ là 5 giờ 20 phút")
    if (!mw) accepted.push(`${h} giờ`);
    else for (const m of minutes) accepted.push(`${h} giờ ${m} phút`);
  }
  const primary = mw ? `${hw.primary} giờ ${mw.primary} phút ${parts[0]}` : `${hw.primary} giờ ${parts[0]}`;
  return { primary, accepted: Array.from(new Set(accepted)) };
}

export function formatClock(hour24: number, minute: number): string {
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
