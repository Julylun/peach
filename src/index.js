require('dotenv').config();

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12)) {
  throw new Error(
    `Node.js ${process.versions.node} không được hỗ trợ. ` +
      'Discord voice/DAVE cần Node.js 22.12 trở lên.'
  );
}

const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionsBitField,
  MessageFlags,
  Partials,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');

const {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  StreamType,
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

const PREFIX = process.env.COMMAND_PREFIX || '!';
const MUSIC_DIR = path.resolve(process.env.MUSIC_DIR || path.join(process.cwd(), 'music'));
const FFMPEG_PATH = resolveFfmpegPath();
const ENABLE_PREFIX_COMMANDS = process.env.ENABLE_PREFIX_COMMANDS === 'true';
const GUILD_ID = process.env.DISCORD_GUILD_ID || '';
const VOICE_DEBUG = process.env.VOICE_DEBUG !== 'false';
const AUDIO_VOLUME = parseNumberEnv('AUDIO_VOLUME', 1.15, 0, 2);
const OPUS_BITRATE = parseNumberEnv('OPUS_BITRATE', 128_000, 16_000, 128_000);
const LOOP_PLAYLIST_DEFAULT = process.env.LOOP_PLAYLIST === 'true';
const RANDOM_NEXT_DEFAULT = process.env.RANDOM_NEXT !== 'false';
const CROSSFADE_SECONDS = parseNumberEnv('CROSSFADE_SECONDS', 5, 0, 12);
const CROSSFADE_BATCH_SIZE = parseNumberEnv('CROSSFADE_BATCH_SIZE', 8, 2, 20);
const REPEAT_MODE_DEFAULT = ['off', 'one', 'all'].includes(process.env.REPEAT_MODE)
  ? process.env.REPEAT_MODE
  : 'off';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

const guildStates = new Map();
const observedNetworkings = new WeakSet();

function parseNumberEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function redactVoiceDebug(message) {
  return String(message)
    .replace(/("token"\s*:\s*")[^"]+/gi, '$1<redacted>')
    .replace(/(token\s*[=:]\s*)[^,\s}]+/gi, '$1<redacted>')
    .replace(/("session_id"\s*:\s*")[^"]+/gi, '$1<redacted>')
    .replace(/("sessionId"\s*:\s*")[^"]+/gi, '$1<redacted>');
}

function getVoiceDiagnostics(connection) {
  const connectionState = connection?.state;
  const networking = connectionState?.networking;
  const networkState = networking?.state;
  const voiceState = connection?.packets?.state;
  const voiceServer = connection?.packets?.server;

  return {
    status: connectionState?.status || 'none',
    channelId: connection?.joinConfig?.channelId || 'none',
    statePacket: Boolean(voiceState),
    sessionId: voiceState?.session_id ? '<received>' : 'missing',
    serverPacket: Boolean(voiceServer),
    endpoint: voiceServer?.endpoint || 'missing',
    networkCode: networkState?.code ?? 'none',
    voiceWebSocket: Boolean(networkState?.ws),
    udpSocket: Boolean(networkState?.udp),
  };
}

function createDebugVoiceAdapterCreator(guild) {
  const originalCreator = guild.voiceAdapterCreator;

  return (methods) => {
    const adapter = originalCreator({
      ...methods,
      onVoiceStateUpdate: (data) => {
        console.log(
          `[voice:${guild.id}] adapter received VOICE_STATE_UPDATE ` +
            `channel=${data.channel_id || 'none'} session=${data.session_id ? '<received>' : 'missing'}`
        );
        methods.onVoiceStateUpdate(data);
      },
      onVoiceServerUpdate: (data) => {
        console.log(
          `[voice:${guild.id}] adapter received VOICE_SERVER_UPDATE ` +
            `endpoint=${data.endpoint || 'none'} token=${data.token ? '<received>' : 'missing'}`
        );
        methods.onVoiceServerUpdate(data);
      },
    });

    console.log(`[voice:${guild.id}] adapter created`);

    return {
      sendPayload: (payload) => {
        const accepted = adapter.sendPayload(payload);
        console.log(
          `[voice:${guild.id}] gateway voice payload accepted=${accepted} ` +
            `channel=${payload?.d?.channel_id || 'none'}`
        );
        return accepted;
      },
      destroy: () => {
        console.log(`[voice:${guild.id}] adapter destroyed`);
        adapter.destroy();
      },
    };
  };
}

function attachNetworkingDebug(networking, guildId) {
  if (!networking || observedNetworkings.has(networking)) return;
  observedNetworkings.add(networking);

  networking.on('close', (code) => {
    console.error(`[voice:${guildId}] voice WebSocket closed code=${code}`);
  });

  networking.on('error', (error) => {
    console.error(`[voice:${guildId}] voice networking error`, {
      name: error?.name,
      code: error?.code,
      message: error?.message,
      cause: error?.cause?.message || error?.cause,
    });
  });
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

function getState(guildId) {
  if (!guildStates.has(guildId)) {
    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });
    const state = {
      player,
      queue: [],
      playlist: [],
      repeatMode: LOOP_PLAYLIST_DEFAULT ? 'all' : REPEAT_MODE_DEFAULT,
      randomEnabled: RANDOM_NEXT_DEFAULT,
      current: null,
      activeResource: null,
      invalidTracks: new Set(),
      forceSingleNext: false,
      volume: AUDIO_VOLUME,
      connection: null,
      ffmpegProcess: null,
      textChannelId: null,
      waitingForReady: false,
      voiceReconnectAttempts: 0,
    };

    player.on(AudioPlayerStatus.Idle, () => {
      void playNext(guildId);
    });

    player.on('error', (error) => {
      console.error(`[voice:${guildId}] player error`, error);
      void playNext(guildId);
    });

    player.on('stateChange', (oldState, newState) => {
      if (oldState.status !== newState.status) {
        console.log(`[voice:${guildId}] player ${oldState.status} -> ${newState.status}`);
      }
    });

    guildStates.set(guildId, state);
  }

  return guildStates.get(guildId);
}

function attachConnectionDebug(connection, guildId) {
  connection.on('stateChange', (oldState, newState) => {
    const oldStatus = oldState.status;
    const newStatus = newState.status;
    attachNetworkingDebug(newState.networking, guildId);
    const channelId = connection.joinConfig?.channelId || 'unknown';
    console.log(`[voice:${guildId}] ${oldStatus} -> ${newStatus} (channel=${channelId})`);
    if (newStatus === VoiceConnectionStatus.Connecting || newStatus === VoiceConnectionStatus.Signalling) {
      console.log(`[voice:${guildId}] diagnostics`, getVoiceDiagnostics(connection));
    }
  });

  connection.on('error', (error) => {
    console.error(`[voice:${guildId}] connection error`, error);
  });

  if (VOICE_DEBUG) {
    connection.on('debug', (message) => {
      console.log(`[voice:${guildId}] debug ${redactVoiceDebug(message)}`);
    });
  }
}

