import type { BadgeTone } from "./badgeTones";

// The single source of truth for message and delivery statuses: label, badge
// tone, and whether it's offered as a filter. Mirrors what the API and workers
// write to messages.status / delivery_logs.status / webhook_logs.status.
export const MESSAGE_STATUSES: {
  value: string;
  label: string;
  tone: BadgeTone;
  filter: boolean;
}[] = [
  { value: "received", label: "Received", tone: "success", filter: true },
  { value: "queued", label: "Queued", tone: "info", filter: true },
  { value: "scheduled", label: "Scheduled", tone: "info", filter: true },
  { value: "sending", label: "Sending", tone: "info", filter: true },
  { value: "delivered", label: "Delivered", tone: "success", filter: true },
  { value: "bounced", label: "Bounced", tone: "danger", filter: true },
  { value: "failed", label: "Failed", tone: "danger", filter: true },
  { value: "suppressed", label: "Suppressed", tone: "neutral", filter: true },
  { value: "cancelled", label: "Cancelled", tone: "neutral", filter: true },
  // Delivery-log and webhook-log states (not message filters)
  { value: "deferred", label: "Deferred", tone: "warning", filter: false },
  { value: "retrying", label: "Retrying", tone: "warning", filter: false },
  { value: "pending", label: "Pending", tone: "info", filter: false },
  { value: "success", label: "Success", tone: "success", filter: false },
];

export const MESSAGE_STATUS_OPTIONS = MESSAGE_STATUSES.filter((s) => s.filter);

export function statusMeta(status: string) {
  return (
    MESSAGE_STATUSES.find((s) => s.value === status) ?? {
      value: status,
      label: status,
      tone: "neutral" as BadgeTone,
      filter: false,
    }
  );
}

/** Quick status views for the list; a value may be several statuses (comma-separated, as the API takes it). */
export const STATUS_VIEWS = [
  { value: "", label: "All" },
  { value: "bounced,failed", label: "Needs attention" },
  { value: "queued,scheduled,sending", label: "In progress" },
  { value: "delivered", label: "Delivered" },
  { value: "received", label: "Received" },
];
