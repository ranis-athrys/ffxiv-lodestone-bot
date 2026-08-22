import { DEFAULT_RULES, type Rule } from './rules.ts';

export interface GuildState {
  guildId: string;
  channelId: string | null;
  enabled: boolean;
  rules: Rule[];
  seeded: boolean;
  lastPollAt?: string;
  lastPostAt?: string;
  lastError?: string;
}

const SEEN_LIMIT = 500;

const stateKey = (guildId: string) => `state:${guildId}`;
const seenKey = (guildId: string) => `seen:${guildId}`;

export function newGuildState(guildId: string): GuildState {
  return {
    guildId,
    channelId: null,
    enabled: false,
    rules: structuredClone(DEFAULT_RULES),
    seeded: false,
  };
}

export async function getState(kv: KVNamespace, guildId: string): Promise<GuildState | null> {
  return await kv.get<GuildState>(stateKey(guildId), 'json');
}

export async function getOrCreateState(kv: KVNamespace, guildId: string): Promise<GuildState> {
  return (await getState(kv, guildId)) ?? newGuildState(guildId);
}

export async function putState(kv: KVNamespace, state: GuildState): Promise<void> {
  await kv.put(stateKey(state.guildId), JSON.stringify(state));
}

export async function listGuildStates(kv: KVNamespace): Promise<GuildState[]> {
  const states: GuildState[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: 'state:', cursor });
    for (const key of page.keys) {
      const state = await kv.get<GuildState>(key.name, 'json');
      if (state) states.push(state);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return states;
}

export async function getSeen(kv: KVNamespace, guildId: string): Promise<Set<string>> {
  const ids = await kv.get<string[]>(seenKey(guildId), 'json');
  return new Set(ids ?? []);
}

export async function putSeen(
  kv: KVNamespace,
  guildId: string,
  seen: Set<string>,
): Promise<void> {
  const ids = [...seen].slice(-SEEN_LIMIT);
  await kv.put(seenKey(guildId), JSON.stringify(ids));
}

export async function clearGuild(kv: KVNamespace, guildId: string): Promise<void> {
  await kv.delete(stateKey(guildId));
  await kv.delete(seenKey(guildId));
}
