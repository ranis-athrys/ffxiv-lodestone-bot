import {
  CATEGORIES,
  CATEGORY_LABELS,
  fetchArticles,
  isCategory,
  type Article,
  type Category,
} from '../lodestone.ts';
import { DEFAULT_RULES, matchArticle, validateRule, type Rule } from '../rules.ts';
import { getOrCreateState, putState, type GuildState } from '../store.ts';
import { pollGuild } from '../poll.ts';
import { checkPostAccess, editDeferredReply } from './api.ts';
import { getInteger, getString, resolveCommand, splitList } from './options.ts';
import { InteractionResponseType, MessageFlags, type Interaction } from './types.ts';

const MESSAGE_LIMIT = 1900;

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}

function reply(content: string): Response {
  return json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: clamp(content), flags: MessageFlags.Ephemeral },
  });
}

function defer(): Response {
  return json({
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral },
  });
}

function clamp(content: string): string {
  return content.length <= MESSAGE_LIMIT
    ? content
    : `${content.slice(0, MESSAGE_LIMIT)}\n… (truncated)`;
}

function block(lines: string[]): string {
  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return slug || 'rule';
}

function uniqueId(base: string, rules: Rule[]): string {
  const taken = new Set(rules.map((rule) => rule.id));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${rules.length + 1}`;
}

function describeRules(rules: Rule[]): string {
  if (rules.length === 0) return 'No rules configured. Nothing will be posted.';
  const lines: string[] = [];
  for (const rule of rules) {
    lines.push(`${rule.enabled ? '[on] ' : '[off]'} ${rule.id} — ${rule.name}`);
    lines.push(`       categories: ${rule.categories.join(', ')}`);
    lines.push(`       include:    ${rule.include.join(' , ') || '(any title)'}`);
    if (rule.exclude.length > 0) lines.push(`       exclude:    ${rule.exclude.join(' , ')}`);
  }
  return block(lines);
}

function statusLines(state: GuildState): string[] {
  const enabledRules = state.rules.filter((rule) => rule.enabled).length;
  return [
    `posting:   ${state.enabled ? 'enabled' : 'disabled'}`,
    `channel:   ${state.channelId ? `#${state.channelId}` : '(not set)'}`,
    `rules:     ${enabledRules} enabled / ${state.rules.length} total`,
    `seeded:    ${state.seeded ? 'yes' : 'no (next poll adopts the backlog silently)'}`,
    `last poll: ${state.lastPollAt ?? 'never'}`,
    `last post: ${state.lastPostAt ?? 'never'}`,
    `last error:${state.lastError ? ` ${state.lastError}` : ' none'}`,
  ];
}

function previewLines(articles: Article[], rules: Rule[], limit: number): string[] {
  const recent = [...articles]
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
    .slice(0, limit);
  return recent.map((article) => {
    const match = matchArticle(article, rules);
    const verdict = match ? `POST via ${match.rule.id}` : 'skip';
    return `[${verdict}] ${article.category}: ${article.title}`;
  });
}

async function runDeferred(
  env: Env,
  interaction: Interaction,
  work: () => Promise<string>,
): Promise<void> {
  let content: string;
  try {
    content = await work();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: 'command_failed', command: interaction.data?.name, message }));
    content = `Command failed: ${message}`;
  }
  await editDeferredReply(env.DISCORD_APPLICATION_ID, interaction.token, {
    content: clamp(content),
  });
}

export async function handleCommand(
  interaction: Interaction,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const guildId = interaction.guild_id;
  if (!guildId) return reply('This command only works inside a server.');

  const command = resolveCommand(interaction.data?.options);
  const state = await getOrCreateState(env.LODESTONE, guildId);

  switch (command.path) {
    case 'status': {
      ctx.waitUntil(
        runDeferred(env, interaction, async () => {
          const lines = statusLines(state);
          if (state.channelId) {
            const problem = await checkPostAccess(
              env.DISCORD_BOT_TOKEN,
              guildId,
              state.channelId,
            );
            lines.push(`access:    ${problem ? problem.reason : 'ok'}`);
            return problem ? `${block(lines)}\n${problem.fix}` : block(lines);
          }
          return block(lines);
        }),
      );
      return defer();
    }

    case 'channel': {
      const channelId = getString(command, 'channel');
      if (!channelId) return reply('Pick a channel.');
      state.channelId = channelId;
      await putState(env.LODESTONE, state);
      ctx.waitUntil(
        runDeferred(env, interaction, async () => {
          const problem = await checkPostAccess(env.DISCORD_BOT_TOKEN, guildId, channelId);
          if (problem) {
            return `Saved <#${channelId}>, but posting will fail: ${problem.reason}\n${problem.fix}`;
          }
          return (
            `Lodestone posts will go to <#${channelId}>.` +
            (state.enabled ? '' : ' Run `/lodestone enable` to start posting.')
          );
        }),
      );
      return defer();
    }

    case 'enable': {
      if (!state.channelId) return reply('Set a channel first with `/lodestone channel`.');
      state.enabled = true;
      await putState(env.LODESTONE, state);
      return reply(
        state.seeded
          ? `Enabled. Posting to <#${state.channelId}>.`
          : `Enabled. The next poll adopts the current Lodestone backlog silently, then posts only new articles.`,
      );
    }

    case 'disable':
      state.enabled = false;
      await putState(env.LODESTONE, state);
      return reply('Disabled. Nothing will be posted until you re-enable.');

    case 'test': {
      const title = getString(command, 'title');
      if (!title) return reply('Give a title to test.');
      const raw = getString(command, 'category') ?? 'topics';
      if (!isCategory(raw)) return reply(`Unknown category "${raw}".`);
      const article: Article = {
        id: 'test',
        category: raw,
        url: 'https://example.invalid',
        title,
        time: new Date().toISOString(),
      };
      const match = matchArticle(article, state.rules);
      return reply(
        match
          ? `Would post — matched rule \`${match.rule.id}\` (${match.rule.name}).`
          : 'Would be skipped — no rule matches.',
      );
    }

    case 'preview': {
      const limit = Math.min(Math.max(getInteger(command, 'count') ?? 10, 1), 25);
      ctx.waitUntil(
        runDeferred(env, interaction, async () => {
          const articles = await fetchArticles(env.LODESTONE_API, env.LODESTONE_LOCALE);
          return block(previewLines(articles, state.rules, limit));
        }),
      );
      return defer();
    }

    case 'poll': {
      ctx.waitUntil(
        runDeferred(env, interaction, async () => {
          const articles = await fetchArticles(env.LODESTONE_API, env.LODESTONE_LOCALE);
          const result = await pollGuild(env.LODESTONE, env.DISCORD_BOT_TOKEN, state, articles);
          if (result.skipped) return `Skipped: ${result.skipped}.`;
          const parts = [
            `fetched ${result.fetched}`,
            `new ${result.fresh}`,
            `matched ${result.matched}`,
            `posted ${result.posted}`,
          ];
          if (result.deferred > 0) parts.push(`held back ${result.deferred} for the next run`);
          if (result.error) parts.push(`error: ${result.error}`);
          return result.seeded && result.posted === 0 && result.matched === 0
            ? `Backlog adopted silently (${result.fresh} articles). Future articles will post.`
            : parts.join(', ');
        }),
      );
      return defer();
    }

    case 'rules list':
      return reply(describeRules(state.rules));

    case 'rules add': {
      const name = getString(command, 'name');
      if (!name) return reply('A rule needs a name.');
      const categories = splitList(getString(command, 'categories')).map((c) =>
        c.toLowerCase(),
      ) as Category[];
      const rule: Rule = {
        id: uniqueId(slugify(name), state.rules),
        name,
        categories: categories.length > 0 ? categories : ['topics'],
        include: splitList(getString(command, 'include')),
        exclude: splitList(getString(command, 'exclude')),
        enabled: true,
      };
      const errors = validateRule(rule);
      if (errors.length > 0) {
        return reply(
          ['Rule rejected:', ...errors.map((e) => `- ${e.field}: ${e.message}`)].join('\n'),
        );
      }
      if (state.rules.length >= 50) return reply('Rule limit reached (50).');
      state.rules.push(rule);
      await putState(env.LODESTONE, state);
      return reply(`Added rule \`${rule.id}\`.\n${describeRules([rule])}`);
    }

    case 'rules remove': {
      const id = getString(command, 'id');
      const index = state.rules.findIndex((rule) => rule.id === id);
      if (index < 0) return reply(`No rule with id \`${id}\`.`);
      state.rules.splice(index, 1);
      await putState(env.LODESTONE, state);
      return reply(`Removed rule \`${id}\`.`);
    }

    case 'rules toggle': {
      const id = getString(command, 'id');
      const rule = state.rules.find((candidate) => candidate.id === id);
      if (!rule) return reply(`No rule with id \`${id}\`.`);
      rule.enabled = !rule.enabled;
      await putState(env.LODESTONE, state);
      return reply(`Rule \`${id}\` is now ${rule.enabled ? 'enabled' : 'disabled'}.`);
    }

    case 'rules reset':
      state.rules = structuredClone(DEFAULT_RULES);
      await putState(env.LODESTONE, state);
      return reply(`Restored the default rules.\n${describeRules(state.rules)}`);

    default:
      return reply(
        `Unknown subcommand. Categories are: ${CATEGORIES.map((c) => `${c} (${CATEGORY_LABELS[c]})`).join(', ')}`,
      );
  }
}
