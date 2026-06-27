const { createServer } = require("http");
const { WebSocketServer } = require("ws");
const fs = require("fs");
const path = require("path");

// --- 1. Store viewers for each camera ---
const leftViewers = new Set();
const rightViewers = new Set();

// --- 2. Create the HTTP server ---
const server = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ALTAR-Eyes Live Feed</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              background: #0a0a0a;
              height: 100vh;
              display: flex;
              flex-direction: column;
              font-family: 'Segoe UI', system-ui, sans-serif;
            }
            .header {
              background: #111;
              padding: 12px 24px;
              border-bottom: 2px solid #1a3a1a;
              display: flex;
              align-items: center;
              gap: 12px;
              flex-shrink: 0;
            }
            .header h1 {
              color: #00cc00;
              font-size: 18px;
              font-weight: 600;
              letter-spacing: 1px;
              text-transform: uppercase;
            }
            .header .dot {
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: #00cc00;
              animation: blink 1.5s infinite;
            }
            @keyframes blink { 50% { opacity: 0.3; } }
            .header .status {
              color: #666;
              font-size: 12px;
              margin-left: auto;
            }
            .monitors {
              flex: 1;
              display: flex;
              gap: 6px;
              padding: 6px;
              background: #050505;
            }
            .monitor {
              flex: 1;
              background: #000;
              border: 2px solid #222;
              border-radius: 4px;
              display: flex;
              flex-direction: column;
              position: relative;
              overflow: hidden;
            }
            .monitor.active { border-color: #1a3a1a; }
            .monitor-label {
              position: absolute;
              top: 10px;
              left: 14px;
              color: rgba(0, 204, 0, 0.6);
              font-size: 13px;
              font-weight: 600;
              letter-spacing: 2px;
              text-transform: uppercase;
              z-index: 2;
              text-shadow: 0 0 8px rgba(0,0,0,0.8);
            }
            .monitor img {
              flex: 1;
              width: 100%;
              object-fit: contain;
              display: block;
            }
            .no-signal {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              color: #333;
              font-size: 14px;
              letter-spacing: 1px;
              text-transform: uppercase;
              gap: 8px;
            }
            .no-signal .icon { font-size: 32px; opacity: 0.3; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="dot"></div>
            <h1>ALTAR-Eyes</h1>
            <span class="status">LIVE FEED</span>
          </div>
          <div class="monitors">
            <div class="monitor" id="monitor-left">
              <div class="monitor-label">CAM 01 &mdash; LEFT</div>
              <div class="no-signal" id="noise-left">
                <div class="icon">&#9673;</div>
                <span>No Signal</span>
              </div>
              <img id="left" style="display:none" />
            </div>
            <div class="monitor" id="monitor-right">
              <div class="monitor-label">CAM 02 &mdash; RIGHT</div>
              <div class="no-signal" id="noise-right">
                <div class="icon">&#9673;</div>
                <span>No Signal</span>
              </div>
              <img id="right" style="display:none" />
            </div>
          </div>
     <script>
  function makeViewer(path, imgId, noiseId, monitorId) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(proto + '//' + location.host + path);
    ws.binaryType = 'arraybuffer';
    const img = document.getElementById(imgId);
    const noise = document.getElementById(noiseId);
    const monitor = document.getElementById(monitorId);
    let currentUrl;
    ws.onmessage = (event) => {
      const blob = new Blob([event.data], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      img.src = url;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = url;
      img.style.display = 'block';
      noise.style.display = 'none';
      monitor.classList.add('active');
    };
    ws.onclose = () => {
      img.style.display = 'none';
      noise.style.display = 'flex';
      monitor.classList.remove('active');
    };
    ws.onerror = () => {
      img.style.display = 'none';
      noise.style.display = 'flex';
      monitor.classList.remove('active');
    };
  }
  makeViewer('/view/left', 'left', 'noise-left', 'monitor-left');
  makeViewer('/view/right', 'right', 'noise-right', 'monitor-right');
</script>
        </body>
      </html>
    `);
    return;
  }
  res.writeHead(404);
  res.end();
});

// --- 3. Helper to broadcast a frame to a viewer set ---
function broadcast(viewers, jpegBuffer) {
  if (viewers.size === 0) return;
  const dead = [];
  for (const viewer of viewers) {
    if (viewer.readyState === 1) {
      viewer.send(jpegBuffer);
    } else {
      dead.push(viewer);
    }
  }
  dead.forEach((v) => viewers.delete(v));
}

// --- 4. Single WebSocket server, route by path ---
const wss = new WebSocketServer({ server, perMessageDeflate: false });

wss.on("connection", (ws, req) => {
  const pathname = req.url.split("?")[0];

  // --- Hardware paths ---
  if (pathname === "/broadcast/left") {
    console.log(`📷 Left camera connected`);
    ws.on("message", (data) => handleFrame(data, "LEFT", leftViewers));
    ws.on("close", () => console.log(`📷 Left camera disconnected`));
    return;
  }

  if (pathname === "/broadcast/right") {
    console.log(`📷 Right camera connected`);
    ws.on("message", (data) => handleFrame(data, "RIGHT", rightViewers));
    ws.on("close", () => console.log(`📷 Right camera disconnected`));
    return;
  }

  // --- Viewer paths ---
  const viewerMap = { "/view/left": leftViewers, "/view/right": rightViewers };
  const targetViewers = viewerMap[pathname];

  if (targetViewers) {
    const label = pathname === "/view/left" ? "LEFT" : "RIGHT";
    console.log(`👀 ${label} viewer connected (Total: ${targetViewers.size + 1})`);
    targetViewers.add(ws);

    ws.on("close", () => {
      targetViewers.delete(ws);
      console.log(`👀 ${label} viewer disconnected (Total: ${targetViewers.size})`);
    });

    ws.on("pong", () => {});
    const interval = setInterval(() => {
      if (ws.readyState === 1) ws.ping();
    }, 30000);
    ws.on("close", () => clearInterval(interval));
    return;
  }
});

// --- 5. Shared frame handler ---
function handleFrame(data, label, viewers) {
  try {
    if (data.length < 5) {
      console.warn(`${label} payload too small`);
      return;
    }

    const timestamp = data.readUInt32LE(0);
    const date = new Date(timestamp * 1000);
    const jpegBuffer = data.subarray(4);

    if (
      jpegBuffer.length < 2 ||
      jpegBuffer[0] !== 0xff ||
      jpegBuffer[1] !== 0xd8
    ) {
      console.warn(`${label} invalid JPEG header`);
      return;
    }

    console.log(
      `${label} frame (${jpegBuffer.length} bytes, ${date.toISOString()})`,
    );

    broadcast(viewers, jpegBuffer);
  } catch (error) {
    console.error(`${label} error:`, error.message);
  }
}

// --- 6. Start the server ---
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Cameras: ws://localhost:${PORT}/broadcast/left`);
  console.log(`         ws://localhost:${PORT}/broadcast/right`);
  console.log(`Viewers: http://localhost:${PORT}`);
});
