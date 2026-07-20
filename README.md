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
  - `/loop [enabled]` - lặp playlist vô hạn
  - `/repeat mode` - `off`, lặp bài hiện tại (`one`) hoặc lặp playlist (`all`)
  - `/random [enabled]` - chọn bài kế tiếp ngẫu nhiên
  - `/shuffle` - xáo trộn queue hiện tại
  - `/pause`, `/resume`, `/volume`, `/nowplaying`
  - `/remove position`, `/clear`, `/queue page`
- Prefix commands `!join`, `!play`, ... chỉ chạy khi bật `ENABLE_PREFIX_COMMANDS=true`
- Slash command phản hồi bằng embed PeachBot màu hồng, có tiêu đề và trạng thái dễ đọc.

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
   - Không cần bật `Message Content Intent` nếu chỉ dùng slash commands

3. Khởi động bot:

```bash
fnm exec --using v25.9.0 npm start
```

## Ghi chú

- Máy chạy bot cần có `ffmpeg` hoặc đặt đường dẫn vào biến môi trường `FFMPEG_PATH`.
- Nếu bot không encode được voice, hãy đảm bảo package `opusscript` được cài.
- Project ưu tiên encoder native `@discordjs/opus` để giảm tải CPU; `opusscript` vẫn được giữ làm fallback.
- Âm lượng mặc định là `1.15x`; chỉnh bằng `AUDIO_VOLUME` trong khoảng `0` đến `2` nếu cần.
- Chất lượng Opus mặc định là `128 kbps`; chỉnh bằng `OPUS_BITRATE` nếu server giới hạn bitrate voice.
- `CROSSFADE_SECONDS=5` nối các bài trong cùng một cụm bằng fade in/out; đặt `0` để tắt.
- `CROSSFADE_BATCH_SIZE=8` là số bài được ghép trong một pipeline FFmpeg.
- Có thể bật loop ngay khi khởi động bằng `LOOP_PLAYLIST=true`; random mặc định bật qua `RANDOM_NEXT=true`.
- Discord voice hiện yêu cầu DAVE/E2EE; project đã dùng `@discordjs/voice 0.19.x` và `@snazzah/davey` để hỗ trợ việc này.
- Nếu muốn dùng prefix command, hãy bật `ENABLE_PREFIX_COMMANDS=true` và `Message Content Intent` trong Discord Developer Portal.
- `VOICE_DEBUG=true` mặc định bật log handshake voice; token và session id sẽ được ẩn trong log.