function createVoiceConnection(guild, voiceChannel, state) {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: createDebugVoiceAdapterCreator(guild),
    selfDeaf: true,
    selfMute: false,
    debug: VOICE_DEBUG,
    daveEncryption: true,
  });

  attachConnectionDebug(connection, guild.id);
  connection.subscribe(state.player);
  state.connection = connection;

  connection.on('stateChange', (oldState, newState) => {
    if (newState.status === VoiceConnectionStatus.Ready && state.waitingForReady && state.connection === connection) {
      state.waitingForReady = false;
      state.voiceReconnectAttempts = 0;
      void playNext(guild.id);
    }

    if (newState.status === VoiceConnectionStatus.Destroyed && state.connection === connection) {
      state.waitingForReady = false;
    }
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      cleanupGuild(guild.id);
    }
  });

  return connection;
}

function hardReconnectVoice(guild, voiceChannel, state, reason) {
  const current = state.connection;
  state.waitingForReady = false;
  state.voiceReconnectAttempts = (state.voiceReconnectAttempts || 0) + 1;

  console.warn(`[voice:${guild.id}] hard reconnect #${state.voiceReconnectAttempts}: ${reason}`);

  if (current) {
    try {
      current.destroy();
    } catch {
      // ignore destroy errors
    }
  }

  if (state.voiceReconnectAttempts > 2) {
    console.warn(`[voice:${guild.id}] giving up on voice reconnect after ${state.voiceReconnectAttempts} attempts`);
    return null;
  }

  const connection = createVoiceConnection(guild, voiceChannel, state);
  setVoiceReadyWatchdog(guild, voiceChannel, state, connection);
  return connection;
}

function setVoiceReadyWatchdog(guild, voiceChannel, state, connection) {
  setTimeout(() => {
    if (state.connection !== connection) return;
    if (connection.state.status === VoiceConnectionStatus.Ready) return;

    console.warn(
      `[voice:${guild.id}] still not ready after 20s: ${connection.state.status}; ` +
        `current=${state.current?.displayName || 'none'} queue=${state.queue.length} ` +
        `retries=${state.voiceReconnectAttempts}`
    );
    console.warn(`[voice:${guild.id}] timeout diagnostics`, getVoiceDiagnostics(connection));
    hardReconnectVoice(guild, voiceChannel, state, `timeout in ${connection.state.status}`);
  }, 20_000).unref();
}

function collectPlayableTracks(filterText = '') {
  const items = [];
  const lowerFilter = filterText.trim().toLowerCase();

  walkMusicDir(MUSIC_DIR, (filePath) => {
    if (!isPlayableFile(filePath)) return;

    const rel = formatRelative(filePath);
    if (!lowerFilter || rel.toLowerCase().includes(lowerFilter)) {
      items.push({
        filePath,
        displayName: rel,
      });
    }
  });

  items.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return items;
}

function shuffleInPlace(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

function refillLoopQueue(state) {
  if (state.repeatMode !== 'all' || state.playlist.length === 0) return false;

  state.queue.push(...state.playlist.filter((track) => !state.invalidTracks.has(track.filePath)));
  if (state.randomEnabled) {
    shuffleInPlace(state.queue);

    if (state.current && state.queue.length > 1 && state.queue[0].filePath === state.current.filePath) {
      [state.queue[0], state.queue[1]] = [state.queue[1], state.queue[0]];
    }
  }

  return true;
}

function takeNextTrack(state) {
  if (state.repeatMode === 'one' && state.current && !state.invalidTracks.has(state.current.filePath)) {
    return state.current;
  }

  if (state.queue.length === 0) {
    refillLoopQueue(state);
  }

  while (state.queue.length > 0 && state.invalidTracks.has(state.queue[0].filePath)) {
    state.queue.shift();
  }

  if (state.queue.length === 0) return null;

  if (!state.randomEnabled) {
    return state.queue.shift();
  }

  let randomIndex = Math.floor(Math.random() * state.queue.length);
  while (randomIndex < state.queue.length && state.invalidTracks.has(state.queue[randomIndex].filePath)) {
    randomIndex += 1;
  }
  if (randomIndex >= state.queue.length) return null;
  return state.queue.splice(randomIndex, 1)[0];
}

function takeNextTracks(state, maxTracks) {
  if (state.repeatMode === 'one') {
    const one = takeNextTrack(state);
    return one ? [one] : [];
  }

  const tracks = [];
  while (tracks.length < maxTracks) {
    const next = takeNextTrack(state);
    if (!next) break;
    tracks.push(next);
  }
  return tracks;
}

function assertVoicePermissions(guild, voiceChannel) {
  const botMember = guild.members.me;
  if (!botMember) {
    throw new Error('Không xác định được bot member trong server.');
  }

  const permissions = voiceChannel.permissionsFor(botMember);
  if (!permissions) {
    throw new Error('Không đọc được quyền của bot trên voice channel.');
  }

  const required = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.Speak,
  ];

  const missing = required.filter((permission) => !permissions.has(permission));
  if (missing.length > 0) {
    throw new Error('Bot cần quyền View Channel, Connect và Speak trong voice channel này.');
  }
}

function getVoiceStatusSummary(guild) {
  const state = guildStates.get(guild.id);
  const botMember = guild.members.me;
  const voiceChannel = botMember?.voice?.channel;

  const lines = [];
  lines.push(`Guild: ${guild.name}`);
  lines.push(`Bot voice: ${voiceChannel ? `${voiceChannel.name} (${voiceChannel.id})` : 'chưa vào voice'}`);
  lines.push(`Voice state: ${state?.connection?.state?.status || 'không có connection'}`);
  lines.push(`Player state: ${state?.player?.state?.status || 'không có player'}`);
  lines.push(`Current track: ${state?.current?.displayName || 'không có'}`);
  lines.push(`Queue length: ${state?.queue?.length || 0}`);
  lines.push(`Repeat: ${state?.repeatMode || 'off'}`);
  lines.push(`Random next: ${state?.randomEnabled ? 'on' : 'off'}`);
  lines.push(`Crossfade: ${CROSSFADE_SECONDS > 0 ? `${CROSSFADE_SECONDS}s` : 'off'}`);

  if (state?.connection) {
    const diagnostics = getVoiceDiagnostics(state.connection);
    lines.push(
      `Voice packets: state=${diagnostics.statePacket ? 'yes' : 'no'} ` +
        `server=${diagnostics.serverPacket ? 'yes' : 'no'} endpoint=${diagnostics.endpoint}`
    );
    lines.push(
      `Voice network: code=${diagnostics.networkCode} ` +
        `ws=${diagnostics.voiceWebSocket ? 'yes' : 'no'} udp=${diagnostics.udpSocket ? 'yes' : 'no'}`
    );
  }

  if (voiceChannel && botMember) {
    const permissions = voiceChannel.permissionsFor(botMember);
    if (permissions) {
      const required = [
        ['ViewChannel', PermissionsBitField.Flags.ViewChannel],
        ['Connect', PermissionsBitField.Flags.Connect],
        ['Speak', PermissionsBitField.Flags.Speak],
      ];

      const missing = required
        .filter(([, permission]) => !permissions.has(permission))
        .map(([name]) => name);

      lines.push(`Missing permissions: ${missing.length > 0 ? missing.join(', ') : 'none'}`);
    }
  }

  return lines.join('\n');
}

