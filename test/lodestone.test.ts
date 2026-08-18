import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchArticles } from '../src/lodestone.ts';

function stubApi(payload: unknown, status = 200): void {
  vi.stubGlobal('fetch', async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchArticles', () => {
  it('flattens every category and tags each article with it', async () => {
    stubApi({
      topics: [{ id: 't1', url: 'u', title: 'Topic', time: '2026-08-18T00:00:00Z', image: 'i' }],
      updates: [{ id: 'u1', url: 'u', title: 'Update', time: '2026-08-18T00:00:00Z' }],
      unknown_category: [{ id: 'x', url: 'u', title: 'X', time: '2026-08-18T00:00:00Z' }],
    });

    const articles = await fetchArticles('https://api.example', 'na');
    expect(articles.map((article) => [article.category, article.id])).toEqual([
      ['topics', 't1'],
      ['updates', 'u1'],
    ]);
    expect(articles[0]!.image).toBe('i');
  });

  it('drops entries missing required fields rather than failing the whole poll', async () => {
    stubApi({
      topics: [
        { id: 'good', url: 'u', title: 'Good', time: '2026-08-18T00:00:00Z' },
        { id: 'no-title', url: 'u', time: '2026-08-18T00:00:00Z' },
        { url: 'u', title: 'no id', time: '2026-08-18T00:00:00Z' },
      ],
    });

    const articles = await fetchArticles('https://api.example', 'na');
    expect(articles.map((article) => article.id)).toEqual(['good']);
  });

  it('tolerates a category arriving as something other than an array', async () => {
    stubApi({ topics: null, updates: 'nope' });
    expect(await fetchArticles('https://api.example', 'na')).toEqual([]);
  });

  it('throws on a non-200 so the run is logged as failed', async () => {
    stubApi({}, 503);
    await expect(fetchArticles('https://api.example', 'na')).rejects.toThrow('503');
  });
});
