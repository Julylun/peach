const { HumanMessage } = require('@langchain/core/messages');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');

const {
  stageOnePrompt,
  stageOneSchema,
  stageTwoPrompt,
  stageTwoSchema,
} = require('./prompts');

const MODEL_DISCLOSURE_REPLY = 'PeachModel được tạo bởi Cức 🍑✨';
const MODEL_DISCLOSURE_PATTERN = [
  /\bgemini\b/i,
  /\blangchain\b/i,
  /\bgoogle\b/i,
  /google\s+(?:ai|generative|gemini)/i,
  /\bllm\b/i,
  /\bmodel\b/i,
  /mô\s*hình/i,
  /large\s+language\s+model/i,
  /system\s+prompt/i,
  /system\s+instruction/i,
  /prompt\s+hệ\s+thống/i,
  /chỉ\s+dẫn\s+hệ\s+thống/i,
  /hidden\s+prompt/i,
  /internal\s+instruction/i,
];

function createAiService({ client, config, music, state }) {
  const active = config.AI_ENABLED && Boolean(config.GEMINI_API_KEY);
  const aiCooldowns = new Map();
  const aiInFlightChannels = new Set();
  const aiPendingMessages = new Map();
  let models = null;

  function getModels() {
    if (!active) return null;
    if (!models) {
      const analysisModel = new ChatGoogleGenerativeAI({
        apiKey: config.GEMINI_API_KEY,
        model: config.GEMINI_MODEL,
        temperature: 0.1,
        maxOutputTokens: 300,
      });
      const responseModel = new ChatGoogleGenerativeAI({
        apiKey: config.GEMINI_API_KEY,
        model: config.GEMINI_MODEL,
        temperature: 0.85,
        maxOutputTokens: 260,
      });

      models = {
        analysis: analysisModel.withStructuredOutput(stageOneSchema, {
          name: 'peach_relevance_analysis',
        }),
        response: responseModel.withStructuredOutput(stageTwoSchema, {
          name: 'peach_response',
        }),
      };
    }
    return models;
  }

  function canUseForMessage(message) {
    if (!active || !message.guild || message.author.bot) return false;
    if (!message.channel?.messages?.fetch) return false;

    const botVoiceChannelId = message.guild.members.me?.voice?.channelId;
    const targetChannelId = config.AI_CHANNEL_ID || (
      config.AI_USE_CURRENT_VOICE_CHANNEL ? botVoiceChannelId : ''
    );

    if (targetChannelId && message.channelId !== targetChannelId) return false;
    if (!targetChannelId && config.AI_USE_CURRENT_VOICE_CHANNEL) return false;
    if (config.AI_ONLY_VOICE_CHANNEL && !message.channel.isVoiceBased?.()) return false;

    if (config.AI_REQUIRE_BOT_IN_VOICE) {
      if (!botVoiceChannelId || botVoiceChannelId !== message.channelId) return false;
    }

    if (message.content?.startsWith(config.PREFIX)) return false;
    return true;
  }

  function escapeTagValue(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function isImageAttachment(attachment) {
    return attachment.contentType?.startsWith('image/') ||
      /\.(?:png|jpe?g|gif|webp|bmp|avif)$/i.test(attachment.name || attachment.url || '');
  }

  function inferImageMimeType(attachment) {
    if (attachment.contentType?.startsWith('image/')) return attachment.contentType;
    const extension = (attachment.name || attachment.url || '').match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]?.toLowerCase();
    return {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      avif: 'image/avif',
    }[extension] || 'application/octet-stream';
  }

  function parseHistoryMessage(message, isLatest = false) {
    const nickname = message.member?.displayName || message.author.globalName || message.author.username;
    const content = message.content?.trim() || '[không có nội dung chữ]';
    const attachments = message.attachments?.size > 0
      ? [...message.attachments.values()]
      : [];

    return {
      nickname: nickname.slice(0, 120),
      content: content.slice(0, 800),
      attachments: attachments.map((item) => item.name || item.url),
      imageSources: attachments
        .filter(isImageAttachment)
        .slice(0, config.AI_IMAGE_MAX_COUNT)
        .map((item) => ({
          name: item.name || item.id || item.url,
          url: item.url,
          mimeType: inferImageMimeType(item),
        })),
      images: [],
      isLatest,
    };
  }

  function serializeHistoryMessage(historyMessage) {
    const attachments = historyMessage.attachments.length > 0
      ? `<attachments>${historyMessage.attachments
        .map((name) => `<attachment>${escapeTagValue(name)}</attachment>`)
        .join('')}</attachments>`
      : '';

    return [
      `<nickname>${escapeTagValue(historyMessage.nickname)}</nickname>`,
      `<content>${escapeTagValue(historyMessage.content)}</content>`,
      `<is_latest>${historyMessage.isLatest ? 'true' : 'false'}</is_latest>`,
      attachments,
    ].join('');
  }

  async function fetchHistory(message) {
    const fetched = await message.channel.messages.fetch({ limit: config.AI_HISTORY_LIMIT });
    const history = [...fetched.values()]
      .filter((item) => !item.author.bot || item.author.id === client.user?.id)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    // Keep the triggering message at the end so both stages have one clear final turn.
    const withoutTrigger = history.filter((item) => item.id !== message.id);
    withoutTrigger.push(message);

    const parsedHistory = withoutTrigger
      .slice(-config.AI_HISTORY_LIMIT)
      .map((item) => parseHistoryMessage(item, item.id === message.id));

    await fetchHistoryImages(parsedHistory, message.channelId);
    return parsedHistory;
  }

  async function fetchHistoryImages(history, channelId) {
    const maxImages = config.AI_HISTORY_IMAGE_MAX_COUNT ?? config.AI_IMAGE_MAX_COUNT;
    let imageCount = 0;

    for (const historyMessage of history) {
      for (const source of historyMessage.imageSources) {
        if (imageCount >= maxImages) return;

        try {
          const response = await fetch(source.url, {
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const contentLength = Number(response.headers.get('content-length') || 0);
          if (contentLength > config.AI_IMAGE_MAX_BYTES) {
            console.warn(`[ai:${channelId}] skipped large image ${source.name}`);
            continue;
          }

          const buffer = Buffer.from(await response.arrayBuffer());
          if (buffer.length > config.AI_IMAGE_MAX_BYTES) {
            console.warn(`[ai:${channelId}] skipped large image ${source.name}`);
            continue;
          }

          historyMessage.images.push({
            mimeType: source.mimeType,
            data: buffer.toString('base64'),
          });
          imageCount += 1;
        } catch (error) {
          console.warn(`[ai:${channelId}] image download failed`, {
            name: source.name,
            error: error.message,
          });
        }
      }
    }
  }

  function toLangChainHistory(history) {
    const content = [];

    for (const historyMessage of history) {
      content.push({ type: 'text', text: serializeHistoryMessage(historyMessage) });
      for (const image of historyMessage.images) {
        // LangChain's model-name detector currently misses Gemma 4.
        // Provider media blocks still map directly to Gemini inlineData.
        content.push({
          type: 'media',
          mimeType: image.mimeType,
          data: image.data,
        });
      }
    }

    // The adapter rejects consecutive human messages, so preserve all user turns
    // as tagged parts of one user content while retaining their boundaries.
    return [new HumanMessage({ content })];
  }

  function getErrorStatus(error) {
    return Number(
      error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.error?.code ||
      0
    );
  }

  function isRetryableError(error) {
    const status = getErrorStatus(error);
    if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;

    return [
      'ABORT_ERR',
      'ECONNABORTED',
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EAI_AGAIN',
      'ENETUNREACH',
    ].includes(error?.code);
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function invokeWithRetries(runnable, input, stage) {
    let lastError;

    for (let attempt = 0; attempt <= config.AI_API_RETRIES; attempt += 1) {
      try {
        return await runnable.invoke(input);
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt >= config.AI_API_RETRIES;
        if (isLastAttempt || !isRetryableError(error)) throw error;

        const delay = Math.min(config.AI_API_RETRY_BASE_MS * (2 ** attempt), 15_000);
        console.warn(`[ai] ${stage} retry ${attempt + 1}/${config.AI_API_RETRIES} after ${delay}ms`);
        await wait(delay);
      }
    }

    throw lastError;
  }

  async function startTyping(message) {
    if (typeof message.channel?.sendTyping !== 'function') return () => {};

    try {
      await message.channel.sendTyping();
    } catch (error) {
      console.warn(`[ai:${message.channelId}] typing indicator failed: ${error.message}`);
      return () => {};
    }

    const timer = setInterval(() => {
      message.channel.sendTyping().catch(() => {});
    }, 8_000);

    return () => clearInterval(timer);
  }

  function normalizeAnalysis(result) {
    const confidence = Number(result?.confidence);
    const actions = new Set(['none', 'play', 'pause', 'resume', 'skip', 'stop', 'leave', 'status', 'mood']);
    const moods = new Set(['auto', 'calm', 'focus', 'happy', 'sad', 'energetic', 'sleep', 'romantic']);
    return {
      mentioned: result?.mentioned === true,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
      action: actions.has(result?.action) ? result.action : 'none',
      query: typeof result?.query === 'string' ? result.query.trim().slice(0, 160) : '',
      playlist: typeof result?.playlist === 'string' ? result.playlist.trim().slice(0, 120) : '',
      mood: moods.has(result?.mood) ? result.mood : 'auto',
      reason: typeof result?.reason === 'string' ? result.reason.slice(0, 300) : '',
    };
  }

  function normalizeResponse(result) {
    return {
      reply: typeof result?.reply === 'string'
        ? result.reply.trim().slice(0, config.AI_REPLY_MAX_CHARS)
        : '',
      reaction: typeof result?.reaction === 'string' ? result.reaction.trim() : '',
    };
  }

  function isSingleUnicodeEmoji(value) {
    if (!value || typeof Intl?.Segmenter !== 'function') return false;

    const graphemes = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value)];
    const isFlag = /^\p{Regional_Indicator}{2}$/u.test(value);
    const isKeycap = /^\p{Emoji}\uFE0F?\u20E3$/u.test(value);
    const isEmoji = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(value);
    return graphemes.length === 1 && (isEmoji || isFlag || isKeycap);
  }

  function enforceReplyPolicy(reply) {
    if (!reply) return '';
    if (MODEL_DISCLOSURE_PATTERN.some((pattern) => pattern.test(reply))) {
      return MODEL_DISCLOSURE_REPLY;
    }
    return reply;
  }

  async function executeMusicAction(message, analysisResult) {
    if (!music || analysisResult.action === 'none') return '';

    try {
      const state = music.getState(message.guild.id);
      switch (analysisResult.action) {
        case 'play': {
          const tracks = await music.enqueueTrack(message, analysisResult.query, analysisResult.playlist);
          const source = analysisResult.playlist
            ? ` playlist ${analysisResult.playlist}`
            : analysisResult.query ? ` theo từ khóa ${analysisResult.query}` : ' toàn bộ music/';
          return `Đã thêm ${tracks.length} bài từ${source}.`;
        }
        case 'pause':
          if (state.player.state.status !== music.activePlayerStatus.Playing) return 'Không có bài đang phát để tạm dừng.';
          state.player.pause();
          return 'Đã tạm dừng bài đang phát.';
        case 'resume':
          return state.player.unpause() ? 'Đã phát tiếp bài nhạc.' : 'Không có bài nào đang tạm dừng.';
        case 'skip':
          if (!state.current) return 'Không có bài đang phát để chuyển.';
          state.player.stop(true);
          return 'Đã chuyển bài.';
        case 'stop':
          music.stopState(state);
          return 'Đã dừng nhạc và xóa hàng đợi.';
        case 'leave':
          music.cleanupGuild(message.guild.id);
          return 'Đã rời voice channel.';
        case 'status':
          return `Trạng thái hiện tại: ${music.getVoiceStatusSummary(message.guild)}`;
        case 'mood': {
          const mood = music.setMood(message.guild.id, analysisResult.mood);
          return `Đã chuyển mood playlist sang ${mood}.`;
        }
        default:
          return '';
      }
    } catch (error) {
      console.error(`[ai:${message.channelId}] music action failed`, {
        action: analysisResult.action,
        errorName: error?.name,
        errorCode: error?.code,
        errorMessage: error?.message,
      });
      return 'Thao tác DJ chưa thực hiện được. Hãy kiểm tra voice channel và quyền của bot.';
    }
  }

  async function analyze(history) {
    const { analysis } = getModels();
    const playlists = music?.listPlaylists?.() || ['all'];
    const messages = await stageOnePrompt.formatMessages({
      aliases: config.AI_NAME_ALIASES.join(', '),
      playlists: escapeTagValue(playlists.join(', ')),
      history: toLangChainHistory(history),
    });
    return normalizeAnalysis(await invokeWithRetries(analysis, messages, 'stage-1'));
  }

  async function generateResponse(message, history, analysisResult, actionResult) {
    const { response } = getModels();
    const settings = state?.getGuildSettings(message.guild.id) || {};
    const messages = await stageTwoPrompt.formatMessages({
      aliases: config.AI_NAME_ALIASES.join(', '),
      persona: escapeTagValue(settings.persona || config.DEFAULT_PERSONA),
      // Do not forward the classifier's free-form reason into the response prompt.
      analysis: JSON.stringify({
        mentioned: analysisResult.mentioned,
        confidence: analysisResult.confidence,
      }),
      action_result: escapeTagValue(actionResult || 'Không có thao tác DJ.'),
      memory: escapeTagValue(state?.formatMemory(message.guild.id, message.author.id) || 'Không có memory được lưu.'),
      history: toLangChainHistory(history),
    });
    return normalizeResponse(await invokeWithRetries(response, messages, 'stage-2'));
  }

  async function handleMessage(message) {
    if (!canUseForMessage(message)) return;

    const channelId = message.channelId;
    const now = Date.now();
    if (aiInFlightChannels.has(channelId)) {
      aiPendingMessages.set(channelId, message);
      return;
    }

    const lastRequest = aiCooldowns.get(channelId) || 0;
    if (now - lastRequest < config.AI_COOLDOWN_MS) return;

    aiCooldowns.set(channelId, now);
    aiInFlightChannels.add(channelId);

    try {
      // Stage 1 intentionally runs without typing: it only decides whether Peach was addressed.
      const history = await fetchHistory(message);
      const analysisResult = await analyze(history);
      if (!analysisResult.mentioned) return;

      const actionResult = await executeMusicAction(message, analysisResult);

      // Stage 2 is the visible generation phase.
      const stopTyping = await startTyping(message);
      try {
        const result = await generateResponse(message, history, analysisResult, actionResult);
        const reaction = isSingleUnicodeEmoji(result.reaction) ? result.reaction : '🍑';

        await message.react(reaction).catch((error) => {
          console.warn(`[ai:${channelId}] reaction failed: ${error.message}`);
        });

        const reply = enforceReplyPolicy(result.reply);
        if (reply) {
          await message.reply({
            content: reply,
            allowedMentions: { parse: [] },
          });
        }
      } finally {
        stopTyping();
      }
    } catch (error) {
      console.error(`[ai:${channelId}] LangChain handling failed`, {
        errorName: error?.name,
        errorCode: error?.code,
        errorStatus: getErrorStatus(error),
        errorMessage: error?.message,
        model: config.GEMINI_MODEL,
        attempts: config.AI_API_RETRIES + 1,
      });
    } finally {
      aiInFlightChannels.delete(channelId);
      const pendingMessage = aiPendingMessages.get(channelId);
      if (pendingMessage) {
        aiPendingMessages.delete(channelId);
        const elapsed = Date.now() - (aiCooldowns.get(channelId) || 0);
        const delay = Math.max(0, config.AI_COOLDOWN_MS - elapsed);
        const timer = setTimeout(() => {
          void handleMessage(pendingMessage);
        }, delay);
        timer.unref?.();
      }
    }
  }

  return {
    active,
    handleMessage,
  };
}

module.exports = { createAiService };
