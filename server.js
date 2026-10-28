const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server({
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
io.attach(server);

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const HOST = '0.0.0.0';

// Check for SSL certificates for HTTPS (Required for mobile in-browser camera)
let httpsServer = null;
const keyPath = path.join(__dirname, 'key.pem');
const certPath = path.join(__dirname, 'cert.pem');
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  try {
    httpsServer = https.createServer({
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    }, app);
    io.attach(httpsServer);
  } catch (sslErr) {
    console.warn('Could not initialize HTTPS server:', sslErr.message);
  }
}

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const framesDir = path.join(__dirname, 'public', 'frames');

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(framesDir, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// SQLite Database Setup
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at database.db');
  }
});

// Initialize database schema
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_name TEXT NOT NULL,
      message TEXT NOT NULL,
      image_url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating photos table:', err.message);
    } else {
      console.log('Photos table verified/initialized.');
    }
  });
});

// Helper to get public tunnel URL if active
function getPublicUrl() {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.trim();
  }
  const tunnelFile = path.join(__dirname, 'tunnel_url.txt');
  if (fs.existsSync(tunnelFile)) {
    try {
      const content = fs.readFileSync(tunnelFile, 'utf8').trim();
      if (content.startsWith('http')) return content.replace(/\/$/, '');
    } catch (e) {}
  }
  return null;
}

// Helper to get local IP addresses for easy mobile testing
function getLocalNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

// Routes
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// GET /api/server-info: Returns IP and recommended camera URL
app.get('/api/server-info', (req, res) => {
  const localIPs = getLocalNetworkAddresses();
  const lanIp = localIPs.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.')) || localIPs[0] || 'localhost';
  const publicBaseUrl = getPublicUrl();
  const hasHttps = !!httpsServer || !!publicBaseUrl;
  const cameraUrl = publicBaseUrl 
    ? `${publicBaseUrl}/camera.html` 
    : (httpsServer ? `https://${lanIp}:${HTTPS_PORT}/camera.html` : `http://${lanIp}:${PORT}/camera.html`);

  res.json({
    port: PORT,
    httpsPort: httpsServer ? HTTPS_PORT : null,
    hasHttps,
    primaryIp: lanIp,
    publicBaseUrl,
    cameraUrl,
    httpCameraUrl: `http://${lanIp}:${PORT}/camera.html`,
    httpsCameraUrl: hasHttps ? cameraUrl : null,
    addresses: localIPs
  });
});

// GET /api/qr: Generate QR Code on-the-fly (Works 100% offline)
app.get('/api/qr', async (req, res) => {
  try {
    const localIPs = getLocalNetworkAddresses();
    const lanIp = localIPs.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.')) || localIPs[0] || 'localhost';
    const publicBaseUrl = getPublicUrl();
    const defaultUrl = publicBaseUrl 
      ? `${publicBaseUrl}/camera.html` 
      : (httpsServer ? `https://${lanIp}:${HTTPS_PORT}/camera.html` : `http://${lanIp}:${PORT}/camera.html`);
    const targetUrl = req.query.url || defaultUrl;

    const qrBuffer = await QRCode.toBuffer(targetUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(qrBuffer);
  } catch (err) {
    console.error('Error generating QR code:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// GET /api/photos: Get latest 50 photos
app.get('/api/photos', (req, res) => {
  const query = 'SELECT * FROM photos ORDER BY id DESC LIMIT 50';
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching photos:', err.message);
      return res.status(500).json({ error: 'Failed to retrieve photos' });
    }
    res.json(rows);
  });
});

// POST /api/upload: Upload photo with message and guest name
app.post('/api/upload', (req, res) => {
  try {
    const { guest_name, message, image_base64 } = req.body;

    if (!guest_name || !message || !image_base64) {
      return res.status(400).json({
        error: 'Missing required fields: guest_name, message, and image_base64 are required'
      });
    }

    // Sanitize and validate base64
    const matches = image_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const cleanBase64 = matches ? matches[2] : image_base64;
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Invalid image data' });
    }

    const filename = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFile(filePath, buffer, (writeErr) => {
      if (writeErr) {
        console.error('Failed to save photo file:', writeErr);
        return res.status(500).json({ error: 'Failed to save image file' });
      }

      const imageUrl = `/uploads/${filename}`;
      const insertQuery = `
        INSERT INTO photos (guest_name, message, image_url, created_at)
        VALUES (?, ?, ?, datetime('now', 'localtime'))
      `;

      db.run(insertQuery, [guest_name.trim(), message.trim(), imageUrl], function (dbErr) {
        if (dbErr) {
          console.error('Failed to insert photo record into DB:', dbErr.message);
          return res.status(500).json({ error: 'Failed to record photo in database' });
        }

        const newId = this.lastID;
        db.get('SELECT * FROM photos WHERE id = ?', [newId], (selectErr, row) => {
          if (selectErr || !row) {
            console.error('Failed to query inserted row:', selectErr);
            const fallbackData = {
              id: newId,
              guest_name: guest_name.trim(),
              message: message.trim(),
              image_url: imageUrl,
              created_at: new Date().toISOString()
            };
            io.emit('new_photo', fallbackData);
            return res.json({ success: true, data: fallbackData });
          }

          // Broadcast immediately to all connected clients
          io.emit('new_photo', row);
          return res.json({ success: true, data: row });
        });
      });
    });
  } catch (err) {
    console.error('Unexpected error in /api/upload:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/photos/:id: Delete photo (utility)
app.delete('/api/photos/:id', (req, res) => {
  const photoId = req.params.id;
  db.get('SELECT * FROM photos WHERE id = ?', [photoId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const relativePath = row.image_url.replace(/^\//, '');
    const absolutePath = path.join(__dirname, 'public', relativePath);

    fs.unlink(absolutePath, (unlinkErr) => {
      if (unlinkErr && unlinkErr.code !== 'ENOENT') {
        console.warn('Failed to delete file from disk:', unlinkErr.message);
      }

      db.run('DELETE FROM photos WHERE id = ?', [photoId], (delErr) => {
        if (delErr) {
          return res.status(500).json({ error: 'Failed to delete record from DB' });
        }
        io.emit('photo_deleted', { id: Number(photoId) });
        return res.json({ success: true, message: 'Photo deleted successfully' });
      });
    });
  });
});

// Socket.io Connection Handling
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// Start Server
server.listen(PORT, HOST, () => {
  const localIPs = getLocalNetworkAddresses();
  const lanIp = localIPs.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.')) || localIPs[0] || 'localhost';

  console.log('==================================================');
  console.log(`  QR Live Photobooth & Wedding Gallery Server`);
  console.log('==================================================');
  console.log(`  Projector Display: http://localhost:${PORT}/live.html`);
  console.log(`  Guest Camera (HTTP):  http://${lanIp}:${PORT}/camera.html`);

  if (httpsServer) {
    httpsServer.listen(HTTPS_PORT, HOST, () => {
      console.log(`  Guest Camera (HTTPS): https://${lanIp}:${HTTPS_PORT}/camera.html  (RECOMMENDED FOR MOBILE BROWSER CAMERA)`);
      console.log('==================================================');
    });
  } else {
    console.log('==================================================');
  }
});

