require "telegram/bot"
require "json"
require "tmpdir"
require "fileutils"
require "open3"
require "securerandom"
require "rbconfig"

TOKEN = ENV.fetch("XDL_BOT_TOKEN") { abort "Set XDL_BOT_TOKEN environment variable" }
BOT_API_URL = ENV["XDL_BOT_API"] || "https://api.telegram.org"

CORE = ENV["XDL_CORE"] || begin
  base = File.expand_path("../core", __dir__)
  exe = RbConfig::CONFIG["host_os"] =~ /mswin|mingw|cygwin/ ? "xcore.exe" : "xcore"
  File.join(base, exe)
end

WORKDIR = ENV["XDL_TMP"] || File.join(Dir.tmpdir, "xdownloader")
MAX_MB = if ENV["XDL_MAX_MB"] && !ENV["XDL_MAX_MB"].empty?
  ENV["XDL_MAX_MB"].to_i
elsif BOT_API_URL =~ %r{127\.0\.0\.1|localhost|192\.168\.}
  2000
else
  49
end

PENDING = {}
PENDING_MUTEX = Mutex.new

def spotify_url?(text)
  text.include?("open.spotify.com") || text.start_with?("spotify:")
end

def soundcloud_url?(text)
  text.include?("soundcloud.com")
end

def audio_only_url?(text)
  spotify_url?(text) || soundcloud_url?(text)
end

def extract_url(text)
  text[/https?:\/\/\S+/] || text[/spotify:[^\s]+/]
end

def core(*args)
  out, err, status = Open3.capture3(CORE, *args)
  [out, err, status.success?]
end

def track_info(url)
  return { "title" => "Spotify track", "is_spotify" => true } if spotify_url?(url)

  out, err, ok = core("info", url)
  return nil unless ok

  JSON.parse(out)
rescue JSON::ParserError
  nil
end

def safe_caption(text, max = 120)
  text.to_s.strip.gsub(/[\u0000-\u001f]/, "").byteslice(0, max) || ""
end

def friendly_error(err)
  e = err.to_s
  case e
  when /no such file|not found.*yt-dlp|yt-dlp.*not install|spotdl.*not/i
    "Download tool isn't installed on the server."
  when /ffmpeg/i
    "The server is missing ffmpeg — can't process this file."
  when /unsupported URL/i
    "This link isn't supported."
  when /private|unavailable|removed|no longer/i
    "This video is private, region-locked, or no longer available."
  when /sign in|age|restricted/i
    "This video requires sign-in or is age-restricted."
  when /no output file was found|track unavailable/i
    "This track isn't available to download right now — YouTube Music has no match for it."
  else
    "Download failed. Try a different link, or make sure yt-dlp and ffmpeg are installed."
  end
end

def format_buttons(url, audio_only)
  token = SecureRandom.hex(8)
  PENDING_MUTEX.synchronize { PENDING[token] = url }

  audio = Telegram::Bot::Types::InlineKeyboardButton.new(text: "🎵 Audio (mp3)", callback_data: "dl:#{token}:mp3")
  buttons = [audio]
  unless audio_only
    buttons << Telegram::Bot::Types::InlineKeyboardButton.new(text: "🎬 Video (mp4)", callback_data: "dl:#{token}:mp4")
  end
  Telegram::Bot::Types::InlineKeyboardMarkup.new(inline_keyboard: [buttons])
end

def handle_callback(bot, cb)
  data = cb.data.to_s
  case data
  when /\Adl:/ then handle_format_choice(bot, cb, data)
  when /\Aqv:/ then handle_quality_choice(bot, cb, data)
  end
end

def handle_format_choice(bot, cb, data)
  _cmd, token, ext = data.split(":")

  if ext == "mp4"
    url = PENDING_MUTEX.synchronize { PENDING[token] }
    if url.nil?
      bot.api.answer_callback_query(callback_query_id: cb.id, text: "Request expired, send the link again.")
      return
    end
    bot.api.answer_callback_query(callback_query_id: cb.id)
    buttons = [480, 720, 1080].map do |h|
      Telegram::Bot::Types::InlineKeyboardButton.new(text: "#{h}p", callback_data: "qv:#{token}:#{h}")
    end
    bot.api.send_message(
      chat_id: cb.message.chat.id,
      text: "Pick a video quality:",
      reply_markup: Telegram::Bot::Types::InlineKeyboardMarkup.new(inline_keyboard: [buttons])
    )
    return
  end

  url = PENDING_MUTEX.synchronize { PENDING.delete(token) }
  if url.nil?
    bot.api.answer_callback_query(callback_query_id: cb.id, text: "Request expired, send the link again.")
    return
  end

  chat_id = cb.message.chat.id
  bot.api.answer_callback_query(callback_query_id: cb.id)
  bot.api.send_message(chat_id: chat_id, text: "Downloading audio...")

  Thread.new do
    begin
      send_file(bot, chat_id, url, "mp3")
    rescue StandardError => e
      bot.api.send_message(chat_id: chat_id, text: "Unexpected error: #{e.message}")
    end
  end
