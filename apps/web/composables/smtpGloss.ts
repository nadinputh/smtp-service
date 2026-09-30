// Plain-language reading of an SMTP failure, keyed by the enhanced status code
// (RFC 3463, e.g. "5.1.1") found in the server's reply, falling back to the
// basic reply class. Returns null when there's nothing useful to add.
const ENHANCED: Record<string, string> = {
  "5.1.1": "That mailbox doesn't exist. Check the address for typos.",
  "5.1.2": "The recipient's domain doesn't exist or has no mail server.",
  "5.1.3": "The recipient address is malformed.",
  "5.2.1": "The mailbox is disabled or not accepting mail.",
  "5.2.2": "The recipient's mailbox is full.",
  "5.3.4": "The message is larger than the receiving server allows.",
  "5.4.1": "The receiving server refused this recipient.",
  "5.7.1":
    "The receiving server rejected the message as unauthorized or as spam. Check SPF, DKIM and DMARC for the sending domain.",
  "5.7.26":
    "The message failed sender authentication. Set up SPF, DKIM and DMARC for the sending domain.",
  "4.2.2": "The recipient's mailbox is full. The server may accept it later.",
  "4.4.1": "The receiving server couldn't be reached. It will be retried.",
  "4.4.2":
    "The connection to the receiving server dropped. It will be retried.",
  "4.7.0":
    "The receiving server is temporarily limiting mail from this sender (for example greylisting). It will be retried.",
};

export function smtpGloss(
  code: number | null | undefined,
  response: string | null | undefined,
): string | null {
  const enhanced = response?.match(/\b([245])\.\d{1,3}\.\d{1,3}\b/)?.[0];
  if (enhanced && ENHANCED[enhanced]) return ENHANCED[enhanced];
  const klass = code ? Math.floor(code / 100) : enhanced ? +enhanced[0] : 0;
  if (klass === 4)
    return "A temporary problem on the receiving side. It will be retried.";
  if (klass === 5)
    return "The receiving server permanently refused the message. Retrying the same message is unlikely to help.";
  return null;
}
