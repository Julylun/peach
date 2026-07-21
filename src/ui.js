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
      mood: 'Mood DJ',
      persona: 'Persona Peach',
      atmosphere: 'Atmosphere',
      radio: 'Radio Host',
      smartqueue: 'Smart Queue',
      remember: 'Memory Peach',
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

  function buildMusicPanel(guild) {
    const state = music.getExistingState(guild.id);
    const botMember = guild.members.me;
    const voiceChannel = botMember?.voice?.channel;
    const playerStatus = state?.player?.state?.status || 'idle';
    const voiceStatus = state?.connection?.state?.status || 'chưa kết nối';
    const currentName = state?.current?.displayName
      ? state.current.displayName.replace(/`/g, "'")
      : 'Chưa có bài nào';
    const volume = Math.round((state?.volume ?? config.AUDIO_VOLUME) * 100);
    const repeatMode = state?.repeatMode || 'off';
    const repeatLabel = { off: 'tắt', one: 'bài hiện tại', all: 'playlist' }[repeatMode] || repeatMode;
    const randomLabel = state?.randomEnabled ? 'bật' : 'tắt';
    const queueLength = state?.queue?.length || 0;
    const hasTrack = Boolean(state?.current);
    const hasState = Boolean(state);
    const settings = social?.getSettings(guild.id) || stateStore?.getGuildSettings(guild.id) || {};
    const mood = settings.mood || 'auto';
    const persona = settings.persona || config.DEFAULT_PERSONA;

    const embed = cuteEmbed(
      'PeachBot Music Panel',
      [
        `🎵 **Đang phát:** ${currentName}`,
        `📍 **Voice:** ${voiceChannel ? voiceChannel.name : 'chưa vào voice'} · ${voiceStatus}`,
        `▶️ **Player:** ${playerStatus}`,
        `🔊 **Âm lượng:** ${volume}%`,
        `🔁 **Repeat:** ${repeatLabel}`,
        `🎲 **Random:** ${randomLabel}`,
        `🎭 **Mood / Persona:** ${mood} / ${persona}`,
        `🧠 **Smart queue:** ${settings.smartQueue ? 'bật' : 'tắt'} · 🌿 **Atmosphere:** ${settings.atmosphere ? 'bật' : 'tắt'}`,
        `📻 **Radio Host:** ${settings.radioHost ? 'bật' : 'tắt'}`,
        `📚 **Queue:** ${queueLength} bài đang chờ`,
        '',
        'Bấm nút hoặc chọn menu bên dưới để điều khiển nhạc nha 🍑',
      ].join('\n')
    ).setFooter({ text: 'PeachBot • /panel để mở panel mới' });

    const controls = new ActionRowBuilder().addComponents(
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
      panelButton('refresh', 'Refresh', ButtonStyle.Secondary, guild.id, { emoji: '🔄' }),
    );

    const tools = new ActionRowBuilder().addComponents(
      panelButton('play', 'Play all', ButtonStyle.Success, guild.id, { emoji: '🎵' }),
      panelButton('shuffle', 'Shuffle', ButtonStyle.Primary, guild.id, {
        emoji: '🔀', disabled: !hasState || queueLength < 2,
      }),
      panelButton('random', 'Random', ButtonStyle.Secondary, guild.id, { emoji: '🎲', disabled: !hasState }),
      panelButton('clear', 'Clear queue', ButtonStyle.Secondary, guild.id, {
        emoji: '🧹', disabled: !hasState || queueLength === 0,
      }),
      panelButton('leave', 'Leave', ButtonStyle.Danger, guild.id, { emoji: '👋', disabled: !voiceChannel }),
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

    const settingsMenu = new StringSelectMenuBuilder()
      .setCustomId(panelCustomId('settings', guild.id))
      .setPlaceholder('🎛️ Chọn persona, mood hoặc social mode')
      .addOptions(
        { label: 'Persona Cute', description: 'Ngọt ngào, nhiều emoji', value: 'persona:cute', emoji: '🎀' },
        { label: 'Persona Lofi', description: 'Nhẹ nhàng, chill', value: 'persona:lofi', emoji: '🌙' },
        { label: 'Persona Chaotic', description: 'Lầy và năng lượng', value: 'persona:chaotic', emoji: '🌈' },
        { label: 'Persona Formal', description: 'Gọn gàng, lịch sự', value: 'persona:formal', emoji: '📚' },
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
        controls,
        tools,
        new ActionRowBuilder().addComponents(repeatMenu),
        new ActionRowBuilder().addComponents(volumeMenu),
        new ActionRowBuilder().addComponents(settingsMenu),
      ],
    };
  }

  function watchPanelMessage(message) {
    if (!message?.id || !message.guild) return;
    panelMessages.set(message.id, message);
  }

  async function refreshPanels() {
    for (const [messageId, message] of panelMessages) {
      try {
        await message.edit(buildMusicPanel(message.guild));
      } catch (error) {
        if ([10008, 10003].includes(error?.code)) panelMessages.delete(messageId);
      }
    }
  }

  const refreshTimer = setInterval(() => void refreshPanels(), config.PANEL_REFRESH_SECONDS * 1_000);
  refreshTimer.unref?.();

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
        case 'play':
          await music.enqueueTrackFromInteraction(interaction, '');
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
            state.volume = percent / 100;
            state.activeResource?.volume?.setVolume(state.volume);
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
        case 'leave':
          music.cleanupGuild(guildId);
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
    watchPanelMessage,
    destroy() {
      clearInterval(refreshTimer);
      panelMessages.clear();
    },
    handlePanelInteraction,
  };
}

module.exports = { createUiService };
