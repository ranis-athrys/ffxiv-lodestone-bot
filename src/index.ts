import { handleCommand } from './discord/commands.ts';
import { InteractionResponseType, InteractionType, type Interaction } from './discord/types.ts';
import { verifyRequest } from './discord/verify.ts';
import { pollAll } from './poll.ts';
import { listGuildStates } from './store.ts';

async function handleInteraction(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const rawBody = await request.text();
  if (!(await verifyRequest(request, rawBody, env.DISCORD_PUBLIC_KEY))) {
    return new Response('invalid request signature', { status: 401 });
  }

  const interaction = JSON.parse(rawBody) as Interaction;
  if (interaction.type === InteractionType.Ping) {
    return Response.json({ type: InteractionResponseType.Pong });
  }
  if (interaction.type === InteractionType.ApplicationCommand) {
    return await handleCommand(interaction, env, ctx);
  }
  return new Response('unsupported interaction type', { status: 400 });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/') {
      try {
        return await handleInteraction(request, env, ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(JSON.stringify({ event: 'interaction_error', message }));
        return Response.json({ error: 'interaction failed' }, { status: 500 });
      }
    }

    return new Response('not found', { status: 404 });
  },

  async scheduled(_controller, env, _ctx): Promise<void> {
    try {
      const states = await listGuildStates(env.LODESTONE);
      const results = await pollAll(
        env.LODESTONE,
        env.DISCORD_BOT_TOKEN,
        env.LODESTONE_API,
        env.LODESTONE_LOCALE,
        states,
      );
      for (const result of results) {
        console.log(JSON.stringify({ event: 'poll', ...result }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ event: 'poll_failed', message }));
    }
  },
} satisfies ExportedHandler<Env>;
