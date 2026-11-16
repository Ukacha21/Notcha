const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateQRCodeSVG } = require('./qr-generator');

class TransferServer {
  constructor(options = {}) {
    this.port = options.port || 53317;
    this.downloadDir = path.join(os.homedir(), 'Downloads', 'Notcha Transfers');
    this.historyFile = path.join(this.downloadDir, '.transfers_history.json');
    this.server = null;
    this.activeIp = '127.0.0.1';
    this.sharedFiles = []; // files shared from Mac -> mobile [{ id, name, size, path, url }]
    this.history = [];
    this.onTransferReceived = options.onTransferReceived || (() => {});

    this.ensureDownloadDir();
    this.loadHistory();
  }

  ensureDownloadDir() {
    try {
      if (!fs.existsSync(this.downloadDir)) {
        fs.mkdirSync(this.downloadDir, { recursive: true });
      }
    } catch (err) {
      console.error('Failed to create Notcha Transfers dir:', err);
    }
  }

  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const raw = fs.readFileSync(this.historyFile, 'utf8');
        this.history = JSON.parse(raw);
      }
    } catch (_) {
      this.history = [];
    }
  }

  saveHistory() {
    try {
      this.ensureDownloadDir();
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history.slice(0, 100), null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save transfer history:', err);
    }
  }

  getLocalIps() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return ips;
  }

  getPrimaryIp() {
    const ips = this.getLocalIps();
    // Prefer 192.168.x.x, then 10.x.x.x, then any non-internal
    const preferred = ips.find((ip) => ip.startsWith('192.168.')) ||
                      ips.find((ip) => ip.startsWith('10.')) ||
                      ips[0] || '127.0.0.1';
    return preferred;
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  categorizeFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    const images = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.heic', '.bmp', '.tiff'];
    const videos = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'];
    const docs = ['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.md', '.csv', '.json'];
    const archives = ['.zip', '.tar', '.gz', '.rar', '.7z', '.dmg'];

    if (images.includes(ext)) return 'images';
    if (videos.includes(ext)) return 'videos';
    if (docs.includes(ext)) return 'docs';
    if (archives.includes(ext)) return 'archives';
    return 'other';
  }

  getUniqueFilePath(filename) {
    this.ensureDownloadDir();
    let dest = path.join(this.downloadDir, filename);
    if (!fs.existsSync(dest)) return dest;

    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let counter = 1;
    while (fs.existsSync(path.join(this.downloadDir, `${base} (${counter})${ext}`))) {
      counter++;
    }
    return path.join(this.downloadDir, `${base} (${counter})${ext}`);
  }

  shareFiles(filePaths) {
    if (!Array.isArray(filePaths)) return;
    for (const fp of filePaths) {
      if (fs.existsSync(fp)) {
        try {
          const stat = fs.statSync(fp);
          if (stat.isFile()) {
            const filename = path.basename(fp);
            const id = 'share_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            this.sharedFiles.unshift({
              id,
              name: filename,
              path: fp,
              size: stat.size,
              formattedSize: this.formatBytes(stat.size),
              type: this.categorizeFile(filename),
              time: Date.now(),
            });
            // Also record in history
            this.history.unshift({
              id,
              name: filename,
              path: fp,
              size: stat.size,
              formattedSize: this.formatBytes(stat.size),
              type: this.categorizeFile(filename),
              direction: 'sent',
              device: 'Local Mac',
              time: Date.now(),
            });
          }
        } catch (_) {}
      }
    }
    this.saveHistory();
  }

  clearSharedFiles() {
    this.sharedFiles = [];
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
  }

  start() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          this.port++;
          this.server.listen(this.port);
        } else {
          console.error('Transfer server error:', err);
        }
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        this.activeIp = this.getPrimaryIp();
        resolve(this.getInfo());
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  getInfo() {
    const ip = this.getPrimaryIp();
    const url = `http://${ip}:${this.port}`;
    let qrSvg = '';
    try {
      qrSvg = generateQRCodeSVG(url, 180);
    } catch (_) {}

    return {
      port: this.port,
      ip,
      url,
      hostname: os.hostname(),
      qrSvg,
      sharedFiles: this.sharedFiles,
      history: this.history,
      downloadDir: this.downloadDir,
    };
  }

  handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-filename, x-device');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // 1. Mobile Web Portal (HTML)
    if (pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(this.renderMobileHtml());
    }

    // 2. Server info API
    if (pathname === '/api/info' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(this.getInfo()));
    }

    // 3. Shared files API
    if (pathname === '/api/shared' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(this.sharedFiles));
    }

    // 4. Download file from Mac to phone
    if (pathname.startsWith('/download/') && req.method === 'GET') {
      const fileId = pathname.replace('/download/', '').trim();
      const item = this.sharedFiles.find((f) => f.id === fileId);
      if (!item || !fs.existsSync(item.path)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('File not found or no longer available.');
      }

      const stat = fs.statSync(item.path);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(item.name)}"`,
      });
      return fs.createReadStream(item.path).pipe(res);
    }

    // 5. Upload file from phone/client to Mac
    if (pathname === '/upload' && req.method === 'POST') {
      let filename = 'file_' + Date.now();
      const rawHeaderName = req.headers['x-filename'];
      if (rawHeaderName) {
        try {
          filename = decodeURIComponent(rawHeaderName);
        } catch (_) {
          filename = rawHeaderName;
        }
      }
      filename = path.basename(filename); // sanitize

      const userAgent = req.headers['user-agent'] || '';
      let clientDevice = 'Mobile Device';
      if (/iPhone|iPad|iPod/.test(userAgent)) clientDevice = 'iPhone';
      else if (/Android/.test(userAgent)) clientDevice = 'Android';
      else if (/Macintosh/.test(userAgent)) clientDevice = 'Mac';
      else if (/Windows/.test(userAgent)) clientDevice = 'Windows PC';

      const targetPath = this.getUniqueFilePath(filename);
      const writeStream = fs.createWriteStream(targetPath);
      let receivedBytes = 0;

      req.on('data', (chunk) => {
        receivedBytes += chunk.length;
      });

      req.pipe(writeStream);

      writeStream.on('finish', () => {
        const finalName = path.basename(targetPath);
        const item = {
          id: 'rec_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: finalName,
          path: targetPath,
          size: receivedBytes,
          formattedSize: this.formatBytes(receivedBytes),
          type: this.categorizeFile(finalName),
          direction: 'received',
          device: clientDevice,
          time: Date.now(),
        };

        this.history.unshift(item);
        this.saveHistory();
        this.onTransferReceived(item);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, file: item }));
      });

      writeStream.on('error', (err) => {
        console.error('File upload write error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });

      return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }

  renderMobileHtml() {
    const hostName = os.hostname();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Notcha AirDrop</title>
  <style>
    :root {
      --bg: #0d0c12;
      --surface: rgba(255, 255, 255, 0.08);
      --surface-hover: rgba(255, 255, 255, 0.14);
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.35);
      --success: #10b981;
      --text: #ffffff;
      --text-dim: rgba(255, 255, 255, 0.65);
      --border: rgba(255, 255, 255, 0.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px 16px 40px;
    }
    .header {
      width: 100%;
      max-width: 480px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }
    .logo-row { display: flex; align-items: center; gap: 10px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 12px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
    }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
    .container { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 20px; }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .upload-box {
      width: 100%;
      border: 2px dashed rgba(56, 189, 248, 0.4);
      border-radius: 16px;
      padding: 32px 16px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      background: rgba(56, 189, 248, 0.03);
      transition: all 0.2s;
    }
    .upload-box:active { transform: scale(0.98); background: rgba(56, 189, 248, 0.08); }
    .upload-icon {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: rgba(56, 189, 248, 0.15);
      display: grid;
      place-items: center;
      color: var(--accent);
    }
    .btn-label { font-size: 16px; font-weight: 700; color: #fff; }
    .btn-sub { font-size: 12px; color: var(--text-dim); }
    .progress-bar-wrap {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      margin-top: 14px;
      overflow: hidden;
      display: none;
    }
    .progress-fill {
      width: 0%;
      height: 100%;
      background: var(--accent);
      transition: width 0.15s ease;
    }
    .status-msg {
      margin-top: 10px;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-dim);
    }
    .shared-section {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 10px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      text-align: left;
    }
    .file-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      text-align: left;
    }
    .file-info { min-width: 0; flex: 1; padding-right: 12px; }
    .file-name { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-size { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
    .dl-btn {
      padding: 6px 14px;
      border: 0;
      border-radius: 10px;
      background: var(--accent);
      color: #0d0c12;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="logo-row">
      <h2 style="font-size: 17px; font-weight: 800; letter-spacing: -0.3px;">Notcha Drop</h2>
    </div>
    <div class="badge">
      <span class="dot"></span>
      <span>${escapeHtml(hostName)}</span>
    </div>
  </header>

  <main class="container">
    <div class="card">
      <input type="file" id="filePicker" multiple style="display: none;" />
      <div class="upload-box" id="uploadTrigger">
        <div class="upload-icon">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <span class="btn-label">Tap to Send Photos or Files</span>
        <span class="btn-sub">Streams directly over Wi-Fi to your Mac</span>
      </div>

      <div class="progress-bar-wrap" id="progressWrap">
        <div class="progress-fill" id="progressFill"></div>
      </div>
      <div class="status-msg" id="statusMsg"></div>
    </div>

    <div class="shared-section" id="sharedSection" style="display: none;">
      <div class="section-title">Files from Mac (Tap to Download)</div>
      <div id="sharedFilesList" style="display: flex; flex-direction: column; gap: 8px;"></div>
    </div>
  </main>

  <script>
    const picker = document.getElementById('filePicker');
    const trigger = document.getElementById('uploadTrigger');
    const progressWrap = document.getElementById('progressWrap');
    const progressFill = document.getElementById('progressFill');
    const statusMsg = document.getElementById('statusMsg');
    const sharedSection = document.getElementById('sharedSection');
    const sharedFilesList = document.getElementById('sharedFilesList');

    trigger.addEventListener('click', () => picker.click());

    picker.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      progressWrap.style.display = 'block';
      let uploaded = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        statusMsg.textContent = 'Sending ' + (i + 1) + ' of ' + files.length + ': ' + file.name + '...';
        progressFill.style.width = Math.round(((i) / files.length) * 100) + '%';

        try {
          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload', true);
            xhr.setRequestHeader('x-filename', encodeURIComponent(file.name));
            xhr.upload.onprogress = (evt) => {
              if (evt.lengthComputable) {
                const part = evt.loaded / evt.total;
                const totalPct = Math.round(((i + part) / files.length) * 100);
                progressFill.style.width = totalPct + '%';
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else reject(new Error('Upload failed'));
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.send(file);
          });
          uploaded++;
        } catch (err) {
          statusMsg.textContent = 'Error uploading ' + file.name;
        }
      }

      progressFill.style.width = '100%';
      statusMsg.innerHTML = '<span style="color:#10b981;">✓ Transferred ' + uploaded + ' file(s) to Mac!</span>';
      picker.value = '';
      setTimeout(() => { progressWrap.style.display = 'none'; }, 2000);
    });

    async function fetchShared() {
      try {
        const res = await fetch('/api/shared');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          sharedSection.style.display = 'flex';
          sharedFilesList.innerHTML = data.map((f) => \`
            <div class="file-item">
              <div class="file-info">
                <div class="file-name">\${escapeHtml(f.name)}</div>
                <div class="file-size">\${f.formattedSize || ''}</div>
              </div>
              <a class="dl-btn" href="/download/\${f.id}" download>Download</a>
            </div>
          \`).join('');
        } else {
          sharedSection.style.display = 'none';
        }
      } catch (_) {}
    }

    function escapeHtml(s) {
      if (!s) return '';
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    fetchShared();
    setInterval(fetchShared, 3500);
  </script>
</body>
</html>`;
  }
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = TransferServer;
module.exports.TransferServer = TransferServer;
