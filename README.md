# ALTAR-Eyes

Live camera streaming server — receives JPEG frames from hardware over WebSocket and displays them in a real-time browser dashboard.

## How it works

```
Camera ──ws──▶ ALTAR-Eyes ──ws──▶ Browser
               (server)          (dashboard)
```

- Hardware (e.g. ESP32-CAM, Raspberry Pi) connects via WebSocket and streams raw JPEG frames.
- Each frame is prefixed with a 4-byte little-endian Unix timestamp.
- The server strips the timestamp, validates the JPEG header, and broadcasts the raw JPEG to all connected viewers.
- The browser page shows a surveillance-style dashboard with live feeds.

## Endpoints

| Path | Direction | Description |
|---|---|---|
| `/broadcast/left` | hardware → server | Left camera sends frames |
| `/broadcast/right` | hardware → server | Right camera sends frames |
| `/view/left` | server → browser | Browser receives left feed |
| `/view/right` | server → browser | Browser receives right feed |
| `/` | server → browser | Live dashboard HTML page |

## Frame format

All frames sent to `/broadcast/*` must follow this binary layout:

```
Bytes 0-3   : Unix timestamp (UInt32LE)
Bytes 4...  : JPEG data (starts with 0xFF 0xD8, ends with 0xFF 0xD9)
```

Minimum payload: 5 bytes. Frames smaller than 5 bytes or missing a valid JPEG header are silently dropped.

## Quick start

```bash
# Install dependencies
npm install

# Start the server
npm start
# or
node index.js
```

Open `http://localhost:8080` in a browser (two monitors showing "No Signal").

### Simulate a camera

```bash
# Simulate the left camera
node test-feed.js left

# Simulate the right camera (separate terminal)
node test-feed.js right
```

The dashboard monitors will show the test images in real time.

## Deploy to Render

1. Push this repo to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com), create a **New Web Service**.
3. Connect your GitHub repo.
4. Render auto-detects Node.js — leave the default settings.
5. Click **Create Web Service**.

The server listens on `process.env.PORT` (Render sets this automatically).

> **Free tier note:** The server spins down after 15 minutes of inactivity. Keep a browser tab open to prevent this during testing.

## Hardware integration example (ESP32)

```cpp
#include <WebSocketsClient.h>

WebSocketsClient ws;

void loop() {
  ws.loop();

  // Capture JPEG frame
  camera_fb_t *fb = esp_camera_fb_get();

  // Build payload: 4-byte timestamp + JPEG
  uint32_t ts = esp_timer_get_time() / 1000000;
  uint8_t header[4];
  header[0] = ts & 0xFF;
  header[1] = (ts >> 8) & 0xFF;
  header[2] = (ts >> 16) & 0xFF;
  header[3] = (ts >> 24) & 0xFF;

  ws.sendBIN(header, 4);
  ws.sendBIN(fb->buf, fb->len);

  esp_camera_fb_return(fb);
}
```

Connect to `ws://your-server.onrender.com/broadcast/left` (or `/broadcast/right`).

## Tech

- **Runtime:** Node.js
- **WebSocket:** ws (v8)
- **Transport:** Binary frames (raw JPEG)
