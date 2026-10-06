#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { checkPrismaSchema } from "../prisma/check.js";
import { findingsToMarkdown } from "../report/finding.js";

const [, , schemaPath = "prisma/schema.prisma", rulesPath] = process.argv;
const source = readFileSync(schemaPath, "utf8");
const rules = rulesPath ? JSON.parse(readFileSync(rulesPath, "utf8")) : {
  tenantField: "schoolId",
  tenantScopedUnique: { Student: ["studentNumber"] },
  auditedModels: ["Attendance", "AttendanceCorrection", "Notification"],
};
const findings = checkPrismaSchema(source, rules);
process.stdout.write(`# Prisma schema findings for ${schemaPath}\n\n` + findingsToMarkdown(findings) + "\n");
process.exitCode = findings.some((f) => f.severity === "Critical") ? 2 : 0;
