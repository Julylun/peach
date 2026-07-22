const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} = require('discord.js');

function createUiService({ music, config, state: stateStore, social }) {
  const AudioPlayerStatus = music.activePlayerStatus;
  const panelMessages = new Map();
  const statusMessages = new Map();
  const personalMessages = new Map();
  const selectedPlaylists = new Map();
  const panelViews = new Map();
  const statusViews = new Map();
  const personalViews = new Map();

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
      help: 'Hướng dẫn PeachBot',
      loop: 'Loop playlist',
      repeat: 'Repeat mode',
      random: 'Random next',
      shuffle: 'Đã xáo trộn',
      remove: 'Đã xóa khỏi queue',
      clear: 'Đã dọn queue',
      panel: 'Bảng điều khiển PeachBot',
      playlists: 'Playlist local',
      ducking: 'Auto ducking',
      water: 'Nhắc uống nước',
      todo: 'Todo đã đặt',
      alarm: 'Báo thức đã đặt',
      reminders: 'Todo & báo thức',
      mood: 'Mood DJ',
      persona: 'Persona Peach',
      atmosphere: 'Atmosphere',
      radio: 'Radio Host',
      smartqueue: 'Smart Queue',
      remember: 'Personalization Peach',
      memory: 'Memory của bạn',
      forgetme: 'Đã xóa memory',
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
    return { page: safePage, totalPages, text: lines.join('\n') };
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
    if (options.emoji) button.setEmoji(options.emoji);
    return button;
  }

  function shorten(value, maxLength = 180) {
    const text = String(value || '');
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  function joinLimited(lines, maxLength = 950) {
    let output = '';
    for (const line of lines) {
      const next = output ? `${output}\n${line}` : line;
      if (next.length > maxLength) return `${output}\n…và còn thêm`.trim();
      output = next;
    }
    return output;
  }

  function statusCustomId(section, guildId) {
    return `peach:status:${section}:${guildId}`;
  }

  function statusButton(section, label, guildId, active = false) {
    return new ButtonBuilder()
      .setCustomId(statusCustomId(section, guildId))
      .setLabel(label)
      .setStyle(active ? ButtonStyle.Primary : ButtonStyle.Secondary);
  }

  function personalCustomId(section, guildId, userId) {
    return `peach:me:${section}:${guildId}:${userId}`;
  }

  function personalButton(section, label, guildId, userId, active = false) {
    return new ButtonBuilder()
      .setCustomId(personalCustomId(section, guildId, userId))
      .setLabel(label)
      .setStyle(active ? ButtonStyle.Primary : ButtonStyle.Secondary);
  }

  function formatStatusTime(timestamp) {
    return new Date(timestamp).toLocaleString('vi-VN', {
      timeZone: config.TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getPlaybackPosition(state) {
    if (!state?.current) return 0;
    let seconds = Number(state.playbackOffsetSeconds) || 0;
    if (state.playbackStartedAt && state.player?.state?.status === AudioPlayerStatus.Playing) {
      seconds += (Date.now() - state.playbackStartedAt) / 1_000;
    }
    return Math.max(0, Math.floor(seconds));
  }

  function buildStatusPanel(guild, requestedSection = null) {
    const sections = ['overview', 'queue', 'reminders', 'social', 'voice'];
    const section = sections.includes(requestedSection)
      ? requestedSection
      : statusViews.get(guild.id) || 'overview';
    statusViews.set(guild.id, section);

    const state = music.getExistingState(guild.id);
    const botMember = guild.members.me;
    const voiceChannel = botMember?.voice?.channel;
    const settings = social?.getSettings(guild.id) || stateStore?.getGuildSettings(guild.id) || {};
    const personalizationEnabled = stateStore?.isPersonalizationEnabled?.(guild.id) ?? config.MEMORY_ENABLED;
    const water = social?.getWaterReminderStatus?.(guild.id) || {
      mode: settings.waterReminderMode || 'off',
      intervalMinutes: settings.waterReminderIntervalMinutes || config.WATER_REMINDER_INTERVAL_MINUTES,
      userIds: settings.waterReminderUserIds || [],
    };
    const counts = stateStore?.getReminderCounts?.() || { todos: 0, alarms: 0 };
    const current = state?.streamSession?.displayName
      ? `📡 LIVE • ${shorten(state.streamSession.displayName.replace(/`/g, "'"), 220)}`
      : state?.current?.displayName
      ? shorten(state.current.displayName.replace(/`/g, "'"), 220)
      : 'Không có bài nào';
    const playerStatus = state?.player?.state?.status || 'idle';
    const repeat = state?.repeatMode || 'off';
    const position = getPlaybackPosition(state);
    const waterTarget = water.mode === 'all'
      ? 'tất cả người trong room'
      : water.mode === 'selected'
        ? `${water.userIds.length} người đã chọn`
        : 'tắt';

    let embed = cuteEmbed(
      section === 'overview' ? 'Tổng quan PeachBot' : `Trạng thái • ${section}`,
      section === 'overview'
        ? 'Tất cả thông tin quan trọng của Peach trong một dashboard 🍑📊'
        : 'Chọn nút bên dưới để chuyển section. Dữ liệu được đọc trực tiếp từ trạng thái hiện tại.',
    );

    if (section === 'overview') {
      embed.addFields(
        { name: '🎵 Playback', value: `**${current}**\nPlayer: **${playerStatus}**\nVị trí checkpoint: **${position}s**`, inline: false },
        { name: '🔊 Voice', value: `${voiceChannel ? shorten(voiceChannel.name, 70) : 'Chưa vào voice'}\nConnection: **${state?.connection?.state?.status || 'none'}**`, inline: true },
        { name: '📚 Queue', value: `Đang chờ: **${state?.queue?.length || 0}**\nRepeat: **${repeat}**\nRandom: **${state?.randomEnabled ? 'bật' : 'tắt'}**`, inline: true },
        { name: '⏰ Reminder', value: `Todo: **${counts.todos}**\nAlarm: **${counts.alarms}**\nTimezone: **${config.TIMEZONE}**`, inline: true },
        { name: '🌿 Social', value: `Water: **${waterTarget} / ${water.intervalMinutes}m**\nMood: **${settings.mood || 'auto'}**\nPersona: **${settings.persona || config.DEFAULT_PERSONA}**`, inline: true },
        { name: '🎛️ Modes', value: `Ducking: **${(state?.ducking ?? settings.ducking) ? 'bật' : 'tắt'}**\nAtmosphere: **${settings.atmosphere ? 'bật' : 'tắt'}**\nRadio: **${settings.radioHost ? 'bật' : 'tắt'}**\nSmart queue: **${settings.smartQueue ? 'bật' : 'tắt'}**`, inline: true },
      );
    }

    if (section === 'queue') {
      const queue = state?.queue || [];
      const queueText = queue.length > 0
        ? joinLimited(queue.slice(0, 18).map((track, index) => `${index + 1}. ${shorten(track.displayName, 90)}`))
        : 'Queue đang trống.';
      embed.addFields(
        { name: '🎵 Đang phát', value: `**${current}**\nPlayer: **${playerStatus}** · Vị trí: **${position}s**`, inline: false },
        { name: `📚 Queue (${queue.length} bài)`, value: queueText, inline: false },
        { name: '🔁 Playback settings', value: `Repeat: **${repeat}**\nRandom: **${state?.randomEnabled ? 'bật' : 'tắt'}**\nVolume: **${Math.round((state?.volume ?? config.AUDIO_VOLUME) * 100)}%**\nMood: **${state?.mood || settings.mood || 'auto'}**`, inline: true },
      );
    }

    if (section === 'reminders') {
      const todos = stateStore?.listReminders?.('todos') || [];
      const alarms = stateStore?.listReminders?.('alarms') || [];
      const todoText = todos.length > 0
        ? joinLimited(todos.slice(0, 10).map((todo) => `• **${shorten(todo.title, 70)}** · ${formatStatusTime(todo.dueAt)} · <@${todo.userId}>`))
        : 'Không có todo đang chờ.';
      const alarmText = alarms.length > 0
        ? joinLimited(alarms.slice(0, 10).map((alarm) => `• **${shorten(alarm.title, 70)}** · ${formatStatusTime(alarm.dueAt)} · ${alarm.status}`))
        : 'Không có alarm đang chờ.';
      embed.addFields(
        { name: `✅ Todo (${todos.length})`, value: todoText, inline: false },
        { name: `⏰ Alarm (${alarms.length})`, value: alarmText, inline: false },
        { name: '💧 Water reminder', value: `Mục tiêu: **${waterTarget}**\nKhoảng nhắc: **${water.intervalMinutes} phút**`, inline: true },
      );
    }

    if (section === 'social') {
      embed.addFields(
        { name: '💧 Water reminder', value: `Mode: **${water.mode}**\nInterval: **${water.intervalMinutes} phút**\nSelected users: **${water.userIds.length}**`, inline: true },
        { name: '🤖 Peach personality', value: `Persona: **${settings.persona || config.DEFAULT_PERSONA}**\nMood: **${settings.mood || 'auto'}**\nPersonalization server: **${personalizationEnabled ? 'bật' : 'tắt'}**`, inline: true },
        { name: '🌿 Automatic modes', value: `Atmosphere: **${settings.atmosphere ? 'bật' : 'tắt'}**\nRadio Host: **${settings.radioHost ? 'bật' : 'tắt'}**\nSmart Queue: **${settings.smartQueue ? 'bật' : 'tắt'}**\nDucking: **${(state?.ducking ?? settings.ducking) ? 'bật' : 'tắt'}**`, inline: false },
      );
    }

    if (section === 'voice') {
      const diagnostics = state?.connection ? music.getVoiceDiagnostics(state.connection) : null;
      const diagnosticText = diagnostics
        ? `Status: **${diagnostics.status}**\nChannel: **${diagnostics.channelId}**\nGateway state: **${diagnostics.statePacket ? 'received' : 'missing'}**\nVoice server: **${diagnostics.serverPacket ? 'received' : 'missing'}**\nEndpoint: **${diagnostics.endpoint}**\nNetwork: code **${diagnostics.networkCode}** · WS **${diagnostics.voiceWebSocket ? 'up' : 'down'}** · UDP **${diagnostics.udpSocket ? 'up' : 'down'}**`
        : 'Chưa có voice connection.';
      embed.addFields(
        { name: '🔊 Voice diagnostics', value: diagnosticText, inline: false },
        { name: '👤 Voice channel', value: voiceChannel ? `**${shorten(voiceChannel.name, 80)}**\nID: \`${voiceChannel.id}\`\nMembers: **${voiceChannel.members.size}**` : 'Bot chưa ở voice channel.', inline: true },
        { name: '🎧 Player', value: `State: **${playerStatus}**\nCurrent: **${current}**\nFFmpeg: **${state?.ffmpegProcess ? 'running' : 'idle'}**\nyt-dlp: **${state?.ytdlpProcess ? 'running' : 'idle'}**`, inline: true },
      );
    }

    embed.setFooter({ text: `PeachBot • Status dashboard • ${formatStatusTime(Date.now())}` });
    const navigation = new ActionRowBuilder().addComponents(
      statusButton('overview', 'Tổng quan', guild.id, section === 'overview'),
      statusButton('queue', 'Queue', guild.id, section === 'queue'),
      statusButton('reminders', 'Todo & Alarm', guild.id, section === 'reminders'),
      statusButton('social', 'Social', guild.id, section === 'social'),
      statusButton('voice', 'Voice', guild.id, section === 'voice'),
    );
    const refresh = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(statusCustomId('refresh', guild.id))
        .setLabel('Refresh dữ liệu')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Success),
    );
    return { embeds: [embed], components: [navigation, refresh] };
  }

  function buildPersonalPanel(guild, user, requestedSection = null) {
    const userId = user?.id;
    const sections = ['overview', 'reminders', 'queue', 'memory'];
    const key = `${guild.id}:${userId}`;
    const section = sections.includes(requestedSection)
      ? requestedSection
      : personalViews.get(key) || 'overview';
    personalViews.set(key, section);

    const state = music.getExistingState(guild.id);
    const todos = (stateStore?.listReminders?.('todos') || []).filter((item) => item.userId === userId);
    const alarms = (stateStore?.listReminders?.('alarms') || []).filter((item) => item.userId === userId);
    const memory = stateStore?.getUserMemory?.(guild.id, userId) || { notes: [], enabled: true };
    const notes = memory.notes || [];
    const personalizationEnabled = stateStore?.isUserPersonalizationEnabled?.(guild.id, userId) ?? memory.enabled !== false;
    const ownedQueue = (state?.queue || [])
      .map((track, index) => ({ track, position: index + 1 }))
      .filter(({ track }) => track.requestedBy === userId);
    const ownsCurrent = state?.current?.requestedBy === userId;
    const displayName = user?.globalName || user?.username || user?.tag || `User ${userId}`;

    let embed = cuteEmbed(
      section === 'overview' ? `Góc của ${shorten(displayName, 70)}` : `Cá nhân • ${section}`,
      `Đây là những thứ Peach đang nhớ và đang phục vụ riêng cho <@${userId}> 🍑✨`,
    );

    if (section === 'overview') {
      embed.addFields(
        { name: '⏰ Nhắc việc của bạn', value: `Todo đang chờ: **${todos.length}**\nAlarm đang chờ: **${alarms.length}**`, inline: true },
        { name: '🎵 Queue của bạn', value: `Bài đang phát: **${ownsCurrent ? 'có' : 'không'}**\nBài đang chờ: **${ownedQueue.length}**`, inline: true },
        { name: '🧠 Memory', value: `Đang lưu: **${notes.length} ghi chú**\nPersonalization: **${personalizationEnabled ? 'bật' : 'tắt'}**`, inline: true },
        { name: '📍 Server', value: `**${shorten(guild.name, 100)}**\nTimezone: **${config.TIMEZONE}**`, inline: false },
      );
    }

    if (section === 'reminders') {
      const todoText = todos.length > 0
        ? joinLimited(todos.slice(0, 10).map((todo) => `• **${shorten(todo.title, 70)}** · ${formatStatusTime(todo.dueAt)}${todo.description ? `\n  ${shorten(todo.description, 100)}` : ''}`))
        : 'Bạn chưa có todo đang chờ.';
      const alarmText = alarms.length > 0
        ? joinLimited(alarms.slice(0, 10).map((alarm) => `• **${shorten(alarm.title, 70)}** · ${formatStatusTime(alarm.dueAt)} · ${shorten(alarm.musicInput, 70)}`))
        : 'Bạn chưa có alarm đang chờ.';
      embed.addFields(
        { name: `✅ Todo của bạn (${todos.length})`, value: todoText, inline: false },
        { name: `⏰ Alarm của bạn (${alarms.length})`, value: alarmText, inline: false },
      );
    }

    if (section === 'queue') {
      const currentText = ownsCurrent
        ? `Đang phát: **${shorten(state.current.displayName, 160)}**`
        : 'Bài đang phát hiện không phải bài bạn thêm.';
      const queueText = ownedQueue.length > 0
        ? joinLimited(ownedQueue.map(({ track, position }) => `${position}. **${shorten(track.displayName, 100)}**`))
        : 'Bạn chưa có bài nào trong queue. Dùng `/play` hoặc nút Play trong panel để thêm nhạc.';
      embed.addFields(
        { name: '🎧 Vị trí hiện tại', value: currentText, inline: false },
        { name: `📚 Các bài bạn đã thêm (${ownedQueue.length})`, value: queueText, inline: false },
        { name: '💡 Cách đọc vị trí', value: 'Số ở đầu mỗi dòng là vị trí thật trong queue hiện tại. Bài đang phát không có số queue.', inline: false },
      );
    }

    if (section === 'memory') {
      embed.addFields({
        name: `🧠 Memory cá nhân (${notes.length})`,
        value: `${notes.length > 0 ? joinLimited(notes.map((note, index) => `${index + 1}. ${shorten(note, 180)}`)) : 'Chưa có memory tự động được lưu.'}\n\nPersonalization của bạn đang **${personalizationEnabled ? 'bật' : 'tắt'}**. Dùng \`/remember me\` để đổi.`,
        inline: false,
      });
    }

    embed.setFooter({ text: `PeachBot • Personal dashboard • ${formatStatusTime(Date.now())}` });
    const navigation = new ActionRowBuilder().addComponents(
      personalButton('overview', 'Tổng quan', guild.id, userId, section === 'overview'),
      personalButton('reminders', 'Todo & Alarm', guild.id, userId, section === 'reminders'),
      personalButton('queue', 'Queue của tôi', guild.id, userId, section === 'queue'),
      personalButton('memory', 'Memory', guild.id, userId, section === 'memory'),
      new ButtonBuilder()
        .setCustomId(personalCustomId('refresh', guild.id, userId))
        .setLabel('Refresh')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Success),
    );
    return { embeds: [embed], components: [navigation] };
  }

  function buildMusicPanel(guild) {
    const state = music.getExistingState(guild.id);
    const botMember = guild.members.me;
    const voiceChannel = botMember?.voice?.channel;
    const playerStatus = state?.player?.state?.status || 'idle';
    const voiceStatus = state?.connection?.state?.status || 'chưa kết nối';
    const currentName = state?.streamSession?.displayName
      ? `📡 LIVE • ${shorten(state.streamSession.displayName.replace(/`/g, "'"))}`
      : state?.current?.displayName
      ? shorten(state.current.displayName.replace(/`/g, "'"))
      : 'Chưa có bài nào';
    const volume = Math.round((state?.volume ?? config.AUDIO_VOLUME) * 100);
    const repeatMode = state?.repeatMode || 'off';
    const repeatLabel = { off: 'tắt', one: 'bài hiện tại', all: 'playlist' }[repeatMode] || repeatMode;
    const randomLabel = state?.randomEnabled ? 'bật' : 'tắt';
    const queueLength = state?.queue?.length || 0;
    const hasTrack = Boolean(state?.current || state?.streamSession);
    const hasState = Boolean(state);
    const settings = social?.getSettings(guild.id) || stateStore?.getGuildSettings(guild.id) || {};
    const mood = settings.mood || 'auto';
    const persona = settings.persona || config.DEFAULT_PERSONA;
    const playlists = music.listPlaylists?.() || ['all'];
    const selectedPlaylist = playlists.includes(selectedPlaylists.get(guild.id))
      ? selectedPlaylists.get(guild.id)
      : 'all';
    const panelView = panelViews.get(guild.id) || 'playlists';
    const water = social?.getWaterReminderStatus?.(guild.id) || { mode: 'off', intervalMinutes: 60 };
    const waterLabel = water.mode === 'all'
      ? `tất cả/${water.intervalMinutes}m`
      : water.mode === 'selected'
        ? `đã chọn/${water.intervalMinutes}m`
        : 'tắt';

    const embed = cuteEmbed(
      'PeachBot Music Panel',
      'Trung tâm điều khiển nhạc của Peach. Chọn một thao tác bên dưới nha 🍑✨'
    )
      .addFields(
        {
          name: '🎵 Đang phát',
          value: `**${currentName}**\n${playerStatus}`,
          inline: false,
        },
        {
          name: '📍 Voice',
          value: `${voiceChannel ? shorten(voiceChannel.name, 60) : 'Chưa vào voice'}\n${voiceStatus}`,
          inline: true,
        },
        {
          name: '📚 Queue',
          value: `${queueLength} bài đang chờ\n${repeatLabel}\nPlaylist: ${selectedPlaylist}`,
          inline: true,
        },
        {
          name: '🎛️ Chế độ',
          value: [
            `Mood: **${mood}** · Persona: **${persona}**`,
            `Random: **${randomLabel}** · Volume: **${volume}%**`,
            `Smart queue: **${settings.smartQueue ? 'bật' : 'tắt'}**`,
            `Ducking: **${(state?.ducking ?? settings.ducking) ? 'bật' : 'tắt'}**`,
            `Atmosphere: **${settings.atmosphere ? 'bật' : 'tắt'}** · Radio: **${settings.radioHost ? 'bật' : 'tắt'}**`,
            `Water reminder: **${waterLabel}**`,
          ].join('\n'),
          inline: false,
        },
      )
      .setFooter({ text: 'PeachBot • Panel tự cập nhật trạng thái' });

    const playbackControls = new ActionRowBuilder().addComponents(
      panelButton('play', 'Play all', ButtonStyle.Success, guild.id, { emoji: '🎵' }),
      panelButton('pause', 'Pause', ButtonStyle.Secondary, guild.id, {
        emoji: '⏸️', disabled: !hasTrack || playerStatus !== AudioPlayerStatus.Playing,
      }),
      panelButton('resume', 'Resume', ButtonStyle.Success, guild.id, {
        emoji: '▶️', disabled: !hasTrack || playerStatus !== AudioPlayerStatus.Paused,
      }),
      panelButton('skip', 'Skip', ButtonStyle.Primary, guild.id, { emoji: '⏭️', disabled: !hasTrack }),
      panelButton('stop', 'Stop', ButtonStyle.Danger, guild.id, {
        emoji: '⏹️', disabled: !hasTrack && queueLength === 0,
      }),
    );

    const queueControls = new ActionRowBuilder().addComponents(
      panelButton('shuffle', 'Shuffle', ButtonStyle.Primary, guild.id, {
        emoji: '🔀', disabled: !hasState || queueLength < 2,
      }),
      panelButton('random', 'Random', ButtonStyle.Secondary, guild.id, { emoji: '🎲', disabled: !hasState }),
      panelButton('clear', 'Clear queue', ButtonStyle.Secondary, guild.id, {
        emoji: '🧹', disabled: !hasState || queueLength === 0,
      }),
      panelButton('leave', 'Leave', ButtonStyle.Danger, guild.id, { emoji: '👋', disabled: !voiceChannel }),
      panelButton('view', panelView === 'playlists' ? 'Modes' : 'Playlists', ButtonStyle.Secondary, guild.id, {
        emoji: panelView === 'playlists' ? '🎛️' : '🎼',
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

    const playlistMenu = new StringSelectMenuBuilder()
      .setCustomId(panelCustomId('playlist', guild.id))
      .setPlaceholder(`🎼 Chọn playlist • hiện tại: ${selectedPlaylist}`)
      .setDisabled(playlists.length === 0)
      .addOptions(
        playlists.slice(0, 25).map((playlist) => ({
          label: playlist === 'all' ? 'Tất cả nhạc trong music/' : shorten(playlist, 90),
          description: playlist === 'all' ? 'Phát toàn bộ nhạc local' : 'Chọn playlist để bấm Play all',
          value: playlist,
          emoji: playlist === 'all' ? '🌈' : '🎵',
          default: playlist === selectedPlaylist,
        })),
      );

    const settingsMenu = new StringSelectMenuBuilder()
      .setCustomId(panelCustomId('settings', guild.id))
      .setPlaceholder('🎛️ Chọn persona, mood hoặc social mode')
      .addOptions(
        { label: 'Persona Cute', description: 'Ngọt ngào, nhiều emoji', value: 'persona:cute', emoji: '🎀' },
        { label: 'Persona Lofi', description: 'Nhẹ nhàng, chill', value: 'persona:lofi', emoji: '🌙' },
        { label: 'Persona Chaotic', description: 'Lầy và năng lượng', value: 'persona:chaotic', emoji: '🌈' },
        { label: 'Persona Formal', description: 'Lịch sự, tiết chế emoji', value: 'persona:formal', emoji: '📚' },
        { label: 'Mood tự động', description: 'Để Peach tự chọn', value: 'mood:auto', emoji: '🍑' },
        { label: 'Mood chill', description: 'Ưu tiên lofi, calm, rain', value: 'mood:calm', emoji: '🌿' },
        { label: 'Mood tập trung', description: 'Ưu tiên study, focus', value: 'mood:focus', emoji: '🎯' },
        { label: 'Mood vui', description: 'Ưu tiên upbeat, dance', value: 'mood:happy', emoji: '☀️' },
        { label: 'Mood ngủ', description: 'Ưu tiên night, ambient', value: 'mood:sleep', emoji: '🌙' },
        { label: 'Bật/tắt atmosphere', description: 'Lời nhắc nhẹ khi phòng im', value: 'toggle:atmosphere', emoji: '🌿' },
        { label: 'Bật/tắt radio host', description: 'Peach dẫn radio định kỳ', value: 'toggle:radio', emoji: '📻' },
        { label: 'Bật/tắt smart queue', description: 'Tránh lặp bài gần đây', value: 'toggle:smartqueue', emoji: '🧠' },
      );

    return {
      embeds: [embed],
      components: [
        playbackControls,
        queueControls,
        new ActionRowBuilder().addComponents(repeatMenu),
        new ActionRowBuilder().addComponents(volumeMenu),
        new ActionRowBuilder().addComponents(panelView === 'playlists' ? playlistMenu : settingsMenu),
      ],
    };
  }

  function watchPanelMessage(message) {
    if (!message?.id || !message.guild) return;
    panelMessages.set(message.id, message);
  }

  function watchStatusMessage(message) {
    if (!message?.id || !message.guild) return;
    statusMessages.set(message.id, message);
  }

  function watchPersonalMessage(message, user) {
    const userInfo = typeof user === 'string' ? { id: user } : user;
    if (!message?.id || !message.guild || !userInfo?.id) return;
    personalMessages.set(message.id, { message, user: userInfo });
  }

  async function refreshPanels() {
    for (const [messageId, message] of panelMessages) {
      try {
        await message.edit(buildMusicPanel(message.guild));
      } catch (error) {
        if ([10008, 10003].includes(error?.code)) panelMessages.delete(messageId);
      }
    }
    for (const [messageId, message] of statusMessages) {
      try {
        await message.edit(buildStatusPanel(message.guild));
      } catch (error) {
        if ([10008, 10003].includes(error?.code)) statusMessages.delete(messageId);
      }
    }
    for (const [messageId, entry] of personalMessages) {
      try {
        await entry.message.edit(buildPersonalPanel(entry.message.guild, entry.user));
      } catch (error) {
        if ([10008, 10003].includes(error?.code)) personalMessages.delete(messageId);
      }
    }
  }

  const refreshTimer = setInterval(() => void refreshPanels(), config.PANEL_REFRESH_SECONDS * 1_000);
  refreshTimer.unref?.();

  async function handleStatusInteraction(interaction) {
    const [, scope, requestedSection, guildId] = interaction.customId.split(':');
    if (scope !== 'status' || !interaction.guild || guildId !== interaction.guildId) {
      await interaction.reply({
        embeds: [cuteEmbed('Status không hợp lệ', 'Dashboard này không thuộc server hiện tại.', 0xff6b81)],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }

    try {
      await interaction.deferUpdate();
      const section = requestedSection === 'refresh'
        ? statusViews.get(guildId) || 'overview'
        : requestedSection;
      await interaction.message.edit(buildStatusPanel(interaction.guild, section));
      watchStatusMessage(interaction.message);
    } catch (error) {
      const expected = [10062, 40060, 10008].includes(error?.code) || error?.status === 404;
      if (expected) {
        console.warn(`[status:${interaction.id}] interaction unavailable code=${error?.code || error?.status}`);
        return;
      }
      console.error(`[status:${interaction.id}] failed`, error);
      await interaction.followUp({
        embeds: [cuteEmbed('Status gặp trục trặc', error?.message || 'Không thể cập nhật dashboard.', 0xff6b81)],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }

  async function handlePersonalInteraction(interaction) {
    const [, scope, requestedSection, guildId, userId] = interaction.customId.split(':');
    if (scope !== 'me' || !interaction.guild || guildId !== interaction.guildId) {
      await interaction.reply({
        embeds: [cuteEmbed('Personal panel không hợp lệ', 'Panel này không thuộc server hiện tại.', 0xff6b81)],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }
    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: 'Đây là dashboard cá nhân của người khác nha 🍑',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }

    try {
      await interaction.deferUpdate();
      const key = `${guildId}:${userId}`;
      const section = requestedSection === 'refresh'
        ? personalViews.get(key) || 'overview'
        : requestedSection;
      await interaction.message.edit(buildPersonalPanel(interaction.guild, interaction.user, section));
      watchPersonalMessage(interaction.message, userId);
    } catch (error) {
      const expected = [10062, 40060, 10008].includes(error?.code) || error?.status === 404;
      if (expected) {
        console.warn(`[me:${interaction.id}] interaction unavailable code=${error?.code || error?.status}`);
        return;
      }
      console.error(`[me:${interaction.id}] failed`, error);
      await interaction.followUp({
        embeds: [cuteEmbed('Personal panel gặp trục trặc', error?.message || 'Không thể cập nhật panel.', 0xff6b81)],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
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
        ? music.getExistingState(guildId)
        : music.getState(guildId);

      switch (action) {
        case 'play': {
          const playlist = selectedPlaylists.get(guildId) || 'all';
          await music.enqueueTrackFromInteraction(interaction, '', playlist === 'all' ? '' : playlist);
          break;
        }
        case 'pause':
          if (state?.player?.state?.status === AudioPlayerStatus.Playing) state.player.pause();
          break;
        case 'resume':
          await music.resumePlaybackFromInteraction(interaction);
          break;
        case 'skip':
          if (state?.current) state.player.stop(true);
          break;
        case 'stop':
          if (state) music.stopState(state);
          break;
        case 'shuffle':
          if (state) music.shuffleInPlace(state.queue);
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
            music.setVolume(guildId, percent / 100);
          }
          break;
        }
        case 'settings': {
          const [kind, value] = (interaction.values?.[0] || '').split(':');
          if (kind === 'persona') social?.setPersona(guildId, value);
          if (kind === 'mood') social?.setMood(guildId, value);
          if (kind === 'toggle') {
            if (value === 'atmosphere') social?.toggleAtmosphere(guildId);
            if (value === 'radio') social?.toggleRadio(guildId);
            if (value === 'smartqueue') social?.toggleSmartQueue(guildId);
          }
          break;
        }
        case 'playlist':
          selectedPlaylists.set(guildId, interaction.values?.[0] || 'all');
          break;
        case 'view':
          panelViews.set(guildId, (panelViews.get(guildId) || 'playlists') === 'playlists' ? 'settings' : 'playlists');
          break;
        case 'leave':
          music.cleanupGuild(guildId);
          selectedPlaylists.delete(guildId);
          panelViews.delete(guildId);
          break;
        case 'refresh':
          break;
        default:
          break;
      }

      await interaction.message.edit(buildMusicPanel(interaction.guild));
      watchPanelMessage(interaction.message);
    } catch (error) {
      console.error(`[panel:${interaction.id}] failed`, error);
      await interaction.followUp({
        embeds: [cuteEmbed('Panel gặp trục trặc', error?.message || 'Không thể cập nhật panel.', 0xff6b81)],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }

  return {
    cuteEmbed,
    getInteractionTitle,
    getQueuePage,
    buildMusicPanel,
    buildStatusPanel,
    watchPanelMessage,
    watchStatusMessage,
    buildPersonalPanel,
    watchPersonalMessage,
    destroy() {
      clearInterval(refreshTimer);
      panelMessages.clear();
      statusMessages.clear();
      personalMessages.clear();
      selectedPlaylists.clear();
      panelViews.clear();
      statusViews.clear();
      personalViews.clear();
    },
    handlePanelInteraction,
    handleStatusInteraction,
    handlePersonalInteraction,
  };
}

module.exports = { createUiService };
