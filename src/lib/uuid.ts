function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export function createClientId(): string {
  const cryptoObject =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (cryptoObject?.randomUUID) {
    return cryptoObject.randomUUID();
  }

  if (cryptoObject?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObject.getRandomValues(bytes);

    // RFC 4122 version 4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    return bytesToUuid(bytes);
  }

  // Final UI-safe fallback for very old or restricted environments.
  const timestamp = Date.now().toString(16).padStart(12, '0');
  const random = Math.random().toString(16).replace('.', '').padEnd(20, '0').slice(0, 20);
  const fallback = `${timestamp}${random}`.slice(0, 32);
  const chars = fallback.split('');

  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);

  return [
    chars.slice(0, 8).join(''),
    chars.slice(8, 12).join(''),
    chars.slice(12, 16).join(''),
    chars.slice(16, 20).join(''),
    chars.slice(20, 32).join(''),
  ].join('-');
}
