# Module matrix template

Decision rules used in the audit:

- **Keep**: works, tested, no structural problem. Only cosmetic or config changes.
- **Refactor**: right responsibility, wrong shape. Internal changes behind the same interface, covered by existing or added tests.
- **Replace**: the approach is wrong for production (for example a process-local rate limiter in a multi-instance deployment). Swap the component, keep the callers.
- **Rebuild**: the module cannot meet a non-negotiable requirement without starting again, and the evidence for that is listed.

A rebuild recommendation without concrete evidence is not allowed.

| Module | Decision | Evidence (file / test / behaviour) | Risk if left | Effort | Depends on |
|---|---|---|---|---|---|
| Authentication (login, sessions) | | | | | |
| Authorization (roles, server-side checks) | | | | | |
| User management (admin, restricted role) | | | | | |
| Rate limiting | | | | | |
| Student import (parse, map, validate, preview, commit) | | | | | |
| Attendance / tardiness workflow | | | | | |
| Biometric event intake | | | | | |
| Messaging: template and consent layer | | | | | |
| Messaging: queue, retry, idempotency | | | | | |
| Messaging: webhook verification and status handling | | | | | |
| Reports (PDF, Excel, RTL) | | | | | |
| Data model and migrations | | | | | |
| Backup / restore | | | | | |
| Deployment / runtime | | | | | |
| Branding / configuration surfaces | | | | | |
