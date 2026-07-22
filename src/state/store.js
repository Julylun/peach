const fs = require('fs');
const path = require('path');

function createStateStore({ config }) {
  const defaults = {
    persona: config.DEFAULT_PERSONA,
    atmosphere: config.ATMOSPHERE_DEFAULT,
    radioHost: config.RADIO_HOST_DEFAULT,
    voiceGreeting: config.VOICE_GREETING_DEFAULT ?? true,
    smartQueue: config.SMART_QUEUE_DEFAULT,
    mood: config.MOOD_DEFAULT || 'auto',
    ducking: config.AUTO_DUCKING_DEFAULT ?? true,
    waterReminderMode: 'off',
    waterReminderIntervalMinutes: config.WATER_REMINDER_INTERVAL_MINUTES || 60,
    waterReminderUserIds: [],
  };
  let data = { guilds: {}, memories: {}, reminders: { todos: [], alarms: [] } };

  function load() {
    try {
      if (fs.existsSync(config.STATE_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(config.STATE_FILE, 'utf8'));
        data = {
          guilds: parsed.guilds || {},
          memories: parsed.memories || {},
          reminders: {
            todos: parsed.reminders?.todos || [],
            alarms: parsed.reminders?.alarms || [],
          },
        };
      }
    } catch (error) {
      console.warn(`[state] unable to load ${config.STATE_FILE}: ${error.message}`);
    }
  }

  function save() {
    try {
      fs.mkdirSync(path.dirname(config.STATE_FILE), { recursive: true });
      const temporary = `${config.STATE_FILE}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`);
      fs.renameSync(temporary, config.STATE_FILE);
    } catch (error) {
      console.error(`[state] unable to save ${config.STATE_FILE}: ${error.message}`);
    }
  }

  function getGuildSettings(guildId) {
    const current = data.guilds[guildId] || {};
    return { ...defaults, ...current };
  }

  function updateGuildSettings(guildId, patch) {
    data.guilds[guildId] = {
      ...getGuildSettings(guildId),
      ...patch,
    };
    save();
    return getGuildSettings(guildId);
  }

  function getUserMemory(guildId, userId) {
    return data.memories[guildId]?.[userId] || { notes: [] };
  }

  function remember(guildId, userId, note) {
    if (!config.MEMORY_ENABLED) return getUserMemory(guildId, userId);
    data.memories[guildId] ||= {};
    const current = getUserMemory(guildId, userId);
    const normalized = String(note).trim().slice(0, config.MEMORY_NOTE_MAX_CHARS);
    const notes = [normalized, ...current.notes.filter((item) => item !== normalized)]
      .filter(Boolean)
      .slice(0, config.MEMORY_MAX_NOTES);
    data.memories[guildId][userId] = { notes, updatedAt: Date.now() };
    save();
    return data.memories[guildId][userId];
  }

  function forgetUser(guildId, userId) {
    if (data.memories[guildId]) delete data.memories[guildId][userId];
    save();
  }

  function formatMemory(guildId, userId) {
    const memory = getUserMemory(guildId, userId);
    if (!config.MEMORY_ENABLED || memory.notes.length === 0) return 'Không có memory được lưu.';
    return memory.notes.map((note, index) => `${index + 1}. ${note}`).join('\n');
  }

  function addReminder(kind, reminder) {
    if (!['todos', 'alarms'].includes(kind)) throw new Error(`Unknown reminder kind: ${kind}`);
    data.reminders[kind].push(reminder);
    save();
    return reminder;
  }

  function listReminders(kind, statuses = ['pending', 'ringing']) {
    if (!['todos', 'alarms'].includes(kind)) throw new Error(`Unknown reminder kind: ${kind}`);
    return data.reminders[kind].filter((reminder) => statuses.includes(reminder.status));
  }

  function updateReminder(id, patch) {
    for (const kind of ['todos', 'alarms']) {
      const reminder = data.reminders[kind].find((item) => item.id === id);
      if (!reminder) continue;
      Object.assign(reminder, patch);
      save();
      return reminder;
    }
    return null;
  }

  function getReminder(id) {
    for (const kind of ['todos', 'alarms']) {
      const reminder = data.reminders[kind].find((item) => item.id === id);
      if (reminder) return reminder;
    }
    return null;
  }

  function getReminderCounts() {
    return {
      todos: listReminders('todos').length,
      alarms: listReminders('alarms').length,
    };
  }

  load();

  return {
    getGuildSettings,
    updateGuildSettings,
    getUserMemory,
    formatMemory,
    remember,
    forgetUser,
    addReminder,
    listReminders,
    updateReminder,
    getReminder,
    getReminderCounts,
  };
}

module.exports = { createStateStore };
