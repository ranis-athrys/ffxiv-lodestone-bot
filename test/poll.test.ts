import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Article, Category } from '../src/lodestone.ts';
import { pollGuild } from '../src/poll.ts';
import { getSeen, newGuildState, putState, type GuildState } from '../src/store.ts';

const GUILD = 'guild-1';
const CHANNEL = 'channel-1';

interface PostedMessage {
  channelId: string;
  embeds: { title: string; footer?: { text: string } }[];
}

let posted: PostedMessage[] = [];
let failNextPost: number | null = null;

function stubDiscord(): void {
  posted = [];
  failNextPost = null;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const match = /\/channels\/([^/]+)\/messages$/.exec(url);
    if (!match) throw new Error(`unexpected fetch to ${url}`);
    if (failNextPost !== null) {
      const status = failNextPost;
      failNextPost = null;
      return new Response('rate limited', { status, headers: { 'retry-after': '1' } });
    }
    posted.push({ channelId: match[1]!, ...(JSON.parse(String(init?.body)) as { embeds: PostedMessage['embeds'] }) });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

function article(id: string, category: Category, title: string, minutesAgo = 0): Article {
  return {
    id,
    category,
    url: `https://na.finalfantasyxiv.com/lodestone/${id}`,
    title,
    time: new Date(Date.UTC(2026, 7, 18, 12, 0, 0) - minutesAgo * 60_000).toISOString(),
  };
}

async function readyState(overrides: Partial<GuildState> = {}): Promise<GuildState> {
  const state: GuildState = {
    ...newGuildState(GUILD),
    channelId: CHANNEL,
    enabled: true,
    seeded: true,
    ...overrides,
  };
  await putState(env.LODESTONE, state);
  return state;
}

const MOG = article('a1', 'topics', 'New Optional Items Available!');
const MIRROR = article('a2', 'developers', 'The Mirror');
const RMT = article('a3', 'notices', 'Actions Taken Against In-Game RMT (Aug. 13)');

beforeEach(async () => {
  await env.LODESTONE.delete(`state:${GUILD}`);
  await env.LODESTONE.delete(`seen:${GUILD}`);
  stubDiscord();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pollGuild', () => {
  it('adopts the existing backlog on the first run without posting', async () => {
    const state = await readyState({ seeded: false });
    const result = await pollGuild(env.LODESTONE, 'token', state, [MOG, MIRROR, RMT]);

    expect(result.posted).toBe(0);
    expect(result.fresh).toBe(3);
    expect(posted).toHaveLength(0);
    expect(await getSeen(env.LODESTONE, GUILD)).toEqual(new Set(['a1', 'a2', 'a3']));
  });

  it('posts only articles a rule matches', async () => {
    const state = await readyState();
    const result = await pollGuild(env.LODESTONE, 'token', state, [MOG, MIRROR, RMT]);

    expect(result.matched).toBe(1);
    expect(result.posted).toBe(1);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.channelId).toBe(CHANNEL);
    expect(posted[0]!.embeds[0]!.title).toBe('New Optional Items Available!');
    expect(posted[0]!.embeds[0]!.footer?.text).toBe('Topics · Mog Station');
  });

  it('marks filtered-out articles seen so they are never reconsidered', async () => {
    const state = await readyState();
    await pollGuild(env.LODESTONE, 'token', state, [MOG, MIRROR, RMT]);
    expect(await getSeen(env.LODESTONE, GUILD)).toEqual(new Set(['a1', 'a2', 'a3']));
  });

  it('does not repost an article it has already seen', async () => {
    const state = await readyState();
    await pollGuild(env.LODESTONE, 'token', state, [MOG]);
    const second = await pollGuild(env.LODESTONE, 'token', state, [MOG]);

    expect(second.fresh).toBe(0);
    expect(posted).toHaveLength(1);
  });

  it('posts oldest first', async () => {
    const state = await readyState();
    const older = article('b1', 'topics', 'Patch 7.54 Notes', 120);
    const newer = article('b2', 'topics', 'Patch 7.55 Notes', 10);
    await pollGuild(env.LODESTONE, 'token', state, [newer, older]);

    expect(posted.map((message) => message.embeds[0]!.title)).toEqual([
      'Patch 7.54 Notes',
      'Patch 7.55 Notes',
    ]);
  });

  it('caps a burst and carries the remainder into the next run', async () => {
    const state = await readyState();
    const burst = Array.from({ length: 11 }, (_, index) =>
      article(`c${index}`, 'topics', `Patch 7.${index} Notes`, 100 - index),
    );

    const first = await pollGuild(env.LODESTONE, 'token', state, burst);
    expect(first.posted).toBe(8);
    expect(first.deferred).toBe(3);

    const second = await pollGuild(env.LODESTONE, 'token', state, burst);
    expect(second.posted).toBe(3);
    expect(posted).toHaveLength(11);
  });

  it('leaves an article unseen when Discord rejects the post', async () => {
    const state = await readyState();
    failNextPost = 429;
    const result = await pollGuild(env.LODESTONE, 'token', state, [MOG]);

    expect(result.posted).toBe(0);
    expect(result.error).toContain('429');
    expect(await getSeen(env.LODESTONE, GUILD)).toEqual(new Set());

    const retry = await pollGuild(env.LODESTONE, 'token', state, [MOG]);
    expect(retry.posted).toBe(1);
  });

  it('skips a disabled guild', async () => {
    const state = await readyState({ enabled: false });
    const result = await pollGuild(env.LODESTONE, 'token', state, [MOG]);

    expect(result.skipped).toBe('disabled');
    expect(posted).toHaveLength(0);
  });

  it('skips a guild with no channel set', async () => {
    const state = await readyState({ channelId: null });
    const result = await pollGuild(env.LODESTONE, 'token', state, [MOG]);

    expect(result.skipped).toBe('no channel configured');
    expect(posted).toHaveLength(0);
  });
});
