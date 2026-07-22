const {
  MessageFlags,
  PermissionsBitField,
} = require('discord.js');
const { buildSlashCommands } = require('./commands/definitions');

function createCommandService({ client, config, music, ui, state, social, reminders }) {
  const AudioPlayerStatus = music.activePlayerStatus;
  const VoiceConnectionStatus = music.voiceStatus;

  async function registerSlashCommands() {
    const commands = buildSlashCommands();

    if (config.GUILD_ID) {
      const guild = await client.guilds.fetch(config.GUILD_ID);
      await guild.commands.set(commands);
      console.log(`Registered ${commands.length} slash commands in guild ${config.GUILD_ID}`);
      return;
    }

    await client.application.commands.set(commands);
    console.log(`Registered ${commands.length} global slash commands`);
  }

  function parseToggle(value, current) {
    if (!value) return !current;
    if (['on', 'true', '1', 'yes'].includes(value.toLowerCase())) return true;
    if (['off', 'false', '0', 'no'].includes(value.toLowerCase())) return false;
    throw new Error('Giá trị cần là `on` hoặc `off`.');
  }

  function assertManageGuild(subject) {
    const userId = subject?.user?.id || subject?.author?.id;
    const guild = subject?.guild;
    const permissions = subject?.memberPermissions || subject?.member?.permissions;
    const isOwner = guild?.ownerId && guild.ownerId === userId;
    if (!isOwner && !permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) {
      throw new Error('Chỉ chủ server hoặc người có quyền Manage Server mới được bật/tắt personalization toàn server.');
    }
  }

  async function handleJoin(message) {
    await music.ensureVoiceConnection(message);
    const panel = await message.reply(ui.buildMusicPanel(message.guild));
    ui.watchPanelMessage(panel);
  }

  async function handlePlay(message, args) {
    let playlist = '';
    let includeList = false;
    const playlistArgument = args.find((arg) => /^(?:playlist|pl)[:=]/i.test(arg));
    if (playlistArgument) {
      playlist = playlistArgument.replace(/^(?:playlist|pl)[:=]/i, '');
      args = args.filter((arg) => arg !== playlistArgument);
    }
    const listArgument = args.find((arg) => /^list[:=]/i.test(arg));
    if (listArgument) {
      includeList = parseToggle(listArgument.replace(/^list[:=]/i, ''), false);
      args = args.filter((arg) => arg !== listArgument);
    }
    const query = args.join(' ');
    const tracks = await music.enqueueTrack(message, query, playlist, includeList);
    await message.reply(
      `Đã thêm ${tracks.length} bài vào hàng đợi` +
      `${playlist ? ` từ playlist **${playlist}**` : ''}${query ? ` theo lọc \`${query}\`` : ''}` +
      `${includeList ? ' (toàn bộ YouTube list)' : ''}.`
    );
  }

  async function handleStream(message, args) {
    const videoArgument = args.find((arg) => /^video:/i.test(arg));
    const video = videoArgument?.split(':')[1]?.toLowerCase() || 'disabled';
    if (video === 'enabled') {
      throw new Error('Discord bot token hiện không thể gửi video camera trong voice channel. Dùng `video:disabled` để stream audio.');
    }
    const url = args.find((arg) => !/^video:/i.test(arg));
    if (!url) throw new Error('Dùng `!stream <link-youtube-live>`.');
    const track = await music.startStreamFromMessage(message, url);
    await message.reply(`Đang stream **${track.displayName}** 📡🎵\nDùng \`${config.PREFIX}play ...\` để tắt stream và quay lại nhạc.`);
  }

  function handlePlaylists(message) {
    const playlists = music.listPlaylists();
    const lines = playlists.length > 0
      ? playlists.map((playlist, index) => `${index + 1}. \`${playlist}\``)
      : ['Chưa có playlist nào. Hãy tạo folder con trong thư mục music/.'];
    message.reply(`Playlist hiện có:\n${lines.join('\n')}`).catch(() => {});
  }

  function getMentionedUserId(message, value) {
    return message.mentions?.users?.first()?.id || String(value || '').match(/<@!?([0-9]+)>/)?.[1] || value;
  }

  function formatWaterStatus(guildId) {
    const water = social.getWaterReminderStatus(guildId);
    const target = water.mode === 'all'
      ? 'tất cả người trong room'
      : water.mode === 'selected'
        ? `${water.userIds.length} người đã chọn`
        : 'tắt';
    return `Water reminder: **${target}**\nKhoảng nhắc: **${water.intervalMinutes} phút**`;
  }

  function handleDucking(message, value) {
    const current = music.getState(message.guild.id).ducking;
    const enabled = parseToggle(value, current);
    const result = music.setDucking(message.guild.id, enabled);
    message.reply(`Auto ducking: **${result ? 'bật' : 'tắt'}** 🎙️🔉`).catch(() => {});
  }

  function handleWater(message, args) {
    const subcommand = (args[0] || 'status').toLowerCase();
    const userId = getMentionedUserId(message, args[1]);
    switch (subcommand) {
      case 'off':
      case 'all':
      case 'selected':
        if (subcommand === 'selected' && userId) social.addWaterReminderUser(message.guild.id, userId);
        else social.setWaterReminderMode(message.guild.id, subcommand);
        message.reply(`${formatWaterStatus(message.guild.id)} 💧`).catch(() => {});
        break;
      case 'add':
        if (!userId) throw new Error('Dùng `!water add @user`.');
        social.addWaterReminderUser(message.guild.id, userId);
        message.reply(`${formatWaterStatus(message.guild.id)}\nĐã thêm <@${userId}> 💧`).catch(() => {});
        break;
      case 'remove':
        if (!userId) throw new Error('Dùng `!water remove @user`.');
        social.removeWaterReminderUser(message.guild.id, userId);
        message.reply(`${formatWaterStatus(message.guild.id)}\nĐã bỏ <@${userId}>.`).catch(() => {});
        break;
      case 'interval':
        social.setWaterReminderInterval(message.guild.id, args[1]);
        message.reply(`${formatWaterStatus(message.guild.id)} 💧`).catch(() => {});
        break;
      case 'status':
        message.reply(formatWaterStatus(message.guild.id)).catch(() => {});
        break;
      default:
        throw new Error('Dùng `!water off`, `!water all`, `!water add @user`, `!water remove @user`, `!water interval 60` hoặc `!water status`.');
    }
  }

  function formatReminderCounts() {
    const counts = reminders.getCounts();
    return `Đang có **${counts.todos} todo** và **${counts.alarms} báo thức** chờ xử lý trên hệ thống.\n` +
      `Múi giờ: **${config.TIMEZONE}** ⏰🍑`;
  }

  function parsePrefixTime(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) throw new Error('Thời gian phải có dạng `HH:MM`, ví dụ `08:30`.');
    return { hour: Number(match[1]), minute: Number(match[2]) };
  }

  function handleTodo(message, args) {
    const [timeText, title, description = ''] = args.join(' ').split('|').map((item) => item.trim());
    if (!timeText || !title) throw new Error('Dùng `!todo HH:MM | Title | Description` (Description có thể bỏ trống).');
    const time = parsePrefixTime(timeText);
    const todo = reminders.createTodo({
      guildId: message.guild.id,
      userId: message.author.id,
      title,
      description,
      ...time,
    });
    message.reply(`Đã đặt todo **${todo.title}** lúc **${reminders.formatTime(todo.dueAt)}**. Peach sẽ DM bạn nha 🍑✅`).catch(() => {});
  }

  function handleAlarm(message, args) {
    const [timeText, title, musicInput] = args.join(' ').split('|').map((item) => item.trim());
    if (!timeText || !title || !musicInput) throw new Error('Dùng `!alarm HH:MM | Title | tên-file-hoặc-URL`.');
    const time = parsePrefixTime(timeText);
    const voiceChannelId = message.guild.members.me?.voice?.channelId || message.member?.voice?.channelId;
    const alarm = reminders.createAlarm({
      guildId: message.guild.id,
      userId: message.author.id,
      title,
      musicInput,
      textChannelId: message.channel.id,
      voiceChannelId,
      ...time,
    });
    message.reply(`Đã đặt báo thức **${alarm.title}** lúc **${reminders.formatTime(alarm.dueAt)}** với nhạc \`${musicInput}\` ⏰🎵`).catch(() => {});
  }

  function handlePause(message) {
    const state = music.getState(message.guild.id);
    if (state.player.state.status !== AudioPlayerStatus.Playing) {
      message.reply('Bài hiện tại chưa ở trạng thái đang phát.').catch(() => {});
      return;
    }
    state.player.pause();
    message.reply('Đã tạm dừng nhạc.').catch(() => {});
  }

  async function handleResume(message) {
    const resumed = await music.resumePlaybackFromMessage(message);
    message.reply(resumed
      ? 'Nhạc phát tiếp từ đoạn Peach đã nhớ rồi nha 🍑▶️'
      : 'Không có bài nào đang tạm dừng hoặc checkpoint để resume.').catch(() => {});
  }

  function handleVolume(message, args) {
    const percent = Number(args[0]);
    if (!Number.isInteger(percent) || percent < 0 || percent > 200) {
      throw new Error('Âm lượng cần là số nguyên từ `0` đến `200`.');
    }
    music.setVolume(message.guild.id, percent / 100);
    message.reply(`Âm lượng PeachBot: **${percent}%**.`).catch(() => {});
  }

  function handleNowPlaying(message) {
    const state = music.getState(message.guild.id);
    const current = state.current ? `**${state.current.displayName}**` : 'chưa có bài nào';
    message.reply(
      `${current}\nVolume: ${Math.round(state.volume * 100)}%\n` +
      `Repeat: ${state.repeatMode} | Random: ${state.randomEnabled ? 'bật' : 'tắt'}`
    ).catch(() => {});
  }

  function handleRemove(message, args) {
    const position = Number(args[0]);
    const state = music.getState(message.guild.id);
    if (!Number.isInteger(position) || position < 1 || position > state.queue.length) {
      throw new Error(`Vị trí queue phải từ 1 đến ${state.queue.length}.`);
    }
    const [removed] = state.queue.splice(position - 1, 1);
    message.reply(`Đã bỏ khỏi queue: \`${removed.displayName}\`.`).catch(() => {});
  }

  function handleClear(message) {
    const state = music.getState(message.guild.id);
    const count = state.queue.length;
    state.queue.length = 0;
    state.playlist.length = 0;
    state.repeatMode = 'off';
    message.reply(`Đã dọn queue (${count} bài). Bài đang phát vẫn tiếp tục.`).catch(() => {});
  }

  function handleLoop(message, args) {
    const state = music.getState(message.guild.id);
    const enabled = parseToggle(args[0], state.repeatMode === 'all');
    state.repeatMode = enabled ? 'all' : 'off';
    if (enabled && !state.current && state.connection?.state?.status === VoiceConnectionStatus.Ready) {
      void music.playNext(message.guild.id);
    }
    const suffix = state.playlist.length > 0 ? '' : ' Hãy dùng `!play` trước để tạo playlist.';
    message.reply(`Loop playlist: **${enabled ? 'bật' : 'tắt'}**.${suffix}`).catch(() => {});
  }

  function handleLoopOne(message, args) {
    const state = music.getState(message.guild.id);
    const enabled = parseToggle(args[0], state.repeatMode === 'one');
    state.repeatMode = enabled ? 'one' : 'off';
    if (enabled && !state.current && state.connection?.state?.status === VoiceConnectionStatus.Ready) {
      void music.playNext(message.guild.id);
    }
    const suffix = state.current ? '' : ' Hãy phát một bài trước.';
    message.reply(`Loop bài hiện tại: **${enabled ? 'bật' : 'tắt'}**.${suffix}`).catch(() => {});
  }

  function handleRepeat(message, args) {
    const mode = (args[0] || '').toLowerCase();
    if (!['off', 'one', 'all'].includes(mode)) {
      throw new Error('Dùng `!repeat off`, `!repeat one` hoặc `!repeat all`.');
    }
    const state = music.getState(message.guild.id);
    state.repeatMode = mode;
    if (mode !== 'off' && !state.current && state.connection?.state?.status === VoiceConnectionStatus.Ready) {
      void music.playNext(message.guild.id);
    }
    message.reply(`Repeat mode: **${mode}**.`).catch(() => {});
  }

  function handleRandom(message, args) {
    const state = music.getState(message.guild.id);
    state.randomEnabled = parseToggle(args[0], state.randomEnabled);
    message.reply(`Random next: **${state.randomEnabled ? 'bật' : 'tắt'}**.`).catch(() => {});
  }

  function handleShuffle(message) {
    const state = music.getState(message.guild.id);
    music.shuffleInPlace(state.queue);
    message.reply(`Đã xáo trộn ${state.queue.length} bài đang chờ.`).catch(() => {});
  }

  function handleMood(message, value) {
    const mood = social.setMood(message.guild.id, value || 'auto');
    message.reply(`Mood playlist: **${mood}** 🎧✨`).catch(() => {});
  }

  function handlePersona(message, value) {
    const settings = social.setPersona(message.guild.id, value || config.DEFAULT_PERSONA);
    message.reply(`Persona của Peach: **${settings.persona}** 🍑`).catch(() => {});
  }

  function handleSocialToggle(message, setting, value) {
    const handlers = {
      atmosphere: social.toggleAtmosphere,
      radio: social.toggleRadio,
      smartqueue: social.toggleSmartQueue,
    };
    const handler = handlers[setting];
    if (!handler) throw new Error('Không có setting này.');
    const current = social.getSettings(message.guild.id);
    const enabled = parseToggle(value, current[setting === 'smartqueue' ? 'smartQueue' : setting === 'radio' ? 'radioHost' : 'atmosphere']);
    const result = handler(message.guild.id, enabled);
    message.reply(`${setting}: **${result ? 'bật' : 'tắt'}** ${setting === 'atmosphere' ? '🌿' : setting === 'radio' ? '📻' : '🧠'}`).catch(() => {});
  }

  function formatPersonalizationStatus(guildId, userId) {
    const globalEnabled = state.isPersonalizationEnabled(guildId);
    const userEnabled = state.getUserMemory(guildId, userId).enabled !== false;
    const effective = state.isUserPersonalizationEnabled(guildId, userId);
    return `Personalization server: **${globalEnabled ? 'bật' : 'tắt'}**\n` +
      `Cài đặt cá nhân: **${userEnabled ? 'bật' : 'tắt'}**\n` +
      `Hiệu lực hiện tại: **${effective ? 'bật' : 'tắt'}**`;
  }

  function handleRemember(message, args = []) {
    const action = String(args[0] || '').toLowerCase();
    if (action === 'me') {
      const current = state.isUserPersonalizationEnabled(message.guild.id, message.author.id);
      const enabled = state.setUserPersonalizationEnabled(
        message.guild.id,
        message.author.id,
        args[1] ? parseToggle(args[1], current) : !current,
      );
      message.reply(`${formatPersonalizationStatus(message.guild.id, message.author.id)}\nĐã ${enabled ? 'bật' : 'tắt'} personalization riêng của bạn 🍑`).catch(() => {});
      return;
    }

    if (action === 'on' || action === 'off') {
      assertManageGuild(message);
      const enabled = state.setPersonalizationEnabled(message.guild.id, action === 'on');
      message.reply(`${formatPersonalizationStatus(message.guild.id, message.author.id)}\nĐã ${enabled ? 'bật' : 'tắt'} personalization toàn server 🧠`).catch(() => {});
      return;
    }

    throw new Error('Dùng `!remember me`, `!remember on` hoặc `!remember off`.');
  }

  function handleForgetMe(message) {
    state.forgetUser(message.guild.id, message.author.id);
    message.reply('Peach đã quên toàn bộ memory của bạn rồi 🧹✨').catch(() => {});
  }

  function handleMemory(message) {
    message.reply(`Memory của bạn:\n${state.formatMemory(message.guild.id, message.author.id)}`).catch(() => {});
  }

  function handleQueue(message, args) {
    const state = music.getState(message.guild.id);
    if (args.length > 0 && /^\d+$/.test(args[0])) {
      const page = ui.getQueuePage(state, Number(args[0]));
      message.reply(`Queue trang ${page.page}/${page.totalPages}\n${page.text}`).catch(() => {});
      return;
    }

    if (args.length > 0) {
      const items = music.listTracks(args.join(' '));
      if (items.length === 0) {
        message.reply(`Không có file nào trong ${config.MUSIC_DIR}.`).catch(() => {});
        return;
      }
      const preview = items.slice(0, 20).map((item, index) => `${index + 1}. ${item}`).join('\n');
      const suffix = items.length > 20 ? `\n...và ${items.length - 20} file nữa` : '';
      const nowPlaying = state.current ? `\nĐang phát: \`${state.current.displayName}\`` : '';
      message.reply(`Danh sách nhạc:\n${preview}${suffix}${nowPlaying}`).catch(() => {});
      return;
    }

    const page = ui.getQueuePage(state, 1);
    const currentText = state.current
      ? `Đang phát: \`${state.current.displayName}\``
      : 'Hiện chưa có bài nào đang phát.';
    message.reply(`${currentText}\nQueue trang ${page.page}/${page.totalPages}\n${page.text}`).catch(() => {});
  }

  function handleSkip(message) {
    const state = music.getState(message.guild.id);
    if (!state.current) {
      message.reply('Hiện không có bài nào đang phát.').catch(() => {});
      return;
    }
    state.player.stop(true);
    message.reply('Đã bỏ qua bài hiện tại.').catch(() => {});
  }

  function handleStop(message) {
    music.stopState(music.getState(message.guild.id));
    message.reply('Đã dừng phát và xoá hàng đợi.').catch(() => {});
  }

  function handleLeave(message) {
    music.cleanupGuild(message.guild.id);
    message.reply('Đã rời voice channel.').catch(() => {});
  }

  async function handleStatus(message) {
    const panel = await message.reply(ui.buildStatusPanel(message.guild));
    ui.watchStatusMessage(panel);
  }

  async function handleMe(message) {
    const panel = await message.reply(ui.buildPersonalPanel(message.guild, message.author));
    ui.watchPersonalMessage(panel, message.author);
  }

  function getHelpText() {
    return [
      '🍑 **PeachBot Help**',
      'Dùng slash command (`/`) là cách được khuyến nghị. Prefix command chỉ hoạt động khi `ENABLE_PREFIX_COMMANDS=true`.',
      '',
      '**🎵 Phát nhạc**',
      '`/join` - Peach vào voice channel bạn đang đứng và mở panel.',
      '`/play` - phát toàn bộ nhạc trong `music/`.',
      '`/play playlist:<tên>` - phát playlist là một folder con trong `music/`.',
      '`/play query:<từ khóa hoặc URL YouTube>` - lọc file hoặc phát YouTube.',
      '`/play query:<URL playlist> list:true` - thêm toàn bộ bài trong YouTube list; mặc định chỉ lấy bài đầu tiên.',
      '`/stream url:<link YouTube live> video:disabled` - tắt nhạc hiện tại và phát audio live; video camera chưa khả dụng với bot token.',
      '`/playlists` - xem playlist hiện có.',
      '`/panel` - mở panel nút/menu điều khiển nhạc.',
      '',
      '**⏯️ Điều khiển**',
      '`/pause`, `/resume` - tạm dừng hoặc phát tiếp; `/resume` còn khôi phục checkpoint sau khi bot restart.',
      '`/skip` - chuyển bài; `/stop` - dừng nhạc và xóa queue.',
      '`/leave` - rời voice channel.',
      '`/volume percent:<0-200>` - chỉnh âm lượng.',
      '`/nowplaying` - xem bài, volume và chế độ phát hiện tại.',
      '`/queue page:<số trang>` - xem queue; `/remove position:<vị trí>` - xóa một bài.',
      '`/clear` - xóa các bài đang chờ; `/list filter:<từ khóa>` - tìm file local.',
      '',
      '**🔁 Chế độ phát**',
      '`/loop enabled:<true|false>` - lặp toàn bộ playlist.',
      '`/loopone enabled:<true|false>` - lặp riêng bài đang phát.',
      '`/repeat mode:<off|one|all>` - tắt, lặp bài hiện tại hoặc lặp playlist.',
      '`/random enabled:<true|false>` - chọn bài tiếp theo ngẫu nhiên.',
      '`/shuffle` - xáo trộn queue.',
      '`/ducking enabled:<true|false>` - tự giảm nhạc khi có người nói.',
      '',
      '**⏰ Todo và báo thức**',
      '`/todo` - nhập title, description tùy chọn, hour và minute. Peach sẽ DM khi đến giờ.',
      '`/alarm` - nhập title, hour, minute và file nhạc/URL YouTube. Alarm tạm dừng bài cũ, hiện nút tắt hoặc delay 10 phút rồi resume.',
      '`/reminders` - xem số todo và báo thức đang chờ.',
      'Giờ dùng định dạng 24h và múi giờ `PEACH_TIMEZONE`.',
      '',
      '**💧 Social mode**',
      '`/water mode` - chọn `off`, `all` hoặc `selected` để nhắc uống nước.',
      '`/water add`, `/water remove` - thêm/bỏ người được nhắc.',
      '`/water interval` - đặt khoảng nhắc từ 5 đến 240 phút.',
      '`/water status` - xem cấu hình nhắc nước.',
      '`/mood`, `/persona` - đổi mood và tính cách Peach.',
      '`/atmosphere`, `/radio`, `/smartqueue` - bật/tắt các chế độ tự động.',
      '',
      '**🤖 AI và memory**',
      'Khi AI được bật, hãy gọi Peach trong text chat của voice channel để bot đọc ngữ cảnh và trả lời.',
      '`/remember me` - bật/tắt personalization riêng của bạn; `/remember on|off` - bật/tắt toàn server.',
      '`/memory`, `/forgetme` - xem hoặc xóa memory cá nhân.',
      '`/status` - mở dashboard tổng quan; dùng button để xem Queue, Todo & Alarm, Social hoặc Voice.',
      '`/me` - xem todo, alarm, memory và vị trí các bài bạn đã thêm vào queue.',
      '',
      '**Ví dụ prefix**',
      `\`${config.PREFIX}play playlist:lofi\``,
      `\`${config.PREFIX}play list:true https://www.youtube.com/playlist?list=...\``,
      `\`${config.PREFIX}todo 20:30 | Học bài | Ôn chương 1\``,
      `\`${config.PREFIX}alarm 07:00 | Dậy học | alarm.mp3\``,
      `\`${config.PREFIX}water all\``,
      `\`${config.PREFIX}help\``,
    ].join('\n');
  }

  function getHelpPages(maxLength = 1_900) {
    const pages = [];
    let current = '';
    for (const line of getHelpText().split('\n')) {
      if (line.length > maxLength) {
        if (current) pages.push(current);
        pages.push(line.slice(0, maxLength));
        current = '';
        continue;
      }
      const next = current ? `${current}\n${line}` : line;
      if (next.length > maxLength) {
        pages.push(current);
        current = line;
      } else {
        current = next;
      }
    }
    if (current) pages.push(current);
    return pages;
  }

  async function handleHelp(message) {
    const pages = getHelpPages();
    await message.reply(pages[0]);
    for (const page of pages.slice(1)) await message.channel.send(page);
  }

  async function handlePrefixMessage(message) {
    if (!config.ENABLE_PREFIX_COMMANDS || !message.guild || message.author.bot) return;
    if (!message.content.startsWith(config.PREFIX)) return;

    const [rawCommand, ...args] = message.content.slice(config.PREFIX.length).trim().split(/\s+/);
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
        case 'stream':
          await handleStream(message, args);
          break;
        case 'playlists':
        case 'playlist':
          handlePlaylists(message);
          break;
        case 'ducking':
          handleDucking(message, args[0]);
          break;
        case 'water':
          handleWater(message, args);
          break;
        case 'todo':
          handleTodo(message, args);
          break;
        case 'alarm':
          handleAlarm(message, args);
          break;
        case 'reminders':
        case 'reminder':
          await message.reply(formatReminderCounts());
          break;
        case 'pause':
          handlePause(message);
          break;
        case 'resume':
        case 'unpause':
          await handleResume(message);
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
        case 'loopone':
          handleLoopOne(message, args);
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
        case 'mood':
          handleMood(message, args[0]);
          break;
        case 'persona':
          handlePersona(message, args[0]);
          break;
        case 'atmosphere':
        case 'radio':
        case 'smartqueue':
          handleSocialToggle(message, command, args[0]);
          break;
        case 'remember':
          handleRemember(message, args);
          break;
        case 'memory':
          handleMemory(message);
          break;
        case 'forgetme':
          handleForgetMe(message);
          break;
        case 'leave':
        case 'disconnect':
          handleLeave(message);
          break;
        case 'status':
          await handleStatus(message);
          break;
        case 'me':
          await handleMe(message);
          break;
        case 'help':
          await handleHelp(message);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error(`[prefix:${message.id}] failed`, error);
      await message.reply(error.message || 'Đã xảy ra lỗi khi xử lý lệnh.').catch(() => {});
    }
  }

  async function respondToInteraction(interaction, handler) {
    const startedAt = Date.now();
    try {
      await interaction.deferReply();
      console.log(
        `[interaction:${interaction.id}] ${interaction.commandName} acknowledged ` +
          `from=${interaction.user.tag} guild=${interaction.guild?.id || 'DM'} ` +
          `age=${Date.now() - interaction.createdTimestamp}ms defer=${Date.now() - startedAt}ms`
      );
      const content = await handler();
      if (typeof content === 'string') {
        await interaction.editReply({
          embeds: [ui.cuteEmbed(ui.getInteractionTitle(interaction.commandName), content)],
        });
      } else if (content) {
        const reply = await interaction.editReply(content);
        if (interaction.commandName === 'status') {
          ui.watchStatusMessage(reply);
        } else if (interaction.commandName === 'me') {
          ui.watchPersonalMessage(reply, interaction.user);
        } else if (interaction.commandName === 'join' || interaction.commandName === 'panel') {
          ui.watchPanelMessage(reply);
        }
      } else {
        await interaction.editReply('Xong.');
      }
    } catch (error) {
      const interactionExpired = [10062, 40060].includes(error?.code)
        || error?.status === 404
        || error?.code === 'UND_ERR_CONNECT_TIMEOUT'
        || error?.name === 'ConnectTimeoutError';
      if (interactionExpired) {
        console.warn(
          `[interaction:${interaction.id}] ${interaction.commandName} response unavailable ` +
            `code=${error?.code || error?.name} age=${Date.now() - interaction.createdTimestamp}ms`
        );
        return;
      }
      console.error(`[interaction:${interaction.id}] ${interaction.commandName} failed`, {
        ageMs: Date.now() - interaction.createdTimestamp,
        deferMs: Date.now() - startedAt,
        deferred: interaction.deferred,
        replied: interaction.replied,
        errorName: error?.name,
        errorCode: error?.code,
        errorMessage: error?.message,
      });
      const content = error?.message || 'Đã xảy ra lỗi khi xử lý lệnh.';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          embeds: [ui.cuteEmbed('Có lỗi rồi', content, 0xff6b81)],
        }).catch(() => {});
      } else {
        await interaction.reply({
          embeds: [ui.cuteEmbed('Có lỗi rồi', content, 0xff6b81)],
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
  }

  async function handleAutocomplete(interaction) {
    if (interaction.commandName !== 'play') return;
    const focusedOption = interaction.options.getFocused(true);
    if (interaction.responded || interaction.replied || interaction.deferred) return;
    if (focusedOption.name !== 'playlist') {
      await interaction.respond([]);
      return;
    }
    const focused = focusedOption.value.toLowerCase();
    const choices = music.listPlaylists()
      .filter((playlist) => playlist.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((playlist) => ({
        name: playlist === 'all' ? 'all - toàn bộ nhạc trong music/' : playlist,
        value: playlist,
      }));
    await interaction.respond(choices);
  }

  function logAutocompleteFailure(interaction, error) {
    const expected = [10062, 40060].includes(error?.code)
      || error?.code === 'UND_ERR_CONNECT_TIMEOUT'
      || error?.name === 'ConnectTimeoutError';
    const level = expected ? 'warn' : 'error';
    console[level](`[autocomplete:${interaction.id}] ${error?.code || error?.name || 'failed'}: ${error?.message || 'unknown error'}`);
  }

  async function handleInteraction(interaction) {
    if (interaction.isButton?.() && interaction.customId.startsWith('peach:alarm:')) {
      await reminders.handleInteraction(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction).catch((error) => {
        // Autocomplete interactions expire quickly; never retry a failed response.
        logAutocompleteFailure(interaction, error);
      });
      return;
    }

    if (interaction.isButton?.() && interaction.customId.startsWith('peach:status:')) {
      await ui.handleStatusInteraction(interaction);
      return;
    }

    if (interaction.isButton?.() && interaction.customId.startsWith('peach:me:')) {
      await ui.handlePersonalInteraction(interaction);
      return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      await ui.handlePanelInteraction(interaction);
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
          await music.ensureVoiceConnectionFromInteraction(interaction);
          return ui.buildMusicPanel(interaction.guild);
        });
        break;
      case 'play':
        await respondToInteraction(interaction, async () => {
          const query = interaction.options.getString('query') || '';
          const playlist = interaction.options.getString('playlist') || '';
          const includeList = interaction.options.getBoolean('list') === true;
          const tracks = await music.enqueueTrackFromInteraction(interaction, query, playlist, includeList);
          const source = playlist
            ? `playlist \`${playlist}\``
            : query.trim() ? `lọc \`${query.trim()}\`` : 'toàn bộ thư mục \`music/\`';
          return `Đã thêm ${tracks.length} bài vào hàng đợi từ ${source}${includeList ? ' (toàn bộ YouTube list)' : ''}.`;
        });
        break;
      case 'stream':
        await respondToInteraction(interaction, async () => {
          const url = interaction.options.getString('url');
          const video = interaction.options.getString('video') || 'disabled';
          if (video === 'enabled') {
            throw new Error('Discord bot token hiện không thể gửi video camera trong voice channel. Hãy dùng `video:disabled` để stream audio.');
          }
          const track = await music.startStreamFromInteraction(interaction, url);
          return `Đang stream **${track.displayName}** 📡🎵\nDùng \`/play ...\` để tắt stream và quay lại nhạc.`;
        });
        break;
      case 'playlists':
        await respondToInteraction(interaction, async () => {
          const playlists = music.listPlaylists();
          return playlists.length > 0
            ? `Playlist hiện có:\n${playlists.map((playlist, index) => `${index + 1}. \`${playlist}\``).join('\n')}`
            : 'Chưa có playlist nào. Hãy tạo folder con trong thư mục `music/`.';
        });
        break;
      case 'ducking':
        await respondToInteraction(interaction, async () => {
          const state = music.getState(interaction.guild.id);
          const enabled = interaction.options.getBoolean('enabled') ?? !state.ducking;
          const result = music.setDucking(interaction.guild.id, enabled);
          return `Auto ducking: **${result ? 'bật' : 'tắt'}** 🎙️🔉`;
        });
        break;
      case 'water':
        await respondToInteraction(interaction, async () => {
          const subcommand = interaction.options.getSubcommand();
          const guildId = interaction.guild.id;
          if (subcommand === 'mode') {
            const mode = interaction.options.getString('value');
            const user = interaction.options.getUser('user');
            if (mode === 'selected' && user) social.addWaterReminderUser(guildId, user.id);
            else social.setWaterReminderMode(guildId, mode);
          } else if (subcommand === 'add') {
            social.addWaterReminderUser(guildId, interaction.options.getUser('user').id);
          } else if (subcommand === 'remove') {
            social.removeWaterReminderUser(guildId, interaction.options.getUser('user').id);
          } else if (subcommand === 'interval') {
            social.setWaterReminderInterval(guildId, interaction.options.getInteger('minutes'));
          }
          return formatWaterStatus(guildId);
        });
        break;
      case 'todo':
        await respondToInteraction(interaction, async () => {
          const todo = reminders.createTodo({
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            title: interaction.options.getString('title'),
            description: interaction.options.getString('description') || '',
            hour: interaction.options.getInteger('hour'),
            minute: interaction.options.getInteger('minute'),
          });
          return `Đã đặt todo **${todo.title}** lúc **${reminders.formatTime(todo.dueAt)}**. Peach sẽ DM bạn khi đến giờ nha 🍑✅`;
        });
        break;
      case 'alarm':
        await respondToInteraction(interaction, async () => {
          const alarm = reminders.createAlarm({
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            title: interaction.options.getString('title'),
            hour: interaction.options.getInteger('hour'),
            minute: interaction.options.getInteger('minute'),
            musicInput: interaction.options.getString('music'),
            textChannelId: interaction.channelId,
            voiceChannelId: interaction.member?.voice?.channelId || interaction.guild.members.me?.voice?.channelId,
          });
          return `Đã đặt báo thức **${alarm.title}** lúc **${reminders.formatTime(alarm.dueAt)}**. Nhạc: \`${alarm.musicInput}\` ⏰🎵`;
        });
        break;
      case 'reminders':
        await respondToInteraction(interaction, async () => formatReminderCounts());
        break;
      case 'pause':
        await respondToInteraction(interaction, async () => {
          const state = music.getState(interaction.guild.id);
          if (state.player.state.status !== AudioPlayerStatus.Playing) return 'Bài hiện tại chưa ở trạng thái đang phát.';
          state.player.pause();
          return 'Đã tạm dừng nhạc.';
        });
        break;
      case 'resume':
        await respondToInteraction(interaction, async () => {
          const resumed = await music.resumePlaybackFromInteraction(interaction);
          return resumed
            ? 'Nhạc phát tiếp từ đoạn Peach đã nhớ rồi nha 🍑▶️'
            : 'Không có bài nào đang tạm dừng hoặc checkpoint để resume.';
        });
        break;
      case 'volume':
        await respondToInteraction(interaction, async () => {
          const percent = interaction.options.getInteger('percent');
          music.setVolume(interaction.guild.id, percent / 100);
          return `Âm lượng PeachBot: **${percent}%**.`;
        });
        break;
      case 'nowplaying':
        await respondToInteraction(interaction, async () => {
          const state = music.getState(interaction.guild.id);
          const current = state.current ? `**${state.current.displayName}**` : 'chưa có bài nào';
          return `${current}\nVolume: ${Math.round(state.volume * 100)}%\nRepeat: ${state.repeatMode} | Random: ${state.randomEnabled ? 'bật' : 'tắt'}`;
        });
        break;
      case 'queue':
        await respondToInteraction(interaction, async () => {
          const state = music.getState(interaction.guild.id);
          const page = ui.getQueuePage(state, interaction.options.getInteger('page') || 1);
          const current = state.current ? `Đang phát: \`${state.current.displayName}\`` : 'Hiện chưa có bài nào đang phát.';
          return `${current}\nRepeat: ${state.repeatMode} | Random: ${state.randomEnabled ? 'bật' : 'tắt'}\nQueue trang ${page.page}/${page.totalPages}\n${page.text}`;
        });
        break;
      case 'remove':
        await respondToInteraction(interaction, async () => {
          const position = interaction.options.getInteger('position');
          const state = music.getState(interaction.guild.id);
          if (position < 1 || position > state.queue.length) return `Vị trí queue phải từ 1 đến ${state.queue.length}.`;
          const [removed] = state.queue.splice(position - 1, 1);
          return `Đã bỏ khỏi queue: \`${removed.displayName}\`.`;
        });
        break;
      case 'clear':
        await respondToInteraction(interaction, async () => {
          const state = music.getState(interaction.guild.id);
          const count = state.queue.length;
          state.queue.length = 0;
          state.playlist.length = 0;
          state.repeatMode = 'off';
          return `Đã dọn queue (${count} bài). Bài đang phát vẫn tiếp tục.`;
        });
        break;
      case 'list':
        await respondToInteraction(interaction, async () => {
          const items = music.listTracks(interaction.options.getString('filter') || '');
          if (items.length === 0) return `Không có file nào trong ${config.MUSIC_DIR}.`;
          const preview = items.slice(0, 20).map((item, index) => `${index + 1}. ${item}`).join('\n');
          const suffix = items.length > 20 ? `\n...và ${items.length - 20} file nữa` : '';
          return `Danh sách nhạc:\n${preview}${suffix}`;
        });
        break;
      case 'skip':
        await respondToInteraction(interaction, async () => {
          const state = music.getState(interaction.guild.id);
          if (!state.current) return 'Hiện không có bài nào đang phát.';
          state.player.stop(true);
          return 'Đã bỏ qua bài hiện tại.';
        });
        break;
      case 'stop':
        await respondToInteraction(interaction, async () => {
          music.stopState(music.getState(interaction.guild.id));
          return 'Đã dừng phát và xoá hàng đợi.';
        });
        break;
      case 'leave':
        await respondToInteraction(interaction, async () => {
          music.cleanupGuild(interaction.guild.id);
          return 'Đã rời voice channel.';
        });
        break;
      case 'status':
        await respondToInteraction(interaction, async () => ui.buildStatusPanel(interaction.guild));
        break;
      case 'me':
        await respondToInteraction(interaction, async () => ui.buildPersonalPanel(interaction.guild, interaction.user));
        break;
      case 'help':
        await respondToInteraction(interaction, async () => getHelpText());
        break;
      case 'panel':
        await respondToInteraction(interaction, async () => ui.buildMusicPanel(interaction.guild));
        break;
      case 'loop':
        await respondToInteraction(interaction, async () => {
          const state = music.getState(interaction.guild.id);
          const enabled = interaction.options.getBoolean('enabled') ?? state.repeatMode !== 'all';
          state.repeatMode = enabled ? 'all' : 'off';
          if (enabled && !state.current && state.connection?.state?.status === VoiceConnectionStatus.Ready) {
            void music.playNext(interaction.guild.id);
          }
          return `Loop playlist: **${enabled ? 'bật' : 'tắt'}**.` + (state.playlist.length > 0 ? '' : ' Hãy dùng `/play` trước để tạo playlist.');
        });
        break;
      case 'loopone':
        await respondToInteraction(interaction, async () => {
          const state = music.getState(interaction.guild.id);
          const enabled = interaction.options.getBoolean('enabled') ?? state.repeatMode !== 'one';
          state.repeatMode = enabled ? 'one' : 'off';
          if (enabled && !state.current && state.connection?.state?.status === VoiceConnectionStatus.Ready) {
            void music.playNext(interaction.guild.id);
          }
          return `Loop bài hiện tại: **${enabled ? 'bật' : 'tắt'}**.` + (state.current ? '' : ' Hãy phát một bài trước.');
        });
        break;
      case 'repeat':
        await respondToInteraction(interaction, async () => {
          const state = music.getState(interaction.guild.id);
          const mode = interaction.options.getString('mode');
          state.repeatMode = mode;
          if (mode !== 'off' && !state.current && state.connection?.state?.status === VoiceConnectionStatus.Ready) {
            void music.playNext(interaction.guild.id);
          }
          return `Repeat mode: **${mode}**.`;
        });
        break;
      case 'random':
        await respondToInteraction(interaction, async () => {
          const state = music.getState(interaction.guild.id);
          const requested = interaction.options.getBoolean('enabled');
          state.randomEnabled = requested ?? !state.randomEnabled;
          return `Random next: **${state.randomEnabled ? 'bật' : 'tắt'}**.`;
        });
        break;
      case 'shuffle':
        await respondToInteraction(interaction, async () => {
          const state = music.getState(interaction.guild.id);
          music.shuffleInPlace(state.queue);
          return `Đã xáo trộn ${state.queue.length} bài đang chờ.`;
        });
        break;
      case 'mood':
        await respondToInteraction(interaction, async () => {
          const mood = social.setMood(interaction.guild.id, interaction.options.getString('value'));
          return `Mood playlist: **${mood}** 🎧✨`;
        });
        break;
      case 'persona':
        await respondToInteraction(interaction, async () => {
          const settings = social.setPersona(interaction.guild.id, interaction.options.getString('value'));
          return `Persona của Peach: **${settings.persona}** 🍑`;
        });
        break;
      case 'atmosphere':
      case 'radio':
      case 'smartqueue':
        await respondToInteraction(interaction, async () => {
          const setting = command;
          const current = social.getSettings(interaction.guild.id);
          const key = setting === 'smartqueue' ? 'smartQueue' : setting === 'radio' ? 'radioHost' : setting;
          const enabled = interaction.options.getBoolean('enabled') ?? !current[key];
          const handlers = {
            atmosphere: social.toggleAtmosphere,
            radio: social.toggleRadio,
            smartqueue: social.toggleSmartQueue,
          };
          const result = handlers[setting](interaction.guild.id, enabled);
          return `${setting}: **${result ? 'bật' : 'tắt'}** ${setting === 'atmosphere' ? '🌿' : setting === 'radio' ? '📻' : '🧠'}`;
        });
        break;
      case 'remember':
        await respondToInteraction(interaction, async () => {
          const subcommand = interaction.options.getSubcommand();
          const guildId = interaction.guild.id;
          const userId = interaction.user.id;
          if (subcommand === 'me') {
            const current = state.isUserPersonalizationEnabled(guildId, userId);
            const enabled = state.setUserPersonalizationEnabled(
              guildId,
              userId,
              interaction.options.getBoolean('enabled') ?? !current,
            );
            return `${formatPersonalizationStatus(guildId, userId)}\nĐã ${enabled ? 'bật' : 'tắt'} personalization riêng của bạn 🍑`;
          }

          assertManageGuild(interaction);
          const enabled = state.setPersonalizationEnabled(guildId, subcommand === 'on');
          return `${formatPersonalizationStatus(guildId, userId)}\nĐã ${enabled ? 'bật' : 'tắt'} personalization toàn server 🧠`;
        });
        break;
      case 'memory':
        await respondToInteraction(interaction, async () => `Memory của bạn:\n${state.formatMemory(interaction.guild.id, interaction.user.id)}`);
        break;
      case 'forgetme':
        await respondToInteraction(interaction, async () => {
          state.forgetUser(interaction.guild.id, interaction.user.id);
          return 'Peach đã quên toàn bộ memory của bạn rồi 🧹✨';
        });
        break;
      default:
        break;
    }
  }

  return {
    buildSlashCommands,
    registerSlashCommands,
    handlePrefixMessage,
    handleInteraction,
  };
}

module.exports = { createCommandService };
