export type Severity = "Critical" | "High" | "Medium" | "Low";

export interface Finding {
  severity: Severity;
  /** Short area tag: database, auth, whatsapp, import, rtl, deployment, auditability, data-quality */
  area: string;
  title: string;
  detail: string;
  /** File or module reference so the client can verify the finding. */
  location?: string;
}

export const SEVERITY_ORDER: Severity[] = ["Critical", "High", "Medium", "Low"];

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.area.localeCompare(b.area),
  );
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const out: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const f of findings) out[f.severity]++;
  return out;
}

export function findingsToMarkdown(findings: Finding[]): string {
  const sorted = sortFindings(findings);
  const counts = countBySeverity(findings);
  const lines: string[] = [];
  lines.push(
    `| Severity | Count |`,
    `|---|---|`,
    ...SEVERITY_ORDER.map((s) => `| ${s} | ${counts[s]} |`),
    "",
  );
  for (const s of SEVERITY_ORDER) {
    const group = sorted.filter((f) => f.severity === s);
    if (!group.length) continue;
    lines.push(`## ${s}`, "");
    for (const f of group) {
      lines.push(`### [${f.area}] ${f.title}`);
      if (f.location) lines.push(`Location: \`${f.location}\``);
      lines.push("", f.detail, "");
    }
  }
  return lines.join("\n");
}
