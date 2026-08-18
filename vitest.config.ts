import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          DISCORD_APPLICATION_ID: 'test-app',
          DISCORD_PUBLIC_KEY: '00'.repeat(32),
          DISCORD_BOT_TOKEN: 'test-token',
        },
      },
    }),
  ],
});
