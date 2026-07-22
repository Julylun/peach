# Discord Local Music Bot

Bot Discord đơn giản để phát nhạc từ file local như `.mp3`, `.wav`, `.ogg`, `.opus`, `.webm`, `.m4a`, `.flac` và stream audio từ URL YouTube.

## Tính năng

- Slash commands mặc định:
  - `/join` - vào voice channel của bạn
  - `/play [playlist] [query]` - phát một playlist, toàn bộ `music/` hoặc URL YouTube
  - `/playlists` - xem playlist và chọn bằng autocomplete của `/play`
  - `/ducking [enabled]` - tự giảm âm lượng khi có người nói
  - `/water mode|add|remove|interval|status` - nhắc uống nước theo room hoặc từng người
  - `/todo title description hour minute` - đặt việc cần làm, Peach DM khi đến giờ
  - `/alarm title hour minute music` - đặt báo thức phát nhạc trong voice room
  - `/reminders` - xem số todo và báo thức đang chờ trên hệ thống
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
  - `/mood`, `/persona` - DJ mood và tính cách Peach
  - `/atmosphere`, `/radio`, `/smartqueue` - bật/tắt các chế độ social
  - `/remember`, `/memory`, `/forgetme` - memory có kiểm soát theo từng người dùng
- Prefix commands `!join`, `!play`, ... chỉ chạy khi bật `ENABLE_PREFIX_COMMANDS=true`
- Slash command phản hồi bằng embed PeachBot màu hồng, có tiêu đề và trạng thái dễ đọc.
- `/panel` được chia thành nhóm `Phát nhạc`, `Queue` và `Chế độ Peach`, có nút `Play all`, `Pause`, `Resume`, `Skip`, `Stop`, `Shuffle`, `Random`, `Clear`, `Leave` cùng menu `Repeat`/`Volume`. Nút `Modes/Playlists` đổi giữa selector playlist và selector persona/mood.
- `/join` cũng tự mở panel sau khi bot vào voice channel.
- Panel tự refresh theo `PANEL_REFRESH_SECONDS`, có menu đổi mood/persona và bật/tắt atmosphere, radio host, smart queue.
- Peach có lời chào khi người dùng vào/rời voice room; `VOICE_GREETING_ENABLED=false` để tắt.
- Smart mood DJ ưu tiên file có tên phù hợp mood; smart queue tránh thêm trùng và hạn chế lặp các bài vừa phát.
- Atmosphere chỉ nhắn khi voice room có người và im lặng đủ lâu; Radio Host định kỳ giới thiệu bài đang phát.
- Gemini AI có thể đọc lịch sử gần nhất, chỉ trả lời khi người dùng đang gọi Peach, và react tin nhắn bằng emoji phù hợp. Peach có thể dùng nhiều emoji Unicode trong câu trả lời, không bị giới hạn ở một danh sách cố định.
- Peach hiểu một số yêu cầu DJ tự nhiên trong voice chat như “phát playlist”, “tạm dừng”, “phát tiếp”, “skip”, “dừng nhạc”, “rời voice” và “xem trạng thái”, không cần gõ slash command.
- Nếu Peach đang xử lý một tin nhắn mà có tin nhắn mới gọi bot, Peach giữ lại tin nhắn mới nhất để xử lý tiếp thay vì bỏ qua.

## Cấu trúc

```text
src/
├── index.js              # khởi tạo client và nối các event/service
├── config.js             # đọc, kiểm tra và chuẩn hóa biến môi trường
├── commands.js           # slash commands và prefix commands
├── ui.js                 # embed, music panel, button/select interactions
├── ai/
│   ├── gemini.js         # LangChain pipeline phân loại và sinh response
│   └── prompts.js        # ChatPromptTemplate và output schemas
├── music/
│   └── service.js        # voice connection, queue, FFmpeg, playback state
├── reminders.js          # todo, alarm scheduler, DM và alarm panel
├── social.js             # greeting, atmosphere và radio host
└── state/
    └── store.js          # settings guild và memory giới hạn
```

Đặt nhạc vào thư mục `music/`; mỗi folder con trực tiếp là một playlist:

```text
music/
├── lofi/
│   ├── rainy-night.mp3
│   └── study.wav
├── energetic/
│   └── workout.mp3
└── welcome.mp3       # file root thuộc playlist default
```

`/play playlist:lofi` phát playlist `lofi`, `/play playlist:all` hoặc `/play` không chọn playlist phát toàn bộ nhạc trong `music/`. Dùng `/playlists` để xem danh sách; option `playlist` của `/play` có autocomplete.

Đặt nhắc việc bằng slash command:

```text
/todo title:"Học bài" description:"Chương 1" hour:20 minute:30
/alarm title:"Dậy học" hour:7 minute:0 music:"alarm.mp3"
/reminders
```

Todo được gửi vào DM của người đặt. Báo thức sẽ tạm dừng bài đang phát, phát nhạc báo tối đa `ALARM_DURATION_SECONDS` (mặc định 90 giây), hiện nút `Tắt báo thức` hoặc `Delay 10 phút`, rồi tiếp tục bài cũ từ vị trí đã dừng. Thời gian dùng múi giờ `PEACH_TIMEZONE` và reminder được lưu trong `data/peach-state.json` để không mất khi restart.

Để phát YouTube, gửi URL vào option `query` của `/play`, dùng `!play <url>`, hoặc nói tự nhiên với Peach như “Peach phát link YouTube này”. Bot dùng `yt-dlp` stream audio trực tiếp qua FFmpeg, không lưu video/audio vào thư mục `music/`.

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

