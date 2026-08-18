export const CATEGORIES = [
  'topics',
  'notices',
  'maintenance',
  'updates',
  'status',
  'developers',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  topics: 'Topics',
  notices: 'Notices',
  maintenance: 'Maintenance',
  updates: 'Updates',
  status: 'Status',
  developers: "Developers' Blog",
};

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export interface Article {
  id: string;
  category: Category;
  url: string;
  title: string;
  time: string;
  image?: string;
  description?: string;
  start?: string;
  end?: string;
}

interface RawArticle {
  id?: unknown;
  url?: unknown;
  title?: unknown;
  time?: unknown;
  image?: unknown;
  description?: unknown;
  start?: unknown;
  end?: unknown;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

function toArticle(raw: RawArticle, category: Category): Article | null {
  const id = str(raw.id);
  const url = str(raw.url);
  const title = str(raw.title);
  const time = str(raw.time);
  if (!id || !url || !title || !time) return null;
  return {
    id,
    category,
    url,
    title,
    time,
    image: str(raw.image),
    description: str(raw.description),
    start: str(raw.start),
    end: str(raw.end),
  };
}

export async function fetchArticles(
  apiBase: string,
  locale: string,
): Promise<Article[]> {
  const url = `${apiBase.replace(/\/+$/, '')}/news/all?locale=${encodeURIComponent(locale)}`;
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'ffxiv-lodestone-bot' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`lodestone api ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const articles: Article[] = [];
  for (const category of CATEGORIES) {
    const entries = payload[category];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const article = toArticle(entry as RawArticle, category);
      if (article) articles.push(article);
    }
  }
  return articles;
}
