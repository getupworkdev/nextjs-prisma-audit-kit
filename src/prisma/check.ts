import {
  fieldListFromAttribute,
  isScalarType,
  parsePrismaSchema,
  type PrismaModel,
  type PrismaSchema,
} from "./parse.js";
import type { Finding } from "../report/finding.js";

export interface PrismaCheckOptions {
  /**
   * Fields that must be unique per tenant, e.g. { Student: ["studentNumber"] }
   * with tenantField "schoolId". The checker expects @@unique([schoolId, studentNumber]).
   */
  tenantScopedUnique?: Record<string, string[]>;
  tenantField?: string;
  /** Models that are expected to carry an audit trail (createdAt/updatedAt). */
  auditedModels?: string[];
}

export function checkPrismaSchema(source: string, opts: PrismaCheckOptions = {}): Finding[] {
  const schema = parsePrismaSchema(source);
  const findings: Finding[] = [];

  checkProvider(schema, findings);
  for (const model of schema.models) {
    checkPrimaryKey(model, findings);
    checkRelationIndexes(model, schema, findings);
    checkTimestamps(model, opts, findings);
    checkPortableTypes(model, schema, findings);
  }
  checkTenantUniqueness(schema, opts, findings);

  return findings;
}

function checkProvider(schema: PrismaSchema, findings: Finding[]): void {
  if (schema.provider === "sqlite") {
    findings.push({
      severity: "High",
      area: "database",
      title: "Datasource provider is sqlite",
      detail:
        "The schema in this snapshot targets SQLite. Production requires PostgreSQL. Migrations generated against SQLite are not valid for PostgreSQL and must be regenerated from a clean migration history against a real server.",
      location: "schema.prisma datasource",
    });
  }
  if (!schema.provider) {
    findings.push({
      severity: "Medium",
      area: "database",
      title: "No datasource provider found",
      detail: "The parser did not find a datasource block with a provider. Check the schema is complete.",
    });
  }
}

function checkPrimaryKey(model: PrismaModel, findings: Finding[]): void {
  const hasId = model.fields.some((f) => f.attributes.some((a) => a.startsWith("@id")));
  const hasBlockId = model.blockAttributes.some((a) => a.startsWith("@@id"));
  if (!hasId && !hasBlockId) {
    findings.push({
      severity: "Critical",
      area: "database",
      title: `Model ${model.name} has no primary key`,
      detail: "Every table needs a stable primary key for updates, deletes and audit references.",
      location: `schema.prisma model ${model.name} (line ${model.line})`,
    });
  }
}

/** Relation scalar fields (foreign keys) without an index make joins and tenant filters slow on PostgreSQL. */
function checkRelationIndexes(model: PrismaModel, schema: PrismaSchema, findings: Finding[]): void {
  const indexed = new Set<string>();
  for (const attr of model.blockAttributes) {
    if (attr.startsWith("@@index") || attr.startsWith("@@unique") || attr.startsWith("@@id")) {
      const fields = fieldListFromAttribute(attr);
      if (fields.length) indexed.add(fields[0]); // leading column of a composite index is usable
    }
  }
  for (const f of model.fields) {
    if (f.attributes.some((a) => a.startsWith("@unique") || a.startsWith("@id"))) indexed.add(f.name);
  }

  for (const f of model.fields) {
    const rel = f.attributes.find((a) => a.startsWith("@relation"));
    if (!rel) continue;
    const fkFields = extractNamedList(rel, "fields");
    for (const fk of fkFields) {
      if (!indexed.has(fk)) {
        findings.push({
          severity: "Medium",
          area: "database",
          title: `Foreign key ${model.name}.${fk} has no index`,
          detail:
            "SQLite tolerates this at small scale; PostgreSQL will seq-scan on every join and every tenant-scoped query. Add @@index([" +
            fk +
            "]) or make it the leading column of an existing composite index.",
          location: `schema.prisma model ${model.name} field ${f.name}`,
        });
      }
    }
  }

  // Also flag implicit FK-looking scalars that have no relation attribute at all.
  for (const f of model.fields) {
    if (/Id$/.test(f.name) && isScalarType(f.type, schema) && !model.fields.some((o) => o.attributes.some((a) => a.includes(`fields: [${f.name}]`) || a.includes(`fields:[${f.name}]`)))) {
      if (f.name === "id") continue;
      findings.push({
        severity: "Low",
        area: "database",
        title: `${model.name}.${f.name} looks like a foreign key but has no @relation`,
        detail: "Referential integrity is not enforced by the database for this column. Confirm whether that is intentional.",
        location: `schema.prisma model ${model.name} field ${f.name}`,
      });
    }
  }
}

