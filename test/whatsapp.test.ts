import { describe, expect, it } from "vitest";
import {
  applyStatusEvent,
  extractStatusEvents,
  handleVerificationHandshake,
  newRecord,
  normalisePhone,
  planNotifications,
  signBody,
  verifyMetaSignature,
  type AbsenceRecord,
} from "../src/index.js";

describe("verifyMetaSignature", () => {
  const secret = "app-secret";
  const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');

  it("accepts a correct signature over the raw body", () => {
    expect(verifyMetaSignature(body, signBody(body, secret), secret)).toBe(true);
  });

  it("rejects a signature computed over re-serialised JSON", () => {
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 2));
    expect(verifyMetaSignature(body, signBody(reserialised, secret), secret)).toBe(false);
  });

  it("rejects missing, malformed and wrong-secret headers", () => {
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=notahex", secret)).toBe(false);
    expect(verifyMetaSignature(body, signBody(body, "other"), secret)).toBe(false);
  });

  it("answers the verification handshake only with the right token", () => {
    const q = { "hub.mode": "subscribe", "hub.verify_token": "t", "hub.challenge": "123" };
    expect(handleVerificationHandshake(q, "t")).toBe("123");
    expect(handleVerificationHandshake(q, "wrong")).toBeNull();
    expect(handleVerificationHandshake({ ...q, "hub.mode": "unsubscribe" }, "t")).toBeNull();
  });
});

describe("status state machine", () => {
  it("moves forward, ignores stale and duplicate events, and treats failed as terminal", () => {
    const r = newRecord("wamid.1", 0);
    expect(applyStatusEvent(r, { wamid: "wamid.1", status: "sent", timestamp: 10 })).toBe("applied");
    expect(applyStatusEvent(r, { wamid: "wamid.1", status: "sent", timestamp: 10 })).toBe("duplicate");
    expect(applyStatusEvent(r, { wamid: "wamid.1", status: "read", timestamp: 30 })).toBe("applied");
    // delivered arrives late, after read: must not regress
    expect(applyStatusEvent(r, { wamid: "wamid.1", status: "delivered", timestamp: 20 })).toBe("stale");
    expect(r.status).toBe("read");
  });

  it("records failure details and ignores anything after failed", () => {
    const r = newRecord("wamid.2", 0);
    applyStatusEvent(r, { wamid: "wamid.2", status: "sent", timestamp: 1 });
    expect(
      applyStatusEvent(r, { wamid: "wamid.2", status: "failed", timestamp: 2, errorCode: 131047, errorTitle: "Re-engagement message" }),
    ).toBe("applied");
    expect(r.errorCode).toBe(131047);
    expect(applyStatusEvent(r, { wamid: "wamid.2", status: "delivered", timestamp: 3 })).toBe("ignored_after_terminal");
  });

  it("extracts status events from a Cloud API payload and ignores inbound messages", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.a", status: "delivered", timestamp: "1700000000" },
                  { id: "wamid.b", status: "failed", timestamp: "1700000001", errors: [{ code: 131026, title: "Message undeliverable" }] },
                  { id: "wamid.c", status: "bogus", timestamp: "1" },
                ],
                messages: [{ from: "9665", id: "wamid.in", type: "text" }],
              },
            },
          ],
        },
      ],
    };
    const events = extractStatusEvents(payload);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ wamid: "wamid.b", status: "failed", errorCode: 131026 });
  });
});

describe("normalisePhone", () => {
  it("normalises Saudi formats to E.164 digits", () => {
    expect(normalisePhone("0501234567", "966")).toBe("966501234567");
    expect(normalisePhone("+966 50 123 4567", "966")).toBe("966501234567");
    expect(normalisePhone("00966501234567", "966")).toBe("966501234567");
    expect(normalisePhone("501234567", "966")).toBe("966501234567");
    expect(normalisePhone("٠٥٠١٢٣٤٥٦٧", "966")).toBe("966501234567");
  });
  it("rejects garbage", () => {
    expect(normalisePhone("12", "966")).toBeNull();
    expect(normalisePhone("abc", "966")).toBeNull();
  });
});

describe("planNotifications", () => {
  const base: Omit<AbsenceRecord, "studentId" | "studentName" | "guardianPhone"> = {
    className: "3A",
    status: "absent",
    guardianConsent: true,
  };

  it("sends one message per guardian, aggregating siblings, and skips no-consent and bad numbers", () => {
    const records: AbsenceRecord[] = [
      { ...base, studentId: "s1", studentName: "أحمد", guardianPhone: "0501234567" },
      { ...base, studentId: "s2", studentName: "سارة", guardianPhone: "+966501234567" }, // same guardian, different format
      { ...base, studentId: "s3", studentName: "خالد", guardianPhone: "0559876543", status: "late" },
      { ...base, studentId: "s4", studentName: "نورة", guardianPhone: "0559876543", guardianConsent: false },
      { ...base, studentId: "s5", studentName: "فهد", guardianPhone: "12" },
      { ...base, studentId: "s1", studentName: "أحمد", guardianPhone: "0501234567" }, // duplicate row
    ];
    const plan = planNotifications(records, { date: "2026-10-06", defaultCountryCode: "966" });

    expect(plan.messages).toHaveLength(2);
    const [first, second] = plan.messages;
    expect(first.to).toBe("966501234567");
    expect(first.template).toBe("absence_multi");
    expect(first.students.map((s) => s.name)).toEqual(["أحمد", "سارة"]);
    expect(first.idempotencyKey).toBe("2026-10-06:966501234567:absence_multi");

    expect(second.to).toBe("966559876543");
    expect(second.template).toBe("late_single");

    expect(plan.skippedNoConsent.map((r) => r.studentId)).toEqual(["s4"]);
    expect(plan.skippedInvalidPhone.map((r) => r.studentId)).toEqual(["s5"]);
  });

  it("is deterministic across runs", () => {
    const records: AbsenceRecord[] = [
      { ...base, studentId: "b", studentName: "ب", guardianPhone: "0500000002" },
      { ...base, studentId: "a", studentName: "أ", guardianPhone: "0500000001" },
    ];
    const opts = { date: "2026-10-06", defaultCountryCode: "966" };
    expect(planNotifications(records, opts)).toEqual(planNotifications([...records].reverse(), opts));
  });
});
