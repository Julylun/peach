const { randomUUID } = require('crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

function createReminderService({ client, config, state, music }) {
  const activeAlarmMessages = new Map();
  const timer = setInterval(() => {
    void checkDueReminders();
  }, 15_000);
  timer.unref?.();

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  }

  function normalizeTitle(title) {
    const value = String(title || '').trim().replace(/\s+/g, ' ');
    if (!value) throw new Error('Title không được để trống.');
    return value.slice(0, 120);
  }

  function normalizeTime(hour, minute) {
    const normalizedHour = Number(hour);
    const normalizedMinute = Number(minute);
    if (!Number.isInteger(normalizedHour) || normalizedHour < 0 || normalizedHour > 23) {
      throw new Error('Giờ phải là số nguyên từ 0 đến 23.');
    }
    if (!Number.isInteger(normalizedMinute) || normalizedMinute < 0 || normalizedMinute > 59) {
      throw new Error('Phút phải là số nguyên từ 0 đến 59.');
    }
    return { hour: normalizedHour, minute: normalizedMinute };
  }

  function nextOccurrence(hour, minute) {
    const due = new Date();
    due.setHours(hour, minute, 0, 0);
    if (due.getTime() <= Date.now()) due.setDate(due.getDate() + 1);
    return due.getTime();
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString('vi-VN', {
      timeZone: config.TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function createTodo({ guildId, userId, title, description, hour, minute }) {
    const time = normalizeTime(hour, minute);
    const todo = {
      id: createId('todo'),
      guildId,
      userId,
      title: normalizeTitle(title),
      description: String(description || '').trim().slice(0, 500),
      hour: time.hour,
      minute: time.minute,
      dueAt: nextOccurrence(time.hour, time.minute),
      status: 'pending',
      createdAt: Date.now(),
    };
    state.addReminder('todos', todo);
    return todo;
  }

  function createAlarm({ guildId, userId, title, hour, minute, musicInput, textChannelId, voiceChannelId }) {
    const time = normalizeTime(hour, minute);
    const input = String(musicInput || '').trim();
    if (!input) throw new Error('Hãy nhập file nhạc báo thức hoặc URL YouTube.');

    const alarm = {
      id: createId('alarm'),
      guildId,
      userId,
      title: normalizeTitle(title),
      hour: time.hour,
      minute: time.minute,
      musicInput: input.slice(0, 500),
      textChannelId: textChannelId || null,
      voiceChannelId: voiceChannelId || null,
      dueAt: nextOccurrence(time.hour, time.minute),
      status: 'pending',
      createdAt: Date.now(),
    };
    state.addReminder('alarms', alarm);
    return alarm;
  }

  function getCounts() {
    return state.getReminderCounts();
  }

  function listUserReminders(userId) {
    return [
      ...state.listReminders('todos').filter((reminder) => reminder.userId === userId),
      ...state.listReminders('alarms').filter((reminder) => reminder.userId === userId),
    ].sort((a, b) => a.dueAt - b.dueAt);
  }

  async function sendTodoDm(todo) {
    try {
      const user = await client.users.fetch(todo.userId);
      const description = todo.description ? `\n${todo.description}` : '';
      await user.send(
        `⏰ **Đến giờ làm todo rồi nè!**\n**${todo.title}**${description}\n` +
        `Đặt lúc **${formatTime(todo.dueAt)}** 🍑✨`
      );
    } catch (error) {
      console.error(`[reminder:${todo.id}] unable to DM todo`, {
        code: error?.code,
        message: error?.message,
      });
      state.updateReminder(todo.id, { error: `DM failed: ${error?.message || 'unknown error'}` });
    }
  }

  function buildAlarmEmbed(alarm, track, status = 'ringing') {
    const isFinished = status !== 'ringing';
    return new EmbedBuilder()
      .setColor(isFinished ? 0x95a5a6 : 0xff9fbd)
      .setTitle(isFinished ? '🍑 Báo thức đã xử lý' : `⏰ ${alarm.title}`)
      .setDescription(isFinished
        ? status === 'snoozed'
          ? `Đã hẹn lại sau 10 phút, báo thức sẽ rung lúc **${formatTime(alarm.dueAt)}**.`
          : 'Peach đã khôi phục nhạc trước đó rồi nha.'
        : `**Đến giờ rồi!** ${alarm.title}\nĐang phát nhạc báo thức trong tối đa ${config.ALARM_DURATION_SECONDS} giây 🔔✨`)
      .addFields(
        { name: '🕒 Thời gian', value: formatTime(alarm.triggeredAt || alarm.dueAt), inline: true },
        { name: '🎵 Nhạc báo', value: String(track?.displayName || alarm.musicInput).slice(0, 1024), inline: true },
      )
      .setFooter({ text: 'PeachBot • alarm mode' });
  }

  function buildAlarmComponents(alarm) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`peach:alarm:stop:${alarm.id}`)
        .setLabel('Tắt báo thức')
        .setEmoji('🔕')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`peach:alarm:snooze:${alarm.id}`)
        .setLabel('Delay 10 phút')
        .setEmoji('🕙')
        .setStyle(ButtonStyle.Secondary),
    )];
  }

  async function sendAlarmPanel(alarm, track) {
    const guild = client.guilds.cache.get(alarm.guildId);
    let channel = alarm.textChannelId
      ? client.channels.cache.get(alarm.textChannelId)
      : guild?.members.me?.voice?.channel;
    if (!channel && alarm.textChannelId) {
      channel = await client.channels.fetch(alarm.textChannelId).catch(() => null);
    }
    if (!channel?.isTextBased()) return;

    const message = await channel.send({
      embeds: [buildAlarmEmbed(alarm, track)],
      components: buildAlarmComponents(alarm),
    });
    activeAlarmMessages.set(alarm.id, { message, track });
  }

  async function triggerAlarm(alarm) {
    try {
      const guild = client.guilds.cache.get(alarm.guildId);
      if (!guild) throw new Error('Không tìm thấy server của báo thức.');

      const currentVoice = guild.members.me?.voice?.channel;
      const targetVoice = currentVoice || (alarm.voiceChannelId
        ? guild.channels.cache.get(alarm.voiceChannelId)
        : null);
      const existingState = music.getExistingState(alarm.guildId);
      if (targetVoice && existingState?.connection?.state?.status !== music.voiceStatus.Ready) {
        await music.ensureVoiceConnectionFromChannel(guild, targetVoice, guild.id);
      }

      const track = await music.resolveTrackInput(alarm.musicInput);
      if (!music.startAlarm(alarm.guildId, track, config.ALARM_DURATION_SECONDS * 1000, alarm.id)) {
        throw new Error('Bot chưa sẵn sàng trong voice channel để phát báo thức.');
      }
      await sendAlarmPanel(alarm, track);
    } catch (error) {
      console.error(`[reminder:${alarm.id}] alarm failed`, error);
      state.updateReminder(alarm.id, { status: 'done', error: error.message });
      const user = await client.users.fetch(alarm.userId).catch(() => null);
      await user?.send(`⚠️ Peach không phát được báo thức **${alarm.title}**: ${error.message}`).catch(() => {});
    }
  }

  async function checkDueReminders() {
    const now = Date.now();
    const dueTodos = state.listReminders('todos', ['pending']).filter((todo) => todo.dueAt <= now);
    const dueAlarms = state.listReminders('alarms', ['pending']).filter((alarm) => alarm.dueAt <= now);

    for (const todo of dueTodos) {
      state.updateReminder(todo.id, { status: 'done', triggeredAt: now });
      void sendTodoDm({ ...todo, triggeredAt: now });
    }
    for (const alarm of dueAlarms) {
      state.updateReminder(alarm.id, { status: 'ringing', triggeredAt: now });
      void triggerAlarm({ ...alarm, status: 'ringing', triggeredAt: now });
    }
  }

  async function finishAlarmMessage(alarmId, status = 'done') {
    const active = activeAlarmMessages.get(alarmId);
    if (!active) return;
    activeAlarmMessages.delete(alarmId);
    await active.message.edit({
      embeds: [buildAlarmEmbed({ ...state.getReminder(alarmId), dueAt: state.getReminder(alarmId)?.dueAt || Date.now() }, active.track, status)],
      components: [],
    }).catch(() => {});
  }

  async function handleAlarmEnd({ guildId, alarmId, reason }) {
    const alarm = state.getReminder(alarmId);
    if (!alarm) return;
    // Snooze updates the reminder before stopping the temporary player.
    if (alarm.status === 'pending') return;
    if (alarm.status === 'ringing') state.updateReminder(alarmId, { status: 'done', finishedAt: Date.now(), finishReason: reason });
    await finishAlarmMessage(alarmId, reason === 'snoozed' ? 'snoozed' : 'done');
    console.log(`[reminder:${alarmId}] alarm ended guild=${guildId} reason=${reason}`);
  }

  async function handleInteraction(interaction) {
    if (!interaction.isButton?.() || !interaction.customId.startsWith('peach:alarm:')) return false;
    const [, , action, alarmId] = interaction.customId.split(':');
    const alarm = state.getReminder(alarmId);
    if (!alarm) {
      await interaction.reply({ content: 'Báo thức này không còn tồn tại.', ephemeral: true }).catch(() => {});
      return true;
    }
    if (interaction.user.id !== alarm.userId) {
      await interaction.reply({ content: 'Chỉ người đặt báo thức mới thao tác được nha.', ephemeral: true }).catch(() => {});
      return true;
    }

    try {
      await interaction.deferUpdate();
    } catch (error) {
      // A stale or double-clicked button can no longer be acknowledged by Discord.
      // Continue the state transition so the alarm still stops without crashing Node.
      if (error?.code !== 10062 && error?.status !== 404) throw error;
      console.warn(`[reminder:${alarm.id}] alarm button interaction expired`);
    }
    if (action === 'snooze') {
      state.updateReminder(alarm.id, {
        status: 'pending',
        dueAt: Date.now() + 10 * 60_000,
        snoozedAt: Date.now(),
      });
      music.stopAlarm(alarm.guildId);
      await finishAlarmMessage(alarm.id, 'snoozed');
      return true;
    }
    if (action === 'stop') {
      state.updateReminder(alarm.id, { status: 'done', finishedAt: Date.now(), finishReason: 'stopped' });
      music.stopAlarm(alarm.guildId);
      await finishAlarmMessage(alarm.id, 'done');
      return true;
    }
    return true;
  }

  function destroy() {
    clearInterval(timer);
    activeAlarmMessages.clear();
  }

  return {
    createTodo,
    createAlarm,
    getCounts,
    listUserReminders,
    checkDueReminders,
    handleAlarmEnd,
    handleInteraction,
    destroy,
    formatTime,
  };
}

module.exports = { createReminderService };
