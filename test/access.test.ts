import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkPostAccess } from '../src/discord/api.ts';

function stub(responder: (path: string) => Response): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return responder(new URL(url).pathname);
  });
}

const ok = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkPostAccess', () => {
  it('passes when the bot can read both the guild and the channel', async () => {
    stub(ok);
    expect(await checkPostAccess('token', 'g', 'c')).toBeNull();
  });

  it('reports a commands-only install, where the guild lookup 404s', async () => {
    stub((path) => (path.startsWith('/api/v10/guilds/') ? new Response('{}', { status: 404 }) : ok()));
    const problem = await checkPostAccess('token', 'g', 'c');
    expect(problem?.reason).toContain('not a member');
    expect(problem?.fix).toContain('`bot` scope');
  });

  it('reports a channel the bot cannot see', async () => {
    stub((path) => (path.startsWith('/api/v10/channels/') ? new Response('{}', { status: 403 }) : ok()));
    const problem = await checkPostAccess('token', 'g', 'c');
    expect(problem?.reason).toContain('cannot see that channel');
  });

  it('rethrows an unexpected failure rather than reporting it as a permission problem', async () => {
    stub(() => new Response('{}', { status: 500 }));
    await expect(checkPostAccess('token', 'g', 'c')).rejects.toThrow('500');
  });
});
