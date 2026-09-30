/**
 * Authenticated file access for the inbox pages. Checks the response, so an
 * API error is reported instead of being saved to disk as if it were the file.
 */
export function useAuthedDownload() {
  const { token } = useAuth();
  const apiBase = useRuntimeConfig().app.baseURL.replace(/\/$/, "");
  const error = ref("");

  async function authedFetch(url: string): Promise<Response> {
    const res = await fetch(url, {
      headers: token.value ? { Authorization: `Bearer ${token.value}` } : {},
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json())?.error ?? "";
      } catch {
        // body wasn't JSON
      }
      throw new Error(detail || `Request failed (${res.status})`);
    }
    return res;
  }

  /** Saves the response as `filename`. Resolves to whether the export was cut short. */
  async function download(
    url: string,
    filename: string,
  ): Promise<{ truncated: boolean } | null> {
    error.value = "";
    try {
      const res = await authedFetch(url);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      // Revoking straight away can cancel the save in Safari/Firefox.
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      return { truncated: res.headers.get("X-Export-Truncated") === "true" };
    } catch (e: any) {
      error.value = e?.message
        ? `Download failed: ${e.message}`
        : "Download failed. Please try again.";
      return null;
    }
  }

  /** Blob of the response with an explicit type (attachments arrive as octet-stream). */
  async function fetchBlob(url: string, type?: string): Promise<Blob> {
    const res = await authedFetch(url);
    const blob = await res.blob();
    return type ? new Blob([blob], { type }) : blob;
  }

  return { apiBase, error, authedFetch, download, fetchBlob };
}
