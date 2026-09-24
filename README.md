<p align="center">
  <img src="assets/XDownload Logo.jpg" alt="XDownload" width="160" />
</p>

<h1 align="center">XDownload</h1>

<p align="center">
  Telegram bot that downloads <b>audio & video</b> from a link — private chats and groups.
</p>

<p align="center">
  <b>Fast · Simple · Free</b><br/>
  Send a link → pick a format → get the file
</p>

<p align="center">
  <img src="assets/XDownload Banner.jpg" alt="XDownload Banner" width="720" />
</p>

---

## Supported platforms

| Platform | Audio | Video |
|---|:---:|:---:|
| **YouTube** / **YouTube Music** | ✅ | ✅ 480–1080p |
| **Spotify** | ✅ 320 kbps | — |
| **SoundCloud** | ✅ | — |
| **TikTok** | ✅ | ✅ |
| **Instagram** | ✅ | ✅ |
| **Facebook** | ✅ | ✅ |
| **Reddit** | ✅ | ✅ |
| **Pinterest** | ✅ | ✅ |
| **VK** | ✅ | ✅ |
| **X (Twitter)** | ✅ | ✅ |
| **Rumble** | ✅ | ✅ |
| **Snapchat Spotlight** | ✅ | ✅ |

Only the platforms in this table are accepted (allowlist).  
**Not supported:** Threads, random other sites.

**Rate limit:** **1 link / 5 seconds** per user (anti-spam, `XDL_COOLDOWN_SEC`). Format and quality buttons have no cooldown; only one download runs at a time per user.

---

## How to use

1. Open the bot in Telegram and press **Start**.
2. Paste any link from the table above (private or group chat).
3. Choose **🎵 Audio (mp3)** or **🎬 Video (mp4)**.
4. For video pick quality: **480 / 720 / 1080**.
5. The file comes back into the chat — save or forward it.

Spotify and SoundCloud are audio-only, so the bot shows only the audio button.

---

## Stack

| Piece | Tech |
|---|---|
| Bot / UX | Ruby (`telegram-bot-ruby`) |
| Download engine | Go (`xcore` — single binary) |
| Extraction | yt-dlp + ffmpeg |
| Spotify | spotdl |

---

## Run (self-hosted)

```powershell
# deps: Go, Ruby+bundler, yt-dlp, ffmpeg, deno, spotdl
.\run_bot.ps1 -Token <BOT_TOKEN>
```

Local Bot API server (optional, for files &gt; 50 MB): `.\run_botapi.ps1`

---

## Notes

- Personal / self-host use. Downloading from YouTube or Spotify may violate their terms of service; Telegram can block public music bots.
- Private, age-restricted, or region-locked media may fail.
- Public Bot API limited to ~50 MB; local Bot API raises the limit.

Privacy: [docs/privacy-policy.md](docs/privacy-policy.md)
