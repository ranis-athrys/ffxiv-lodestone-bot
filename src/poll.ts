import { fetchArticles, type Article } from './lodestone.ts';
import { matchArticle } from './rules.ts';
import { getSeen, putSeen, putState, type GuildState } from './store.ts';
import { buildEmbed } from './discord/embeds.ts';
import { DiscordError, postMessage } from './discord/api.ts';

const MAX_POSTS_PER_RUN = 8;

export interface PollResult {
  guildId: string;
  fetched: number;
  fresh: number;
  matched: number;
  posted: number;
  deferred: number;
  seeded: boolean;
  skipped?: string;
  error?: string;
}

const byTimeAscending = (a: Article, b: Article) => Date.parse(a.time) - Date.parse(b.time);

export async function pollGuild(
  kv: KVNamespace,
  botToken: string,
  state: GuildState,
  articles: Article[],
): Promise<PollResult> {
  const result: PollResult = {
    guildId: state.guildId,
    fetched: articles.length,
    fresh: 0,
    matched: 0,
    posted: 0,
    deferred: 0,
    seeded: state.seeded,
  };

  if (!state.enabled) return { ...result, skipped: 'disabled' };
  if (!state.channelId) return { ...result, skipped: 'no channel configured' };

  const seen = await getSeen(kv, state.guildId);
  const fresh = articles.filter((article) => !seen.has(article.id));
  result.fresh = fresh.length;

  if (!state.seeded) {
    for (const article of fresh) seen.add(article.id);
    state.seeded = true;
    result.seeded = true;
    state.lastPollAt = new Date().toISOString();
    await putSeen(kv, state.guildId, seen);
    await putState(kv, state);
    return result;
  }

  const matched: { article: Article; ruleName: string }[] = [];
  for (const article of fresh) {
    const match = matchArticle(article, state.rules);
    if (match) matched.push({ article, ruleName: match.rule.name });
    else seen.add(article.id);
  }
  matched.sort((a, b) => byTimeAscending(a.article, b.article));
  result.matched = matched.length;

  const batch = matched.slice(0, MAX_POSTS_PER_RUN);
  result.deferred = matched.length - batch.length;

  for (const { article, ruleName } of batch) {
    try {
      await postMessage(botToken, state.channelId, {
        embeds: [buildEmbed(article, ruleName)],
      });
      seen.add(article.id);
      result.posted += 1;
      state.lastPostAt = new Date().toISOString();
    } catch (error) {
      // Not marked seen, so the next run retries it.
      result.error = error instanceof Error ? error.message : String(error);
      if (error instanceof DiscordError && error.status === 429) break;
      break;
    }
  }

  state.lastPollAt = new Date().toISOString();
  state.lastError = result.error;
  await putSeen(kv, state.guildId, seen);
  await putState(kv, state);
  return result;
}

export async function pollAll(
  kv: KVNamespace,
  botToken: string,
  apiBase: string,
  locale: string,
  states: GuildState[],
): Promise<PollResult[]> {
  if (states.length === 0) return [];
  const articles = await fetchArticles(apiBase, locale);
  const results: PollResult[] = [];
  for (const state of states) {
    results.push(await pollGuild(kv, botToken, state, articles));
  }
  return results;
}
