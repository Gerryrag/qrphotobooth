# PRODUCT REQUIREMENTS DOCUMENT (PRD)
**Project Name:** QR Live Photobooth & Wedding Gallery (MVP Local Prototype)  
**Architecture:** Ultra-Lightweight Monolith (RAM < 70MB)  
**Target Environment:** Local Laptop Server (Monitor Display) + Mobile Phone Browser (Guest Camera)

---

## 1. PROJECT OVERVIEW & OBJECTIVE
Build a real-time web application where wedding/event guests scan a QR code on their phone, take a selfie with a live decorative wedding frame overlay, write a short congratulatory message, and submit it. Within 1 second of submission, the photo and message must automatically pop up on the Laptop/Projector screen (`live.html`) via WebSockets without refreshing the page.

## 2. STRICT TECHNICAL CONSTRAINTS (CRITICAL FOR AI AGENT)
1. **NO Heavy Frontend Frameworks:** Do NOT use React, Vue, Next.js, or Vite. Use pure **HTML5, Vanilla JavaScript, and Tailwind CSS via CDN**.
2. **Backend Stack:** **Node.js + Express.js + Socket.io + SQLite (`sqlite3`)**.
3. **Zero Missing Assets (Self-Contained Frame):** Since no external `.png` frame is uploaded yet, you MUST programmatically draw an aesthetic transparent wedding frame overlay (gold/white border + bottom banner text: *"The Wedding of Romeo & Juliet"*) directly using **HTML5 2D Canvas API** so the app works 100% out-of-the-box. Also support loading an optional `/frames/custom-frame.png` if the user drops a file there later.
4. **High Payload Limit:** Set `express.json({ limit: '15mb' })` to handle Base64 image uploads smoothly.
5. **Client-Side Compression:** Compress the captured `<canvas>` image on the phone browser using `canvas.toDataURL('image/jpeg', 0.75)` (~150KB–250KB) before sending it to the backend.

---

## 3. DIRECTORY STRUCTURE TO GENERATE
Create the exact folder and file structure below:

```text
.
├── public/
│   ├── frames/              # Auto-created directory for custom PNG frames
│   ├── uploads/             # Auto-created directory to store guest .jpg photos
│   ├── camera.html          # Mobile-first Guest Camera UI + Canvas Merger
│   └── live.html            # 16:9 Widescreen Projector/TV Live Slideshow UI
├── database.db              # SQLite database file (auto-generated on startup)
├── server.js                # Express + Socket.io + SQLite Backend
└── package.json             # Dependencies and start script
```

---

## 4. DETAILED MODULE SPECIFICATIONS

### Module 1: `package.json`
Initialize and install only lightweight packages:
- Dependencies: `express`, `socket.io`, `sqlite3`, `cors`
- Scripts: `"start": "node server.js"`

### Module 2: Backend Server (`server.js`)
1. **Directory Initialization:** On startup, use `fs.mkdirSync(..., { recursive: true })` to ensure `public/uploads` and `public/frames` exist.
2. **SQLite Database (`database.db`):**
   Auto-create table `photos` if it does not exist:
   - `id`: INTEGER PRIMARY KEY AUTOINCREMENT
   - `guest_name`: TEXT NOT NULL
   - `message`: TEXT NOT NULL
   - `image_url`: TEXT NOT NULL
   - `created_at`: DATETIME DEFAULT CURRENT_TIMESTAMP
3. **API Endpoints:**
   - `GET /api/photos`: Return the latest 50 photos ordered by `id DESC` as JSON.
   - `POST /api/upload`:
     - Receive JSON `{ guest_name, message, image_base64 }`.
     - Strip the `data:image/jpeg;base64,` prefix, convert to a Buffer, and save as `public/uploads/photo_${Date.now()}.jpg`.
     - Insert record into SQLite `photos` table.
     - Broadcast the new photo object immediately to all connected clients via `io.emit('new_photo', newPhotoData)`.
     - Return `{ success: true, data: newPhotoData }`.
   - `DELETE /api/photos/:id`: (Bonus utility) Delete a photo from DB and disk.
4. **Server Listener:** Listen on `PORT = 3000` and host `0.0.0.0` so mobile devices on the same network or Cloudflare Tunnel can connect.

### Module 3: Guest Mobile Camera (`public/camera.html`)
1. **UI/UX Layout:** Mobile-first container (`max-w-md mx-auto min-h-screen bg-slate-900 text-white`).
2. **Camera Stream & Fallback:**
   - Start camera automatically via `navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } }, audio: false })`.
   - Include a **"Switch Camera (Depan/Belakang)"** button.
   - **IMPORTANT FALLBACK:** Include an **"Ambil dari Galeri / Kamera HP"** (`<input type="file" accept="image/*" capture="user">`) button so if the user tests via non-HTTPS local IP (`http://192.168.x.x:3000`) where `getUserMedia` is blocked by the browser, they can still take a photo and test the full flow!
3. **Canvas Frame Merging (3:4 Portrait Ratio - 720x960px):**
   - Draw the video frame or uploaded image onto a 720x960 `<canvas>` (crop center/object-cover style so it doesn't stretch).
   - If using front camera, mirror the video horizontally so selfies look natural.
   - Draw an elegant wedding frame overlay on top of the canvas:
     - Inner decorative gold/white border line.
     - Semi-transparent dark gradient at the bottom.
     - Elegant serif text at the bottom: **"The Wedding of Romeo & Juliet"** and current date.
4. **Form & Submission Flow:**
   - Step 1: Preview live camera -> Click **"Jepret Foto"** (with 3-2-1 countdown overlay).
   - Step 2: Show merged photo preview + **"Foto Ulang"** button + Input **Nama Tamu** & **Ucapan Doa**.
   - Step 3: Click **"Kirim ke Layar Utama"** -> POST to `/api/upload` -> Show celebratory success alert and button to take another photo.

### Module 4: Live Projector Display (`public/live.html`)
1. **UI/UX Layout:** Widescreen TV/Projector layout (`h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 text-white`).
2. **Main Display Area (Left/Center):**
   - Large spotlight card showing the currently active photo (`max-h-[80vh]`), guest name in bold gold text, message in large readable quotation text, and timestamp.
3. **Sidebar / Bottom Strip & QR Code Widget (Right):**
   - Display a clean card instructing guests how to join: *"Scan QR untuk Kirim Foto ke Layar!"*.
   - Automatically generate a QR Code pointing to `window.location.origin + '/camera.html'` using `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=...` so the user can scan the laptop screen directly with their phone!
   - Below the QR card, show a grid/strip of the last 6 recent photos.
4. **Slideshow & Socket.io Interruption Logic:**
   - Fetch initial photos from `GET /api/photos` on load and cycle through them every 5 seconds with smooth fade transitions.
   - Listen to `socket.on('new_photo', (photo) => { ... })`.
   - When a new photo arrives:
     - Play a subtle chime effect (using Web Audio API synth beep, no external MP3 needed).
     - Show a glowing badge: **"✨ FOTO BARU MASUK! ✨"**.
     - Immediately display the new photo on the main spotlight and pause the regular slideshow timer for **10 seconds** before resuming rotation.

---

## 5. EXECUTION INSTRUCTIONS FOR AI AGENT
1. Create all folders and files (`package.json`, `server.js`, `public/camera.html`, `public/live.html`) completely without placeholders or `// TODO` comments.
2. Run `npm install` in the terminal to install dependencies.
3. Start the server or verify there are no syntax errors, then inform the user that the app is ready at `http://localhost:3000/live.html` and `http://localhost:3000/camera.html`.