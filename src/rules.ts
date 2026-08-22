import { type Article, type Category, CATEGORIES, isCategory } from './lodestone.ts';

export interface Rule {
  id: string;
  name: string;
  categories: Category[];
  include: string[];
  exclude: string[];
  enabled: boolean;
}

export const LIMITS = {
  rules: 50,
  patternsPerList: 20,
  patternLength: 200,
  nameLength: 64,
} as const;

export const DEFAULT_RULES: Rule[] = [
  {
    id: 'mogstation',
    name: 'Mog Station',
    categories: ['topics'],
    include: ['optional items', 'online store', 'mog station'],
    exclude: ['maintenance'],
    enabled: true,
  },
  {
    id: 'seasonal',
    name: 'Seasonal Events',
    categories: ['topics'],
    include: [
      'moonfire faire',
      "all saints' wake",
      'starlight celebration',
      'heavensturn',
      'valentione',
      "little ladies' day",
      'hatching-tide',
      'the rising',
      'make it rain',
      'yo-kai',
      '\\bbegins\\b.*!',
      '\\breturns to eorzea\\b',
    ],
    // Otherwise the generic 'begins' pattern sweeps in the Fan Festival run-up.
    exclude: ['fan festival'],
    enabled: true,
  },
  {
    id: 'patches',
    name: 'Patches',
    categories: ['topics', 'updates'],
    include: ['^patch \\d', 'patch notes', '^final fantasy xiv updated'],
    exclude: [],
    enabled: true,
  },
];

export interface RuleValidationError {
  field: string;
  message: string;
}

function compile(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

export function validatePatterns(
  field: string,
  patterns: string[],
): RuleValidationError[] {
  const errors: RuleValidationError[] = [];
  if (patterns.length > LIMITS.patternsPerList) {
    errors.push({ field, message: `at most ${LIMITS.patternsPerList} patterns` });
  }
  for (const pattern of patterns) {
    if (pattern.length > LIMITS.patternLength) {
      errors.push({ field, message: `pattern longer than ${LIMITS.patternLength} chars` });
    } else if (!compile(pattern)) {
      errors.push({ field, message: `invalid regex: ${pattern}` });
    }
  }
  return errors;
}

export function validateRule(rule: Rule): RuleValidationError[] {
  const errors: RuleValidationError[] = [];
  if (!rule.name || rule.name.length > LIMITS.nameLength) {
    errors.push({ field: 'name', message: `1-${LIMITS.nameLength} characters` });
  }
  if (rule.categories.length === 0) {
    errors.push({ field: 'categories', message: 'at least one category' });
  }
  for (const category of rule.categories) {
    if (!isCategory(category)) {
      errors.push({
        field: 'categories',
        message: `unknown category "${category}" (valid: ${CATEGORIES.join(', ')})`,
      });
    }
  }
  errors.push(...validatePatterns('include', rule.include));
  errors.push(...validatePatterns('exclude', rule.exclude));
  return errors;
}

function anyMatch(patterns: string[], title: string): boolean {
  for (const pattern of patterns) {
    const regex = compile(pattern);
    if (regex?.test(title)) return true;
  }
  return false;
}

export interface Match {
  rule: Rule;
}

export function matchArticle(article: Article, rules: Rule[]): Match | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.categories.includes(article.category)) continue;
    if (rule.include.length > 0 && !anyMatch(rule.include, article.title)) continue;
    if (rule.exclude.length > 0 && anyMatch(rule.exclude, article.title)) continue;
    return { rule };
  }
  return null;
}
