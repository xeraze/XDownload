# Privacy Policy — XDownload

_Last updated: September 2026_

## What the bot does

XDownload is a Telegram bot for personal use. You send a link, choose a format (audio or video) and, for video, a quality — the bot processes the link with [yt-dlp](https://github.com/yt-dlp/yt-dlp) and sends the resulting file back to you in chat.

## What is stored

**Nothing.** The bot does not keep a database, does not log links, files, or messages, and does not retain any user identifiers beyond what Telegram itself requires to deliver the response.

The link you send is used only to fetch and process the requested media in memory/temporary storage for the duration of that single request. Once the file is sent back to you, nothing related to that request remains on the server.

## Third parties

The bot does not use any third-party download APIs or external services. Downloading is handled entirely by the bot's own instance of yt-dlp, running on infrastructure controlled by the bot operator. No user data is shared with, or passed to, any outside party.

## Telegram platform data

Standard Telegram Bot API interactions apply — Telegram itself handles message delivery between you and the bot. This policy covers only what the bot does with your data beyond that; it does not cover Telegram's own data practices, which are described in [Telegram's Privacy Policy](https://telegram.org/privacy).

## Your responsibility

You are responsible for the content of the links you submit and for complying with the terms of service of the platform the link points to (YouTube, Instagram, TikTok, etc.), as well as any applicable copyright law in your jurisdiction. The bot is provided for personal use only.

## Changes

If this policy changes, the updated version will be published in this repository.

## Contact

Questions about this policy can be raised through the repository's issue tracker.
