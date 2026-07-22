const { spawn } = require('child_process');

function createMediaStreams({ config, formatRelative }) {
function extractYouTubePlaylistEntries(url, maxEntries = 50) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn(config.YTDLP_PATH, [
      '--yes-playlist',
      '--flat-playlist',
      '--dump-single-json',
      '--ignore-errors',
      '--no-warnings',
      '--quiet',
      '--no-progress',
      '--playlist-items', `1:${maxEntries}`,
      '--', String(url).trim(),
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (!ytdlp.killed) ytdlp.kill('SIGKILL');
      reject(new Error(`yt-dlp playlist timeout: ${url}`));
      settled = true;
    }, 30_000);
    timeout.unref?.();

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    ytdlp.stdout.on('data', (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-4_000_000);
    });
    ytdlp.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    ytdlp.on('error', fail);
    ytdlp.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`yt-dlp playlist failed (${code ?? signal}): ${stderr.trim() || url}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
        const tracks = entries.map((entry) => {
          const entryUrl = entry.webpage_url || entry.original_url || (
            String(entry.url || '').startsWith('http')
              ? entry.url
              : entry.id
                ? `https://www.youtube.com/watch?v=${entry.id}`
                : ''
          );
          return {
            url: String(entryUrl || '').trim(),
            title: typeof entry.title === 'string' ? entry.title.trim() : '',
            uploader: typeof (entry.uploader || entry.channel) === 'string'
              ? String(entry.uploader || entry.channel).trim()
              : '',
            isLive: entry.is_live === true || entry.live_status === 'is_live',
          };
        }).filter((entry) => entry.url);

        // A normal video URL with list:true has no playlist entries.
        if (tracks.length === 0) tracks.push({ url: String(url).trim(), title: '', uploader: '', isLive: false });
        resolve(tracks.slice(0, maxEntries));
      } catch (error) {
        reject(new Error(`yt-dlp returned invalid playlist metadata: ${error.message}`));
      }
    });
  });
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

function createFfmpegStream(filePath, onFailure, startOffsetSeconds = 0) {
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error'];
  if (Number(startOffsetSeconds) > 0.1) args.push('-ss', String(Number(startOffsetSeconds).toFixed(1)));
  args.push(
    '-i', filePath, '-map', '0:a:0', '-vn', '-sn', '-dn',
    '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1',
  );
  return attachFfmpegLogging(spawn(config.FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] }), formatRelative(filePath), onFailure);
}

function createYouTubeFfmpegStream(url, onFailure, startOffsetSeconds = 0) {
  const ytdlp = spawn(config.YTDLP_PATH, [
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    '--no-progress',
    '-f', 'bestaudio/best',
    '-o', '-',
    '--', url,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const ffmpegArgs = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0'];
  if (Number(startOffsetSeconds) > 0.1) ffmpegArgs.push('-ss', String(Number(startOffsetSeconds).toFixed(1)));
  ffmpegArgs.push('-map', '0:a:0', '-vn', '-sn', '-dn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1');
  const ffmpeg = spawn(config.FFMPEG_PATH, ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

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

function resolveYouTubeAudioUrl(track) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn(config.YTDLP_PATH, [
      '--no-playlist',
      '--no-warnings',
      '--quiet',
      '--no-progress',
      '-f', 'bestaudio/best',
      '-g',
      '--', track.url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      if (!ytdlp.killed) ytdlp.kill('SIGKILL');
      reject(new Error(`yt-dlp resolve timeout: ${track.displayName}`));
    }, 20_000);
    timeout.unref?.();

    ytdlp.stdout.on('data', (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-200_000);
    });
    ytdlp.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-2_000);
    });
    ytdlp.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    ytdlp.on('close', (code, signal) => {
      clearTimeout(timeout);
      const url = stdout.trim().split(/\r?\n/).find(Boolean);
      if (code === 0 && url) {
        resolve(url);
        return;
      }
      reject(new Error(`yt-dlp resolve failed (${code ?? signal}): ${stderr || track.displayName}`));
    });
  });
}

async function createCrossfadeYouTubeFfmpegStream(tracks, onFailure) {
  const urls = await Promise.all(tracks.map((track) => resolveYouTubeAudioUrl(track)));
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error'];
  const filters = [];

  urls.forEach((url, index) => {
    args.push(
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', url,
    );
    filters.push(`[${index}:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${index}]`);
  });

  let previous = 'a0';
  for (let index = 1; index < tracks.length; index += 1) {
    const output = index === tracks.length - 1 ? 'out' : `xf${index}`;
    filters.push(`[${previous}][a${index}]acrossfade=d=${config.CROSSFADE_SECONDS}:c1=tri:c2=tri[${output}]`);
    previous = output;
  }

  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1');
  return attachFfmpegLogging(
    spawn(config.FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] }),
    `youtube crossfade ${tracks.map((track) => track.displayName).join(' -> ')}`,
    onFailure,
  );
}

function createCrossfadeFfmpegStream(tracks, onFailure) {
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


  return {
    extractYouTubePlaylistEntries,
    createFfmpegStream,
    createYouTubeFfmpegStream,
    createCrossfadeYouTubeFfmpegStream,
    createCrossfadeFfmpegStream,
  };
}

module.exports = { createMediaStreams };