Google AI Studio cung cấp Gemini API key; bot dùng LangChain với `@langchain/google-genai`. Khi `AI_ENABLED=true`, bot chạy hai giai đoạn: giai đoạn 1 phân loại mức độ liên quan không hiển thị typing, giai đoạn 2 mới sinh câu trả lời và hiển thị typing. Mặc định bot tự lấy ID voice channel mà nó đang join; khi bot chuyển room, channel AI cũng tự chuyển theo. Có thể đặt `AI_CHANNEL_ID` nếu muốn khóa cố định một channel.

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

Các mode của Peach:

```env
PEACH_PERSONA=cute
ATMOSPHERE_ENABLED=false
RADIO_HOST_ENABLED=false
VOICE_GREETING_ENABLED=true
SMART_QUEUE_ENABLED=true
PEACH_MOOD=auto
PEACH_MEMORY_ENABLED=true
PEACH_MEMORY_MAX_NOTES=5
PANEL_REFRESH_SECONDS=15
ATMOSPHERE_IDLE_MINUTES=10
RADIO_HOST_EVERY_TRACKS=3
AUTO_DUCKING_ENABLED=true
DUCKING_VOLUME=0.35
WATER_REMINDER_INTERVAL_MINUTES=60
```

Nội dung tin nhắn, lịch sử và tối đa `AI_HISTORY_IMAGE_MAX_COUNT` ảnh đính kèm trong history được gửi tới Google Gemini khi tính năng bật. Lịch sử được gửi thành từng `contents` riêng với `role=user`; mỗi content có dạng `<nickname>...</nickname><content>...</content><is_latest>...</is_latest>` để model phân biệt người dùng và nhận biết tin nhắn cuối. Ảnh vượt `AI_IMAGE_MAX_BYTES` sẽ bị bỏ qua; không bật AI trong các channel không muốn đưa dữ liệu ra ngoài.

LangChain/Gemini sẽ retry tối đa `AI_API_RETRIES` lần sau lần gọi đầu với lỗi mạng, timeout, rate limit `429` hoặc lỗi server `5xx`, dùng exponential backoff. Lỗi API key/model/request không hợp lệ sẽ debug ngay.

Ảnh trong history cũng được gửi cho giai đoạn phân loại, tối đa `AI_HISTORY_IMAGE_MAX_COUNT` ảnh; trong giai đoạn 1 bot không hiển thị trạng thái đang nhập. Khi giai đoạn 1 xác định tin nhắn có liên quan, bot mới hiển thị typing trong lúc giai đoạn 2 sinh câu trả lời.

## Chạy bằng Docker Compose

Docker sẽ tự đọc `DISCORD_TOKEN` và các cấu hình khác từ file `.env`. Thư mục `music/` trên máy được mount vào `/app/music` trong container, nên thêm hoặc xóa nhạc không cần build lại image.
Thư mục `data/` cũng được mount vào `/app/data` để todo và báo thức không mất khi container được recreate.

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
- Máy chạy bot cần có `yt-dlp` trong PATH hoặc đặt `YTDLP_PATH`; Dockerfile đã cài sẵn `yt-dlp`.
- Định dạng audio được nhận diện gồm `.mp3`, `.wav`, `.ogg`, `.oga`, `.opus`, `.m4a`, `.m4b`, `.flac`, `.aac`, `.webm`, `.weba` và `.mka`; FFmpeg sẽ giải mã về PCM 48 kHz stereo trước khi gửi vào Discord.
- Project ưu tiên encoder native `@discordjs/opus` để giảm tải CPU; `opusscript@0.0.x` được giữ làm fallback tương thích với `prism-media`.
- Âm lượng mặc định là `1.15x`; chỉnh bằng `AUDIO_VOLUME` trong khoảng `0` đến `2` nếu cần.
- Chất lượng Opus mặc định là `128 kbps`; chỉnh bằng `OPUS_BITRATE` nếu server giới hạn bitrate voice.
- `CROSSFADE_SECONDS=5` nối các bài trong cùng một cụm bằng fade in/out; đặt `0` để tắt.
- `CROSSFADE_BATCH_SIZE=8` là số bài được ghép trong một pipeline FFmpeg.
- Có thể bật loop ngay khi khởi động bằng `LOOP_PLAYLIST=true`; random mặc định bật qua `RANDOM_NEXT=true`.
- Discord voice hiện yêu cầu DAVE/E2EE; project đã dùng `@discordjs/voice 0.19.x` và `@snazzah/davey` để hỗ trợ việc này.
- Nếu muốn dùng prefix command, hãy bật `ENABLE_PREFIX_COMMANDS=true` và `Message Content Intent` trong Discord Developer Portal.
- `VOICE_DEBUG=true` mặc định bật log handshake voice; token và session id sẽ được ẩn trong log.
- Settings guild và memory được lưu ở `data/peach-state.json`; thư mục này đã nằm trong `.gitignore`. Memory chỉ được lưu khi người dùng chủ động gọi `/remember` và có thể xóa bằng `/forgetme`.
- Water reminder mặc định tắt. Dùng `/water mode` với `off`, `all` hoặc `selected`; dùng `/water add`, `/water remove` và `/water interval` để chọn người và thời gian. Chỉ những người đang ở cùng voice room với bot mới được mention.
- Auto ducking cần bot nhận voice packet nên connection dùng `selfDeaf=false`; âm lượng hạ xuống theo `DUCKING_VOLUME` khi có người nói và tự khôi phục sau đó.
