/**
 * Arabic / RTL output checks that can run without a browser or a PDF renderer.
 * They catch the classes of defects that show up in generated reports and
 * WhatsApp templates: fallback English, broken shaping, mixed-direction
 * numbers, and unmapped Noor column headers.
 */

const ARABIC_RANGE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻿]/;
const ARABIC_INDIC_DIGITS = /[٠-٩]/;
const ASCII_DIGITS = /[0-9]/;

export interface RtlIssue {
  code:
    | "no_arabic"
    | "presentation_forms"
    | "mixed_digit_systems"
    | "ltr_isolate_missing"
    | "english_fallback";
  message: string;
  sample?: string;
}

/** Check a user-visible Arabic string (UI label, validation message, template body). */
export function checkArabicText(text: string, opts: { allowEnglish?: boolean } = {}): RtlIssue[] {
  const issues: RtlIssue[] = [];
  if (!ARABIC_RANGE.test(text)) {
    issues.push({ code: "no_arabic", message: "String contains no Arabic characters", sample: text.slice(0, 60) });
    return issues;
  }
  if (PRESENTATION_FORMS.test(text)) {
    issues.push({
      code: "presentation_forms",
      message:
        "Text uses Arabic presentation forms (pre-shaped glyphs). This usually means a PDF library shaped the text and the result was pasted back; it breaks search and screen readers.",
      sample: text.slice(0, 60),
    });
  }
  if (ARABIC_INDIC_DIGITS.test(text) && ASCII_DIGITS.test(text)) {
    issues.push({
      code: "mixed_digit_systems",
      message: "String mixes Arabic-Indic and ASCII digits. Pick one digit system per output.",
      sample: text.slice(0, 60),
    });
  }
  // Phone numbers and dates embedded in RTL text should be wrapped in LRI/PDI
  // (U+2066 / U+2069) or LRM so they render left-to-right as a unit.
  const ltrRun = text.match(/(\+?\d[\d\s-]{7,})/);
  if (ltrRun && !/[⁦‎]/.test(text)) {
    issues.push({
      code: "ltr_isolate_missing",
      message: "A long digit run (phone or ID) is embedded in RTL text without an LTR isolate; it may render reversed or split.",
      sample: ltrRun[1],
    });
  }
  if (!opts.allowEnglish && /\b(error|required|invalid|success|loading|submit)\b/i.test(text)) {
    issues.push({
      code: "english_fallback",
      message: "English UI vocabulary found inside an Arabic string; looks like a missing translation.",
      sample: text.slice(0, 60),
    });
  }
  return issues;
}

/** Noor export column names (Arabic) and the fields they map to. Extend per school. */
export const NOOR_HEADER_MAP: Record<string, string> = {
  "رقم الطالب": "studentNumber",
  "اسم الطالب": "studentName",
  "الصف": "grade",
  "الفصل": "className",
  "رقم جوال ولي الأمر": "guardianPhone",
  "جوال ولي الامر": "guardianPhone",
  "اسم ولي الأمر": "guardianName",
  "رقم الهوية": "nationalId",
};

export function normaliseHeader(h: string): string {
  return h
    .replace(/[ً-ْـ]/g, "") // strip tashkeel and tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export interface HeaderMapping {
  mapped: Record<number, string>; // column index -> field
  unmapped: { index: number; header: string }[];
  missingRequired: string[];
}

export function mapNoorHeaders(headers: string[], required: string[] = ["studentNumber", "studentName", "guardianPhone"]): HeaderMapping {
  const normalisedMap = new Map(Object.entries(NOOR_HEADER_MAP).map(([k, v]) => [normaliseHeader(k), v]));
  const mapped: Record<number, string> = {};
  const unmapped: { index: number; header: string }[] = [];
  headers.forEach((h, i) => {
    const field = normalisedMap.get(normaliseHeader(h));
    if (field) mapped[i] = field;
    else unmapped.push({ index: i, header: h });
  });
  const present = new Set(Object.values(mapped));
  return { mapped, unmapped, missingRequired: required.filter((r) => !present.has(r)) };
}

/**
 * Find the header row in a sheet: Noor exports carry title rows above the real
 * header. Returns the first row index where at least `minMatches` known headers appear.
 */
export function detectHeaderRow(rows: string[][], minMatches = 2): number {
  const normalisedKnown = new Set(Object.keys(NOOR_HEADER_MAP).map(normaliseHeader));
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const matches = rows[i].filter((c) => normalisedKnown.has(normaliseHeader(String(c ?? "")))).length;
    if (matches >= minMatches) return i;
  }
  return -1;
}
