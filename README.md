# NexDownloader

A local download manager for direct HTTP/HTTPS media links and supported public video pages.

## Features

- Queue direct media URLs and supported video-platform pages.
- Track transfer progress and received size when the server provides a content length.
- Pause, resume, cancel, retry failed transfers, and clear completed entries.
- Keep queue metadata in local browser storage across reloads.
- Filter the queue by all, active, or completed downloads.

## Run

Install Python 3 and Node.js, then install the video extractor and start the local service:

```powershell
python -m pip install -r requirements.txt
node server.js
```

Open `http://127.0.0.1:4173` in your browser. Keep the server running while downloading. If port 4173 is occupied, set `PORT` to another port before starting the server.

## Limits

Direct media URLs are proxied by the local service, avoiding browser CORS restrictions. Supported platform pages use yt-dlp and select the best single-file MP4 format when available, or the best single-file format otherwise. This avoids requiring ffmpeg but may limit resolution or format options. The app does not bypass DRM, authentication, or access controls; only download content you own or are permitted to access. Downloads are buffered in browser memory before saving, so very large files may exceed available memory. Queue metadata is saved locally, but an interrupted transfer restarts from the beginning after a page reload.
