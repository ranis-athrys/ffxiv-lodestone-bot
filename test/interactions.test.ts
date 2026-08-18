import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { verifyRequest } from '../src/discord/verify.ts';

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

async function signedRequest(body: string, keyPair: CryptoKeyPair, timestamp = '1') {
  const signature = await crypto.subtle.sign(
    { name: 'Ed25519' },
    keyPair.privateKey,
    new TextEncoder().encode(timestamp + body),
  );
  return new Request('https://bot.example/', {
    method: 'POST',
    body,
    headers: {
      'x-signature-ed25519': toHex(signature),
      'x-signature-timestamp': timestamp,
    },
  });
}

describe('verifyRequest', () => {
  it('accepts a correctly signed body and rejects a tampered one', async () => {
    const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const publicKey = toHex(
      (await crypto.subtle.exportKey('raw', keyPair.publicKey)) as ArrayBuffer,
    );
    const body = JSON.stringify({ type: 1 });

    expect(await verifyRequest(await signedRequest(body, keyPair), body, publicKey)).toBe(true);
    expect(await verifyRequest(await signedRequest(body, keyPair), '{"type":2}', publicKey)).toBe(
      false,
    );
  });

  it('rejects a request with no signature headers', async () => {
    const request = new Request('https://bot.example/', { method: 'POST', body: '{}' });
    expect(await verifyRequest(request, '{}', env.DISCORD_PUBLIC_KEY)).toBe(false);
  });

  it('rejects a malformed signature instead of throwing', async () => {
    const request = new Request('https://bot.example/', {
      method: 'POST',
      body: '{}',
      headers: { 'x-signature-ed25519': 'not-hex', 'x-signature-timestamp': '1' },
    });
    expect(await verifyRequest(request, '{}', env.DISCORD_PUBLIC_KEY)).toBe(false);
  });
});

describe('worker routes', () => {
  it('answers a health check', async () => {
    const response = await SELF.fetch('https://bot.example/health');
    expect(response.status).toBe(200);
  });

  it('rejects an unsigned interaction with 401', async () => {
    const response = await SELF.fetch('https://bot.example/', {
      method: 'POST',
      body: JSON.stringify({ type: 1 }),
    });
    expect(response.status).toBe(401);
  });

  it('404s anything else', async () => {
    const response = await SELF.fetch('https://bot.example/whatever');
    expect(response.status).toBe(404);
  });
});
