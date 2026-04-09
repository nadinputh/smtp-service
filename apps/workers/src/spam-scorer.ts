import type { ParsedMail } from "mailparser";

export interface SpamRule {
  rule: string;
  score: number;
  description: string;
}

export interface SpamResult {
  score: number;
  verdict: "clean" | "suspicious" | "spam";
  rules: SpamRule[];
  suggestions: string[];
}

/**
 * Simple heuristic spam scorer inspired by SpamAssassin rules.
 * Each rule contributes a positive score (higher = spammier).
 */
export function scoreEmail(
  parsed: ParsedMail,
  rawSource: string,
  envelopeFrom?: string,
): SpamResult {
  const rules: SpamRule[] = [];
  const suggestions: string[] = [];

  const subject = parsed.subject ?? "";
  const textBody = parsed.text ?? "";
  const htmlBody = parsed.html || "";
  const from = parsed.from?.text ?? "";
  const headers = parsed.headers;

  // ─── Subject rules ──────────────────────────────────────
  if (/^[A-Z\s!]{10,}$/.test(subject)) {
    rules.push({
      rule: "SUBJ_ALL_CAPS",
      score: 1.5,
      description: "Subject is all uppercase",
    });
    suggestions.push("Avoid using all-caps in the subject line");
  }

  if (/!!+/.test(subject) || /\?\?+/.test(subject)) {
    rules.push({
      rule: "SUBJ_EXCESSIVE_PUNCTUATION",
      score: 1.0,
      description: "Subject has excessive punctuation",
    });
  }

  if (!subject || subject.trim().length === 0) {
    rules.push({
      rule: "MISSING_SUBJECT",
      score: 1.2,
      description: "Email has no subject",
    });
    suggestions.push("Add a meaningful subject line");
  }

  if (
    /\b(free|winner|congratulations|urgent|act now|limited time|buy now|click here|unsubscribe)\b/i.test(
      subject,
    )
  ) {
    rules.push({
      rule: "SUBJ_SPAM_WORDS",
      score: 2.0,
      description: "Subject contains common spam trigger words",
    });
    suggestions.push("Avoid spam trigger words in the subject");
  }

  // ─── Body rules ─────────────────────────────────────────
  const bodyText = textBody + " " + htmlBody;

  if (
    /\b(viagra|cialis|pharmacy|pills|weight loss|diet|miracle)\b/i.test(
      bodyText,
    )
  ) {
    rules.push({
      rule: "BODY_PHARMA_SPAM",
      score: 3.0,
      description: "Body contains pharmaceutical spam keywords",
    });
  }

  if (
    /\b(nigerian prince|wire transfer|bank account|inheritance|million dollars|lottery)\b/i.test(
      bodyText,
    )
  ) {
    rules.push({
      rule: "BODY_ADVANCE_FEE",
      score: 3.5,
      description: "Body contains advance-fee fraud indicators",
    });
  }

  if (/\$\d{1,3}(,\d{3})+/.test(bodyText) || /\b\d+%\s*off\b/i.test(bodyText)) {
    rules.push({
      rule: "BODY_MONEY_OFFERS",
      score: 1.5,
      description: "Body contains money amounts or discount offers",
    });
  }

  // Check for excessive links in HTML
  const linkCount = (htmlBody.match(/<a\s/gi) ?? []).length;
  if (linkCount > 20) {
    rules.push({
      rule: "EXCESSIVE_LINKS",
      score: 1.0,
      description: `HTML body has ${linkCount} links (excessive)`,
    });
    suggestions.push("Reduce the number of links in the email body");
  } else if (linkCount > 10) {
    rules.push({
      rule: "HTML_MANY_LINKS",
      score: 0.5,
      description: `HTML body has ${linkCount} links`,
    });
  }

  // HTML with no text alternative
  if (htmlBody && !textBody) {
    rules.push({
      rule: "HTML_ONLY",
      score: 0.5,
      description: "Email has HTML body but no plain text alternative",
    });
    suggestions.push("Include a plain-text alternative alongside HTML");
  }

  // Image-only HTML
  if (htmlBody) {
    const imgTags = (htmlBody.match(/<img\s/gi) ?? []).length;
    const textContent = htmlBody.replace(/<[^>]*>/g, "").trim();
    if (imgTags > 0 && textContent.length < 50) {
      rules.push({
        rule: "IMAGE_ONLY",
        score: 2.0,
        description: "HTML body is predominantly images with minimal text",
      });
      suggestions.push("Add meaningful text content alongside images");
    }
  }

  // Short body
  if (textBody && textBody.trim().length < 20 && !htmlBody) {
    rules.push({
      rule: "SHORT_BODY",
      score: 0.5,
      description: "Body text is fewer than 20 characters",
    });
  }

  // ─── Header rules ───────────────────────────────────────
  if (!headers.has("message-id")) {
    rules.push({
      rule: "MISSING_MESSAGE_ID",
      score: 0.5,
      description: "Missing Message-ID header",
    });
    suggestions.push("Ensure your mailer sets a Message-ID header");
  }

  if (!headers.has("date")) {
    rules.push({
      rule: "MISSING_DATE",
      score: 1.0,
      description: "Missing Date header",
    });
    suggestions.push("Ensure your mailer sets a Date header");
  }

  if (!headers.has("mime-version")) {
    rules.push({
      rule: "MISSING_MIME_VERSION",
      score: 0.5,
      description: "Missing MIME-Version header",
    });
  }

  // Check for SPF/DKIM/DMARC authentication results
  const authResults = headers.get("authentication-results");
  if (!authResults) {
    rules.push({
      rule: "NO_AUTH_RESULTS",
      score: 0.5,
      description: "No Authentication-Results header",
    });
  }

  // DKIM check
  if (!headers.has("dkim-signature")) {
    rules.push({
      rule: "NO_DKIM",
      score: 1.5,
      description: "No DKIM-Signature header present",
    });
    suggestions.push("Sign outgoing emails with DKIM");
  }

  // SPF check
  const receivedSpf = headers.get("received-spf");
  const hasSpfPass =
    (typeof authResults === "string" && /spf=pass/i.test(authResults)) ||
    (typeof receivedSpf === "string" && /pass/i.test(receivedSpf));
  if (!hasSpfPass && !receivedSpf) {
    rules.push({
      rule: "NO_SPF",
      score: 1.5,
      description: "No SPF pass detected in authentication headers",
    });
    suggestions.push("Configure SPF records for your sending domain");
  }

  // Forged sender check
  if (envelopeFrom && from) {
    const fromDomain = from.match(/@([\w.-]+)/)?.[1]?.toLowerCase();
    const envDomain = envelopeFrom.match(/@([\w.-]+)/)?.[1]?.toLowerCase();
    if (fromDomain && envDomain && fromDomain !== envDomain) {
      rules.push({
        rule: "FORGED_SENDER",
        score: 2.5,
        description: `From domain (${fromDomain}) doesn't match envelope sender (${envDomain})`,
      });
    }
  }

  // Suspicious mailer
  const xMailer = headers.get("x-mailer");
  if (
    typeof xMailer === "string" &&
    /PHPMailer|swiftmailer|mass.?mail/i.test(xMailer)
  ) {
    rules.push({
      rule: "SUSPICIOUS_MAILER",
      score: 1.0,
      description: `Suspicious X-Mailer: ${xMailer}`,
    });
  }

  // Received header chain analysis
  const received = headers.get("received");
  if (!received) {
    rules.push({
      rule: "NO_RECEIVED_HEADERS",
      score: 1.0,
      description: "No Received headers found",
    });
  }

  // From address analysis
  if (from.includes("noreply") || from.includes("no-reply")) {
    rules.push({
      rule: "FROM_NO_REPLY",
      score: 0.5,
      description: "From address is a no-reply address",
    });
  }

  // Missing List-Unsubscribe for bulk-like messages
  if (linkCount > 5 && !headers.has("list-unsubscribe")) {
    rules.push({
      rule: "MISSING_UNSUBSCRIBE",
      score: 1.0,
      description: "Bulk-like message with no List-Unsubscribe header",
    });
    suggestions.push("Add a List-Unsubscribe header for bulk emails");
  }

  // ─── Content analysis ───────────────────────────────────
  // Base64-encoded body without multipart
  if (
    rawSource.includes("Content-Transfer-Encoding: base64") &&
    !rawSource.includes("multipart/")
  ) {
    rules.push({
      rule: "SINGLE_PART_BASE64",
      score: 1.0,
      description: "Single-part base64 encoded message",
    });
  }

  const totalScore = rules.reduce((sum, r) => sum + r.score, 0);
  const rounded = Math.round(totalScore * 10) / 10;

  return {
    score: rounded,
    verdict: rounded < 3 ? "clean" : rounded < 6 ? "suspicious" : "spam",
    rules,
    suggestions,
  };
}
