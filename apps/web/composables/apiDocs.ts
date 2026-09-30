// Reference data for the API docs page and the API key scope picker. The
// scope of every endpoint here is checked against requiredApiKeyScope in
// apps/api/tests/api-docs.test.ts, so it can't drift from the API.

export const API_KEY_SCOPE_INFO = [
  {
    value: "send",
    description: "Send email (POST /v1/messages) and forward messages.",
  },
  {
    value: "read",
    description: "Read inboxes, messages, templates and analytics (GET).",
  },
  { value: "delete", description: "Delete messages and other resources." },
] as const;

export interface ApiEndpoint {
  method: "GET" | "POST" | "DELETE";
  path: string;
  scope: (typeof API_KEY_SCOPE_INFO)[number]["value"];
  summary: string;
}

export const API_ENDPOINTS: ApiEndpoint[] = [
  { method: "POST", path: "/v1/messages", scope: "send", summary: "Send one email (JSON)." },
  { method: "POST", path: "/v1/messages/mime", scope: "send", summary: "Send one email with attachments (multipart)." },
  { method: "POST", path: "/v1/messages/batch", scope: "send", summary: "Send a template to up to 1000 recipients." },
  { method: "POST", path: "/api/messages/:id/forward", scope: "send", summary: "Forward a captured message to an address." },
  { method: "GET", path: "/api/inboxes", scope: "read", summary: "List inboxes you can access." },
  { method: "GET", path: "/api/inboxes/:id", scope: "read", summary: "Inbox detail. SMTP credentials are not included for API keys." },
  { method: "GET", path: "/api/inboxes/:id/messages", scope: "read", summary: "List messages. Query: q, from, to, status, after, before, page, limit (max 100)." },
  { method: "GET", path: "/api/messages/:id", scope: "read", summary: "Message detail with body." },
  { method: "GET", path: "/api/messages/:id/raw", scope: "read", summary: "Raw RFC 822 source." },
  { method: "GET", path: "/api/messages/:id/headers", scope: "read", summary: "Parsed headers." },
  { method: "GET", path: "/api/messages/:id/attachments/:index", scope: "read", summary: "Download an attachment by position." },
  { method: "GET", path: "/api/templates", scope: "read", summary: "List templates." },
  { method: "GET", path: "/api/templates/:id", scope: "read", summary: "Template detail." },
  { method: "GET", path: "/api/domains", scope: "read", summary: "List sender domains and verification status." },
  { method: "GET", path: "/api/suppressions", scope: "read", summary: "List suppressed addresses." },
  { method: "GET", path: "/api/account/usage", scope: "read", summary: "Monthly send quota and usage." },
  { method: "DELETE", path: "/api/messages/:id", scope: "delete", summary: "Delete a message." },
  { method: "DELETE", path: "/api/inboxes/:id/messages", scope: "delete", summary: "Delete every message in an inbox." },
  { method: "DELETE", path: "/api/templates/:id", scope: "delete", summary: "Delete a template." },
  { method: "DELETE", path: "/api/inboxes/:id", scope: "delete", summary: "Delete an inbox and its messages." },
];

export const API_ERRORS = [
  { status: "400", meaning: "Invalid or missing field. The body is { error }." },
  { status: "401", meaning: "Missing, unknown, revoked or expired key." },
  { status: "403", meaning: "The key lacks the scope, or the endpoint needs a user session." },
  { status: "404", meaning: "Not found, or not an inbox you can send from." },
  { status: "422", meaning: "Sender domain not verified, or every recipient is suppressed." },
  { status: "429", meaning: "Rate limit or monthly send quota exceeded." },
] as const;
