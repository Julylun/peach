# The full Bookworm image includes the system CA bundle needed to verify
# Debian HTTPS repositories during apt-get update.
FROM node:22-bookworm

ENV NODE_ENV=production
WORKDIR /app

# FFmpeg is required for decoding local audio files. The build tools allow
# native audio packages to compile when a prebuilt binary is unavailable.
# Use HTTPS and discard any stale package lists before verifying Debian metadata.
RUN rm -rf /var/lib/apt/lists/* \
  && sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY src ./src
RUN mkdir -p /app/music

ENV MUSIC_DIR=/app/music
ENV FFMPEG_PATH=ffmpeg

CMD ["node", "src/index.js"]
