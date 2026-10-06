import { describe, expect, it } from "vitest";
import { checkPrismaSchema, parsePrismaSchema } from "../src/index.js";

const SCHEMA = `
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
}

model School {
  id        String    @id @default(cuid())
  name      String
  students  Student[]
}

model Student {
  id            String  @id @default(cuid())
  studentNumber String  @unique
  name          String
  guardianPhone String
  schoolId      String
  school        School  @relation(fields: [schoolId], references: [id])
  meta          Json?
}

model Attendance {
  id        String           @id @default(cuid())
  studentId String
  status    AttendanceStatus
  student   Student          @relation(fields: [studentId], references: [id])
  @@index([studentId])
}

model Orphan {
  name String
}
`;

describe("parsePrismaSchema", () => {
  it("reads provider, enums, models, fields and attributes", () => {
    const s = parsePrismaSchema(SCHEMA);
    expect(s.provider).toBe("sqlite");
    expect(s.enums).toEqual(["AttendanceStatus"]);
    expect(s.models.map((m) => m.name)).toEqual(["School", "Student", "Attendance", "Orphan"]);
    const student = s.models[1];
    expect(student.fields.find((f) => f.name === "studentNumber")?.attributes).toEqual(["@unique"]);
    expect(student.fields.find((f) => f.name === "meta")?.isOptional).toBe(true);
    expect(student.fields.find((f) => f.name === "school")?.attributes[0]).toContain("@relation");
  });
});

describe("checkPrismaSchema", () => {
  const findings = checkPrismaSchema(SCHEMA, {
    tenantField: "schoolId",
    tenantScopedUnique: { Student: ["studentNumber"] },
    auditedModels: ["Attendance"],
  });
  const titles = findings.map((f) => f.title);

  it("flags the sqlite provider as a production blocker", () => {
    expect(titles).toContain("Datasource provider is sqlite");
  });

  it("flags a model without a primary key as Critical", () => {
    const f = findings.find((x) => x.title === "Model Orphan has no primary key");
    expect(f?.severity).toBe("Critical");
  });

  it("flags a globally unique student number instead of per-school uniqueness", () => {
    const f = findings.find((x) => x.title === "Student.studentNumber is not unique per schoolId");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("Medium"); // globally unique already, so not Critical
    expect(f?.detail).toContain("@@unique([schoolId, studentNumber])");
  });

  it("flags an unindexed foreign key but not an indexed one", () => {
    expect(titles).toContain("Foreign key Student.schoolId has no index");
    expect(titles).not.toContain("Foreign key Attendance.studentId has no index");
  });

  it("flags missing timestamps on audited models", () => {
    expect(titles).toContain("Attendance lacks createdAt");
    expect(titles).toContain("Attendance lacks updatedAt");
  });

  it("flags Json under sqlite and unconstrained guardian phone", () => {
    expect(titles).toContain("Student.meta is Json under sqlite");
    expect(titles).toContain("Student.guardianPhone has no length or format constraint");
  });

  it("is clean on a well-formed postgres schema", () => {
    const good = `
datasource db { provider = "postgresql" }
model School { id String @id }
model Student {
  id String @id
  studentNumber String
  schoolId String
  school School @relation(fields: [schoolId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([schoolId, studentNumber])
}`;
    const f = checkPrismaSchema(good, { tenantScopedUnique: { Student: ["studentNumber"] }, auditedModels: ["Student"] });
    expect(f).toEqual([]);
  });
});
