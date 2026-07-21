# Discord Local Music Bot

Bot Discord đơn giản để phát nhạc từ file local như `.mp3`, `.wav`, `.ogg`, `.m4a`.

## Tính năng

- Slash commands mặc định:
  - `/join` - vào voice channel của bạn
  - `/play [query]` - queue toàn bộ file trong `music/` hoặc lọc theo query
  - `/queue` - xem danh sách đang chờ
  - `/list [filter]` - liệt kê file nhạc trong thư mục local
  - `/skip` - bỏ qua bài hiện tại
  - `/stop` - dừng phát và xoá queue
  - `/leave` - rời voice channel
  - `/status` - xem trạng thái bot/voice/queue
  - `/panel` - mở panel điều khiển trực tiếp bằng nút và menu
  - `/loop [enabled]` - lặp playlist vô hạn
  - `/repeat mode` - `off`, lặp bài hiện tại (`one`) hoặc lặp playlist (`all`)
  - `/random [enabled]` - chọn bài kế tiếp ngẫu nhiên
  - `/shuffle` - xáo trộn queue hiện tại
  - `/pause`, `/resume`, `/volume`, `/nowplaying`
  - `/remove position`, `/clear`, `/queue page`
- Prefix commands `!join`, `!play`, ... chỉ chạy khi bật `ENABLE_PREFIX_COMMANDS=true`
- Slash command phản hồi bằng embed PeachBot màu hồng, có tiêu đề và trạng thái dễ đọc.
- `/panel` có nút `Play all`, `Pause`, `Resume`, `Skip`, `Stop`, `Shuffle`, `Random`, `Clear`, `Leave`, `Refresh` và menu chọn `Repeat`/`Volume`.
- `/join` cũng tự mở panel sau khi bot vào voice channel.
- Gemini AI có thể đọc lịch sử gần nhất, chỉ trả lời khi người dùng đang gọi Peach, và react tin nhắn bằng emoji phù hợp.

## Cấu trúc

- Đặt nhạc vào thư mục `music/`
- Bot sẽ chỉ tìm và phát file bên trong thư mục này

## Cài đặt

1. Dùng Node.js `22.12+` (máy này đã có Node `25.9.0` qua `fnm`), sau đó cài dependencies:

```bash
fnm exec --using v25.9.0 npm install
```

2. Tạo file `.env` từ `.env.example` và điền `DISCORD_TOKEN`
   - Nên điền thêm `DISCORD_GUILD_ID` để slash commands xuất hiện ngay trong server test
   - Nếu bật Gemini AI, đặt `AI_ENABLED=true`, điền `GEMINI_API_KEY`, sau đó bật `Message Content Intent` trong Discord Developer Portal

3. Khởi động bot:

```bash
fnm exec --using v25.9.0 npm start
```

Sau khi bot chạy, gõ `/panel` trong một text channel. Nếu command chưa xuất hiện, hãy kiểm tra `DISCORD_GUILD_ID` trong `.env` rồi restart bot để đăng ký lại slash commands trong server.

### Gemini AI

Google AI Studio cung cấp Gemini API key; SDK chính thức dùng package `@google/genai`. Khi `AI_ENABLED=true`, bot gửi lịch sử tối đa `AI_HISTORY_LIMIT` tin nhắn của channel sang Gemini để phân loại và tạo câu trả lời. Mặc định bot tự lấy ID voice channel mà nó đang join; khi bot chuyển room, channel AI cũng tự chuyển theo. Có thể đặt `AI_CHANNEL_ID` nếu muốn khóa cố định một channel.

Các biến liên quan:

```env
AI_ENABLED=true
GEMINI_API_KEY=your-google-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash-lite
AI_CHANNEL_ID=
AI_USE_CURRENT_VOICE_CHANNEL=true
AI_ONLY_VOICE_CHANNEL=true
AI_REQUIRE_BOT_IN_VOICE=false
```

Nội dung tin nhắn, lịch sử và tối đa `AI_IMAGE_MAX_COUNT` ảnh đính kèm ở tin nhắn cuối được gửi tới Google Gemini khi tính năng bật. Ảnh vượt `AI_IMAGE_MAX_BYTES` sẽ bị bỏ qua; không bật AI trong các channel không muốn đưa dữ liệu ra ngoài.

Gemini sẽ retry tối đa `AI_API_RETRIES` lần sau lần gọi đầu với lỗi mạng, timeout, rate limit `429` hoặc lỗi server `5xx`, dùng exponential backoff. Lỗi API key/model/request không hợp lệ sẽ debug ngay.

## Chạy bằng Docker Compose

Docker sẽ tự đọc `DISCORD_TOKEN` và các cấu hình khác từ file `.env`. Thư mục `music/` trên máy được mount vào `/app/music` trong container, nên thêm hoặc xóa nhạc không cần build lại image.

```bash
docker compose up -d --build
docker compose logs -f peachbot
```

Dừng bot:

```bash
docker compose down
```

`MUSIC_DIR` và `FFMPEG_PATH` trong Compose được cố định thành đường dẫn bên trong container; không cần sửa hai biến này trong `.env` khi chạy Docker.

## Ghi chú

- Máy chạy bot cần có `ffmpeg` hoặc đặt đường dẫn vào biến môi trường `FFMPEG_PATH`.
- Project ưu tiên encoder native `@discordjs/opus` để giảm tải CPU; `opusscript@0.0.x` được giữ làm fallback tương thích với `prism-media`.
- Âm lượng mặc định là `1.15x`; chỉnh bằng `AUDIO_VOLUME` trong khoảng `0` đến `2` nếu cần.
- Chất lượng Opus mặc định là `128 kbps`; chỉnh bằng `OPUS_BITRATE` nếu server giới hạn bitrate voice.
- `CROSSFADE_SECONDS=5` nối các bài trong cùng một cụm bằng fade in/out; đặt `0` để tắt.
- `CROSSFADE_BATCH_SIZE=8` là số bài được ghép trong một pipeline FFmpeg.
- Có thể bật loop ngay khi khởi động bằng `LOOP_PLAYLIST=true`; random mặc định bật qua `RANDOM_NEXT=true`.
- Discord voice hiện yêu cầu DAVE/E2EE; project đã dùng `@discordjs/voice 0.19.x` và `@snazzah/davey` để hỗ trợ việc này.
- Nếu muốn dùng prefix command, hãy bật `ENABLE_PREFIX_COMMANDS=true` và `Message Content Intent` trong Discord Developer Portal.
- `VOICE_DEBUG=true` mặc định bật log handshake voice; token và session id sẽ được ẩn trong log.