function buildSlashCommands() {
  return [
    new SlashCommandBuilder()
      .setName('join')
      .setDescription('Vào voice channel của bạn'),
    new SlashCommandBuilder()
      .setName('play')
      .setDescription('Phát file nhạc local')
      .addStringOption((option) =>
        option
          .setName('query')
          .setDescription('Bộ lọc tùy chọn cho file trong thư mục music')
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('pause')
      .setDescription('Tạm dừng bài đang phát'),
    new SlashCommandBuilder()
      .setName('resume')
      .setDescription('Tiếp tục phát bài'),
    new SlashCommandBuilder()
      .setName('volume')
      .setDescription('Chỉnh âm lượng bot theo phần trăm')
      .addIntegerOption((option) =>
        option
          .setName('percent')
          .setDescription('0 đến 200%')
          .setMinValue(0)
          .setMaxValue(200)
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('nowplaying')
      .setDescription('Xem bài đang phát'),
    new SlashCommandBuilder()
      .setName('queue')
      .setDescription('Xem queue hiện tại')
      .addIntegerOption((option) =>
        option
          .setName('page')
          .setDescription('Trang queue, mỗi trang 10 bài')
          .setMinValue(1)
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('remove')
      .setDescription('Xóa một bài khỏi queue')
      .addIntegerOption((option) =>
        option
          .setName('position')
          .setDescription('Vị trí bài trong queue')
          .setMinValue(1)
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('clear')
      .setDescription('Xóa toàn bộ queue đang chờ'),
    new SlashCommandBuilder()
      .setName('list')
      .setDescription('Liệt kê file nhạc local')
      .addStringOption((option) =>
        option
          .setName('filter')
          .setDescription('Lọc theo tên file hoặc thư mục')
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('skip')
      .setDescription('Bỏ qua bài hiện tại'),
    new SlashCommandBuilder()
      .setName('stop')
      .setDescription('Dừng phát và xoá queue'),
    new SlashCommandBuilder()
      .setName('leave')
      .setDescription('Rời voice channel'),
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Xem trạng thái bot và voice connection'),
    new SlashCommandBuilder()
      .setName('panel')
      .setDescription('Mở bảng điều khiển nhạc trực tiếp'),
    new SlashCommandBuilder()
      .setName('loop')
      .setDescription('Bật/tắt phát lặp playlist vô hạn')
      .addBooleanOption((option) =>
        option
          .setName('enabled')
          .setDescription('Bật hoặc tắt loop; bỏ trống để đảo trạng thái')
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('repeat')
      .setDescription('Chọn chế độ lặp: tắt, bài hiện tại hoặc playlist')
      .addStringOption((option) =>
        option
          .setName('mode')
          .setDescription('Chế độ lặp')
          .setRequired(true)
          .addChoices(
            { name: 'Tắt', value: 'off' },
            { name: 'Bài hiện tại', value: 'one' },
            { name: 'Cả playlist', value: 'all' },
          )
      ),
    new SlashCommandBuilder()
      .setName('random')
      .setDescription('Bật/tắt chọn bài kế tiếp ngẫu nhiên')
      .addBooleanOption((option) =>
        option
          .setName('enabled')
          .setDescription('Bật hoặc tắt random; bỏ trống để đảo trạng thái')
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('shuffle')
      .setDescription('Xáo trộn các bài đang chờ'),
  ].map((command) => command.toJSON());
}

async function registerSlashCommands() {
  const commands = buildSlashCommands();

  if (GUILD_ID) {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.commands.set(commands);
    console.log(`Registered ${commands.length} slash commands in guild ${GUILD_ID}`);
    return;
  }

  await client.application.commands.set(commands);
  console.log(`Registered ${commands.length} global slash commands`);
}

async function ensureVoiceConnection(message) {
  const memberVoice = message.member?.voice?.channel;
  if (!memberVoice) {
    throw new Error('Bạn cần vào voice channel trước.');
  }

  assertVoicePermissions(message.guild, memberVoice);

  const state = getState(message.guild.id);
  if (state.connection?.state?.status === VoiceConnectionStatus.Ready) {
    return state.connection;
  }

  if (state.connection) {
    try {
      state.connection.destroy();
    } catch {
      // ignore stale connection cleanup
    }
    state.connection = null;
  }

  const connection = createVoiceConnection(message.guild, memberVoice, state);
  setVoiceReadyWatchdog(message.guild, memberVoice, state, connection);
  return connection;
}

async function ensureVoiceConnectionFromInteraction(interaction) {
  const memberVoice = interaction.member?.voice?.channel;
  if (!memberVoice) {
    throw new Error('Bạn cần vào voice channel trước.');
  }

  assertVoicePermissions(interaction.guild, memberVoice);

  const state = getState(interaction.guild.id);
  if (state.connection?.state?.status === VoiceConnectionStatus.Ready) {
    return state.connection;
  }

  if (state.connection) {
    try {
      state.connection.destroy();
    } catch {
      // ignore stale connection cleanup
    }
    state.connection = null;
  }

  const connection = createVoiceConnection(interaction.guild, memberVoice, state);
  setVoiceReadyWatchdog(interaction.guild, memberVoice, state, connection);
  return connection;
}

function cleanupGuild(guildId) {
  const state = guildStates.get(guildId);
  if (!state) return;

  if (state.ffmpegProcess && !state.ffmpegProcess.killed) {
    state.ffmpegProcess.kill('SIGKILL');
  }

  state.queue.length = 0;
  state.current = null;
  state.textChannelId = null;

  if (state.connection) {
    try {
      state.connection.destroy();
    } catch {
      // ignore cleanup errors
    }
    state.connection = null;
  }

  state.player.stop(true);
  guildStates.delete(guildId);
}

function isInsideMusicDir(candidate) {
  const relative = path.relative(MUSIC_DIR, candidate);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function safeResolveInput(query) {
  const normalized = query.trim().replace(/^["']|["']$/g, '');
  const direct = path.resolve(MUSIC_DIR, normalized);

  if (isInsideMusicDir(direct) && fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }

  const lowerQuery = normalized.toLowerCase();
  const matches = [];

  walkMusicDir(MUSIC_DIR, (filePath) => {
    const base = path.basename(filePath).toLowerCase();
    const withoutExt = path.parse(base).name;

    if (base === lowerQuery || withoutExt === lowerQuery || base.includes(lowerQuery) || withoutExt.includes(lowerQuery)) {
      matches.push(filePath);
    }
  });

  if (matches.length === 0) {
    return null;
  }

  matches.sort((a, b) => a.length - b.length);
  return matches[0];
}

function walkMusicDir(rootDir, onFile) {
  if (!fs.existsSync(rootDir)) return;

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkMusicDir(fullPath, onFile);
      continue;
    }

    if (entry.isFile()) {
      onFile(fullPath);
    }
  }
}

function formatRelative(filePath) {
  return path.relative(MUSIC_DIR, filePath).split(path.sep).join('/');
}

function isPlayableFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.webm'].includes(ext);
}

function listTracks(filterText = '') {
  const items = [];
  const lowerFilter = filterText.trim().toLowerCase();

  walkMusicDir(MUSIC_DIR, (filePath) => {
    if (!isPlayableFile(filePath)) return;

    const rel = formatRelative(filePath);
    if (!lowerFilter || rel.toLowerCase().includes(lowerFilter)) {
      items.push(rel);
    }
  });

  items.sort((a, b) => a.localeCompare(b));
  return items;
}

function attachFfmpegLogging(ffmpegProcess, label, onFailure) {
  let stderr = '';
  let failureReported = false;

  const reportFailure = (error) => {
    if (failureReported) return;
    failureReported = true;
    onFailure?.(error);
  };

  ffmpegProcess.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-2_000);
  });

  ffmpegProcess.on('error', (error) => {
    console.error(`[ffmpeg] failed for ${label}`, error);
    reportFailure(error);
  });

  ffmpegProcess.on('close', (code, signal) => {
    if (code !== 0 && signal !== 'SIGKILL') {
      console.error(`[ffmpeg] exited code=${code} signal=${signal || 'none'} label=${label}\n${stderr}`);
      reportFailure(new Error(`FFmpeg exit ${code ?? signal}: ${label}`));
    }
  });

  return ffmpegProcess;
}

function createFfmpegStream(filePath, onFailure) {
  const { spawn } = require('child_process');

  const args = [
    '-nostdin',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', filePath,
    '-map', '0:a:0',
    '-vn',
    '-sn',
    '-dn',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ];

  const ffmpegProcess = spawn(FFMPEG_PATH, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return attachFfmpegLogging(ffmpegProcess, formatRelative(filePath), onFailure);
}

function createCrossfadeFfmpegStream(tracks, onFailure) {
  const { spawn } = require('child_process');
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error'];
  const filters = [];

  for (let index = 0; index < tracks.length; index += 1) {
    args.push('-i', tracks[index].filePath);
    filters.push(
      `[${index}:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${index}]`
    );
  }

  let previous = 'a0';
  for (let index = 1; index < tracks.length; index += 1) {
    const output = index === tracks.length - 1 ? 'out' : `xf${index}`;
    filters.push(
      `[${previous}][a${index}]acrossfade=d=${CROSSFADE_SECONDS}:c1=tri:c2=tri[${output}]`
    );
    previous = output;
  }

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[out]',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  );

  const ffmpegProcess = spawn(FFMPEG_PATH, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return attachFfmpegLogging(
    ffmpegProcess,
    `crossfade ${tracks.map((track) => track.displayName).join(' -> ')}`,
    onFailure
  );
}

async function playNext(guildId) {
  const state = guildStates.get(guildId);
  if (!state) return;

  if (state.ffmpegProcess && !state.ffmpegProcess.killed) {
    state.ffmpegProcess.kill('SIGKILL');
    state.ffmpegProcess = null;
  }

  const batchSize = state.forceSingleNext ? 1 : CROSSFADE_SECONDS > 0 ? CROSSFADE_BATCH_SIZE : 1;
  state.forceSingleNext = false;
  const batch = takeNextTracks(state, batchSize);
  const next = batch[0];

  if (!next) {
    state.current = null;
    return;
  }

  if (!state.connection || state.connection.state.status !== VoiceConnectionStatus.Ready) {
    state.queue.unshift(...batch);
    if (state.connection) {
      state.waitingForReady = true;
    }
    return;
  }

  state.current = next;

  const handleFfmpegFailure = () => {
    if (batch.length > 1) {
      state.forceSingleNext = true;
      state.queue.unshift(...batch);
    } else {
      state.invalidTracks.add(next.filePath);
      state.playlist = state.playlist.filter((track) => track.filePath !== next.filePath);
    }

    state.current = null;
    state.activeResource = null;
    state.player.stop(true);
    setImmediate(() => {
      if (!state.current && state.connection?.state?.status === VoiceConnectionStatus.Ready) {
        void playNext(guildId);
      }
    });
  };

  const process = batch.length > 1
    ? createCrossfadeFfmpegStream(batch, handleFfmpegFailure)
    : createFfmpegStream(next.filePath, handleFfmpegFailure);
  state.ffmpegProcess = process;

  process.on('close', () => {
    if (state.ffmpegProcess === process) {
      state.ffmpegProcess = null;
      state.activeResource = null;
      if (state.current?.filePath === batch[0].filePath) {
        state.current = batch[batch.length - 1];
      }
    }
  });

  const resource = createAudioResource(process.stdout, {
    inputType: StreamType.Raw,
    inlineVolume: true,
  });

  resource.volume?.setVolume(state.volume);
  resource.encoder?.setBitrate(OPUS_BITRATE);
  resource.encoder?.setFEC(true);
  state.activeResource = resource;

  state.player.play(resource);

  const textChannel = client.channels.cache.get(state.textChannelId);
  if (textChannel?.isTextBased()) {
    textChannel.send(`Đang phát: \`${next.displayName}\``).catch(() => {});
  }
}

async function enqueueTrack(message, query) {
  const state = getState(message.guild.id);
  const tracks = collectPlayableTracks(query);

  if (tracks.length === 0) {
    throw new Error(`Không tìm thấy file nhạc trong thư mục ${MUSIC_DIR}.`);
  }

  await ensureVoiceConnection(message);

  state.textChannelId = message.channel.id;
  state.playlist = tracks.slice();
  state.queue.push(...tracks);

  if (state.player.state.status !== AudioPlayerStatus.Playing && !state.current) {
    await playNext(message.guild.id);
  }

  return tracks;
}

async function enqueueTrackFromInteraction(interaction, query) {
  const state = getState(interaction.guild.id);
  const tracks = collectPlayableTracks(query);

  if (tracks.length === 0) {
    throw new Error(`Không tìm thấy file nhạc trong thư mục ${MUSIC_DIR}.`);
  }

  await ensureVoiceConnectionFromInteraction(interaction);

  state.textChannelId = interaction.channelId;
  state.playlist = tracks.slice();
  state.queue.push(...tracks);

  if (state.player.state.status !== AudioPlayerStatus.Playing && !state.current) {
    await playNext(interaction.guild.id);
  }

  return tracks;
}

async function handlePlay(message, args) {
  const query = args.join(' ');
  const tracks = await enqueueTrack(message, query);
  const count = tracks.length;
  const scope = query.trim()
    ? `theo lọc \`${query.trim()}\``
    : 'toàn bộ thư mục `music/`';
  message.reply(`Đã thêm ${count} bài vào hàng đợi từ ${scope}.`).catch(() => {});
}

async function handleJoin(message) {
  await ensureVoiceConnection(message);
  message.reply(buildMusicPanel(message.guild)).catch(() => {});
}

function parseToggle(value, current) {
  if (!value) return !current;
  if (['on', 'true', '1', 'yes'].includes(value.toLowerCase())) return true;
  if (['off', 'false', '0', 'no'].includes(value.toLowerCase())) return false;
  throw new Error('Giá trị cần là `on` hoặc `off`.');
}

function cuteEmbed(title, description, color = 0xff9fbd) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`🍑 ${title}`)
    .setDescription(description)
    .setFooter({ text: 'PeachBot • local music' });
}

function getInteractionTitle(commandName) {
  return {
    join: 'Đã vào voice',
    play: 'Bắt đầu phát nhạc',
    pause: 'Đã tạm dừng',
    resume: 'Phát tiếp nào',
    volume: 'Âm lượng',
    nowplaying: 'Đang phát',
    queue: 'Hàng đợi nhạc',
    list: 'Thư viện nhạc',
    skip: 'Đã chuyển bài',
    stop: 'Đã dừng nhạc',
    leave: 'Tạm biệt voice',
    status: 'Trạng thái PeachBot',
    loop: 'Loop playlist',
    repeat: 'Repeat mode',
    random: 'Random next',
    shuffle: 'Đã xáo trộn',
    remove: 'Đã xóa khỏi queue',
    clear: 'Đã dọn queue',
    panel: 'Bảng điều khiển PeachBot',
  }[commandName] || 'PeachBot';
}

function getQueuePage(state, page = 1) {
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(state.queue.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const items = state.queue.slice(start, start + pageSize);
  const lines = items.length > 0
    ? items.map((item, index) => `${start + index + 1}. \`${item.displayName}\``)
    : ['Queue đang trống.'];

  return {
    page: safePage,
    totalPages,
    text: lines.join('\n'),
  };
}

function panelCustomId(action, guildId) {
  return `peach:panel:${action}:${guildId}`;
}

function panelButton(action, label, style, guildId, options = {}) {
  const button = new ButtonBuilder()
    .setCustomId(panelCustomId(action, guildId))
    .setLabel(label)
    .setStyle(style)
    .setDisabled(options.disabled ?? false);

  if (options.emoji) {
    button.setEmoji(options.emoji);
  }

  return button;
}

function buildMusicPanel(guild) {
  const state = guildStates.get(guild.id);
  const botMember = guild.members.me;
  const voiceChannel = botMember?.voice?.channel;
  const playerStatus = state?.player?.state?.status || 'idle';
  const voiceStatus = state?.connection?.state?.status || 'chưa kết nối';
  const currentName = state?.current?.displayName
    ? state.current.displayName.replace(/`/g, "'")
    : 'Chưa có bài nào';
  const volume = Math.round((state?.volume ?? AUDIO_VOLUME) * 100);
  const repeatMode = state?.repeatMode || 'off';
  const repeatLabel = { off: 'tắt', one: 'bài hiện tại', all: 'playlist' }[repeatMode] || repeatMode;
  const randomLabel = state?.randomEnabled ? 'bật' : 'tắt';
  const queueLength = state?.queue?.length || 0;
  const hasTrack = Boolean(state?.current);
  const hasState = Boolean(state);

  const embed = cuteEmbed(
    'PeachBot Music Panel',
    [
      `🎵 **Đang phát:** ${currentName}`,
      `📍 **Voice:** ${voiceChannel ? voiceChannel.name : 'chưa vào voice'} · ${voiceStatus}`,
      `▶️ **Player:** ${playerStatus}`,
      `🔊 **Âm lượng:** ${volume}%`,
      `🔁 **Repeat:** ${repeatLabel}`,
      `🎲 **Random:** ${randomLabel}`,
      `📚 **Queue:** ${queueLength} bài đang chờ`,
      '',
      'Bấm nút hoặc chọn menu bên dưới để điều khiển nhạc nha 🍑',
    ].join('\n')
  ).setFooter({ text: 'PeachBot • /panel để mở panel mới' });

  const controls = new ActionRowBuilder().addComponents(
    panelButton('pause', 'Pause', ButtonStyle.Secondary, guild.id, {
      emoji: '⏸️',
      disabled: !hasTrack || playerStatus !== AudioPlayerStatus.Playing,
    }),
    panelButton('resume', 'Resume', ButtonStyle.Success, guild.id, {
      emoji: '▶️',
      disabled: !hasTrack || playerStatus !== AudioPlayerStatus.Paused,
    }),
    panelButton('skip', 'Skip', ButtonStyle.Primary, guild.id, {
      emoji: '⏭️',
      disabled: !hasTrack,
    }),
    panelButton('stop', 'Stop', ButtonStyle.Danger, guild.id, {
      emoji: '⏹️',
      disabled: !hasTrack && queueLength === 0,
    }),
    panelButton('refresh', 'Refresh', ButtonStyle.Secondary, guild.id, { emoji: '🔄' }),
  );

  const tools = new ActionRowBuilder().addComponents(
    panelButton('play', 'Play all', ButtonStyle.Success, guild.id, {
      emoji: '🎵',
    }),
    panelButton('shuffle', 'Shuffle', ButtonStyle.Primary, guild.id, {
      emoji: '🔀',
      disabled: !hasState || queueLength < 2,
    }),
    panelButton('random', 'Random', ButtonStyle.Secondary, guild.id, {
      emoji: '🎲',
      disabled: !hasState,
    }),
    panelButton('clear', 'Clear queue', ButtonStyle.Secondary, guild.id, {
      emoji: '🧹',
      disabled: !hasState || queueLength === 0,
    }),
    panelButton('leave', 'Leave', ButtonStyle.Danger, guild.id, {
      emoji: '👋',
      disabled: !voiceChannel,
    }),
  );

  const repeatMenu = new StringSelectMenuBuilder()
    .setCustomId(panelCustomId('repeat', guild.id))
    .setPlaceholder('🔁 Chọn chế độ repeat')
    .setDisabled(!hasState)
    .addOptions(
      { label: 'Không lặp', description: 'Dừng lặp playlist', value: 'off', emoji: '➡️', default: repeatMode === 'off' },
      { label: 'Lặp bài hiện tại', description: 'Phát lại một bài', value: 'one', emoji: '🔂', default: repeatMode === 'one' },
      { label: 'Lặp cả playlist', description: 'Phát playlist vô hạn', value: 'all', emoji: '🔁', default: repeatMode === 'all' },
    );

  const volumeMenu = new StringSelectMenuBuilder()
    .setCustomId(panelCustomId('volume', guild.id))
    .setPlaceholder(`🔊 Âm lượng hiện tại: ${volume}%`)
    .setDisabled(!hasState)
    .addOptions(
      { label: '50%', description: 'Âm lượng nhẹ', value: '50', emoji: '🔈', default: volume === 50 },
      { label: '75%', description: 'Âm lượng vừa', value: '75', emoji: '🔉', default: volume === 75 },
      { label: '100%', description: 'Âm lượng gốc', value: '100', emoji: '🔊', default: volume === 100 },
      { label: '115%', description: 'Mức mặc định của PeachBot', value: '115', emoji: '🍑', default: volume === 115 },
      { label: '125%', description: 'To hơn một chút', value: '125', emoji: '📢', default: volume === 125 },
      { label: '150%', description: 'To rõ hơn', value: '150', emoji: '📣', default: volume === 150 },
      { label: '200%', description: 'Mức tối đa', value: '200', emoji: '🚀', default: volume === 200 },
    );

  return {
    embeds: [embed],
    components: [
      controls,
      tools,
      new ActionRowBuilder().addComponents(repeatMenu),
      new ActionRowBuilder().addComponents(volumeMenu),
    ],
  };
}

function stopState(state) {
  state.queue.length = 0;
  state.playlist.length = 0;
  state.repeatMode = 'off';
  state.invalidTracks.clear();
  state.current = null;
  state.activeResource = null;

  if (state.ffmpegProcess && !state.ffmpegProcess.killed) {
    state.ffmpegProcess.kill('SIGKILL');
    state.ffmpegProcess = null;
  }

  state.player.stop(true);
}

async function handlePanelInteraction(interaction) {
  const [, scope, action, guildId] = interaction.customId.split(':');
  if (scope !== 'panel' || !interaction.guild || guildId !== interaction.guildId) {
    await interaction.reply({
      embeds: [cuteEmbed('Panel không hợp lệ', 'Panel này không thuộc server hiện tại.', 0xff6b81)],
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return;
  }

  try {
    await interaction.deferUpdate();
    const state = action === 'refresh' || action === 'leave'
      ? guildStates.get(guildId)
      : getState(guildId);

    switch (action) {
      case 'play':
        await enqueueTrackFromInteraction(interaction, '');
        break;
      case 'pause':
        if (state?.player?.state?.status === AudioPlayerStatus.Playing) state.player.pause();
        break;
      case 'resume':
        state?.player?.unpause();
        break;
      case 'skip':
        if (state?.current) state.player.stop(true);
        break;
      case 'stop':
        if (state) stopState(state);
        break;
      case 'shuffle':
        if (state) shuffleInPlace(state.queue);
        break;
      case 'clear':
        if (state) {
          state.queue.length = 0;
          state.playlist.length = 0;
          state.repeatMode = 'off';
        }
        break;
      case 'random':
        if (state) state.randomEnabled = !state.randomEnabled;
        break;
      case 'repeat': {
        const mode = interaction.values?.[0];
        if (state && ['off', 'one', 'all'].includes(mode)) state.repeatMode = mode;
        break;
      }
      case 'volume': {
        const percent = Number(interaction.values?.[0]);
        if (state && Number.isInteger(percent) && percent >= 0 && percent <= 200) {
          state.volume = percent / 100;
          state.activeResource?.volume?.setVolume(state.volume);
        }
        break;
      }
      case 'leave':
        cleanupGuild(guildId);
        break;
      case 'refresh':
        break;
      default:
        break;
    }

    await interaction.message.edit(buildMusicPanel(interaction.guild));
  } catch (error) {
    console.error(`[panel:${interaction.id}] failed`, error);
    await interaction.followUp({
      embeds: [cuteEmbed('Panel gặp trục trặc', error?.message || 'Không thể cập nhật panel.', 0xff6b81)],
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }
}

function handlePause(message) {
  const state = getState(message.guild.id);
  if (state.player.state.status !== AudioPlayerStatus.Playing) {
    message.reply('Bài hiện tại chưa ở trạng thái đang phát.').catch(() => {});
    return;
  }
  state.player.pause();
  message.reply('Đã tạm dừng nhạc.').catch(() => {});
}

function handleResume(message) {
  const state = getState(message.guild.id);
  if (!state.player.unpause()) {
    message.reply('Không có bài nào đang tạm dừng.').catch(() => {});
    return;
  }
  message.reply('Nhạc phát tiếp rồi.').catch(() => {});
}

function handleVolume(message, args) {
  const percent = Number(args[0]);
  if (!Number.isInteger(percent) || percent < 0 || percent > 200) {
    throw new Error('Âm lượng cần là số nguyên từ `0` đến `200`.');
  }
  const state = getState(message.guild.id);
  state.volume = percent / 100;
  state.activeResource?.volume?.setVolume(state.volume);
  message.reply(`Âm lượng PeachBot: **${percent}%**.`).catch(() => {});
}

function handleNowPlaying(message) {
  const state = getState(message.guild.id);
  const current = state.current ? `**${state.current.displayName}**` : 'chưa có bài nào';
  message.reply(`${current}\nVolume: ${Math.round(state.volume * 100)}%\nRepeat: ${state.repeatMode} | Random: ${state.randomEnabled ? 'bật' : 'tắt'}`).catch(() => {});
}

function handleRemove(message, args) {
  const position = Number(args[0]);
  const state = getState(message.guild.id);
  if (!Number.isInteger(position) || position < 1 || position > state.queue.length) {
    throw new Error(`Vị trí queue phải từ 1 đến ${state.queue.length}.`);
  }
  const [removed] = state.queue.splice(position - 1, 1);
  message.reply(`Đã bỏ khỏi queue: \`${removed.displayName}\`.`).catch(() => {});
}

function handleClear(message) {
  const state = getState(message.guild.id);
  const count = state.queue.length;
  state.queue.length = 0;
  state.playlist.length = 0;
  state.repeatMode = 'off';
  message.reply(`Đã dọn queue (${count} bài). Bài đang phát vẫn tiếp tục.`).catch(() => {});
}

function handleLoop(message, args) {
  const state = getState(message.guild.id);
  const enabled = parseToggle(args[0], state.repeatMode === 'all');
  state.repeatMode = enabled ? 'all' : 'off';
  if (enabled && !state.current && state.connection?.state?.status === VoiceConnectionStatus.Ready) {
    void playNext(message.guild.id);
  }
  const playlistState = state.playlist.length > 0 ? '' : ' Hãy dùng `!play` trước để tạo playlist.';
  message.reply(`Loop playlist: **${enabled ? 'bật' : 'tắt'}**.${playlistState}`).catch(() => {});
}

function handleRepeat(message, args) {
  const state = getState(message.guild.id);
  const mode = (args[0] || '').toLowerCase();
  if (!['off', 'one', 'all'].includes(mode)) {
    throw new Error('Dùng `!repeat off`, `!repeat one` hoặc `!repeat all`.');
  }
  state.repeatMode = mode;
  if (mode !== 'off' && !state.current && state.connection?.state?.status === VoiceConnectionStatus.Ready) {
    void playNext(message.guild.id);
  }
  message.reply(`Repeat mode: **${mode}**.`).catch(() => {});
}

function handleRandom(message, args) {
  const state = getState(message.guild.id);
  state.randomEnabled = parseToggle(args[0], state.randomEnabled);
  message.reply(`Random next: **${state.randomEnabled ? 'bật' : 'tắt'}**.`).catch(() => {});
}

function handleShuffle(message) {
  const state = getState(message.guild.id);
  shuffleInPlace(state.queue);
  message.reply(`Đã xáo trộn ${state.queue.length} bài đang chờ.`).catch(() => {});
}

function handleQueue(message, args) {
  const state = getState(message.guild.id);
  if (args.length > 0) {
    if (/^\d+$/.test(args[0])) {
      const page = getQueuePage(state, Number(args[0]));
      message.reply(`Queue trang ${page.page}/${page.totalPages}\n${page.text}`).catch(() => {});
      return;
    }
    const items = listTracks(args.join(' '));

    if (items.length === 0) {
      message.reply(`Không có file nào trong ${MUSIC_DIR}.`).catch(() => {});
      return;
    }

    const preview = items.slice(0, 20).map((item, index) => `${index + 1}. ${item}`).join('\n');
    const suffix = items.length > 20 ? `\n...và ${items.length - 20} file nữa` : '';
    const nowPlaying = state.current ? `\nĐang phát: \`${state.current.displayName}\`` : '';
    message.reply(`Danh sách nhạc:\n${preview}${suffix}${nowPlaying}`).catch(() => {});
    return;
  }

  const page = getQueuePage(state, 1);
  const queueText = `Queue trang ${page.page}/${page.totalPages}\n${page.text}`;
  const currentText = state.current ? `Đang phát: \`${state.current.displayName}\`` : 'Hiện chưa có bài nào đang phát.';
  message.reply(`${currentText}\n${queueText}`).catch(() => {});
}

function handleSkip(message) {
  const state = getState(message.guild.id);
  if (!state.current) {
    message.reply('Hiện không có bài nào đang phát.').catch(() => {});
    return;
  }

  state.player.stop(true);
  message.reply('Đã bỏ qua bài hiện tại.').catch(() => {});
}

function handleStop(message) {
  const state = getState(message.guild.id);
  state.queue.length = 0;
  state.playlist.length = 0;
  state.repeatMode = 'off';
  state.invalidTracks.clear();
  state.current = null;
  state.activeResource = null;

  if (state.ffmpegProcess && !state.ffmpegProcess.killed) {
    state.ffmpegProcess.kill('SIGKILL');
    state.ffmpegProcess = null;
  }

  state.player.stop(true);
  message.reply('Đã dừng phát và xoá hàng đợi.').catch(() => {});
}

function handleLeave(message) {
  cleanupGuild(message.guild.id);
  message.reply('Đã rời voice channel.').catch(() => {});
}

async function respondToInteraction(interaction, handler) {
  const startedAt = Date.now();
  try {
    await interaction.deferReply();
    const ageMs = Date.now() - interaction.createdTimestamp;
    console.log(
      `[interaction:${interaction.id}] ${interaction.commandName} acknowledged ` +
        `from=${interaction.user.tag} guild=${interaction.guild?.id || 'DM'} age=${ageMs}ms ` +
        `defer=${Date.now() - startedAt}ms`
    );
    const content = await handler();
    if (typeof content === 'string') {
      await interaction.editReply({
        embeds: [cuteEmbed(getInteractionTitle(interaction.commandName), content)],
      });
    } else if (content) {
      await interaction.editReply(content);
    } else {
      await interaction.editReply('Xong.');
    }
  } catch (error) {
    console.error(`[interaction:${interaction.id}] ${interaction.commandName} failed`, {
      ageMs: Date.now() - interaction.createdTimestamp,
      deferMs: Date.now() - startedAt,
      deferred: interaction.deferred,
      replied: interaction.replied,
      errorName: error?.name,
      errorCode: error?.code,
      errorMessage: error?.message,
    });
    console.error(error);
    const message = error?.message || 'Đã xảy ra lỗi khi xử lý lệnh.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        embeds: [cuteEmbed('Có lỗi rồi', message, 0xff6b81)],
      }).catch(() => {});
    } else {
      await interaction.reply({
        embeds: [cuteEmbed('Có lỗi rồi', message, 0xff6b81)],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}

client.on('debug', (message) => {
  if (String(message).startsWith('[VOICE]')) {
    console.log(`[gateway] ${redactVoiceDebug(message)}`);
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

client.on('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Music dir: ${MUSIC_DIR}`);
  console.log(`FFmpeg: ${FFMPEG_PATH}`);
  void registerSlashCommands().catch((error) => {
    console.error('Failed to register slash commands:', error);
  });
});

client.on('messageCreate', async (message) => {
  if (!ENABLE_PREFIX_COMMANDS) return;
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const [rawCommand, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (rawCommand || '').toLowerCase();

  try {
    switch (command) {
      case 'join':
      case 'connect':
        await handleJoin(message);
        break;
      case 'play':
        await handlePlay(message, args);
        break;
      case 'pause':
        handlePause(message);
        break;
      case 'resume':
      case 'unpause':
        handleResume(message);
        break;
      case 'volume':
        handleVolume(message, args);
        break;
      case 'nowplaying':
      case 'np':
        handleNowPlaying(message);
        break;
      case 'queue':
      case 'list':
        handleQueue(message, args);
        break;
      case 'remove':
        handleRemove(message, args);
        break;
      case 'clear':
        handleClear(message);
        break;
      case 'skip':
        handleSkip(message);
        break;
      case 'stop':
        handleStop(message);
        break;
      case 'loop':
        handleLoop(message, args);
        break;
      case 'repeat':
        handleRepeat(message, args);
        break;
      case 'random':
        handleRandom(message, args);
        break;
      case 'shuffle':
        handleShuffle(message);
        break;
      case 'leave':
      case 'disconnect':
        handleLeave(message);
        break;
      case 'help':
        message.reply([
          `Lệnh hiện có:`,
          `\`${PREFIX}join\` - vào voice channel của bạn`,
          `\`${PREFIX}play [lọc]\` - phát toàn bộ nhạc local hoặc lọc theo từ khóa`,
          `\`${PREFIX}pause\` / \`${PREFIX}resume\` - tạm dừng/tiếp tục`,
          `\`${PREFIX}volume <0-200>\` - chỉnh âm lượng`,
          `\`${PREFIX}nowplaying\` - xem bài đang phát`,
          `\`${PREFIX}queue [từ khóa]\` - liệt kê file nhạc`,
          `\`${PREFIX}remove <vị trí>\` / \`${PREFIX}clear\` - quản lý queue`,
          `\`${PREFIX}skip\` - bỏ qua bài hiện tại`,
          `\`${PREFIX}stop\` - dừng phát`,
          `\`${PREFIX}loop [on|off]\` - lặp playlist vô hạn`,
          `\`${PREFIX}repeat off|one|all\` - chế độ lặp`,
          `\`${PREFIX}random [on|off]\` - chọn bài kế tiếp ngẫu nhiên`,
          `\`${PREFIX}shuffle\` - xáo trộn queue`,
          `\`${PREFIX}leave\` - rời voice channel`,
          `\`${PREFIX}status\` - xem trạng thái bot`,
        ].join('\n')).catch(() => {});
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(error);
    message.reply(error.message || 'Đã xảy ra lỗi khi xử lý lệnh.').catch(() => {});
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await handlePanelInteraction(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  console.log(
    `[interaction:${interaction.id}] received ${interaction.commandName} ` +
      `age=${Date.now() - interaction.createdTimestamp}ms`
  );

  const command = interaction.commandName;

  switch (command) {
    case 'join':
      await respondToInteraction(interaction, async () => {
        await ensureVoiceConnectionFromInteraction(interaction);
        return buildMusicPanel(interaction.guild);
      });
      break;
    case 'play':
      await respondToInteraction(interaction, async () => {
        const query = interaction.options.getString('query') || '';
        const tracks = await enqueueTrackFromInteraction(interaction, query);
        const scope = query.trim()
          ? `theo lọc \`${query.trim()}\``
          : 'toàn bộ thư mục `music/`';
        return `Đã thêm ${tracks.length} bài vào hàng đợi từ ${scope}.`;
      });
      break;
    case 'pause':
      await respondToInteraction(interaction, async () => {
        const state = getState(interaction.guild.id);
        if (state.player.state.status !== AudioPlayerStatus.Playing) {
          return 'Bài hiện tại chưa ở trạng thái đang phát.';
        }
        state.player.pause();
        return 'Đã tạm dừng nhạc.';
      });
      break;
    case 'resume':
      await respondToInteraction(interaction, async () => {
        const state = getState(interaction.guild.id);
        return state.player.unpause() ? 'Nhạc phát tiếp rồi.' : 'Không có bài nào đang tạm dừng.';
      });
      break;
    case 'volume':
      await respondToInteraction(interaction, async () => {
        const percent = interaction.options.getInteger('percent');
        const state = getState(interaction.guild.id);
        state.volume = percent / 100;
        state.activeResource?.volume?.setVolume(state.volume);
        return `Âm lượng PeachBot: **${percent}%**.`;
      });
      break;
    case 'nowplaying':
      await respondToInteraction(interaction, async () => {
        const state = getState(interaction.guild.id);
        const current = state.current ? `**${state.current.displayName}**` : 'chưa có bài nào';
        return `${current}\nVolume: ${Math.round(state.volume * 100)}%\nRepeat: ${state.repeatMode} | Random: ${state.randomEnabled ? 'bật' : 'tắt'}`;
      });
      break;
    case 'queue':
      await respondToInteraction(interaction, async () => {
        const state = getState(interaction.guild.id);
        const page = getQueuePage(state, interaction.options.getInteger('page') || 1);
        const currentText = state.current ? `Đang phát: \`${state.current.displayName}\`` : 'Hiện chưa có bài nào đang phát.';
        return `${currentText}\nRepeat: ${state.repeatMode} | Random: ${state.randomEnabled ? 'bật' : 'tắt'}\nQueue trang ${page.page}/${page.totalPages}\n${page.text}`;
      });
      break;
    case 'remove':
      await respondToInteraction(interaction, async () => {
        const position = interaction.options.getInteger('position');
        const state = getState(interaction.guild.id);
        if (position > state.queue.length) {
          return `Vị trí queue phải từ 1 đến ${state.queue.length}.`;
        }
        const [removed] = state.queue.splice(position - 1, 1);
        return `Đã bỏ khỏi queue: \`${removed.displayName}\`.`;
      });
      break;
    case 'clear':
      await respondToInteraction(interaction, async () => {
        const state = getState(interaction.guild.id);
        const count = state.queue.length;
        state.queue.length = 0;
        state.playlist.length = 0;
        state.repeatMode = 'off';
        return `Đã dọn queue (${count} bài). Bài đang phát vẫn tiếp tục.`;
      });
      break;
    case 'list':
      await respondToInteraction(interaction, async () => {
        const filter = interaction.options.getString('filter') || '';
        const items = listTracks(filter);

        if (items.length === 0) {
          return `Không có file nào trong ${MUSIC_DIR}.`;
        }

        const preview = items.slice(0, 20).map((item, index) => `${index + 1}. ${item}`).join('\n');
        const suffix = items.length > 20 ? `\n...và ${items.length - 20} file nữa` : '';
        return `Danh sách nhạc:\n${preview}${suffix}`;
      });
      break;
    case 'skip':
      await respondToInteraction(interaction, async () => {
        const state = getState(interaction.guild.id);
        if (!state.current) {
          return 'Hiện không có bài nào đang phát.';
        }
        state.player.stop(true);
        return 'Đã bỏ qua bài hiện tại.';
      });
      break;
      case 'stop':
        await respondToInteraction(interaction, async () => {
          const state = getState(interaction.guild.id);
          state.queue.length = 0;
          state.playlist.length = 0;
          state.repeatMode = 'off';
          state.invalidTracks.clear();
          state.current = null;
          state.activeResource = null;

        if (state.ffmpegProcess && !state.ffmpegProcess.killed) {
          state.ffmpegProcess.kill('SIGKILL');
          state.ffmpegProcess = null;
        }

        state.player.stop(true);
        return 'Đã dừng phát và xoá hàng đợi.';
      });
      break;
    case 'leave':
      await respondToInteraction(interaction, async () => {
        cleanupGuild(interaction.guild.id);
        return 'Đã rời voice channel.';
      });
      break;
    case 'status':
      await respondToInteraction(interaction, async () => {
        return '```text\n' + getVoiceStatusSummary(interaction.guild) + '\n```';
      });
      break;
    case 'panel':
      await respondToInteraction(interaction, async () => buildMusicPanel(interaction.guild));
      break;
    case 'loop':
      await respondToInteraction(interaction, async () => {
        const state = getState(interaction.guild.id);
        const requested = interaction.options.getBoolean('enabled');
        const enabled = requested ?? state.repeatMode !== 'all';
        state.repeatMode = enabled ? 'all' : 'off';
        if (enabled && !state.current && state.connection?.state?.status === VoiceConnectionStatus.Ready) {
          void playNext(interaction.guild.id);
        }
        return `Loop playlist: **${enabled ? 'bật' : 'tắt'}**.` +
          (state.playlist.length > 0 ? '' : ' Hãy dùng `/play` trước để tạo playlist.');
      });
      break;
    case 'repeat':
      await respondToInteraction(interaction, async () => {
        const state = getState(interaction.guild.id);
        const mode = interaction.options.getString('mode');
        state.repeatMode = mode;
        if (mode !== 'off' && !state.current && state.connection?.state?.status === VoiceConnectionStatus.Ready) {
          void playNext(interaction.guild.id);
        }
        return `Repeat mode: **${mode}**.`;
      });
      break;
    case 'random':
      await respondToInteraction(interaction, async () => {
        const state = getState(interaction.guild.id);
        const requested = interaction.options.getBoolean('enabled');
        state.randomEnabled = requested ?? !state.randomEnabled;
        return `Random next: **${state.randomEnabled ? 'bật' : 'tắt'}**.`;
      });
      break;
    case 'shuffle':
      await respondToInteraction(interaction, async () => {
        const state = getState(interaction.guild.id);
        shuffleInPlace(state.queue);
        return `Đã xáo trộn ${state.queue.length} bài đang chờ.`;
      });
      break;
    default:
      break;
  }
});

process.on('SIGINT', () => {
  for (const guildId of guildStates.keys()) {
    cleanupGuild(guildId);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  for (const guildId of guildStates.keys()) {
    cleanupGuild(guildId);
  }
  process.exit(0);
});

if (!process.env.DISCORD_TOKEN) {
  throw new Error('Thiếu DISCORD_TOKEN trong file .env');
}

if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

client.login(process.env.DISCORD_TOKEN);
