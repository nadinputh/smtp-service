export function useApi() {
  const { token } = useAuth();

  function authHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  return {
    async getInboxes() {
      return await $fetch<Inbox[]>("/api/inboxes", {
        headers: authHeaders(),
      });
    },

    async getInbox(inboxId: string) {
      return await $fetch<InboxDetail>(`/api/inboxes/${inboxId}`, {
        headers: authHeaders(),
      });
    },

    async createInbox(name: string) {
      return await $fetch<InboxDetail>("/api/inboxes", {
        method: "POST",
        headers: authHeaders(),
        body: { name },
      });
    },

    async deleteInbox(inboxId: string) {
      return await $fetch<{ success: boolean }>(`/api/inboxes/${inboxId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    },

    async getInboxMessages(
      inboxId: string,
      params?: {
        q?: string;
        from?: string;
        to?: string;
        status?: string;
        after?: string;
        before?: string;
        page?: number;
        limit?: number;
      },
    ) {
      const query: Record<string, string> = {};
      if (params?.q) query.q = params.q;
      if (params?.from) query.from = params.from;
      if (params?.to) query.to = params.to;
      if (params?.status) query.status = params.status;
      if (params?.after) query.after = params.after;
      if (params?.before) query.before = params.before;
      if (params?.page) query.page = String(params.page);
      if (params?.limit) query.limit = String(params.limit);
      return await $fetch<PaginatedMessages>(
        `/api/inboxes/${inboxId}/messages`,
        { headers: authHeaders(), query },
      );
    },

    async getMessage(messageId: string) {
      return await $fetch<MessageDetail>(`/api/messages/${messageId}`, {
        headers: authHeaders(),
      });
    },

    async getMessageSource(messageId: string) {
      return await $fetch<string>(`/api/messages/${messageId}/source`, {
        headers: authHeaders(),
        responseType: "text",
      });
    },

    async getMessageHeaders(messageId: string) {
      return await $fetch<HeadersResponse>(
        `/api/messages/${messageId}/headers`,
        { headers: authHeaders() },
      );
    },

    async deleteMessage(messageId: string) {
      return await $fetch<{ success: boolean }>(`/api/messages/${messageId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    },

    async deleteInboxMessages(inboxId: string) {
      return await $fetch<{ success: boolean; deleted: number }>(
        `/api/inboxes/${inboxId}/messages`,
        { method: "DELETE", headers: authHeaders() },
      );
    },

    // ─── Domains ────────────────────────────────────────────
    async getDomains() {
      return await $fetch<Domain[]>("/api/domains", {
        headers: authHeaders(),
      });
    },

    async createDomain(domain: string) {
      return await $fetch<DomainDetail>("/api/domains", {
        method: "POST",
        headers: authHeaders(),
        body: { domain },
      });
    },

    async verifyDomain(domainId: string) {
      return await $fetch<{ verified: boolean; errors: string[] }>(
        `/api/domains/${domainId}/verify`,
        { method: "POST", headers: authHeaders() },
      );
    },

    async deleteDomain(domainId: string) {
      return await $fetch<{ success: boolean }>(`/api/domains/${domainId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    },

    // ─── Webhooks ───────────────────────────────────────────
    async getWebhooks(inboxId: string) {
      return await $fetch<Webhook[]>(`/api/inboxes/${inboxId}/webhooks`, {
        headers: authHeaders(),
      });
    },

    async createWebhook(
      inboxId: string,
      data: {
        url: string;
        onDelivered?: boolean;
        onBounced?: boolean;
        onOpened?: boolean;
      },
    ) {
      return await $fetch<Webhook>(`/api/inboxes/${inboxId}/webhooks`, {
        method: "POST",
        headers: authHeaders(),
        body: data,
      });
    },

    async deleteWebhook(inboxId: string, webhookId: string) {
      return await $fetch<{ success: boolean }>(
        `/api/inboxes/${inboxId}/webhooks/${webhookId}`,
        { method: "DELETE", headers: authHeaders() },
      );
    },

    // ─── Delivery Logs ──────────────────────────────────────
    async getDeliveryLogs(messageId: string) {
      return await $fetch<DeliveryLog[]>(
        `/api/messages/${messageId}/delivery`,
        { headers: authHeaders() },
      );
    },

    // ─── Send Email ─────────────────────────────────────────
    async sendEmail(data: {
      inboxId: string;
      from: string;
      to: string[];
      subject: string;
      html?: string;
      text?: string;
      sendAt?: string;
      headers?: Record<string, string>;
      templateId?: string;
      variables?: Record<string, string>;
    }) {
      return await $fetch<{
        id: string;
        status: string;
        message: string;
        suppressed?: string[];
      }>("/v1/messages", {
        method: "POST",
        headers: authHeaders(),
        body: data,
      });
    },

    // ─── Batch Send ─────────────────────────────────────────
    async sendBatch(data: {
      from: string;
      subject: string;
      inboxId: string;
      templateId?: string;
      html?: string;
      text?: string;
      recipients: Array<{
        to: string;
        variables?: Record<string, string>;
      }>;
    }) {
      return await $fetch<{
        batchId: string;
        messageIds: string[];
        count: number;
        suppressed?: string[];
      }>("/v1/messages/batch", {
        method: "POST",
        headers: authHeaders(),
        body: data,
      });
    },

    // ─── Forward ────────────────────────────────────────────
    async forwardMessage(messageId: string, to: string) {
      return await $fetch<{ id: string; status: string; message: string }>(
        `/api/messages/${messageId}/forward`,
        { method: "POST", headers: authHeaders(), body: { to } },
      );
    },

    // ─── Schedule Cancel ────────────────────────────────────
    async cancelScheduledMessage(messageId: string) {
      return await $fetch<{ success: boolean; status: string }>(
        `/api/messages/${messageId}/schedule`,
        { method: "DELETE", headers: authHeaders() },
      );
    },

    // ─── Templates ──────────────────────────────────────────
    async getTemplates() {
      return await $fetch<Template[]>("/api/templates", {
        headers: authHeaders(),
      });
    },

    async getTemplate(templateId: string) {
      return await $fetch<Template>(`/api/templates/${templateId}`, {
        headers: authHeaders(),
      });
    },

    async createTemplate(data: {
      name: string;
      subject?: string;
      html: string;
      text?: string;
    }) {
      return await $fetch<Template>("/api/templates", {
        method: "POST",
        headers: authHeaders(),
        body: data,
      });
    },

    async updateTemplate(
      templateId: string,
      data: {
        name?: string;
        subject?: string;
        html?: string;
        text?: string;
      },
    ) {
      return await $fetch<Template>(`/api/templates/${templateId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: data,
      });
    },

    async deleteTemplate(templateId: string) {
      return await $fetch<{ success: boolean }>(
        `/api/templates/${templateId}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        },
      );
    },

    // ─── Suppressions ───────────────────────────────────────
    async getSuppressions(params?: {
      q?: string;
      page?: number;
      limit?: number;
    }) {
      const query: Record<string, string> = {};
      if (params?.q) query.q = params.q;
      if (params?.page) query.page = String(params.page);
      if (params?.limit) query.limit = String(params.limit);
      return await $fetch<PaginatedSuppressions>("/api/suppressions", {
        headers: authHeaders(),
        query,
      });
    },

    async addSuppression(email: string, reason?: string) {
      return await $fetch<Suppression>("/api/suppressions", {
        method: "POST",
        headers: authHeaders(),
        body: { email, reason },
      });
    },

    async removeSuppression(id: string) {
      return await $fetch<{ success: boolean }>(`/api/suppressions/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    },

    // ─── API Keys ───────────────────────────────────────────
    async getApiKeys() {
      return await $fetch<ApiKey[]>("/api/keys", { headers: authHeaders() });
    },

    async createApiKey(data: {
      name: string;
      scopes: string[];
      expiresAt?: string;
    }) {
      return await $fetch<ApiKeyCreateResponse>("/api/keys", {
        method: "POST",
        headers: authHeaders(),
        body: data,
      });
    },

    async deleteApiKey(keyId: string) {
      return await $fetch<{ success: boolean }>(`/api/keys/${keyId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    },

    // ─── Webhook Logs ───────────────────────────────────────
    async getWebhookLogs(inboxId: string, webhookId: string) {
      return await $fetch<WebhookLog[]>(
        `/api/inboxes/${inboxId}/webhooks/${webhookId}/logs`,
        { headers: authHeaders() },
      );
    },

    async retryWebhookLog(inboxId: string, webhookId: string, logId: string) {
      return await $fetch<{ success: boolean }>(
        `/api/inboxes/${inboxId}/webhooks/${webhookId}/logs/${logId}/retry`,
        { method: "POST", headers: authHeaders() },
      );
    },

    // ─── Analytics ────────────────────────────────────────────
    async getAnalyticsOverview(period?: string) {
      const query: Record<string, string> = {};
      if (period) query.period = period;
      return await $fetch<AnalyticsOverview>("/api/analytics/overview", {
        headers: authHeaders(),
        query,
      });
    },

    async getAnalyticsTimeseries(metric?: string, period?: string) {
      const query: Record<string, string> = {};
      if (metric) query.metric = metric;
      if (period) query.period = period;
      return await $fetch<TimeseriesData>("/api/analytics/timeseries", {
        headers: authHeaders(),
        query,
      });
    },

    async getAnalyticsTopRecipients() {
      return await $fetch<{ domains: { domain: string; count: number }[] }>(
        "/api/analytics/top-recipients",
        { headers: authHeaders() },
      );
    },

    async getAnalyticsBounceRate(period?: string) {
      const query: Record<string, string> = {};
      if (period) query.period = period;
      return await $fetch<TimeseriesData>("/api/analytics/bounce-rate", {
        headers: authHeaders(),
        query,
      });
    },

    // ─── Inbox Members ──────────────────────────────────────
    async getInboxMembers(inboxId: string) {
      return await $fetch<InboxMember[]>(`/api/inboxes/${inboxId}/members`, {
        headers: authHeaders(),
      });
    },

    async addInboxMember(inboxId: string, email: string, role: string) {
      return await $fetch<InboxMember>(`/api/inboxes/${inboxId}/members`, {
        method: "POST",
        headers: authHeaders(),
        body: { email, role },
      });
    },

    async updateInboxMemberRole(
      inboxId: string,
      memberId: string,
      role: string,
    ) {
      return await $fetch<InboxMember>(
        `/api/inboxes/${inboxId}/members/${memberId}`,
        { method: "PUT", headers: authHeaders(), body: { role } },
      );
    },

    async removeInboxMember(inboxId: string, memberId: string) {
      return await $fetch<{ success: boolean }>(
        `/api/inboxes/${inboxId}/members/${memberId}`,
        { method: "DELETE", headers: authHeaders() },
      );
    },

    async getAccountUsage() {
      return await $fetch<AccountUsage>("/api/account/usage", {
        headers: authHeaders(),
      });
    },

    // ─── Admin: User Management ─────────────────────────────
    async createAdminUser(data: {
      email: string;
      password: string;
      name?: string;
      role?: string;
    }) {
      return await $fetch<AdminUser>("/api/admin/users", {
        method: "POST",
        headers: authHeaders(),
        body: data,
      });
    },

    async getAdminUsers(params?: {
      page?: number;
      limit?: number;
      search?: string;
    }) {
      const query: Record<string, string> = {};
      if (params?.page) query.page = String(params.page);
      if (params?.limit) query.limit = String(params.limit);
      if (params?.search) query.search = params.search;
      return await $fetch<PaginatedUsers>("/api/admin/users", {
        headers: authHeaders(),
        query,
      });
    },

    async getAdminUser(userId: string) {
      return await $fetch<AdminUser>(`/api/admin/users/${userId}`, {
        headers: authHeaders(),
      });
    },

    async updateAdminUser(
      userId: string,
      data: { role?: string; name?: string },
    ) {
      return await $fetch<AdminUser>(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: data,
      });
    },

    async deleteAdminUser(userId: string) {
      return await $fetch<void>(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    },

    async setAdminUserPassword(userId: string, password: string) {
      return await $fetch<{ success: boolean }>(
        `/api/admin/users/${userId}/password`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: { password },
        },
      );
    },

    // ─── Auth / Profile ─────────────────────────────────────
    async getMe() {
      return await $fetch<AdminUser>("/api/auth/me", {
        headers: authHeaders(),
      });
    },

    async changePassword(currentPassword: string, newPassword: string) {
      return await $fetch<{ success: boolean }>("/api/auth/change-password", {
        method: "PUT",
        headers: authHeaders(),
        body: { currentPassword, newPassword },
      });
    },

    // ─── Teams ──────────────────────────────────────────────
    async getTeams() {
      return await $fetch<Team[]>("/api/teams", { headers: authHeaders() });
    },

    async createTeam(name: string) {
      return await $fetch<Team>("/api/teams", {
        method: "POST",
        headers: authHeaders(),
        body: { name },
      });
    },

    async getTeam(teamId: string) {
      return await $fetch<Team>(`/api/teams/${teamId}`, {
        headers: authHeaders(),
      });
    },

    async updateTeam(teamId: string, name: string) {
      return await $fetch<Team>(`/api/teams/${teamId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: { name },
      });
    },

    async deleteTeam(teamId: string) {
      return await $fetch<void>(`/api/teams/${teamId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    },

    async getTeamMembers(teamId: string) {
      return await $fetch<TeamMember[]>(`/api/teams/${teamId}/members`, {
        headers: authHeaders(),
      });
    },

    async searchUsers(query: string) {
      return await $fetch<{ id: string; email: string; name: string | null }[]>(
        "/api/users/search",
        { headers: authHeaders(), query: { q: query } },
      );
    },

    async addTeamMember(teamId: string, userId: string, role?: string) {
      return await $fetch<TeamMember>(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: authHeaders(),
        body: { userId, role },
      });
    },

    async updateTeamMemberRole(teamId: string, userId: string, role: string) {
      return await $fetch<TeamMember>(
        `/api/teams/${teamId}/members/${userId}`,
        { method: "PUT", headers: authHeaders(), body: { role } },
      );
    },

    async removeTeamMember(teamId: string, userId: string) {
      return await $fetch<void>(`/api/teams/${teamId}/members/${userId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    },

    // ─── Read Status ──────────────────────────────────────
    async markMessageRead(messageId: string) {
      return await $fetch<{ success: boolean }>(
        `/api/messages/${messageId}/read`,
        { method: "PUT", headers: authHeaders() },
      );
    },

    async markMessageUnread(messageId: string) {
      return await $fetch<{ success: boolean }>(
        `/api/messages/${messageId}/read`,
        { method: "DELETE", headers: authHeaders() },
      );
    },

    async batchMarkRead(
      inboxId: string,
      messageIds: string[],
      isRead: boolean,
    ) {
      return await $fetch<{ success: boolean; updated: number }>(
        `/api/inboxes/${inboxId}/messages/read`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: { messageIds, isRead },
        },
      );
    },
  };
}

// ─── Types ────────────────────────────────────────────────
export interface Inbox {
  id: string;
  name: string;
  smtpUsername: string;
  createdAt: string;
}

export interface InboxDetail extends Inbox {
  userId: string;
  smtpPassword: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  from: string;
  to: string[];
  subject: string | null;
  date: string | null;
  size: number | null;
  status: string;
  isRead: boolean;
  createdAt: string;
}

export interface MessageDetail extends Message {
  inboxId: string;
  cc: string[] | null;
  bcc: string[] | null;
  html: string | null;
  text: string | null;
  rawKey: string;
  attachments: Attachment[] | null;
  spamScore: number | null;
  spamRules: { rule: string; score: number; description: string }[] | null;
}

export interface Attachment {
  filename: string;
  contentType: string;
  size: number;
  storageKey: string;
}

export interface Domain {
  id: string;
  domain: string;
  dkimSelector: string;
  dkimPublicKey: string;
  verified: boolean;
  createdAt: string;
}

export interface DomainDetail extends Domain {
  dnsRecords: {
    dkim: { type: string; name: string; value: string };
    spf: { type: string; name: string; value: string; note: string };
  };
}

export interface Webhook {
  id: string;
  inboxId: string;
  url: string;
  onDelivered: boolean;
  onBounced: boolean;
  onOpened: boolean;
  onReceived: boolean;
  active: boolean;
  createdAt: string;
}

export interface DeliveryLog {
  id: string;
  messageId: string;
  recipient: string;
  status: string;
  smtpCode: number | null;
  smtpResponse: string | null;
  mxHost: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface HeaderEntry {
  key: string;
  value: string;
}

export interface HeadersResponse {
  headers: HeaderEntry[];
  groups: Record<string, HeaderEntry[]>;
  hops: {
    from: string;
    by: string;
    timestamp: string | null;
    delay: string | null;
  }[];
  authChecks: { method: string; result: string }[];
}

export interface PaginatedMessages {
  messages: Message[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreateResponse extends ApiKey {
  rawKey: string;
}

export interface WebhookLog {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  responseBody: string | null;
  error: string | null;
  attempt: number;
  nextRetryAt: string | null;
  status: string;
  createdAt: string;
}

export interface Template {
  id: string;
  userId: string;
  name: string;
  subject: string | null;
  html: string;
  text: string | null;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Suppression {
  id: string;
  userId: string;
  email: string;
  reason: string;
  source: string | null;
  createdAt: string;
}

export interface PaginatedSuppressions {
  suppressions: Suppression[];
  total: number;
  page: number;
  limit: number;
}

export interface AnalyticsOverview {
  totalMessages: number;
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalReceived: number;
  deliveryRate: number;
  bounceRate: number;
  period: {
    days: number;
    total: number;
    sent: number;
    delivered: number;
    bounced: number;
    received: number;
  };
}

export interface TimeseriesData {
  labels: string[];
  values: number[];
  metric?: string;
  period?: string;
}

export interface InboxMember {
  id: string;
  userId: string;
  role: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface AccountUsage {
  monthlySendLimit: number;
  currentMonthlySent: number;
  maxInboxes: number;
  currentInboxes: number;
  maxMessagesPerInbox: number;
  quotaResetAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedUsers {
  data: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  role: string;
  email: string;
  name: string | null;
  createdAt: string;
}
