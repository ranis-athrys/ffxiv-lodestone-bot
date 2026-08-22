# ffxiv-lodestone-bot

A Discord bot that filters FFXIV Lodestone news by category and title. It runs
as a Cloudflare Worker, polls every ten minutes, and stores per-guild rules in
KV. News comes from [lodestonenews.com](https://lodestonenews.com).

Default rules post Mog Station releases, seasonal events, and patches.

## Setup

Create a Discord application, add a bot, and invite it with the `bot` and
`applications.commands` scopes plus Send Messages and Embed Links permissions.

```sh
npm install
npx wrangler login
npx wrangler kv namespace create LODESTONE
npx wrangler secret put DISCORD_APPLICATION_ID
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler deploy
```

Put the KV namespace id in `wrangler.jsonc`. Set the deployed Worker URL as the
Discord application's Interactions Endpoint URL.

Register commands and enable a destination:

```sh
DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... npm run register
```

```text
/lodestone channel #your-channel
/lodestone enable
```

The first poll records the current backlog without posting it.

## Commands

All commands require Manage Server and reply privately.

| Command | Effect |
| --- | --- |
| `/lodestone status` | Show configuration and poll status |
| `/lodestone channel <channel>` | Set the destination |
| `/lodestone enable` / `disable` | Start or stop posting |
| `/lodestone poll` | Poll now |
| `/lodestone preview [count]` | Preview matches against recent articles |
| `/lodestone test <title> [category]` | Test a headline |
| `/lodestone rules list` | List rules and patterns |
| `/lodestone rules add <name> <categories> [include] [exclude]` | Add a rule |
| `/lodestone rules remove <id>` | Delete a rule |
| `/lodestone rules toggle <id>` | Enable or disable a rule |
| `/lodestone rules reset` | Restore defaults |

## Rules

A rule matches when its category matches, at least one `include` pattern
matches, and no `exclude` pattern matches. An empty `include` matches every
article in the selected categories. Patterns are comma-separated,
case-insensitive regular expressions.

Categories: `topics`, `updates`, `notices`, `maintenance`, `status`, and
`developers`.

```text
/lodestone rules add name:Free Login categories:topics include:free login,welcome back
/lodestone rules add name:Maintenance categories:maintenance exclude:emergency,follow-up
```

## Development

```sh
npm test
npm run typecheck
npm run dev
```

Copy `.dev.vars.example` to `.dev.vars`. Generate
`worker-configuration.d.ts` with `npm run types`; the file is not committed.

## Template reuse

Delete `src/rules.ts`, `src/lodestone.ts`, and the concrete handlers in
`src/discord/commands.ts` to reuse the Discord/Workers shell.

- Use `Ed25519`, not the legacy `NODE-ED25519` name.
- Vitest pool 0.22 uses the `cloudflareTest()` Vite plugin.
- Install both `bot` and `applications.commands`; command-only installs cannot
  post.
- Defer interactions before network work, then edit the original response.
- Copy `.dev.vars.example` before `wrangler types` in CI.
- Keep config and seen ids in separate KV keys to avoid poll/edit races.