function checkTimestamps(model: PrismaModel, opts: PrismaCheckOptions, findings: Finding[]): void {
  const audited = opts.auditedModels ?? [];
  if (!audited.includes(model.name)) return;
  const names = new Set(model.fields.map((f) => f.name));
  for (const required of ["createdAt", "updatedAt"]) {
    if (!names.has(required)) {
      findings.push({
        severity: "Medium",
        area: "auditability",
        title: `${model.name} lacks ${required}`,
        detail: "Attendance, corrections and notification records need timestamps to reconstruct what happened and when.",
        location: `schema.prisma model ${model.name}`,
      });
    }
  }
}

/** Types whose behaviour differs between SQLite and PostgreSQL, or that deserve a look. */
function checkPortableTypes(model: PrismaModel, schema: PrismaSchema, findings: Finding[]): void {
  for (const f of model.fields) {
    if (f.type === "Json" && schema.provider === "sqlite") {
      findings.push({
        severity: "Medium",
        area: "database",
        title: `${model.name}.${f.name} is Json under sqlite`,
        detail:
          "Prisma stores Json as TEXT on SQLite and jsonb on PostgreSQL. Values that round-trip on SQLite (for example, invalid JSON written through raw SQL) will fail on PostgreSQL. Validate the migration with real data.",
        location: `schema.prisma model ${model.name} field ${f.name}`,
      });
    }
    if (f.type === "Float" && /amount|price|fee|total|balance/i.test(f.name)) {
      findings.push({
        severity: "Low",
        area: "database",
        title: `${model.name}.${f.name} uses Float for a money-like value`,
        detail: "Use Decimal for anything that is summed or compared for equality.",
        location: `schema.prisma model ${model.name} field ${f.name}`,
      });
    }
    if (f.type === "String" && /phone|mobile|guardianNumber/i.test(f.name) && !f.attributes.some((a) => a.startsWith("@db."))) {
      findings.push({
        severity: "Low",
        area: "data-quality",
        title: `${model.name}.${f.name} has no length or format constraint`,
        detail:
          "Guardian phone numbers drive WhatsApp delivery and sibling aggregation. Normalise to E.164 at write time and enforce it with a check constraint or a validated service layer.",
        location: `schema.prisma model ${model.name} field ${f.name}`,
      });
    }
  }
}

function checkTenantUniqueness(schema: PrismaSchema, opts: PrismaCheckOptions, findings: Finding[]): void {
  const tenantField = opts.tenantField ?? "schoolId";
  const rules = opts.tenantScopedUnique ?? {};
  for (const [modelName, fields] of Object.entries(rules)) {
    const model = schema.models.find((m) => m.name === modelName);
    if (!model) {
      findings.push({
        severity: "Medium",
        area: "database",
        title: `Expected model ${modelName} not found`,
        detail: `The audit rules expect a ${modelName} model with tenant-scoped uniqueness on ${fields.join(", ")}.`,
      });
      continue;
    }
    for (const field of fields) {
      const ok = model.blockAttributes.some((attr) => {
        if (!attr.startsWith("@@unique")) return false;
        const list = fieldListFromAttribute(attr);
        return list.includes(tenantField) && list.includes(field);
      });
      const globallyUnique = model.fields.find((f) => f.name === field)?.attributes.some((a) => a.startsWith("@unique"));
      if (!ok) {
        findings.push({
          severity: globallyUnique ? "Medium" : "Critical",
          area: "database",
          title: `${modelName}.${field} is not unique per ${tenantField}`,
          detail: globallyUnique
            ? `${field} is globally unique, which blocks two schools from sharing a number. Replace with @@unique([${tenantField}, ${field}]).`
            : `Uniqueness is not enforced at the database level. Application checks alone allow duplicates under concurrent imports. Add @@unique([${tenantField}, ${field}]).`,
          location: `schema.prisma model ${modelName}`,
        });
      }
    }
  }
}

function extractNamedList(attr: string, key: string): string[] {
  const m = attr.match(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`));
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}
