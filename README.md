# PeachBot

PeachBot là Discord bot hỗ trợ phòng học, phòng thư giãn và phòng nghe nhạc. Bot phát nhạc local hoặc YouTube vào voice channel, điều khiển bằng panel, hỗ trợ playlist, nhắc việc, báo thức, tự giảm âm lượng khi có người nói và có AI để trò chuyện trong text channel của voice room.

## Tác giả

- Người phát triển: **Hoang Luan (JulyLun)**
- Tên bot: **PeachBot**
- Nền tảng: Node.js, Discord.js, Discord Voice, FFmpeg và yt-dlp

## Tính năng

- Phát toàn bộ nhạc trong `music/`, một playlist hoặc file được lọc theo tên.
- Hỗ trợ `.mp3`, `.wav`, `.ogg`, `.opus`, `.webm`, `.m4a`, `.flac`, `.aac`, `.mka` và các định dạng FFmpeg đọc được.
- Stream audio từ URL YouTube bằng `yt-dlp`, không lưu video vào thư mục nhạc.
- Playlist được tổ chức bằng folder con trong `music/`.
- Panel điều khiển bằng button và select menu.
- Loop playlist, repeat bài, random next, shuffle, smart queue và crossfade.
- Auto ducking: tự hạ âm lượng khi có người nói trong voice channel.
- Atmosphere, Radio Host, lời chào voice và nhắc uống nước.
- Todo gửi DM khi đến giờ.
- Alarm tạm dừng bài hiện tại, phát nhạc báo thức, cho phép tắt hoặc delay 10 phút rồi resume.
- AI Peach đọc lịch sử tin nhắn, ảnh đính kèm và chỉ phản hồi khi nội dung liên quan đến bot.
- Memory cá nhân do người dùng chủ động lưu.

## Yêu cầu

- Node.js `22.12+`.
- FFmpeg trong PATH khi chạy trực tiếp.
- yt-dlp trong PATH nếu muốn phát YouTube.
- Một Discord application có bot token.
- Bot cần các quyền Discord cơ bản:
  - View Channel
  - Send Messages
  - Embed Links
  - Read Message History
  - Connect
  - Speak

Nếu bật AI hoặc prefix command, bật thêm **Message Content Intent** trong Discord Developer Portal. Gateway intent `Guild Voice States` cũng cần được bật trong code và bot phải được cấp quyền voice ở channel cần sử dụng.

## Cài đặt nhanh

```bash
fnm exec --using v25.9.0 npm install
cp .env.example .env
```

Mở `.env` và điền ít nhất:

```env
DISCORD_TOKEN=your-discord-bot-token
DISCORD_GUILD_ID=your-test-server-id
```

Chạy bot:

```bash
fnm exec --using v25.9.0 npm start
```

Khi dùng `DISCORD_GUILD_ID`, slash command được đăng ký trực tiếp trong server và thường xuất hiện nhanh hơn global command. Sau khi thêm hoặc sửa slash command, restart bot để đăng ký lại.

## Thư viện nhạc và playlist

Mỗi folder con trực tiếp trong `music/` là một playlist:

```text
music/
├── lofi/
│   ├── rainy-night.mp3
│   └── study.wav
├── energetic/
│   └── workout.opus
└── welcome.mp3
```

- File ở root thuộc playlist `default`.
- `/play` phát toàn bộ file trong `music/`.
- `/play playlist:lofi` chỉ phát playlist `lofi`.
- `/play playlist:all` phát toàn bộ thư viện.
- `/playlists` xem danh sách playlist.
- `/list filter:study` tìm file theo tên hoặc đường dẫn.

## Hướng dẫn lệnh

Gõ `/help` trong Discord để xem help trực tiếp. Nếu bật prefix command, dùng `!help` hoặc prefix được cấu hình trong `COMMAND_PREFIX`.

### Kết nối và panel

| Lệnh | Chức năng |
| --- | --- |
| `/join` | Peach vào voice channel bạn đang đứng và tự mở panel. |
| `/panel` | Mở lại panel điều khiển nhạc. |
| `/status` | Xem voice state, player state, bài hiện tại, queue và quyền bot. |
| `/leave` | Dừng kết nối và rời voice channel. |
| `/help` | Xem hướng dẫn lệnh. |

Panel có các nhóm điều khiển phát nhạc, queue, playlist và settings. Chọn playlist trong panel rồi bấm `Play` để phát mà không cần gõ `/play`.

### Phát nhạc

