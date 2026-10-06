import { describe, expect, it } from "vitest";
import { checkArabicText, detectHeaderRow, mapNoorHeaders, normaliseHeader } from "../src/index.js";

describe("checkArabicText", () => {
  it("passes a clean Arabic string", () => {
    expect(checkArabicText("تم تسجيل الغياب بنجاح")).toEqual([]);
  });

  it("flags English fallback and missing Arabic", () => {
    expect(checkArabicText("Required field").map((i) => i.code)).toEqual(["no_arabic"]);
    expect(checkArabicText("هذا الحقل required").map((i) => i.code)).toContain("english_fallback");
  });

  it("flags presentation forms and mixed digit systems", () => {
    expect(checkArabicText("ﻟﻠﺭ").map((i) => i.code)).toContain("presentation_forms");
    expect(checkArabicText("الصف ٣ الفصل 2").map((i) => i.code)).toContain("mixed_digit_systems");
  });

  it("flags a phone number embedded without an LTR isolate, and accepts one with it", () => {
    expect(checkArabicText("رقم ولي الأمر 0501234567").map((i) => i.code)).toContain("ltr_isolate_missing");
    expect(checkArabicText("رقم ولي الأمر ⁦0501234567⁩")).toEqual([]);
  });
});

describe("Noor header mapping", () => {
  it("normalises hamza, taa marbuta and tashkeel variants", () => {
    expect(normaliseHeader("إسم الطالب")).toBe(normaliseHeader("اسم الطالب"));
    expect(normaliseHeader("رقم جوال ولي الامر")).toBe(normaliseHeader("رقم جوال ولي الأمر"));
    expect(normaliseHeader("الصَّف")).toBe("الصف");
  });

  it("maps known headers, reports unknown ones and missing required fields", () => {
    const m = mapNoorHeaders(["رقم الطالب", "إسم الطالب", "الصف", "ملاحظات"]);
    expect(m.mapped).toEqual({ 0: "studentNumber", 1: "studentName", 2: "grade" });
    expect(m.unmapped).toEqual([{ index: 3, header: "ملاحظات" }]);
    expect(m.missingRequired).toEqual(["guardianPhone"]);
  });

  it("finds the real header row under title rows", () => {
    const rows = [
      ["وزارة التعليم", "", ""],
      ["تقرير الطلاب", "", ""],
      ["رقم الطالب", "اسم الطالب", "رقم جوال ولي الأمر"],
      ["1001", "أحمد", "0501234567"],
    ];
    expect(detectHeaderRow(rows)).toBe(2);
    expect(detectHeaderRow([["a", "b"]])).toBe(-1);
  });
});
