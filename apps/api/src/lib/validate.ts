/** Trimmed non-empty string within `max` characters, else null. */
export function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

/** True for undefined, null, or a string within `max` characters. */
export function isOptionalString(value: unknown, max: number): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.length <= max)
  );
}

/** Escape LIKE/ILIKE wildcards so user input matches literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Parse a positive integer query value, clamped to [1, max]. */
export function clampInt(
  value: unknown,
  fallback: number,
  max: number,
): number {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  return Math.min(max, Math.max(1, Number.isFinite(n) ? n : fallback));
}
