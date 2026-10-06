# Technical audit report: <system name>

Snapshot: <commit or archive hash>  Date: <YYYY-MM-DD>  Auditor: <name>

## 1. Summary

Three to five sentences. What the system is, what state it is in, the single
biggest risk, and whether the recommendation is to harden the existing code or
rebuild specific modules.

| Severity | Count |
|---|---|
| Critical | |
| High | |
| Medium | |
| Low | |

## 2. Reproduction on a clean environment

Exact commands and results from `scripts/audit.sh`. Attach `reports/<stamp>/`.

| Step | Command | Result | Notes |
|---|---|---|---|
| Install | | | lockfile honoured? |
| Lint | | | warnings count |
| Build | | | |
| Tests | | | passed / failed / skipped vs the number claimed |
| Prisma validate | | | provider |

Differences from the previously reported numbers, with the reason for each.

## 3. Production blockers

Numbered list. Each item: what, where (file/module), why it blocks production,
what fixes it, estimated effort (S/M/L).

## 4. Findings by area

One subsection per area, findings ordered by severity. Each finding:

**[Severity] Title**
Location: `path/to/file.ts:line`
Evidence: what was observed (quote, test output, request/response).
Impact: what goes wrong in production.
Fix: concrete change.

Areas:
- Architecture, module boundaries, runtime consistency (Node / Bun)
- Authentication, authorization, sessions, rate limiting, secrets
- Data model, constraints, transactions, migrations, PostgreSQL readiness, backup/restore
- Import workflow (parsing, header mapping, validation, duplicates, preview/commit integrity, rollback)
- Attendance and tardiness state transitions, corrections, audit trail
- Messaging integration (templates, consent, aggregation, idempotency, queue/retry, webhook verification, status handling)
- Arabic / RTL in UI, validation, PDF and Excel output
- Deployment readiness (environments, reverse proxy, database hosting, backups, monitoring, rollback)

## 5. Module matrix

See `MODULE_MATRIX.md` (Keep / Refactor / Replace / Rebuild with reasons, risk, effort).

## 6. Target architecture and runtime

One recommended deployment model and one runtime, with the alternatives that
were considered and why they were not chosen.

## 7. PostgreSQL migration and validation plan

Steps, commands, data checks, backup/restore drill, rollback.

## 8. Messaging production integration plan

From current state to live sending: business verification, sender approval,
template submission, webhook endpoint, test-sender validation, staged cutover,
monitoring of delivery states.

## 9. Prioritised roadmap

| # | Milestone | Scope | Acceptance criteria | Effort |
|---|---|---|---|---|

## 10. Appendix

Commands, environment versions, synthetic test data used, tools.
