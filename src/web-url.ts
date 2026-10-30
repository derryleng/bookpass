/** Whether this is an address a bookmark may point at: http, https or ftp. Anything else (javascript:, data:, file:) is not. */
export function isWebUrl(url: string): boolean {
  try {
    return /^(https?|ftp):$/.test(new URL(url.trim()).protocol);
  } catch {
    return false;
  }
}
