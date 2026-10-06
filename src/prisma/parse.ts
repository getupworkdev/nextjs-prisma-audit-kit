/**
 * Minimal Prisma schema parser. It reads the pieces an audit cares about
 * (datasource provider, models, fields, attributes, block attributes) without
 * pulling in the Prisma engine. It is deliberately tolerant: anything it does
 * not understand is kept as raw text so a finding can still point at it.
 */

export interface PrismaField {
  name: string;
  type: string;
  isList: boolean;
  isOptional: boolean;
  attributes: string[]; // raw, e.g. "@id", "@unique", "@relation(fields: [schoolId], references: [id])"
}

export interface PrismaModel {
  name: string;
  fields: PrismaField[];
  blockAttributes: string[]; // raw, e.g. "@@unique([schoolId, studentNumber])"
  line: number;
}

export interface PrismaSchema {
  provider: string | null;
  models: PrismaModel[];
  enums: string[];
}

const SCALARS = new Set([
  "String",
  "Boolean",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "DateTime",
  "Json",
  "Bytes",
]);

export function isScalarType(type: string, schema: PrismaSchema): boolean {
  return SCALARS.has(type) || schema.enums.includes(type);
}

export function parsePrismaSchema(source: string): PrismaSchema {
  // Normalise one-line blocks such as `model A { id String @id }` so block
  // bodies always sit on their own lines.
  const lines = source
    .replace(/\{\s*(?=\S)/g, "{\n")
    .replace(/(?<=\S)\s*\}/g, "\n}")
    .split(/\r?\n/);
  const schema: PrismaSchema = { provider: null, models: [], enums: [] };

  let i = 0;
  while (i < lines.length) {
    const line = stripComment(lines[i]).trim();

    if (line.startsWith("datasource ")) {
      const end = findBlockEnd(lines, i);
      for (let j = i + 1; j < end; j++) {
        const m = stripComment(lines[j]).match(/provider\s*=\s*"([^"]+)"/);
        if (m) schema.provider = m[1];
      }
      i = end + 1;
      continue;
    }

    if (line.startsWith("enum ")) {
      const name = line.split(/\s+/)[1];
      schema.enums.push(name);
      i = findBlockEnd(lines, i) + 1;
      continue;
    }

    if (line.startsWith("model ")) {
      const name = line.split(/\s+/)[1];
      const end = findBlockEnd(lines, i);
      const model: PrismaModel = { name, fields: [], blockAttributes: [], line: i + 1 };
      for (let j = i + 1; j < end; j++) {
        const raw = stripComment(lines[j]).trim();
        if (!raw) continue;
        if (raw.startsWith("@@")) {
          model.blockAttributes.push(raw);
          continue;
        }
        const field = parseField(raw);
        if (field) model.fields.push(field);
      }
      schema.models.push(model);
      i = end + 1;
      continue;
    }

    i++;
  }

  return schema;
}

function stripComment(line: string): string {
  const idx = line.indexOf("//");
  return idx === -1 ? line : line.slice(0, idx);
}

function findBlockEnd(lines: string[], start: number): number {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return lines.length - 1;
}

function parseField(raw: string): PrismaField | null {
  // name  Type[]?  @attr(...) @attr
  const m = raw.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
  if (!m) return null;
  const [, name, type, list, optional, rest] = m;
  return {
    name,
    type,
    isList: Boolean(list),
    isOptional: Boolean(optional),
    attributes: splitAttributes(rest ?? ""),
  };
}

/** Split "@id @default(autoincrement()) @map("x")" into top-level attributes. */
function splitAttributes(rest: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of rest) {
    if (ch === "@" && depth === 0 && current.trim()) {
      out.push(current.trim());
      current = "";
    }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Extract field names from "[a, b]" inside an attribute such as @@unique([a, b]). */
export function fieldListFromAttribute(attr: string): string[] {
  const m = attr.match(/\[([^\]]*)\]/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim().split(/[\s(]/)[0])
    .filter(Boolean);
}
