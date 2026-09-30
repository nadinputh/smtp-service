export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

/**
 * Single source of truth for the account password policy. Applied uniformly
 * to registration, self-service password change, and admin-set passwords —
 * these used to disagree (8 chars + complexity at signup, 6 chars with no
 * complexity check everywhere else), which let an admin or "change password"
 * flow set a weaker password than registration would ever allow.
 */
export function passwordPolicyError(password: unknown): string | null {
  if (typeof password !== "string") return "Password must be a string";
  // bcrypt silently ignores everything past 72 bytes; refuse instead.
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_BYTES} bytes`;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    return "Password must contain uppercase, lowercase, and a number";
  }
  return null;
}
