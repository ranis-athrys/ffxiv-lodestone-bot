import { CATEGORIES } from '../src/lodestone.ts';

const OptionType = {
  SubCommand: 1,
  SubCommandGroup: 2,
  String: 3,
  Integer: 4,
  Channel: 7,
} as const;

const categoryChoices = CATEGORIES.map((category) => ({ name: category, value: category }));

const commands = [
  {
    name: 'lodestone',
    description: 'Configure Lodestone news posting',
    // MANAGE_GUILD
    default_member_permissions: '32',
    integration_types: [0],
    contexts: [0],
    options: [
      { name: 'status', description: 'Show current configuration', type: OptionType.SubCommand },
      {
        name: 'channel',
        description: 'Set the channel Lodestone news is posted to',
        type: OptionType.SubCommand,
        options: [
          {
            name: 'channel',
            description: 'Target channel',
            type: OptionType.Channel,
            channel_types: [0, 5],
            required: true,
          },
        ],
      },
      { name: 'enable', description: 'Start posting', type: OptionType.SubCommand },
      { name: 'disable', description: 'Stop posting', type: OptionType.SubCommand },
      { name: 'poll', description: 'Check the Lodestone right now', type: OptionType.SubCommand },
      {
        name: 'preview',
        description: 'Show what recent Lodestone articles would do under the current rules',
        type: OptionType.SubCommand,
        options: [
          {
            name: 'count',
            description: 'How many recent articles to show (1-25, default 10)',
            type: OptionType.Integer,
            min_value: 1,
            max_value: 25,
          },
        ],
      },
      {
        name: 'test',
        description: 'Check whether a headline would be posted',
        type: OptionType.SubCommand,
        options: [
          {
            name: 'title',
            description: 'Headline to test',
            type: OptionType.String,
            required: true,
          },
          {
            name: 'category',
            description: 'Lodestone category (default topics)',
            type: OptionType.String,
            choices: categoryChoices,
          },
        ],
      },
      {
        name: 'rules',
        description: 'Manage filter rules',
        type: OptionType.SubCommandGroup,
        options: [
          { name: 'list', description: 'List filter rules', type: OptionType.SubCommand },
          {
            name: 'add',
            description: 'Add a filter rule',
            type: OptionType.SubCommand,
            options: [
              {
                name: 'name',
                description: 'Rule name, shown in the post footer',
                type: OptionType.String,
                required: true,
              },
              {
                name: 'categories',
                description: `Comma-separated: ${CATEGORIES.join(', ')}`,
                type: OptionType.String,
                required: true,
              },
              {
                name: 'include',
                description: 'Comma-separated title patterns; blank matches every article in the categories',
                type: OptionType.String,
              },
              {
                name: 'exclude',
                description: 'Comma-separated title patterns that veto a match',
                type: OptionType.String,
              },
            ],
          },
          {
            name: 'remove',
            description: 'Remove a filter rule',
            type: OptionType.SubCommand,
            options: [
              { name: 'id', description: 'Rule id', type: OptionType.String, required: true },
            ],
          },
          {
            name: 'toggle',
            description: 'Enable or disable a filter rule',
            type: OptionType.SubCommand,
            options: [
              { name: 'id', description: 'Rule id', type: OptionType.String, required: true },
            ],
          },
          {
            name: 'reset',
            description: 'Restore the default rule set',
            type: OptionType.SubCommand,
          },
        ],
      },
    ],
  },
];

const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!applicationId || !botToken) {
  console.error('DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN are required');
  process.exit(1);
}

const path = guildId
  ? `/applications/${applicationId}/guilds/${guildId}/commands`
  : `/applications/${applicationId}/commands`;

const response = await fetch(`https://discord.com/api/v10${path}`, {
  method: 'PUT',
  headers: {
    authorization: `Bot ${botToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(commands),
});

if (!response.ok) {
  console.error(`registration failed: ${response.status}\n${await response.text()}`);
  process.exit(1);
}

console.log(`registered ${commands.length} command tree(s) ${guildId ? `to guild ${guildId}` : 'globally'}`);
