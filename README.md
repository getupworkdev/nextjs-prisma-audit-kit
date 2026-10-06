# nextjs-prisma-audit-kit

Reproducible tooling for auditing an existing Next.js + Prisma application
before taking it to production, with specific coverage for two things that go
wrong in school and notification systems: PostgreSQL readiness after SQLite
development, and the Meta WhatsApp Cloud API delivery path.

The point of the kit is that audit findings should be reproducible by the
client, not taken on trust. Every check here is code with tests; the report
templates ask for file references and evidence next to every finding.

## What is in it

| Path | Purpose |
|---|---|
| `scripts/audit.sh` | Reproduces install, lint, build and the full test suite on a clean machine, detects the package manager, records Node/Bun versions, pulls the real test counts out of the log, runs `prisma validate`, and checks for tracked `.env` and database files and env files in Git history. Everything lands in `reports/<timestamp>/`. |
| `src/prisma/` | A small Prisma schema parser and a checker that reports: SQLite provider, models without a primary key, foreign keys without an index, missing per-tenant uniqueness (for example student number unique per school), missing `createdAt`/`updatedAt` on audited models, `Json` columns under SQLite, `Float` for money, unconstrained phone columns. |
| `src/whatsapp/signature.ts` | `X-Hub-Signature-256` verification over the raw body with a constant-time compare, plus the GET verification handshake. |
| `src/whatsapp/status.ts` | Message status state machine: provider acceptance is not delivery; statuses only move forward; `failed` is terminal; duplicate and out-of-order webhooks are no-ops. Includes a parser for Cloud API status payloads. |
| `src/whatsapp/aggregate.ts` | Notification planning: E.164 normalisation including Arabic-Indic digits, consent check, one message per guardian with siblings aggregated, deterministic idempotency keys. |
| `src/rtl/arabic.ts` | Checks for Arabic output: English fallback text, presentation-form glyphs, mixed digit systems, phone numbers embedded in RTL text without an LTR isolate. Noor header normalisation and mapping, header-row detection under title rows. |
| `src/report/finding.ts` | Finding model (Critical / High / Medium / Low, area, location, evidence) and Markdown rendering. |
| `docs/REPORT_TEMPLATE.md` | The audit report structure. |
| `docs/MODULE_MATRIX.md` | Keep / Refactor / Replace / Rebuild matrix with the decision rules. |
| `fixtures/` | A synthetic attendance schema in SQLite shape and the checker's output for it. |

## Run it

```bash
npm ci
npm test            # 26 tests
npm run build
node dist/cli/prisma-check.js fixtures/attendance.sqlite.prisma
scripts/audit.sh /path/to/project          # package manager auto-detected
scripts/audit.sh /path/to/project bun      # or force one
```

`prisma-check` takes an optional rules file:

```json
{
  "tenantField": "schoolId",
  "tenantScopedUnique": { "Student": ["studentNumber"] },
  "auditedModels": ["Attendance", "AttendanceCorrection", "Notification"]
}
```

It exits 2 when any Critical finding exists, so it can gate CI.

## Using the library

```ts
import { verifyMetaSignature, extractStatusEvents, applyStatusEvent, planNotifications } from "nextjs-prisma-audit-kit";

// webhook handler
if (!verifyMetaSignature(rawBody, req.headers["x-hub-signature-256"], APP_SECRET)) return 401;
for (const ev of extractStatusEvents(JSON.parse(rawBody))) {
  const record = await load(ev.wamid);
  const result = applyStatusEvent(record, ev); // "applied" | "duplicate" | "stale" | "ignored_after_terminal"
  if (result === "applied") await save(record);
}

// daily absence run
const plan = planNotifications(absences, { date: "2026-10-06", defaultCountryCode: "966" });
// plan.messages: one per guardian, siblings merged, idempotencyKey per message
```

## What it does not do

- It does not replace a manual review of authentication, authorization and business rules. It makes the mechanical parts reproducible so review time goes to judgement.
- It does not send anything to Meta. The WhatsApp modules are the receiving and planning side, which is where most production defects live.
- The Noor header list is a starting set. Real exports vary by school and year; extend `NOOR_HEADER_MAP`.

## License

MIT
