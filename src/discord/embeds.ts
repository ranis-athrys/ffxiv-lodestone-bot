import { CATEGORY_LABELS, type Article, type Category } from '../lodestone.ts';
import type { Embed } from './types.ts';

const COLORS: Record<Category, number> = {
  topics: 0x2f7ec4,
  updates: 0x4c9f70,
  maintenance: 0xc9a227,
  notices: 0x9b6bcc,
  status: 0xc4642f,
  developers: 0x6d7f8c,
};

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Discord renders `<t:unix:F>` in the reader's own timezone. */
function discordTime(iso: string): string | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : `<t:${Math.floor(ms / 1000)}:F>`;
}

export function buildEmbed(article: Article, ruleName: string): Embed {
  const parts: string[] = [];
  if (article.description) parts.push(truncate(plain(article.description), 600));

  if (article.start && article.end) {
    const start = discordTime(article.start);
    const end = discordTime(article.end);
    if (start && end) parts.push(`**Window:** ${start} — ${end}`);
  }

  const embed: Embed = {
    title: truncate(article.title, 256),
    url: article.url,
    timestamp: article.time,
    color: COLORS[article.category],
    author: { name: 'The Lodestone' },
    footer: { text: `${CATEGORY_LABELS[article.category]} · ${ruleName}` },
  };

  const description = parts.join('\n\n');
  if (description) embed.description = truncate(description, 4096);
  if (article.image) embed.image = { url: article.image };
  return embed;
}
