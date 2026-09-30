// Attachment type/name come from the sender, so they're untrusted: only a
// short allowlist of inert types may render inline, everything else
// downloads, and the response can never run script on our origin.
const INLINE_SAFE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

/** Content-Disposition with an ASCII fallback and RFC 5987 UTF-8 filename. */
export function contentDisposition(
  kind: "inline" | "attachment",
  filename: string,
): string {
  const asciiName =
    filename.replace(/[^\x20-\x7e]|["\\]/g, "_") || "attachment";
  // encodeURIComponent leaves ' ( ) * unescaped, which RFC 5987 doesn't allow.
  const encodedName = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}

/** Response headers for serving a stored attachment. */
export function attachmentHeaders(
  filename: string,
  contentType: string,
): Record<string, string> {
  const inline = INLINE_SAFE_TYPES.has(contentType.trim().toLowerCase());
  return {
    "Content-Type": inline ? contentType : "application/octet-stream",
    "Content-Disposition": contentDisposition(
      inline ? "inline" : "attachment",
      filename,
    ),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  };
}
