# Prisma schema findings for fixtures/attendance.sqlite.prisma

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 10 |
| Low | 4 |

## High

### [database] Datasource provider is sqlite
Location: `schema.prisma datasource`

The schema in this snapshot targets SQLite. Production requires PostgreSQL. Migrations generated against SQLite are not valid for PostgreSQL and must be regenerated from a clean migration history against a real server.

## Medium

### [auditability] Attendance lacks createdAt
Location: `schema.prisma model Attendance`

Attendance, corrections and notification records need timestamps to reconstruct what happened and when.

### [auditability] Attendance lacks updatedAt
Location: `schema.prisma model Attendance`

Attendance, corrections and notification records need timestamps to reconstruct what happened and when.

### [auditability] Notification lacks createdAt
Location: `schema.prisma model Notification`

Attendance, corrections and notification records need timestamps to reconstruct what happened and when.

### [auditability] Notification lacks updatedAt
Location: `schema.prisma model Notification`

Attendance, corrections and notification records need timestamps to reconstruct what happened and when.

### [database] School.settings is Json under sqlite
Location: `schema.prisma model School field settings`

Prisma stores Json as TEXT on SQLite and jsonb on PostgreSQL. Values that round-trip on SQLite (for example, invalid JSON written through raw SQL) will fail on PostgreSQL. Validate the migration with real data.

### [database] Foreign key User.schoolId has no index
Location: `schema.prisma model User field school`

SQLite tolerates this at small scale; PostgreSQL will seq-scan on every join and every tenant-scoped query. Add @@index([schoolId]) or make it the leading column of an existing composite index.

### [database] Foreign key Student.schoolId has no index
Location: `schema.prisma model Student field school`

SQLite tolerates this at small scale; PostgreSQL will seq-scan on every join and every tenant-scoped query. Add @@index([schoolId]) or make it the leading column of an existing composite index.

### [database] Foreign key Attendance.studentId has no index
Location: `schema.prisma model Attendance field student`

SQLite tolerates this at small scale; PostgreSQL will seq-scan on every join and every tenant-scoped query. Add @@index([studentId]) or make it the leading column of an existing composite index.

### [database] Notification.payload is Json under sqlite
Location: `schema.prisma model Notification field payload`

Prisma stores Json as TEXT on SQLite and jsonb on PostgreSQL. Values that round-trip on SQLite (for example, invalid JSON written through raw SQL) will fail on PostgreSQL. Validate the migration with real data.

### [database] Student.studentNumber is not unique per schoolId
Location: `schema.prisma model Student`

studentNumber is globally unique, which blocks two schools from sharing a number. Replace with @@unique([schoolId, studentNumber]).

## Low

### [data-quality] Student.guardianPhone has no length or format constraint
Location: `schema.prisma model Student field guardianPhone`

Guardian phone numbers drive WhatsApp delivery and sibling aggregation. Normalise to E.164 at write time and enforce it with a check constraint or a validated service layer.

### [data-quality] Notification.guardianPhone has no length or format constraint
Location: `schema.prisma model Notification field guardianPhone`

Guardian phone numbers drive WhatsApp delivery and sibling aggregation. Normalise to E.164 at write time and enforce it with a check constraint or a validated service layer.

### [database] Attendance.recordedById looks like a foreign key but has no @relation
Location: `schema.prisma model Attendance field recordedById`

Referential integrity is not enforced by the database for this column. Confirm whether that is intentional.

### [database] Notification.studentId looks like a foreign key but has no @relation
Location: `schema.prisma model Notification field studentId`

Referential integrity is not enforced by the database for this column. Confirm whether that is intentional.

