/**
 * Guardian notification planning.
 *
 * One guardian phone number often belongs to several students (siblings).
 * The school must send one message per guardian per session, not one per
 * student, and must skip guardians without consent. The output of
 * planNotifications is deterministic, so a test can assert exactly which
 * messages would be sent and with which template parameters.
 */

export interface AbsenceRecord {
  studentId: string;
  studentName: string;
  className: string;
  status: "absent" | "late";
  guardianPhone: string; // any formatting, normalised here
  guardianConsent: boolean;
}

export interface PlannedMessage {
  /** Deterministic idempotency key: date + normalised phone + template. */
  idempotencyKey: string;
  to: string; // E.164
  template: "absence_single" | "absence_multi" | "late_single" | "late_multi";
  students: { name: string; className: string; status: "absent" | "late" }[];
}

export interface PlanOptions {
  date: string; // YYYY-MM-DD
  defaultCountryCode: string; // e.g. "966"
}

export interface PlanResult {
  messages: PlannedMessage[];
  skippedNoConsent: AbsenceRecord[];
  skippedInvalidPhone: AbsenceRecord[];
}

/**
 * Normalise a Saudi or international number to E.164 digits without "+".
 * Accepts "05xxxxxxxx", "5xxxxxxxx", "+9665xxxxxxxx", "009665xxxxxxxx", with
 * spaces or dashes. Returns null when it cannot produce a plausible number.
 */
export function normalisePhone(raw: string, defaultCountryCode: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("+")) digits = digits.slice(1);
  // Convert Arabic-Indic digits if present in the original
  if (/[٠-٩]/.test(raw)) {
    digits = raw
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[^\d]/g, "");
  }
  if (digits.startsWith("0")) digits = defaultCountryCode + digits.slice(1);
  else if (!digits.startsWith(defaultCountryCode) && digits.length <= 10) digits = defaultCountryCode + digits;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function planNotifications(records: AbsenceRecord[], opts: PlanOptions): PlanResult {
  const byGuardian = new Map<string, AbsenceRecord[]>();
  const skippedNoConsent: AbsenceRecord[] = [];
  const skippedInvalidPhone: AbsenceRecord[] = [];

  for (const r of records) {
    if (!r.guardianConsent) {
      skippedNoConsent.push(r);
      continue;
    }
    const phone = normalisePhone(r.guardianPhone, opts.defaultCountryCode);
    if (!phone) {
      skippedInvalidPhone.push(r);
      continue;
    }
    const list = byGuardian.get(phone) ?? [];
    list.push(r);
    byGuardian.set(phone, list);
  }

  const messages: PlannedMessage[] = [];
  for (const [phone, list] of [...byGuardian.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // Deduplicate the same student appearing twice (e.g. two sessions).
    const seen = new Set<string>();
    const students = list
      .filter((r) => (seen.has(r.studentId) ? false : (seen.add(r.studentId), true)))
      .sort((a, b) => a.studentName.localeCompare(b.studentName, "ar"))
      .map((r) => ({ name: r.studentName, className: r.className, status: r.status }));

    const allLate = students.every((s) => s.status === "late");
    const base = allLate ? "late" : "absence";
    const template = `${base}_${students.length > 1 ? "multi" : "single"}` as PlannedMessage["template"];

    messages.push({
      idempotencyKey: `${opts.date}:${phone}:${template}`,
      to: phone,
      template,
      students,
    });
  }

  return { messages, skippedNoConsent, skippedInvalidPhone };
}
