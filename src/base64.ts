// Bytes cross the extension message boundary and the native helper as base64 text.

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if ('toBase64' in view && typeof view.toBase64 === 'function')
    return (view as { toBase64(): string }).toBase64();
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000)
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  if ('fromBase64' in Uint8Array && typeof Uint8Array.fromBase64 === 'function') {
    return (Uint8Array as unknown as { fromBase64(s: string): Uint8Array<ArrayBuffer> }).fromBase64(
      base64,
    );
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}
