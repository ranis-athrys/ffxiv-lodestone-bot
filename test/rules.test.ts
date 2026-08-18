import { describe, expect, it } from 'vitest';
import type { Article, Category } from '../src/lodestone.ts';
import { DEFAULT_RULES, matchArticle, validateRule, type Rule } from '../src/rules.ts';

function article(category: Category, title: string): Article {
  return {
    id: title,
    category,
    url: 'https://na.finalfantasyxiv.com/lodestone/',
    title,
    time: '2026-08-18T00:00:00Z',
  };
}

/** Real headlines pulled from the Lodestone feed. */
const WANTED: [Category, string, string][] = [
  ['topics', 'New Optional Items Available!', 'mogstation'],
  ['topics', 'Add New Style with Optional Items!', 'mogstation'],
  ['topics', 'The Moonfire Faire Begins August 12!', 'seasonal'],
  ['topics', 'Gather One, Gather All─Yo-kai Watch Returns to Eorzea!', 'seasonal'],
  ['topics', "All Saints' Wake Begins October 18!", 'seasonal'],
  ['topics', 'Patch 7.55 Notes', 'patches'],
  ['updates', 'FINAL FANTASY XIV Updated (Aug. 14)', 'patches'],
];

const UNWANTED: [Category, string][] = [
  ['developers', 'The Mirror'],
  ['developers', 'Sinister'],
  ['notices', 'Actions Taken Against In-Game RMT & Other Illicit Activities (Aug. 13)'],
  ['notices', 'Current Known Issues (Aug. 7)'],
  ['maintenance', 'All Worlds Emergency Maintenance (Aug. 13)'],
  ['maintenance', 'Online Store / Mog Station Maintenance (Aug. 12)'],
  ['status', '[Primal] Recovery from Famfrit World Technical Difficulties (Aug. 8)'],
  ['topics', 'Fan Festival 2026 Merchandise Round 3 Pre-orders Now Available!'],
  ['topics', 'Fan Festival 2026 in Berlin Begins July 25!'],
  ['topics', 'Crystalline Conflict Regional Championship 2026 (Japan) Quarterfinals Streaming Details'],
  ['topics', 'Announcing the Twitch Support-A-Streamer Campaign!'],
  ['topics', 'Letter from the Producer LIVE PART XCIII Digest Released'],
];

describe('default rules', () => {
  it.each(WANTED)('posts %s "%s" via the %s rule', (category, title, ruleId) => {
    const match = matchArticle(article(category, title), DEFAULT_RULES);
    expect(match?.rule.id).toBe(ruleId);
  });

  it.each(UNWANTED)('skips %s "%s"', (category, title) => {
    expect(matchArticle(article(category, title), DEFAULT_RULES)).toBeNull();
  });

  it('validates', () => {
    for (const rule of DEFAULT_RULES) expect(validateRule(rule)).toEqual([]);
  });
});

describe('matchArticle', () => {
  const rule = (overrides: Partial<Rule>): Rule => ({
    id: 'r',
    name: 'r',
    categories: ['topics'],
    include: [],
    exclude: [],
    enabled: true,
    ...overrides,
  });

  it('treats an empty include list as "every article in these categories"', () => {
    expect(matchArticle(article('topics', 'anything at all'), [rule({})])).not.toBeNull();
  });

  it('ignores disabled rules', () => {
    expect(matchArticle(article('topics', 'anything'), [rule({ enabled: false })])).toBeNull();
  });

  it('lets exclude veto an include match', () => {
    const rules = [rule({ include: ['patch'], exclude: ['preliminary'] })];
    expect(matchArticle(article('topics', 'Patch 7.6 Notes'), rules)).not.toBeNull();
    expect(matchArticle(article('topics', 'Preliminary Patch 7.6 Notes'), rules)).toBeNull();
  });

  it('matches case-insensitively', () => {
    expect(matchArticle(article('topics', 'PATCH 7.6 NOTES'), [rule({ include: ['patch'] })])).not.toBeNull();
  });

  it('returns the first matching rule', () => {
    const rules = [rule({ id: 'first', include: ['patch'] }), rule({ id: 'second' })];
    expect(matchArticle(article('topics', 'Patch 7.6'), rules)?.rule.id).toBe('first');
  });

  it('does not match across categories', () => {
    expect(matchArticle(article('updates', 'x'), [rule({ categories: ['topics'] })])).toBeNull();
  });

  it('survives an invalid stored pattern instead of throwing', () => {
    expect(matchArticle(article('topics', 'anything'), [rule({ include: ['('] })])).toBeNull();
  });
});

describe('validateRule', () => {
  it('rejects an unknown category', () => {
    const errors = validateRule({
      id: 'x',
      name: 'x',
      categories: ['nonsense' as Category],
      include: [],
      exclude: [],
      enabled: true,
    });
    expect(errors.some((error) => error.field === 'categories')).toBe(true);
  });

  it('rejects an uncompilable regex', () => {
    const errors = validateRule({
      id: 'x',
      name: 'x',
      categories: ['topics'],
      include: ['(unclosed'],
      exclude: [],
      enabled: true,
    });
    expect(errors.some((error) => error.field === 'include')).toBe(true);
  });

  it('rejects an empty category list', () => {
    const errors = validateRule({
      id: 'x',
      name: 'x',
      categories: [],
      include: [],
      exclude: [],
      enabled: true,
    });
    expect(errors.some((error) => error.field === 'categories')).toBe(true);
  });
});
