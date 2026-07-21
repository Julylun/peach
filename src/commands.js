const {
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');

function createCommandService({ client, config, music, ui, state, social }) {
  const AudioPlayerStatus = music.activePlayerStatus;
  const VoiceConnectionStatus = music.voiceStatus;

  function buildSlashCommands() {
    return [
      new SlashCommandBuilder().setName('join').setDescription('Vào voice channel của bạn'),
      new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát file nhạc local')
        .addStringOption((option) => option
          .setName('playlist')
          .setDescription('Chọn playlist từ thư mục music')
          .setAutocomplete(true)
          .setRequired(false))
        .addStringOption((option) => option
          .setName('query')
          .setDescription('Bộ lọc tùy chọn cho file trong thư mục music')
          .setRequired(false)),
      new SlashCommandBuilder().setName('playlists').setDescription('Xem các playlist trong thư mục music'),
      new SlashCommandBuilder().setName('pause').setDescription('Tạm dừng bài đang phát'),
      new SlashCommandBuilder().setName('resume').setDescription('Tiếp tục phát bài'),
      new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Chỉnh âm lượng bot theo phần trăm')
        .addIntegerOption((option) => option
          .setName('percent')
          .setDescription('0 đến 200%')
          .setMinValue(0)
          .setMaxValue(200)
          .setRequired(true)),
      new SlashCommandBuilder().setName('nowplaying').setDescription('Xem bài đang phát'),
      new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Xem queue hiện tại')
        .addIntegerOption((option) => option
          .setName('page')
          .setDescription('Trang queue, mỗi trang 10 bài')
          .setMinValue(1)
          .setRequired(false)),
      new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Xóa một bài khỏi queue')
        .addIntegerOption((option) => option
          .setName('position')
          .setDescription('Vị trí bài trong queue')
          .setMinValue(1)
          .setRequired(true)),
      new SlashCommandBuilder().setName('clear').setDescription('Xóa toàn bộ queue đang chờ'),
      new SlashCommandBuilder()
        .setName('list')
        .setDescription('Liệt kê file nhạc local')
        .addStringOption((option) => option
          .setName('filter')
          .setDescription('Lọc theo tên file hoặc thư mục')
          .setRequired(false)),
      new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hiện tại'),
      new SlashCommandBuilder().setName('stop').setDescription('Dừng phát và xoá queue'),
      new SlashCommandBuilder().setName('leave').setDescription('Rời voice channel'),
      new SlashCommandBuilder().setName('status').setDescription('Xem trạng thái bot và voice connection'),
      new SlashCommandBuilder().setName('panel').setDescription('Mở bảng điều khiển nhạc trực tiếp'),
      new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Bật/tắt phát lặp playlist vô hạn')
        .addBooleanOption((option) => option
          .setName('enabled')
          .setDescription('Bật hoặc tắt loop; bỏ trống để đảo trạng thái')
          .setRequired(false)),
      new SlashCommandBuilder()
        .setName('repeat')
        .setDescription('Chọn chế độ lặp: tắt, bài hiện tại hoặc playlist')
        .addStringOption((option) => option
          .setName('mode')
          .setDescription('Chế độ lặp')
          .setRequired(true)
          .addChoices(
            { name: 'Tắt', value: 'off' },
            { name: 'Bài hiện tại', value: 'one' },
            { name: 'Cả playlist', value: 'all' },
          )),
      new SlashCommandBuilder()
        .setName('random')
        .setDescription('Bật/tắt chọn bài kế tiếp ngẫu nhiên')
        .addBooleanOption((option) => option
          .setName('enabled')
          .setDescription('Bật hoặc tắt random; bỏ trống để đảo trạng thái')
          .setRequired(false)),
      new SlashCommandBuilder().setName('shuffle').setDescription('Xáo trộn các bài đang chờ'),
      new SlashCommandBuilder()
        .setName('mood')
        .setDescription('Đổi mood để Peach sắp xếp playlist thông minh')
        .addStringOption((option) => option
          .setName('value')
          .setDescription('Mood của playlist')
          .setRequired(true)
          .addChoices(
            { name: 'Tự động', value: 'auto' },
            { name: 'Chill', value: 'calm' },
            { name: 'Tập trung', value: 'focus' },
            { name: 'Vui', value: 'happy' },
            { name: 'Buồn', value: 'sad' },
            { name: 'Năng lượng', value: 'energetic' },
            { name: 'Ngủ', value: 'sleep' },
            { name: 'Lãng mạn', value: 'romantic' },
          )),
      new SlashCommandBuilder()
        .setName('persona')
        .setDescription('Chọn tính cách phản hồi của Peach')
        .addStringOption((option) => option
          .setName('value')
          .setDescription('Persona')
          .setRequired(true)
          .addChoices(
            { name: 'Cute', value: 'cute' },
            { name: 'Lofi', value: 'lofi' },
            { name: 'Chaotic', value: 'chaotic' },
            { name: 'Formal', value: 'formal' },
          )),
      new SlashCommandBuilder()
        .setName('atmosphere')
        .setDescription('Bật/tắt lời nhắc không khí trong voice room')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Bật hoặc tắt').setRequired(false)),
      new SlashCommandBuilder()
        .setName('radio')
        .setDescription('Bật/tắt Radio Host của Peach')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Bật hoặc tắt').setRequired(false)),
      new SlashCommandBuilder()
        .setName('smartqueue')
        .setDescription('Bật/tắt queue thông minh, tránh lặp bài gần đây')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Bật hoặc tắt').setRequired(false)),
      new SlashCommandBuilder()
        .setName('remember')
        .setDescription('Lưu một ghi chú riêng cho Peach nhớ')
        .addStringOption((option) => option.setName('note').setDescription('Ghi chú cần lưu').setRequired(true)),
      new SlashCommandBuilder().setName('forgetme').setDescription('Xóa toàn bộ memory của bạn'),
      new SlashCommandBuilder().setName('memory').setDescription('Xem memory Peach đang lưu của bạn'),
    ].map((command) => command.toJSON());
  }

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

  async function handleJoin(message) {
    await music.ensureVoiceConnection(message);
    const panel = await message.reply(ui.buildMusicPanel(message.guild));
    ui.watchPanelMessage(panel);
  }

  async function handlePlay(message, args) {
    let playlist = '';
    const playlistArgument = args.find((arg) => /^(?:playlist|pl)[:=]/i.test(arg));
    if (playlistArgument) {
      playlist = playlistArgument.replace(/^(?:playlist|pl)[:=]/i, '');
      args = args.filter((arg) => arg !== playlistArgument);
    }
    const query = args.join(' ');
    const tracks = await music.enqueueTrack(message, query, playlist);
    await message.reply(
      `Đã thêm ${tracks.length} bài vào hàng đợi` +
      `${playlist ? ` từ playlist **${playlist}**` : ''}${query ? ` theo lọc \`${query}\`` : ''}.`
    );
  }

  function handlePlaylists(message) {
    const playlists = music.listPlaylists();
    const lines = playlists.length > 0
      ? playlists.map((playlist, index) => `${index + 1}. \`${playlist}\``)
      : ['Chưa có playlist nào. Hãy tạo folder con trong thư mục music/.'];
    message.reply(`Playlist hiện có:\n${lines.join('\n')}`).catch(() => {});
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

  function handleResume(message) {
    const state = music.getState(message.guild.id);
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
    const state = music.getState(message.guild.id);
    state.volume = percent / 100;
    state.activeResource?.volume?.setVolume(state.volume);
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

  function handleRemember(message, note) {
    if (!note) throw new Error('Hãy nhập nội dung cần nhớ.');
    const memory = state.remember(message.guild.id, message.author.id, note);
    message.reply(`Peach nhớ thêm rồi nha 🍑\n${memory.notes.map((item, index) => `${index + 1}. ${item}`).join('\n')}`).catch(() => {});
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

  function getHelpText() {
    return [
      'Lệnh hiện có:',
      `\`${config.PREFIX}join\` - vào voice channel của bạn`,
      `\`${config.PREFIX}play [lọc]\` - phát toàn bộ nhạc local hoặc lọc theo từ khóa`,
      `\`${config.PREFIX}play playlist:lofi\` - phát một playlist trong music/`,
      `\`${config.PREFIX}playlists\` - xem playlist hiện có`,
      `\`${config.PREFIX}pause\` / \`${config.PREFIX}resume\` - tạm dừng/tiếp tục`,
      `\`${config.PREFIX}volume <0-200>\` - chỉnh âm lượng`,
      `\`${config.PREFIX}nowplaying\` - xem bài đang phát`,
      `\`${config.PREFIX}queue [trang|từ khóa]\` - xem queue hoặc liệt kê file nhạc`,
      `\`${config.PREFIX}remove <vị trí>\` / \`${config.PREFIX}clear\` - quản lý queue`,
      `\`${config.PREFIX}skip\` - bỏ qua bài hiện tại`,
      `\`${config.PREFIX}stop\` - dừng phát`,
      `\`${config.PREFIX}loop [on|off]\` - lặp playlist vô hạn`,
      `\`${config.PREFIX}repeat off|one|all\` - chế độ lặp`,
      `\`${config.PREFIX}random [on|off]\` - chọn bài kế tiếp ngẫu nhiên`,
      `\`${config.PREFIX}shuffle\` - xáo trộn queue`,
      `\`${config.PREFIX}mood <auto|calm|focus|happy|sad|energetic|sleep|romantic>\` - mood DJ`,
      `\`${config.PREFIX}persona <cute|lofi|chaotic|formal>\` - tính cách Peach`,
      `\`${config.PREFIX}atmosphere [on|off]\` / \`${config.PREFIX}radio [on|off]\` - social mode`,
      `\`${config.PREFIX}smartqueue [on|off]\` - queue thông minh`,
      `\`${config.PREFIX}remember <ghi chú>\` / \`${config.PREFIX}memory\` / \`${config.PREFIX}forgetme\` - memory có kiểm soát`,
      `\`${config.PREFIX}leave\` - rời voice channel`,
      `\`${config.PREFIX}status\` - xem trạng thái bot`,
    ].join('\n');
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
        case 'playlists':
        case 'playlist':
          handlePlaylists(message);
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
          handleRemember(message, args.join(' '));
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
          await message.reply(`\`\`\`text\n${music.getVoiceStatusSummary(message.guild)}\n\`\`\``);
          break;
        case 'help':
          await message.reply(getHelpText());
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
        if (interaction.commandName === 'join' || interaction.commandName === 'panel') {
          ui.watchPanelMessage(reply);
        }
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

  async function handleInteraction(interaction) {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction).catch((error) => {
        console.error(`[autocomplete:${interaction.id}] failed`, error);
        interaction.respond([]).catch(() => {});
      });
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
          const tracks = await music.enqueueTrackFromInteraction(interaction, query, playlist);
          const source = playlist
            ? `playlist \`${playlist}\``
            : query.trim() ? `lọc \`${query.trim()}\`` : 'toàn bộ thư mục \`music/\`';
          return `Đã thêm ${tracks.length} bài vào hàng đợi từ ${source}.`;
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
          const state = music.getState(interaction.guild.id);
          return state.player.unpause() ? 'Nhạc phát tiếp rồi.' : 'Không có bài nào đang tạm dừng.';
        });
        break;
      case 'volume':
        await respondToInteraction(interaction, async () => {
          const percent = interaction.options.getInteger('percent');
          const state = music.getState(interaction.guild.id);
          state.volume = percent / 100;
          state.activeResource?.volume?.setVolume(state.volume);
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
        await respondToInteraction(interaction, async () => `\`\`\`text\n${music.getVoiceStatusSummary(interaction.guild)}\n\`\`\``);
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
          const memory = state.remember(
            interaction.guild.id,
            interaction.user.id,
            interaction.options.getString('note')
          );
          return `Peach nhớ thêm rồi nha 🍑\n${memory.notes.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
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
