/**
 * Message status model for the WhatsApp Cloud API.
 *
 * Provider acceptance (a 200 from /messages with a wamid) is NOT delivery.
 * Delivery is only known from the status webhooks, which can arrive out of
 * order and more than once. This module encodes the rules an audit checks:
 *
 *  - statuses only move forward (queued -> accepted -> sent -> delivered -> read)
 *  - failed is terminal and can follow any non-terminal state
 *  - a duplicate or stale webhook is a no-op, never an error
 */

export type MessageStatus = "queued" | "accepted" | "sent" | "delivered" | "read" | "failed";

const RANK: Record<MessageStatus, number> = {
  queued: 0,
  accepted: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
};

export interface StatusEvent {
  wamid: string;
  status: MessageStatus;
  timestamp: number; // epoch seconds from the webhook
  errorCode?: number;
  errorTitle?: string;
}

export interface MessageRecord {
  wamid: string;
  status: MessageStatus;
  lastEventAt: number;
  errorCode?: number;
  errorTitle?: string;
  /** Webhook event keys already applied, for idempotency. */
  appliedEvents: Set<string>;
}

export type ApplyResult = "applied" | "duplicate" | "stale" | "ignored_after_terminal";

export function eventKey(e: StatusEvent): string {
  return `${e.wamid}:${e.status}:${e.timestamp}`;
}

export function isTerminal(status: MessageStatus): boolean {
  return status === "failed" || status === "read";
}

export function applyStatusEvent(record: MessageRecord, event: StatusEvent): ApplyResult {
  const key = eventKey(event);
  if (record.appliedEvents.has(key)) return "duplicate";

  if (record.status === "failed") {
    record.appliedEvents.add(key);
    return "ignored_after_terminal";
  }

  if (event.status === "failed") {
    record.status = "failed";
    record.lastEventAt = event.timestamp;
    record.errorCode = event.errorCode;
    record.errorTitle = event.errorTitle;
    record.appliedEvents.add(key);
    return "applied";
  }

  if (RANK[event.status] <= RANK[record.status]) {
    record.appliedEvents.add(key);
    return "stale";
  }

  record.status = event.status;
  record.lastEventAt = event.timestamp;
  record.appliedEvents.add(key);
  return "applied";
}

export function newRecord(wamid: string, now: number): MessageRecord {
  return { wamid, status: "queued", lastEventAt: now, appliedEvents: new Set() };
}

/**
 * Parse the statuses array out of a Cloud API webhook payload.
 * Returns an empty list for message (inbound) webhooks, which carry no statuses.
 */
export function extractStatusEvents(payload: unknown): StatusEvent[] {
  const out: StatusEvent[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] }).changes ?? [];
    for (const change of changes) {
      const statuses = (change as { value?: { statuses?: unknown[] } }).value?.statuses ?? [];
      for (const s of statuses) {
        const st = s as {
          id?: string;
          status?: string;
          timestamp?: string;
          errors?: { code?: number; title?: string }[];
        };
        if (!st.id || !st.status) continue;
        const status = st.status as MessageStatus;
        if (!(status in RANK)) continue;
        out.push({
          wamid: st.id,
          status,
          timestamp: Number(st.timestamp ?? 0),
          errorCode: st.errors?.[0]?.code,
          errorTitle: st.errors?.[0]?.title,
        });
      }
    }
  }
  return out;
}
