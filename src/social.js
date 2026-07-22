const ATMOSPHERE_LINES = [
  'Phòng mình yên quá… Peach thả thêm một chút nắng lofi nha 🍑🌤️',
  'Mọi người còn đang chill chứ? Peach vẫn canh nhạc ở đây nè 🎧✨',
  'Một ngụm nước, một hơi thở sâu, rồi mình nghe tiếp nhé 🌿💧',
  'Không khí đang dịu lại rồi đó… cứ từ từ thôi nha 🫧🌙',
];

const RADIO_LINES = [
  'Peach Radio vừa đổi mood nhẹ một chút. Ngồi thoải mái nha 🎙️🍑',
  'Bài tiếp theo đã lên sóng. Ai đang học thì cố lên nhé 📻✨',
  'Peach chọn bài này vì vibe của phòng hôm nay quá xinh 🎵🌸',
  'Radio host Peach xin phép chen một câu: nghe vui nha mọi người 💖🎧',
];

function createSocialService({ client, config, state, music }) {
  const lastActivity = new Map();
  const lastAtmosphereMessage = new Map();
  const lastWaterReminder = new Map();
  const radioTrackCounts = new Map();
  let atmosphereIndex = 0;
  let radioIndex = 0;

  function getSettings(guildId) {
    return state.getGuildSettings(guildId);
  }

  function updateSettings(guildId, patch) {
    return state.updateGuildSettings(guildId, patch);
  }

  function touch(guildId) {
    lastActivity.set(guildId, Date.now());
    lastAtmosphereMessage.delete(guildId);
  }

  function resolveChannel(channel) {
    if (channel && typeof channel.send === 'function') return channel;
    if (channel?.id) return client.channels.cache.get(channel.id);
    return null;
  }

  function send(channel, content, allowedMentions = { parse: [] }) {
    const target = resolveChannel(channel);
    if (!target || typeof target.send !== 'function') return Promise.resolve(null);
    return target.send({ content, allowedMentions }).catch((error) => {
      console.warn(`[social:${target.id || 'unknown'}] message failed: ${error.message}`);
      return null;
    });
  }

  function handleMessage(message) {
    if (message.guild) touch(message.guild.id);
  }

  function handleVoiceStateUpdate(oldState, newState) {
    const guildId = newState.guild.id;
    touch(guildId);
    if (newState.member?.user?.bot) return;

    const botChannelId = newState.guild.members.me?.voice?.channelId;
    const joined = !oldState.channelId && newState.channelId === botChannelId;
    const left = oldState.channelId === botChannelId && !newState.channelId;
    const movedToBot = newState.channelId === botChannelId && oldState.channelId !== botChannelId;
    const movedFromBot = oldState.channelId === botChannelId && newState.channelId !== botChannelId;
    const settings = getSettings(guildId);
    if (!settings.voiceGreeting) return;

    if (joined || movedToBot) {
      void send(
        newState.channel,
        `Chào mừng **${newState.member.displayName}** vào phòng nha 🍑✨ Peach bật mood nhẹ cho bạn rồi!`
      );
    }
    if (left || movedFromBot) {
      void send(
        oldState.channel,
        `Tạm biệt **${oldState.member?.displayName || newState.member?.displayName || 'bạn'}** nha, hẹn gặp lại 🎀👋`
      );
    }
  }

  function setPersona(guildId, persona) {
    const allowed = ['cute', 'lofi', 'chaotic', 'formal'];
    return updateSettings(guildId, { persona: allowed.includes(persona) ? persona : config.DEFAULT_PERSONA });
  }

  function setMood(guildId, mood) {
    const normalized = music.setMood(guildId, mood);
    return normalized;
  }

  function toggleAtmosphere(guildId, enabled) {
    const settings = getSettings(guildId);
    return updateSettings(guildId, { atmosphere: enabled ?? !settings.atmosphere });
  }

  function toggleRadio(guildId, enabled) {
    const settings = getSettings(guildId);
    return updateSettings(guildId, { radioHost: enabled ?? !settings.radioHost });
  }

  function toggleSmartQueue(guildId, enabled) {
    const settings = getSettings(guildId);
    return music.setSmartQueue(guildId, enabled ?? !settings.smartQueue);
  }

  function setWaterReminderMode(guildId, mode) {
    const normalized = ['off', 'all', 'selected'].includes(mode) ? mode : 'off';
    lastWaterReminder.set(guildId, Date.now());
    return updateSettings(guildId, { waterReminderMode: normalized });
  }

  function addWaterReminderUser(guildId, userId) {
    const settings = getSettings(guildId);
    const userIds = [...new Set([...(settings.waterReminderUserIds || []), userId])].slice(0, 50);
    lastWaterReminder.set(guildId, Date.now());
    return updateSettings(guildId, { waterReminderMode: 'selected', waterReminderUserIds: userIds });
  }

  function removeWaterReminderUser(guildId, userId) {
    const settings = getSettings(guildId);
    const userIds = (settings.waterReminderUserIds || []).filter((id) => id !== userId);
    return updateSettings(guildId, { waterReminderUserIds: userIds });
  }

  function setWaterReminderInterval(guildId, minutes) {
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < 5 || value > 240) {
      throw new Error('Khoảng nhắc uống nước phải là số nguyên từ 5 đến 240 phút.');
    }
    lastWaterReminder.set(guildId, Date.now());
    return updateSettings(guildId, { waterReminderIntervalMinutes: value });
  }

  function getWaterReminderStatus(guildId) {
    const settings = getSettings(guildId);
    return {
      mode: settings.waterReminderMode || 'off',
      intervalMinutes: settings.waterReminderIntervalMinutes || config.WATER_REMINDER_INTERVAL_MINUTES,
      userIds: settings.waterReminderUserIds || [],
    };
  }

  function handleTrackStart({ guildId, track, textChannelId }) {
    touch(guildId);
    const settings = getSettings(guildId);
    if (!settings.radioHost) return;

    const count = (radioTrackCounts.get(guildId) || 0) + 1;
    radioTrackCounts.set(guildId, count);
    if (count % config.RADIO_HOST_EVERY_TRACKS !== 0) return;

    const channel = client.channels.cache.get(textChannelId);
    const line = RADIO_LINES[radioIndex++ % RADIO_LINES.length];
    void send(channel, `${line}\n> **${track.displayName}** 🎶`);
  }

  async function checkAtmosphere() {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
      const settings = getSettings(guild.id);
      if (!settings.atmosphere) continue;

      const voiceChannel = guild.members.me?.voice?.channel;
      const humans = voiceChannel?.members?.filter((member) => !member.user.bot);
      if (!voiceChannel || !humans || humans.size === 0) continue;

      const activity = lastActivity.get(guild.id) || now;
      const idleFor = now - activity;
      if (idleFor < config.ATMOSPHERE_IDLE_MINUTES * 60_000) continue;
      if (lastAtmosphereMessage.get(guild.id) >= activity) continue;

      const line = ATMOSPHERE_LINES[atmosphereIndex++ % ATMOSPHERE_LINES.length];
      await send(voiceChannel, line);
      lastAtmosphereMessage.set(guild.id, now);
    }
  }

  async function checkWaterReminders() {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
      const settings = getSettings(guild.id);
      const mode = settings.waterReminderMode || 'off';
      if (mode === 'off') continue;

      const voiceChannel = guild.members.me?.voice?.channel;
      const humans = voiceChannel?.members?.filter((member) => !member.user.bot);
      if (!voiceChannel || !humans || humans.size === 0) continue;

      const targets = mode === 'all'
        ? [...humans.values()]
        : [...humans.values()].filter((member) => (settings.waterReminderUserIds || []).includes(member.id));
      if (targets.length === 0) continue;

      const interval = (settings.waterReminderIntervalMinutes || config.WATER_REMINDER_INTERVAL_MINUTES) * 60_000;
      if (now - (lastWaterReminder.get(guild.id) || now) < interval) continue;

      const mentions = targets.map((member) => `<@${member.id}>`).join(' ');
      await send(
        voiceChannel,
        `Đến giờ uống nước rồi nè 💧🍑 ${mentions}\nUống vài ngụm rồi quay lại học tiếp nha!`,
        { parse: [], users: targets.map((member) => member.id) }
      );
      lastWaterReminder.set(guild.id, now);
    }
  }

  const timer = setInterval(() => {
    void checkAtmosphere();
    void checkWaterReminders();
  }, 60_000);
  timer.unref?.();

  return {
    getSettings,
    updateSettings,
    handleMessage,
    handleVoiceStateUpdate,
    handleTrackStart,
    setPersona,
    setMood,
    toggleAtmosphere,
    toggleRadio,
    toggleSmartQueue,
    setWaterReminderMode,
    addWaterReminderUser,
    removeWaterReminderUser,
    setWaterReminderInterval,
    getWaterReminderStatus,
    destroy() {
      clearInterval(timer);
    },
  };
}

module.exports = { createSocialService };
