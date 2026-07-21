const {
  Client,
  GatewayIntentBits,
  Partials,
} = require('discord.js');

const { config, ensureMusicDirectory } = require('./config');
const { createAiService } = require('./ai/gemini');
const { createCommandService } = require('./commands');
const { createMusicService } = require('./music/service');
const { createUiService } = require('./ui');

if (!config.DISCORD_TOKEN) {
  throw new Error('Thiếu DISCORD_TOKEN trong file .env');
}

ensureMusicDirectory();

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildVoiceStates,
];

if (config.AI_ENABLED && config.GEMINI_API_KEY) {
  intents.push(GatewayIntentBits.MessageContent);
}

const client = new Client({
  intents,
  partials: [Partials.Channel],
});

const music = createMusicService({ client, config });
const ai = createAiService({ client, config });
const ui = createUiService({ music, config });
const commands = createCommandService({ client, config, music, ui });

client.on('debug', (message) => {
  if (String(message).startsWith('[VOICE]')) {
    console.log(`[gateway] ${music.redactVoiceDebug(message)}`);
  }
});

client.on('voiceStateUpdate', (oldState, newState) => {
  if (newState.id !== client.user?.id) return;

  console.log(
    `[gateway] bot voice state guild=${newState.guild.id} ` +
      `channel=${newState.channelId || 'none'} session=${newState.sessionId ? '<received>' : 'missing'} ` +
      `selfDeaf=${newState.serverDeaf ? 'server' : newState.selfDeaf} selfMute=${newState.selfMute} ` +
      `oldChannel=${oldState.channelId || 'none'}`
  );
});

client.on('voiceServerUpdate', (data) => {
  console.log(
    `[gateway] voice server guild=${data.guildId} ` +
      `endpoint=${data.endpoint || 'none'} token=${data.token ? '<received>' : 'missing'}`
  );
});

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Music dir: ${config.MUSIC_DIR}`);
  console.log(`FFmpeg: ${config.FFMPEG_PATH}`);
  console.log(
    `Gemini AI: ${ai.active ? `on (${config.GEMINI_MODEL})` : config.AI_ENABLED ? 'configured but missing GEMINI_API_KEY' : 'off'}`
  );
  void commands.registerSlashCommands().catch((error) => {
    console.error('Failed to register slash commands:', error);
  });
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  void ai.handleMessage(message);
  await commands.handlePrefixMessage(message);
});

client.on('interactionCreate', (interaction) => {
  void commands.handleInteraction(interaction);
});

function shutdown(signal) {
  console.log(`Received ${signal}, cleaning up voice connections...`);
  music.cleanupAll();
  client.destroy();
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

void client.login(config.DISCORD_TOKEN);