| Lệnh | Chức năng |
| --- | --- |
| `/play` | Phát toàn bộ thư mục `music/`. |
| `/play playlist:<name>` | Phát playlist được chọn. |
| `/play query:<text>` | Lọc file local theo tên hoặc stream URL YouTube. |
| `/pause` | Tạm dừng bài hiện tại. |
| `/resume` | Phát tiếp bài đang tạm dừng. |
| `/skip` | Chuyển bài. |
| `/stop` | Dừng nhạc và xóa queue đang chờ. |
| `/volume percent:<0-200>` | Chỉnh âm lượng. |
| `/nowplaying` | Xem bài hiện tại và chế độ phát. |
| `/queue page:<number>` | Xem queue theo trang. |
| `/remove position:<number>` | Xóa một bài khỏi queue. |
| `/clear` | Xóa các bài đang chờ, không dừng bài hiện tại. |

Ví dụ:

```text
/play
/play playlist:lofi
/play query:rain
/play query:https://www.youtube.com/watch?v=...
```

### Chế độ phát

| Lệnh | Chức năng |
| --- | --- |
| `/loop enabled:true` | Lặp toàn bộ playlist vô hạn. |
| `/repeat mode:off` | Tắt repeat. |
| `/repeat mode:one` | Lặp bài hiện tại. |
| `/repeat mode:all` | Lặp playlist. |
| `/random enabled:true` | Chọn bài kế tiếp ngẫu nhiên. |
| `/shuffle` | Xáo trộn queue. |
| `/ducking enabled:true` | Tự giảm nhạc khi có người nói. |
| `/mood value:focus` | Ưu tiên bài phù hợp mood. |
| `/smartqueue enabled:true` | Hạn chế thêm trùng và lặp bài gần đây. |

Các mood hiện có: `auto`, `calm`, `focus`, `happy`, `sad`, `energetic`, `sleep`, `romantic`.

### Todo và báo thức

Todo và alarm dùng giờ 24h theo `PEACH_TIMEZONE`, mặc định là `Asia/Ho_Chi_Minh`.

```text
/todo title:"Học bài" description:"Ôn chương 1" hour:20 minute:30
/alarm title:"Dậy học" hour:7 minute:0 music:"alarm.mp3"
/reminders
```

- `/todo`: description có thể bỏ trống; đến giờ Peach gửi DM cho người đặt.
- `/alarm`: music nhận tên file, bộ lọc file local hoặc URL YouTube.
- Khi alarm chạy, bài đang phát được pause tại vị trí hiện tại.
- Peach phát alarm tối đa `ALARM_DURATION_SECONDS`, mặc định 90 giây.
- Panel alarm có `Tắt báo thức` và `Delay 10 phút`.
- Khi alarm kết thúc hoặc bị tắt, bài cũ được resume.
- `/reminders`: xem tổng số todo và alarm đang ở trạng thái chờ/ringing.

Alarm là reminder một lần. Nếu dùng `Delay 10 phút`, alarm được tạo lại ở thời điểm mới.

### Social mode

| Lệnh | Chức năng |
| --- | --- |
| `/water mode value:off` | Tắt nhắc uống nước. |
| `/water mode value:all` | Nhắc tất cả người đang ở cùng voice room. |
| `/water mode value:selected user:@user` | Chọn user được nhắc. |
| `/water add user:@user` | Thêm user vào danh sách được nhắc. |
| `/water remove user:@user` | Bỏ user khỏi danh sách. |
| `/water interval minutes:60` | Đặt khoảng nhắc từ 5 đến 240 phút. |
| `/water status` | Xem cấu hình hiện tại. |
| `/persona value:cute` | Đổi tính cách phản hồi. |
| `/atmosphere enabled:true` | Bật lời nhắc không khí trong room. |
| `/radio enabled:true` | Bật Radio Host giới thiệu bài. |

Water reminder mặc định tắt.

### Memory

```text
/remember note:"Tôi thường học vào buổi tối"
/memory
/forgetme
```

Memory chỉ được lưu khi user chủ động dùng `/remember` và có thể xóa bằng `/forgetme`.

## AI Peach

AI sử dụng Google Gemini thông qua LangChain. Bot xử lý hai giai đoạn:

1. Phân tích message, lịch sử và ảnh để xác định có đang gọi hoặc hỏi Peach hay không.
2. Nếu có liên quan, Peach hiển thị typing rồi sinh câu trả lời.

