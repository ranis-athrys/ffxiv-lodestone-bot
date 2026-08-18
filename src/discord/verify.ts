function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error('public key is not valid hex');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Discord signs `timestamp + rawBody`; anything unverified must get a 401 or Discord drops the endpoint. */
export async function verifyRequest(
  request: Request,
  rawBody: string,
  publicKeyHex: string,
): Promise<boolean> {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  if (!signature || !timestamp) return false;

  let signatureBytes: Uint8Array;
  let keyBytes: Uint8Array;
  try {
    signatureBytes = hexToBytes(signature);
    keyBytes = hexToBytes(publicKeyHex);
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'Ed25519' }, false, [
    'verify',
  ]);
  return await crypto.subtle.verify(
    { name: 'Ed25519' },
    key,
    signatureBytes,
    new TextEncoder().encode(timestamp + rawBody),
  );
}