end

def handle_quality_choice(bot, cb, data)
  _cmd, token, height = data.split(":")
  url = PENDING_MUTEX.synchronize { PENDING.delete(token) }
  if url.nil?
    bot.api.answer_callback_query(callback_query_id: cb.id, text: "Request expired, send the link again.")
    return
  end

  chat_id = cb.message.chat.id
  bot.api.answer_callback_query(callback_query_id: cb.id)
  bot.api.send_message(chat_id: chat_id, text: "Downloading video (#{height}p)...")

  Thread.new do
    begin
      send_file(bot, chat_id, url, "mp4", height.to_i)
    rescue StandardError => e
      bot.api.send_message(chat_id: chat_id, text: "Unexpected error: #{e.message}")
    end
  end
end

def send_file(bot, chat_id, url, ext, height = 1080)
  ext = "mp3" if ext == "mp4" && audio_only_url?(url)

  info = track_info(url)
  title = safe_caption(info && info["title"])
  FileUtils.mkdir_p(WORKDIR)

  is_video = ext == "mp4"
  bot.api.send_chat_action(chat_id: chat_id, action: is_video ? "upload_video" : "upload_document")

  heights = is_video ? [height, 720, 480].uniq : [nil]
  path = nil
  sent = nil

  heights.each do |h|
    args = ["dl", "--dir", WORKDIR, "--ext", ext]
    args += ["--height", h.to_s] if h
    out, err, ok = core(*args, url)
    unless ok
      bot.api.send_message(chat_id: chat_id, text: friendly_error(err.to_s))
      return
    end

    out.force_encoding(Encoding::BINARY).lines.reverse_each do |line|
      if line.start_with?("RESULT:")
        path = line.sub("RESULT:", "").strip.force_encoding(Encoding::UTF_8)
        break
      end
    end
    if path.nil? || !File.file?(path)
      bot.api.send_message(chat_id: chat_id, text: "Download finished but the file is missing.")
      return
    end

    mb = File.size(path) / 1024.0 / 1024.0
    if mb <= MAX_MB
      sent = h
      break
    end

    FileUtils.rm_f(path)
    path = nil
  end

  if path.nil?
    bot.api.send_message(chat_id: chat_id, text: "This file is over #{MAX_MB} MB even at the lowest quality — can't send it.")
    return
  end

  if is_video && sent && sent != height
    bot.api.send_message(chat_id: chat_id, text: "The video was over #{MAX_MB} MB, so I lowered the quality to #{sent}p.")
  end

  if is_video
    bot.api.send_video(
      chat_id: chat_id,
      video: Faraday::UploadIO.new(path, "video/mp4"),
      caption: title,
      supports_streaming: true
    )
  else
    bot.api.send_audio(
      chat_id: chat_id,
      audio: Faraday::UploadIO.new(path, "audio/mpeg"),
      caption: title
    )
  end
ensure
  FileUtils.rm_f(path) if path && File.file?(path)
end

Telegram::Bot::Client.run(TOKEN, url: BOT_API_URL) do |bot|
  bot.logger = Logger.new($stderr)
  bot.logger.level = Logger::INFO
  bot.logger.info("XDownloader bot started")
  begin
    bot.api.set_my_commands(
      commands: [
        { command: "start", description: "Start the bot" },
        { command: "help", description: "How it works" }
      ]
    )
    bot.logger.info("set_my_commands ok")
  rescue StandardError => e
    bot.logger.warn("set_my_commands failed: #{e.message}")
  end
  bot.listen do |update|
    case update
    when Telegram::Bot::Types::CallbackQuery
      handle_callback(bot, update)
    when Telegram::Bot::Types::Message
      next if update.text.nil?

      text = update.text.strip
      case text
      when "/start"
        bot.api.send_message(chat_id: update.chat.id, text: "Hi! I'm your pocket DJ. Send me a link — YouTube, Spotify, SoundCloud, TikTok, Instagram and more — and I'll fetch it for you.")
      when "/help"
        bot.api.send_message(chat_id: update.chat.id, text: "Paste any media link (YouTube, Spotify, SoundCloud, TikTok, Instagram, Reddit, Facebook, Pinterest, Likee and more), then pick a format. Works here and in groups.")
      else
        url = extract_url(text)
        if url.nil?
          bot.api.send_message(chat_id: update.chat.id, text: "I need a media link.")
          next
        end
        audio_only = audio_only_url?(url)
        bot.api.send_message(
          chat_id: update.chat.id,
          text: audio_only ? "Got it! This platform is audio only." : "Got it! Pick a format:",
          reply_markup: format_buttons(url, audio_only)
        )
      end
    end
  end
end