AI đọc text channel của voice room mà bot đang tham gia khi `AI_USE_CURRENT_VOICE_CHANNEL=true`. Có thể khóa channel bằng `AI_CHANNEL_ID`. Bot không tự nghe hoặc chuyển giọng nói trong voice channel thành text.

Cấu hình tối thiểu:

```env
AI_ENABLED=true
GEMINI_API_KEY=your-google-gemini-api-key
GEMINI_MODEL=gemma-4-31b-it
AI_USE_CURRENT_VOICE_CHANNEL=true
AI_ONLY_VOICE_CHANNEL=true
AI_REQUIRE_BOT_IN_VOICE=false
```

Ảnh trong message/history được giới hạn bởi `AI_IMAGE_MAX_BYTES`, `AI_IMAGE_MAX_COUNT` và `AI_HISTORY_IMAGE_MAX_COUNT`. Khả năng nhận ảnh còn phụ thuộc model/provider thực tế đang được Google API cung cấp.

AI retry lỗi mạng, timeout, rate limit `429` và lỗi server `5xx` theo `AI_API_RETRIES` và `AI_API_RETRY_BASE_MS`. Không gửi nội dung nhạy cảm vào channel AI nếu không muốn đưa dữ liệu tới provider.

## Cấu hình môi trường

Các biến thường dùng trong `.env`:

```env
DISCORD_TOKEN=
DISCORD_GUILD_ID=
PEACH_TIMEZONE=Asia/Ho_Chi_Minh
MUSIC_DIR=./music
PEACH_STATE_FILE=./data/peach-state.json
FFMPEG_PATH=ffmpeg
YTDLP_PATH=yt-dlp
AUDIO_VOLUME=1.15
OPUS_BITRATE=128000
LOOP_PLAYLIST=false
RANDOM_NEXT=true
REPEAT_MODE=off
CROSSFADE_SECONDS=5
CROSSFADE_BATCH_SIZE=8
ALARM_DURATION_SECONDS=90
COMMAND_PREFIX=!
ENABLE_PREFIX_COMMANDS=false
VOICE_DEBUG=true
```

Các biến AI, social, memory và cấu hình đầy đủ nằm trong `.env.example`.

## Docker Compose

Docker tự đọc biến môi trường từ `.env`:

```bash
docker compose up -d --build
docker compose logs -f peachbot
```

Chạy nền và không phụ thuộc terminal hiện tại vì container có `restart: unless-stopped`.

```bash
docker compose ps
docker compose restart peachbot
docker compose down
```

Compose mount:

- `./music` vào `/app/music` để cập nhật nhạc không cần build lại.
- `./data` vào `/app/data` để giữ settings, memory, todo và alarm sau khi recreate container.

## Cấu trúc mã nguồn

```text
src/
├── index.js              # khởi tạo client và nối các service
├── config.js             # đọc và chuẩn hóa biến môi trường
├── commands.js           # slash command và prefix command
├── ui.js                 # embed, panel và interaction
├── reminders.js          # todo, alarm scheduler, DM và alarm panel
├── social.js             # greeting, atmosphere, radio và water reminder
├── ai/
│   ├── gemini.js         # LangChain Gemini pipeline
│   └── prompts.js        # prompt templates và schema
├── music/
│   └── service.js        # voice connection, queue, FFmpeg, playback
└── state/
    └── store.js          # settings, memory và reminder persistence
```

## Xử lý lỗi thường gặp

- Slash command không xuất hiện: kiểm tra `DISCORD_GUILD_ID`, quyền bot và restart bot.
- `Used disallowed intents`: bật các privileged intents tương ứng trong Developer Portal.
- Bot không vào voice: cấp `View Channel`, `Connect` và `Speak` cho bot trong voice channel.
- YouTube không phát: kiểm tra `yt-dlp --version`, URL và log FFmpeg.
- Todo không DM được: user cần cho phép Direct Messages từ server.
- Alarm không phát: bot cần đang ở voice hoặc phải có quyền vào voice channel đã lưu trong reminder.

## Ghi chú

- State runtime nằm ở `data/peach-state.json`; thư mục `data/` không được commit.
- `VOICE_DEBUG=true` hữu ích khi chẩn đoán voice handshake nhưng tạo nhiều log.
- `AUDIO_VOLUME` nằm trong khoảng `0` đến `2`; `OPUS_BITRATE` tối đa mặc định là `128000`.
- FFmpeg chuyển audio về PCM 48 kHz stereo trước khi gửi vào Discord.
