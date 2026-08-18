import type { CommandOption } from './types.ts';

export interface ResolvedCommand {
  path: string;
  options: Map<string, string | number | boolean>;
}

export function resolveCommand(options: CommandOption[] | undefined): ResolvedCommand {
  const segments: string[] = [];
  let current = options ?? [];

  // Sub-command groups and sub-commands nest their arguments one level deeper.
  while (current.length === 1 && (current[0]!.type === 1 || current[0]!.type === 2)) {
    const node = current[0]!;
    segments.push(node.name);
    current = node.options ?? [];
  }

  const resolved = new Map<string, string | number | boolean>();
  for (const option of current) {
    if (option.value !== undefined) resolved.set(option.name, option.value);
  }
  return { path: segments.join(' '), options: resolved };
}

export function getString(command: ResolvedCommand, name: string): string | undefined {
  const value = command.options.get(name);
  return typeof value === 'string' ? value : undefined;
}

export function getInteger(command: ResolvedCommand, name: string): number | undefined {
  const value = command.options.get(name);
  return typeof value === 'number' ? value : undefined;
}

/** Comma-separated, so a pattern cannot itself contain a comma. */
export function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
