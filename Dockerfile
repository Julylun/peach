FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# FFmpeg is required for decoding local audio files. The build tools allow
# native audio packages to compile when a prebuilt binary is unavailable.
RUN apt-get update \
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
