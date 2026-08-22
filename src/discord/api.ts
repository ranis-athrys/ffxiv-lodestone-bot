const API = 'https://discord.com/api/v10';

export class DiscordError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'DiscordError';
  }
}

async function call(
  path: string,
  init: RequestInit,
  auth: string,
): Promise<Response> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      authorization: auth,
      'content-type': 'application/json',
      'user-agent': 'ffxiv-lodestone-bot',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new DiscordError(
      `discord ${init.method ?? 'GET'} ${path} -> ${response.status}: ${body.slice(0, 300)}`,
      response.status,
      Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
    );
  }
  return response;
}

export async function postMessage(
  botToken: string,
  channelId: string,
  body: unknown,
): Promise<void> {
  await call(
    `/channels/${channelId}/messages`,
    { method: 'POST', body: JSON.stringify(body) },
    `Bot ${botToken}`,
  );
}

export interface AccessProblem {
  reason: string;
  fix: string;
}

export async function checkPostAccess(
  botToken: string,
  guildId: string,
  channelId: string,
): Promise<AccessProblem | null> {
  try {
    await call(`/guilds/${guildId}`, { method: 'GET' }, `Bot ${botToken}`);
  } catch (error) {
    if (error instanceof DiscordError && (error.status === 403 || error.status === 404)) {
      return {
        reason: 'The bot user is not a member of this server.',
        fix: 'Re-invite the app using an OAuth2 URL that includes the `bot` scope — installing it with `applications.commands` alone registers the commands without adding the bot.',
      };
    }
    throw error;
  }

  try {
    await call(`/channels/${channelId}`, { method: 'GET' }, `Bot ${botToken}`);
  } catch (error) {
    if (error instanceof DiscordError && (error.status === 403 || error.status === 404)) {
      return {
        reason: 'The bot cannot see that channel.',
        fix: 'Grant the bot View Channel, Send Messages, and Embed Links on it.',
      };
    }
    throw error;
  }

  return null;
}

export async function editDeferredReply(
  applicationId: string,
  interactionToken: string,
  body: unknown,
): Promise<void> {
  const response = await fetch(
    `${API}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'user-agent': 'ffxiv-lodestone-bot' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new DiscordError(`discord PATCH @original -> ${response.status}: ${text.slice(0, 300)}`, response.status);
  }
}
