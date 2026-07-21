const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { PermissionsBitField } = require('discord.js');
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

function createMusicService({ client, config, stateStore }) {
  const guildStates = new Map();
  const observedNetworkings = new WeakSet();
  const events = new EventEmitter();
  const SUPPORTED_AUDIO_EXTENSIONS = [
    '.mp3', '.wav', '.ogg', '.oga', '.opus', '.m4a', '.m4b',
    '.flac', '.aac', '.webm', '.weba', '.mka',
  ];
  const MOODS = ['auto', 'calm', 'focus', 'happy', 'sad', 'energetic', 'sleep', 'romantic'];
  const MOOD_KEYWORDS = {
    calm: ['calm', 'chill', 'lofi', 'relax', 'ambient', 'piano', 'rain'],
    focus: ['focus', 'study', 'instrumental', 'deep', 'concentration', 'work'],
    happy: ['happy', 'upbeat', 'fun', 'summer', 'party', 'dance'],
    sad: ['sad', 'rain', 'melancholy', 'blue', 'piano', 'night'],
    energetic: ['energy', 'rock', 'workout', 'dance', 'boost', 'intense'],
    sleep: ['sleep', 'night', 'ambient', 'rain', 'calm', 'lofi'],
    romantic: ['love', 'romantic', 'acoustic', 'piano', 'heart'],
  };

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
        repeatMode: config.LOOP_PLAYLIST_DEFAULT ? 'all' : config.REPEAT_MODE_DEFAULT,
        randomEnabled: config.RANDOM_NEXT_DEFAULT,
        smartQueue: stateStore?.getGuildSettings(guildId).smartQueue ?? config.SMART_QUEUE_DEFAULT,
        mood: stateStore?.getGuildSettings(guildId).mood || config.MOOD_DEFAULT,
        current: null,
        activeResource: null,
        invalidTracks: new Set(),
        forceSingleNext: false,
        volume: config.AUDIO_VOLUME,
        connection: null,
        ffmpegProcess: null,
        ytdlpProcess: null,
        textChannelId: null,
        waitingForReady: false,
        voiceReconnectAttempts: 0,
        recentTracks: [],
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

    if (config.VOICE_DEBUG) {
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
      debug: config.VOICE_DEBUG,
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
    return collectPlayableTracksFromDirectory(filterText, config.MUSIC_DIR, '');
  }

  function getTrackPlaylistName(filePath) {
    const relative = formatRelative(filePath);
    const [firstPart] = relative.split('/');
    return relative.includes('/') ? firstPart : 'default';
  }

  function trackKey(track) {
    return track?.filePath || track?.url || track?.displayName;
  }

  function isYouTubeUrl(value) {
    try {
      const url = new URL(String(value).trim());
      const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
      return [
        'youtube.com',
        'm.youtube.com',
        'music.youtube.com',
        'youtu.be',
      ].includes(hostname);
    } catch {
      return false;
    }
  }

  function createYouTubeTrack(url) {
    return {
      source: 'youtube',
      url: String(url).trim(),
      displayName: `YouTube • ${String(url).trim()}`,
      playlist: 'youtube',
    };
  }

  function collectPlayableTracksFromDirectory(filterText = '', rootDir = config.MUSIC_DIR, playlistName = '') {
    const items = [];
    const lowerFilter = filterText.trim().toLowerCase();

    walkMusicDir(rootDir, (filePath) => {
      if (!isPlayableFile(filePath)) return;
      if (playlistName === 'default' && path.dirname(filePath) !== rootDir) return;

      const rel = formatRelative(filePath);
      if (!lowerFilter || rel.toLowerCase().includes(lowerFilter)) {
        items.push({
          filePath,
          displayName: rel,
          playlist: playlistName || getTrackPlaylistName(filePath),
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

    state.queue.push(...state.playlist.filter((track) => !state.invalidTracks.has(trackKey(track))));
    if (state.randomEnabled) {
      shuffleInPlace(state.queue);

      if (state.current && state.queue.length > 1 && trackKey(state.queue[0]) === trackKey(state.current)) {
        [state.queue[0], state.queue[1]] = [state.queue[1], state.queue[0]];
      }
    }

    return true;
  }

  function takeNextTrack(state) {
    if (state.repeatMode === 'one' && state.current && !state.invalidTracks.has(trackKey(state.current))) {
      return state.current;
    }

    if (state.queue.length === 0) refillLoopQueue(state);
    const eligible = state.queue.filter((track) => !state.invalidTracks.has(trackKey(track)));
    if (eligible.length === 0) {
      state.queue.length = 0;
      return null;
    }

    let candidates = eligible;
    if (state.smartQueue && eligible.length > 1) {
      const fresh = eligible.filter((track) => !state.recentTracks.includes(trackKey(track)));
      if (fresh.length > 0) candidates = fresh;
    }

    if (state.mood !== 'auto' && MOOD_KEYWORDS[state.mood]) {
      const moodOrdered = orderTracksForMood(candidates, state.mood);
      candidates = moodOrdered.slice(0, Math.max(1, Math.ceil(moodOrdered.length * 0.6)));
    }

    const chosen = state.randomEnabled
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : candidates[0];
    const randomIndex = state.queue.indexOf(chosen);
    return randomIndex >= 0 ? state.queue.splice(randomIndex, 1)[0] : null;
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
    if (!botMember) throw new Error('Không xác định được bot member trong server.');

    const permissions = voiceChannel.permissionsFor(botMember);
    if (!permissions) throw new Error('Không đọc được quyền của bot trên voice channel.');

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
    const lines = [
      `Guild: ${guild.name}`,
      `Bot voice: ${voiceChannel ? `${voiceChannel.name} (${voiceChannel.id})` : 'chưa vào voice'}`,
      `Voice state: ${state?.connection?.state?.status || 'không có connection'}`,
      `Player state: ${state?.player?.state?.status || 'không có player'}`,
      `Current track: ${state?.current?.displayName || 'không có'}`,
      `Queue length: ${state?.queue?.length || 0}`,
      `Repeat: ${state?.repeatMode || 'off'}`,
      `Random next: ${state?.randomEnabled ? 'on' : 'off'}`,
      `Smart queue: ${state?.smartQueue ? 'on' : 'off'}`,
      `Mood: ${state?.mood || config.MOOD_DEFAULT}`,
      `Crossfade: ${config.CROSSFADE_SECONDS > 0 ? `${config.CROSSFADE_SECONDS}s` : 'off'}`,
    ];

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
        const missing = required.filter(([, permission]) => !permissions.has(permission)).map(([name]) => name);
        lines.push(`Missing permissions: ${missing.length > 0 ? missing.join(', ') : 'none'}`);
      }
    }

    return lines.join('\n');
  }

  async function ensureVoiceConnection(message) {
    return ensureVoiceConnectionFromChannel(message.guild, message.member?.voice?.channel, message.guild.id);
  }

  async function ensureVoiceConnectionFromInteraction(interaction) {
    return ensureVoiceConnectionFromChannel(interaction.guild, interaction.member?.voice?.channel, interaction.guild.id);
  }

  async function ensureVoiceConnectionFromChannel(guild, memberVoice, guildId) {
    if (!memberVoice) throw new Error('Bạn cần vào voice channel trước.');
    assertVoicePermissions(guild, memberVoice);

    const state = getState(guildId);
    if (state.connection?.state?.status === VoiceConnectionStatus.Ready) return state.connection;

    if (state.connection) {
      try {
        state.connection.destroy();
      } catch {
        // ignore stale connection cleanup
      }
      state.connection = null;
    }

    const connection = createVoiceConnection(guild, memberVoice, state);
    setVoiceReadyWatchdog(guild, memberVoice, state, connection);
    return connection;
  }

  function cleanupGuild(guildId) {
    const state = guildStates.get(guildId);
    if (!state) return;

    if (state.ffmpegProcess && !state.ffmpegProcess.killed) state.ffmpegProcess.kill('SIGKILL');
    if (state.ytdlpProcess && !state.ytdlpProcess.killed) state.ytdlpProcess.kill('SIGKILL');
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
    const relative = path.relative(config.MUSIC_DIR, candidate);
    return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  function walkMusicDir(rootDir, onFile) {
    if (!fs.existsSync(rootDir)) return;
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) walkMusicDir(fullPath, onFile);
      else if (entry.isFile()) onFile(fullPath);
    }
  }

  function formatRelative(filePath) {
    return path.relative(config.MUSIC_DIR, filePath).split(path.sep).join('/');
  }

  function isPlayableFile(filePath) {
    return SUPPORTED_AUDIO_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
  }

  function listTracks(filterText = '') {
    const items = [];
    const lowerFilter = filterText.trim().toLowerCase();
    walkMusicDir(config.MUSIC_DIR, (filePath) => {
      if (!isPlayableFile(filePath)) return;
      const rel = formatRelative(filePath);
      if (!lowerFilter || rel.toLowerCase().includes(lowerFilter)) items.push(rel);
    });
    items.sort((a, b) => a.localeCompare(b));
    return items;
  }

  function collectPlayableTracksByQuery(query = '') {
    return collectPlayableTracks(query);
  }

  function listPlaylists() {
    if (!fs.existsSync(config.MUSIC_DIR)) return [];
    const playlists = fs.readdirSync(config.MUSIC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
    const hasRootTracks = fs.readdirSync(config.MUSIC_DIR, { withFileTypes: true })
      .some((entry) => entry.isFile() && isPlayableFile(entry.name));
    if (hasRootTracks) playlists.unshift('default');
    return ['all', ...playlists.sort((a, b) => a.localeCompare(b))];
  }

  function resolvePlaylistName(playlistName) {
    const requested = String(playlistName || '').trim().toLowerCase();
    if (!requested) return '';
    return listPlaylists().find((name) => name.toLowerCase() === requested) || '';
  }

  function collectPlaylistTracks(playlistName, filterText = '') {
    const resolved = resolvePlaylistName(playlistName);
    if (!resolved) throw new Error(`Không tìm thấy playlist \`${playlistName}\`. Dùng /playlists để xem danh sách.`);
    if (resolved === 'all') return collectPlayableTracks(filterText);
    if (resolved === 'default') return collectPlayableTracksFromDirectory(filterText, config.MUSIC_DIR, 'default');
    return collectPlayableTracksFromDirectory(
      filterText,
      path.join(config.MUSIC_DIR, resolved),
      resolved
    );
  }

  function collectInputTracks(query = '', playlistName = '') {
    const input = String(query || '').trim();
    if (isYouTubeUrl(input)) return [createYouTubeTrack(input)];
    return playlistName ? collectPlaylistTracks(playlistName, input) : collectPlayableTracks(input);
  }

  function orderTracksForMood(tracks, mood) {
    if (!MOOD_KEYWORDS[mood]) return tracks.slice();
    const keywords = MOOD_KEYWORDS[mood];
    return tracks
      .map((track, index) => ({
        track,
        index,
        score: keywords.reduce((score, keyword) => (
          track.displayName.toLowerCase().includes(keyword) ? score + 1 : score
        ), 0),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ track }) => track);
  }

  function setMood(guildId, mood) {
    const normalized = MOODS.includes(mood) ? mood : 'auto';
    const state = getState(guildId);
    state.mood = normalized;
    state.playlist = orderTracksForMood(state.playlist, normalized);
    state.queue = orderTracksForMood(state.queue, normalized);
    stateStore?.updateGuildSettings(guildId, { mood: normalized });
    return normalized;
  }

  function setSmartQueue(guildId, enabled) {
    const state = getState(guildId);
    state.smartQueue = Boolean(enabled);
    stateStore?.updateGuildSettings(guildId, { smartQueue: state.smartQueue });
    return state.smartQueue;
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
      '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-i', filePath, '-map', '0:a:0', '-vn', '-sn', '-dn',
      '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1',
    ];
    return attachFfmpegLogging(spawn(config.FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] }), formatRelative(filePath), onFailure);
  }

  function createYouTubeFfmpegStream(url, onFailure) {
    const { spawn } = require('child_process');
    const ytdlp = spawn(config.YTDLP_PATH, [
      '--no-playlist',
      '--no-warnings',
      '--quiet',
      '--no-progress',
      '-f', 'bestaudio/best',
      '-o', '-',
      '--', url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    const ffmpeg = spawn(config.FFMPEG_PATH, [
      '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0', '-map', '0:a:0', '-vn', '-sn', '-dn',
      '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let streamEnded = false;
    let failureReported = false;
    const reportFailure = (error) => {
      if (failureReported || streamEnded) return;
      failureReported = true;
      onFailure?.(error);
    };

    let ytdlpStderr = '';
    ytdlp.stderr.on('data', (chunk) => {
      ytdlpStderr = `${ytdlpStderr}${chunk}`.slice(-2_000);
    });
    ytdlp.on('error', (error) => {
      console.error(`[yt-dlp] failed for ${url}`, error);
      reportFailure(error);
      if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
    });
    ytdlp.on('close', (code, signal) => {
      if (code !== 0 && signal !== 'SIGKILL' && !streamEnded) {
        console.error(`[yt-dlp] exited code=${code ?? signal} url=${url}\n${ytdlpStderr}`);
        reportFailure(new Error(`yt-dlp exit ${code ?? signal}`));
      }
    });

    const ffmpegProcess = attachFfmpegLogging(
      ffmpeg,
      `youtube ${url}`,
      reportFailure
    );
    const handlePipeError = (error) => {
      // Stopping a track closes FFmpeg stdin while yt-dlp may still be writing.
      // EPIPE is expected during that shutdown and must not crash Node.
      if (['EPIPE', 'ERR_STREAM_DESTROYED'].includes(error?.code)) return;
      reportFailure(error);
    };
    ffmpeg.stdin.on('error', handlePipeError);
    ytdlp.stdout.on('error', handlePipeError);
    ffmpegProcess.on('close', () => {
      streamEnded = true;
      ytdlp.stdout.unpipe(ffmpeg.stdin);
      if (!ffmpeg.stdin.destroyed) ffmpeg.stdin.destroy();
      if (!ytdlp.killed) ytdlp.kill('SIGKILL');
    });
    ytdlp.stdout.pipe(ffmpeg.stdin);

    return { ffmpegProcess, ytdlpProcess: ytdlp };
  }

  function createCrossfadeFfmpegStream(tracks, onFailure) {
    const { spawn } = require('child_process');
    const args = ['-nostdin', '-hide_banner', '-loglevel', 'error'];
    const filters = [];

    for (let index = 0; index < tracks.length; index += 1) {
      args.push('-i', tracks[index].filePath);
      filters.push(`[${index}:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${index}]`);
    }

    let previous = 'a0';
    for (let index = 1; index < tracks.length; index += 1) {
      const output = index === tracks.length - 1 ? 'out' : `xf${index}`;
      filters.push(`[${previous}][a${index}]acrossfade=d=${config.CROSSFADE_SECONDS}:c1=tri:c2=tri[${output}]`);
      previous = output;
    }

    args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1');
    return attachFfmpegLogging(
      spawn(config.FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] }),
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
    if (state.ytdlpProcess && !state.ytdlpProcess.killed) {
      state.ytdlpProcess.kill('SIGKILL');
      state.ytdlpProcess = null;
    }

    const hasYouTubeTrack = state.current?.source === 'youtube' || state.queue.some((track) => track.source === 'youtube');
    const batchSize = state.forceSingleNext || hasYouTubeTrack
      ? 1
      : config.CROSSFADE_SECONDS > 0 ? config.CROSSFADE_BATCH_SIZE : 1;
    state.forceSingleNext = false;
    const batch = takeNextTracks(state, batchSize);
    const next = batch[0];
    if (!next) {
      state.current = null;
      return;
    }

    if (!state.connection || state.connection.state.status !== VoiceConnectionStatus.Ready) {
      state.queue.unshift(...batch);
      if (state.connection) state.waitingForReady = true;
      return;
    }

    state.current = next;
    state.recentTracks = [
      trackKey(next),
      ...state.recentTracks.filter((key) => key !== trackKey(next)),
    ].slice(0, 3);
    const handleFfmpegFailure = () => {
      if (batch.length > 1) {
        state.forceSingleNext = true;
        state.queue.unshift(...batch);
      } else {
        state.invalidTracks.add(trackKey(next));
        state.playlist = state.playlist.filter((track) => trackKey(track) !== trackKey(next));
      }

      state.current = null;
      state.activeResource = null;
      state.player.stop(true);
      setImmediate(() => {
        if (!state.current && state.connection?.state?.status === VoiceConnectionStatus.Ready) void playNext(guildId);
      });
    };

    let ffmpegProcess;
    if (next.source === 'youtube') {
      const youtubeStream = createYouTubeFfmpegStream(next.url, handleFfmpegFailure);
      ffmpegProcess = youtubeStream.ffmpegProcess;
      state.ytdlpProcess = youtubeStream.ytdlpProcess;
    } else {
      ffmpegProcess = batch.length > 1
        ? createCrossfadeFfmpegStream(batch, handleFfmpegFailure)
        : createFfmpegStream(next.filePath, handleFfmpegFailure);
      state.ytdlpProcess = null;
    }
    state.ffmpegProcess = ffmpegProcess;

    ffmpegProcess.on('close', () => {
      if (state.ffmpegProcess === ffmpegProcess) {
        state.ffmpegProcess = null;
        if (state.ytdlpProcess && !state.ytdlpProcess.killed) state.ytdlpProcess.kill('SIGKILL');
        state.ytdlpProcess = null;
        state.activeResource = null;
        if (trackKey(state.current) === trackKey(batch[0])) state.current = batch[batch.length - 1];
      }
    });

    const resource = createAudioResource(ffmpegProcess.stdout, { inputType: StreamType.Raw, inlineVolume: true });
    resource.volume?.setVolume(state.volume);
    resource.encoder?.setBitrate(config.OPUS_BITRATE);
    resource.encoder?.setFEC(true);
    state.activeResource = resource;
    state.player.play(resource);

    const textChannel = client.channels.cache.get(state.textChannelId);
    if (textChannel?.isTextBased()) textChannel.send(`Đang phát: \`${next.displayName}\``).catch(() => {});
    events.emit('trackStart', { guildId, track: next, textChannelId: state.textChannelId });
  }

  function appendTracks(state, tracks) {
    const ordered = orderTracksForMood(tracks, state.mood);
    const occupied = new Set([
      trackKey(state.current),
      ...state.queue.map((track) => trackKey(track)),
    ].filter(Boolean));
    const additions = state.smartQueue
      ? ordered.filter((track) => !occupied.has(trackKey(track)))
      : ordered;

    state.playlist = state.smartQueue
      ? [...new Map([...state.playlist, ...ordered].map((track) => [trackKey(track), track])).values()]
      : ordered.slice();
    state.queue.push(...additions);
    return additions;
  }

  async function enqueueTrack(message, query = '', playlistName = '') {
    const state = getState(message.guild.id);
    const tracks = collectInputTracks(query, playlistName);
    if (tracks.length === 0) throw new Error(`Không tìm thấy file nhạc trong thư mục ${config.MUSIC_DIR}.`);
    await ensureVoiceConnection(message);
    state.textChannelId = message.channel.id;
    const additions = appendTracks(state, tracks);
    if (additions.length === 0) return [];
    if (state.player.state.status !== AudioPlayerStatus.Playing && !state.current) await playNext(message.guild.id);
    return additions;
  }

  async function enqueueTrackFromInteraction(interaction, query = '', playlistName = '') {
    const state = getState(interaction.guild.id);
    const tracks = collectInputTracks(query, playlistName);
    if (tracks.length === 0) throw new Error(`Không tìm thấy file nhạc trong thư mục ${config.MUSIC_DIR}.`);
    await ensureVoiceConnectionFromInteraction(interaction);
    state.textChannelId = interaction.channelId;
    const additions = appendTracks(state, tracks);
    if (additions.length === 0) return [];
    if (state.player.state.status !== AudioPlayerStatus.Playing && !state.current) await playNext(interaction.guild.id);
    return additions;
  }

  function cleanupAll() {
    for (const guildId of guildStates.keys()) cleanupGuild(guildId);
  }

  return {
    activePlayerStatus: AudioPlayerStatus,
    voiceStatus: VoiceConnectionStatus,
    getState,
    getExistingState: (guildId) => guildStates.get(guildId),
    getVoiceDiagnostics,
    getVoiceStatusSummary,
    redactVoiceDebug,
    cleanupGuild,
    cleanupAll,
    ensureVoiceConnection,
    ensureVoiceConnectionFromInteraction,
    enqueueTrack,
    enqueueTrackFromInteraction,
    collectPlayableTracks: collectPlayableTracksByQuery,
    collectPlaylistTracks,
    listPlaylists,
    listTracks,
    shuffleInPlace,
    playNext,
    stopState(state) {
      state.queue.length = 0;
      state.playlist.length = 0;
      state.repeatMode = 'off';
      state.invalidTracks.clear();
      state.current = null;
      state.activeResource = null;
      state.recentTracks = [];
      if (state.ffmpegProcess && !state.ffmpegProcess.killed) {
        state.ffmpegProcess.kill('SIGKILL');
        state.ffmpegProcess = null;
      }
      if (state.ytdlpProcess && !state.ytdlpProcess.killed) {
        state.ytdlpProcess.kill('SIGKILL');
        state.ytdlpProcess = null;
      }
      state.player.stop(true);
    },
    setMood,
    setSmartQueue,
    getMoodOptions: () => MOODS.slice(),
    on(eventName, handler) {
      events.on(eventName, handler);
      return () => events.off(eventName, handler);
    },
  };
}

module.exports = { createMusicService };
