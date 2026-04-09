/**
 * Rewrites HTML content to add click tracking and open tracking pixel.
 */
export function injectTracking(
  html: string,
  messageId: string,
  trackingBaseUrl: string,
): string {
  let result = html;

  // 1. Rewrite <a href="..."> links for click tracking
  result = result.replace(
    /<a\s([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
    (_match, before: string, url: string, after: string) => {
      // Skip mailto:, tel:, and anchor links
      if (/^(mailto:|tel:|#|javascript:)/i.test(url)) {
        return _match;
      }
      const tracked = `${trackingBaseUrl}/t/click/${messageId}?url=${encodeURIComponent(url)}`;
      return `<a ${before}href="${tracked}"${after}>`;
    },
  );

  // 2. Inject open tracking pixel before </body>
  const pixel = `<img src="${trackingBaseUrl}/t/open/${messageId}" width="1" height="1" style="display:none" alt="" />`;

  if (result.includes("</body>")) {
    result = result.replace("</body>", `${pixel}</body>`);
  } else {
    // No body tag — append at end
    result += pixel;
  }

  return result;
}
