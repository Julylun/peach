const { SlashCommandBuilder } = require('discord.js');

function buildSlashCommands() {
    return [
      new SlashCommandBuilder().setName('join').setDescription('Vào voice channel của bạn'),
      new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc local hoặc URL YouTube')
        .addStringOption((option) => option
          .setName('query')
          .setDescription('Bộ lọc file local hoặc URL YouTube')
          .setRequired(false))
        .addStringOption((option) => option
          .setName('playlist')
          .setDescription('Chọn playlist local từ thư mục music')
          .setAutocomplete(true)
          .setRequired(false))
        .addBooleanOption((option) => option
          .setName('list')
          .setDescription('Lấy toàn bộ bài trong YouTube playlist/list (mặc định tắt)')
          .setRequired(false)),
      new SlashCommandBuilder()
        .setName('stream')
        .setDescription('Phát live stream YouTube; tự tắt nhạc hiện tại')
        .addStringOption((option) => option
          .setName('url')
          .setDescription('Link YouTube live stream')
          .setRequired(true))
        .addStringOption((option) => option
          .setName('video')
          .setDescription('Video camera của Peach; bot token hiện chưa hỗ trợ')
          .addChoices(
            { name: 'Tắt video', value: 'disabled' },
            { name: 'Bật video', value: 'enabled' },
          )
          .setRequired(false)),
      new SlashCommandBuilder().setName('playlists').setDescription('Xem các playlist trong thư mục music'),
      new SlashCommandBuilder()
        .setName('ducking')
        .setDescription('Bật/tắt tự giảm âm lượng khi có người nói')
        .addBooleanOption((option) => option
          .setName('enabled')
          .setDescription('Bật hoặc tắt auto ducking')
          .setRequired(false)),
      new SlashCommandBuilder()
        .setName('water')
        .setDescription('Cấu hình lời nhắc uống nước trong voice room')
        .addSubcommand((subcommand) => subcommand
          .setName('mode')
          .setDescription('Chọn người nhận lời nhắc')
          .addStringOption((option) => option
            .setName('value')
            .setDescription('Tắt, nhắc tất cả hoặc nhắc người đã chọn')
            .setRequired(true)
            .addChoices(
              { name: 'Tắt nhắc', value: 'off' },
              { name: 'Tất cả người trong room', value: 'all' },
              { name: 'Người đã chọn', value: 'selected' },
            ))
          .addUserOption((option) => option
            .setName('user')
            .setDescription('Thêm người này vào nhóm được nhắc')
            .setRequired(false)))
        .addSubcommand((subcommand) => subcommand
          .setName('add')
          .setDescription('Thêm một người vào nhóm được nhắc')
          .addUserOption((option) => option.setName('user').setDescription('Người cần nhắc').setRequired(true)))
        .addSubcommand((subcommand) => subcommand
          .setName('remove')
          .setDescription('Bỏ một người khỏi nhóm được nhắc')
          .addUserOption((option) => option.setName('user').setDescription('Người không cần nhắc').setRequired(true)))
        .addSubcommand((subcommand) => subcommand
          .setName('interval')
          .setDescription('Đặt khoảng thời gian giữa các lần nhắc')
          .addIntegerOption((option) => option
            .setName('minutes')
            .setDescription('Từ 5 đến 240 phút')
            .setMinValue(5)
            .setMaxValue(240)
            .setRequired(true)))
        .addSubcommand((subcommand) => subcommand
          .setName('status')
          .setDescription('Xem cấu hình nhắc uống nước')),
      new SlashCommandBuilder()
        .setName('todo')
        .setDescription('Đặt một việc cần làm và nhận DM khi đến giờ')
        .addStringOption((option) => option
          .setName('title')
          .setDescription('Tên công việc')
          .setRequired(true))
        .addIntegerOption((option) => option
          .setName('hour')
          .setDescription('Giờ theo định dạng 24h, từ 0 đến 23')
          .setMinValue(0)
          .setMaxValue(23)
          .setRequired(true))
        .addIntegerOption((option) => option
          .setName('minute')
          .setDescription('Phút từ 0 đến 59')
          .setMinValue(0)
          .setMaxValue(59)
          .setRequired(true))
        .addStringOption((option) => option
          .setName('description')
          .setDescription('Mô tả công việc, có thể bỏ trống')
          .setRequired(false)),
      new SlashCommandBuilder()
        .setName('alarm')
        .setDescription('Đặt báo thức phát nhạc trong voice channel')
        .addStringOption((option) => option
          .setName('title')
          .setDescription('Mô tả báo thức')
          .setRequired(true))
        .addIntegerOption((option) => option
          .setName('hour')
          .setDescription('Giờ theo định dạng 24h, từ 0 đến 23')
          .setMinValue(0)
          .setMaxValue(23)
          .setRequired(true))
        .addIntegerOption((option) => option
          .setName('minute')
          .setDescription('Phút từ 0 đến 59')
          .setMinValue(0)
          .setMaxValue(59)
          .setRequired(true))
        .addStringOption((option) => option
          .setName('music')
          .setDescription('Tên file local, bộ lọc file hoặc URL YouTube')
          .setRequired(true)),
      new SlashCommandBuilder().setName('reminders').setDescription('Xem số todo và báo thức đang chờ'),
      new SlashCommandBuilder().setName('pause').setDescription('Tạm dừng bài đang phát'),
      new SlashCommandBuilder().setName('resume').setDescription('Tiếp tục phát bài'),
      new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Chỉnh âm lượng bot theo phần trăm')
        .addIntegerOption((option) => option
          .setName('percent')
          .setDescription('0 đến 200%')
          .setMinValue(0)
          .setMaxValue(200)
          .setRequired(true)),
      new SlashCommandBuilder().setName('nowplaying').setDescription('Xem bài đang phát'),
      new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Xem queue hiện tại')
        .addIntegerOption((option) => option
          .setName('page')
          .setDescription('Trang queue, mỗi trang 10 bài')
          .setMinValue(1)
          .setRequired(false)),
      new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Xóa một bài khỏi queue')
        .addIntegerOption((option) => option
          .setName('position')
          .setDescription('Vị trí bài trong queue')
          .setMinValue(1)
          .setRequired(true)),
      new SlashCommandBuilder().setName('clear').setDescription('Xóa toàn bộ queue đang chờ'),
      new SlashCommandBuilder()
        .setName('list')
        .setDescription('Liệt kê file nhạc local')
        .addStringOption((option) => option
          .setName('filter')
          .setDescription('Lọc theo tên file hoặc thư mục')
          .setRequired(false)),
      new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hiện tại'),
      new SlashCommandBuilder().setName('stop').setDescription('Dừng phát và xoá queue'),
      new SlashCommandBuilder().setName('leave').setDescription('Rời voice channel'),
      new SlashCommandBuilder().setName('status').setDescription('Mở dashboard tổng quan: queue, reminder, social và voice'),
      new SlashCommandBuilder().setName('me').setDescription('Xem todo, alarm, memory và bài queue của riêng bạn'),
      new SlashCommandBuilder().setName('help').setDescription('Xem hướng dẫn sử dụng PeachBot'),
      new SlashCommandBuilder().setName('panel').setDescription('Mở bảng điều khiển nhạc trực tiếp'),
      new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Bật/tắt phát lặp playlist vô hạn')
        .addBooleanOption((option) => option
          .setName('enabled')
          .setDescription('Bật hoặc tắt loop; bỏ trống để đảo trạng thái')
          .setRequired(false)),
      new SlashCommandBuilder()
        .setName('loopone')
        .setDescription('Bật/tắt lặp riêng bài đang phát')
        .addBooleanOption((option) => option
          .setName('enabled')
          .setDescription('Bật hoặc tắt; bỏ trống để đảo trạng thái')
          .setRequired(false)),
      new SlashCommandBuilder()
        .setName('repeat')
        .setDescription('Chọn chế độ lặp: tắt, bài hiện tại hoặc playlist')
        .addStringOption((option) => option
          .setName('mode')
          .setDescription('Chế độ lặp')
          .setRequired(true)
          .addChoices(
            { name: 'Tắt', value: 'off' },
            { name: 'Bài hiện tại', value: 'one' },
            { name: 'Cả playlist', value: 'all' },
          )),
      new SlashCommandBuilder()
        .setName('random')
        .setDescription('Bật/tắt chọn bài kế tiếp ngẫu nhiên')
        .addBooleanOption((option) => option
          .setName('enabled')
          .setDescription('Bật hoặc tắt random; bỏ trống để đảo trạng thái')
          .setRequired(false)),
      new SlashCommandBuilder().setName('shuffle').setDescription('Xáo trộn các bài đang chờ'),
      new SlashCommandBuilder()
        .setName('mood')
        .setDescription('Đổi mood để Peach sắp xếp playlist thông minh')
        .addStringOption((option) => option
          .setName('value')
          .setDescription('Mood của playlist')
          .setRequired(true)
          .addChoices(
            { name: 'Tự động', value: 'auto' },
            { name: 'Chill', value: 'calm' },
            { name: 'Tập trung', value: 'focus' },
            { name: 'Vui', value: 'happy' },
            { name: 'Buồn', value: 'sad' },
            { name: 'Năng lượng', value: 'energetic' },
            { name: 'Ngủ', value: 'sleep' },
            { name: 'Lãng mạn', value: 'romantic' },
          )),
      new SlashCommandBuilder()
        .setName('persona')
        .setDescription('Chọn tính cách phản hồi của Peach')
        .addStringOption((option) => option
          .setName('value')
          .setDescription('Persona')
          .setRequired(true)
          .addChoices(
            { name: 'Cute', value: 'cute' },
            { name: 'Lofi', value: 'lofi' },
            { name: 'Chaotic', value: 'chaotic' },
            { name: 'Formal', value: 'formal' },
          )),
      new SlashCommandBuilder()
        .setName('atmosphere')
        .setDescription('Bật/tắt lời nhắc không khí trong voice room')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Bật hoặc tắt').setRequired(false)),
      new SlashCommandBuilder()
        .setName('radio')
        .setDescription('Bật/tắt Radio Host của Peach')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Bật hoặc tắt').setRequired(false)),
      new SlashCommandBuilder()
        .setName('smartqueue')
        .setDescription('Bật/tắt queue thông minh, tránh lặp bài gần đây')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Bật hoặc tắt').setRequired(false)),
      new SlashCommandBuilder()
        .setName('remember')
        .setDescription('Bật/tắt personalization của Peach')
        .addSubcommand((subcommand) => subcommand
          .setName('me')
          .setDescription('Bật/tắt personalization riêng của bạn')
          .addBooleanOption((option) => option
            .setName('enabled')
            .setDescription('Bật hoặc tắt; bỏ trống để đảo trạng thái')
            .setRequired(false)))
        .addSubcommand((subcommand) => subcommand
          .setName('on')
          .setDescription('Bật personalization cho toàn bộ server'))
        .addSubcommand((subcommand) => subcommand
          .setName('off')
          .setDescription('Tắt personalization cho toàn bộ server')),
      new SlashCommandBuilder().setName('forgetme').setDescription('Xóa toàn bộ memory của bạn'),
      new SlashCommandBuilder().setName('memory').setDescription('Xem memory Peach đang lưu của bạn'),
    ].map((command) => command.toJSON());
}

module.exports = { buildSlashCommands };
