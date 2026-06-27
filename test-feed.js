const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const side = (process.argv[2] || 'left').toLowerCase();
if (side !== 'left' && side !== 'right') {
  console.error('Usage: node test-feed.js [left|right]');
  process.exit(1);
}

const JPEG_PATH = path.join(__dirname, side === 'left' ? 'test-image.jpg' : 'test-image-right.jpg');
const url = `ws://localhost:8080/broadcast/${side}`;

const ws = new WebSocket(url, { perMessageDeflate: false });

ws.on('open', () => {
  console.log(`${side} camera connected, sending test image...`);

  let jpeg;
  try {
    jpeg = fs.readFileSync(JPEG_PATH);
  } catch {
    console.error(`Put a JPEG at ${JPEG_PATH} first`);
    ws.close();
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = Buffer.alloc(4 + jpeg.length);
  payload.writeUInt32LE(timestamp, 0);
  jpeg.copy(payload, 4);

  const interval = setInterval(() => {
    payload.writeUInt32LE(Math.floor(Date.now() / 1000), 0);
    ws.send(payload);
    console.log(`[${side}] Sent ${jpeg.length} bytes`);
  }, 1000);

  setTimeout(() => {
    clearInterval(interval);
    ws.close();
  }, 30000);
});

ws.on('error', console.error);