# YouTube Subtitle AI Writer · 2026-11-08

URL: `/youtube-subtitle-writer/`

## Implemented
- Fork Wikipedia Writer UI/UX layout and use its shared Reddit-light CSS, AI discovery (Gemini first, Groq fallback), Google OAuth, Google Sheets vocabulary and Drive backup.
- Replace Wikipedia URL ingestion with directly pasted YouTube subtitle text (plain text, SRT or VTT). No scraping or YouTube API.
- Normalize timestamp cues, limit input to 50,000 characters, send up to 16,000 characters of cleaned transcript to model.
- Dedicated FIFO queue localStorage key; individual queue results require manual review before Sheet writes.
- Dedicated Drive backup file name/prefix/schema so restored sessions do not mix with Wikipedia writer.
- Registered Vite multipage entry and Editor **Truy cập nhanh** shortcut.

## Editorial safeguards
Content is AI-generated from user-provided and unverified subtitles, not an authenticated representation of the video. Require human fact checking. Never put AI credentials in a committed file. OAuth must be configured as for the existing Editor.

## Test checklist
- Build Vite and verify `/youtube-subtitle-writer/` route resolves.
- Paste plain subtitles and SRT/VTT; reject empty and excessively long inputs.
- Generate with Gemini/Groq valid API key; verify validation, progress and fallback.
- Enqueue two subtitles, review both results, ensure original Wikipedia queue is isolated.
- Test Drive backups/restores and Sheet append with authorized test account.
- Check Editor quick access desktop/mobile and preservation of existing shortcuts.

No claim of production deployment or full end-to-end API testing is made in this document.
