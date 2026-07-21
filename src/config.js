const fs = require('fs');
const path = require('path');

require('dotenv').config();

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12)) {
  throw new Error(
    `Node.js ${process.versions.node} không được hỗ trợ. ` +
      'Discord voice/DAVE cần Node.js 22.12 trở lên.'
  );
}

function parseNumberEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function resolveFfmpegPath() {
  if (process.env.FFMPEG_PATH && process.env.FFMPEG_PATH.trim()) {
    return process.env.FFMPEG_PATH.trim();
  }

  try {
    return require('ffmpeg-static') || 'ffmpeg';
  } catch {
    return 'ffmpeg';
  }
}

const config = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  PREFIX: process.env.COMMAND_PREFIX || '!',
  MUSIC_DIR: path.resolve(process.env.MUSIC_DIR || path.join(process.cwd(), 'music')),
  STATE_FILE: path.resolve(process.env.PEACH_STATE_FILE || path.join(process.cwd(), 'data', 'peach-state.json')),
  FFMPEG_PATH: resolveFfmpegPath(),
  YTDLP_PATH: process.env.YTDLP_PATH?.trim() || 'yt-dlp',
  ENABLE_PREFIX_COMMANDS: process.env.ENABLE_PREFIX_COMMANDS === 'true',
  GUILD_ID: process.env.DISCORD_GUILD_ID || '',
  VOICE_DEBUG: process.env.VOICE_DEBUG !== 'false',
  AUDIO_VOLUME: parseNumberEnv('AUDIO_VOLUME', 1.15, 0, 2),
  OPUS_BITRATE: parseNumberEnv('OPUS_BITRATE', 128_000, 16_000, 128_000),
  LOOP_PLAYLIST_DEFAULT: process.env.LOOP_PLAYLIST === 'true',
  RANDOM_NEXT_DEFAULT: process.env.RANDOM_NEXT !== 'false',
  CROSSFADE_SECONDS: parseNumberEnv('CROSSFADE_SECONDS', 5, 0, 12),
  CROSSFADE_BATCH_SIZE: parseNumberEnv('CROSSFADE_BATCH_SIZE', 8, 2, 20),
  REPEAT_MODE_DEFAULT: ['off', 'one', 'all'].includes(process.env.REPEAT_MODE)
    ? process.env.REPEAT_MODE
    : 'off',
  AI_ENABLED: process.env.AI_ENABLED === 'true',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim() || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
  AI_CHANNEL_ID: process.env.AI_CHANNEL_ID?.trim() || '',
  AI_USE_CURRENT_VOICE_CHANNEL: process.env.AI_USE_CURRENT_VOICE_CHANNEL !== 'false',
  AI_ONLY_VOICE_CHANNEL: process.env.AI_ONLY_VOICE_CHANNEL === 'true',
  AI_REQUIRE_BOT_IN_VOICE: process.env.AI_REQUIRE_BOT_IN_VOICE === 'true',
  AI_HISTORY_LIMIT: parseNumberEnv('AI_HISTORY_LIMIT', 12, 3, 30),
  AI_COOLDOWN_MS: parseNumberEnv('AI_COOLDOWN_MS', 3_000, 0, 60_000),
  AI_REPLY_MAX_CHARS: parseNumberEnv('AI_REPLY_MAX_CHARS', 1_500, 100, 2_000),
  AI_IMAGE_MAX_BYTES: parseNumberEnv('AI_IMAGE_MAX_BYTES', 3_000_000, 100_000, 15_000_000),
  AI_IMAGE_MAX_COUNT: parseNumberEnv('AI_IMAGE_MAX_COUNT', 3, 1, 10),
  AI_HISTORY_IMAGE_MAX_COUNT: parseNumberEnv('AI_HISTORY_IMAGE_MAX_COUNT', 8, 1, 20),
  AI_API_RETRIES: parseNumberEnv('AI_API_RETRIES', 4, 0, 8),
  AI_API_RETRY_BASE_MS: parseNumberEnv('AI_API_RETRY_BASE_MS', 1_000, 100, 10_000),
  AI_NAME_ALIASES: (process.env.AI_NAME_ALIASES || 'Peach,Peach Bot,PeachBot')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
  DEFAULT_PERSONA: ['cute', 'lofi', 'chaotic', 'formal'].includes(process.env.PEACH_PERSONA)
    ? process.env.PEACH_PERSONA
    : 'cute',
  ATMOSPHERE_DEFAULT: process.env.ATMOSPHERE_ENABLED === 'true',
  RADIO_HOST_DEFAULT: process.env.RADIO_HOST_ENABLED === 'true',
  VOICE_GREETING_DEFAULT: process.env.VOICE_GREETING_ENABLED !== 'false',
  SMART_QUEUE_DEFAULT: process.env.SMART_QUEUE_ENABLED !== 'false',
  MOOD_DEFAULT: ['auto', 'calm', 'focus', 'happy', 'sad', 'energetic', 'sleep', 'romantic'].includes(process.env.PEACH_MOOD)
    ? process.env.PEACH_MOOD
    : 'auto',
  MEMORY_ENABLED: process.env.PEACH_MEMORY_ENABLED !== 'false',
  MEMORY_MAX_NOTES: parseNumberEnv('PEACH_MEMORY_MAX_NOTES', 5, 1, 20),
  MEMORY_NOTE_MAX_CHARS: parseNumberEnv('PEACH_MEMORY_NOTE_MAX_CHARS', 240, 40, 500),
  PANEL_REFRESH_SECONDS: parseNumberEnv('PANEL_REFRESH_SECONDS', 15, 5, 120),
  ATMOSPHERE_IDLE_MINUTES: parseNumberEnv('ATMOSPHERE_IDLE_MINUTES', 10, 2, 120),
  RADIO_HOST_EVERY_TRACKS: parseNumberEnv('RADIO_HOST_EVERY_TRACKS', 3, 1, 20),
};

function ensureMusicDirectory() {
  if (!fs.existsSync(config.MUSIC_DIR)) {
    fs.mkdirSync(config.MUSIC_DIR, { recursive: true });
  }
}

module.exports = {
  config,
  ensureMusicDirectory,
  parseNumberEnv,
};
