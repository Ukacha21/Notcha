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
    this.pairedFile = path.join(this.downloadDir, '.paired_device.json');
    this.server = null;
    this.activeIp = '127.0.0.1';
    this.sharedFiles = []; // files shared from Mac -> mobile [{ id, name, size, path, url }]
    this.history = [];
    this.pairedDevice = null; // { id, name, ip, time }
    this.discoveredDevices = new Map(); // id -> { id, name, ip, ua, lastSeen }

    this.onTransferReceived = options.onTransferReceived || (() => {});
    this.onTransferProgress = options.onTransferProgress || (() => {});
    this.onDevicePaired = options.onDevicePaired || (() => {});
    this.onDeviceUnpaired = options.onDeviceUnpaired || (() => {});
    this.onDiscoveredDevicesUpdated = options.onDiscoveredDevicesUpdated || (() => {});

    this.ensureDownloadDir();
    this.loadHistory();
    this.loadPairedDevice();
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

  loadPairedDevice() {
    try {
      if (fs.existsSync(this.pairedFile)) {
        const raw = fs.readFileSync(this.pairedFile, 'utf8');
        this.pairedDevice = JSON.parse(raw);
      }
    } catch (_) {
      this.pairedDevice = null;
    }
  }

  savePairedDevice() {
    try {
      this.ensureDownloadDir();
      if (this.pairedDevice) {
        fs.writeFileSync(this.pairedFile, JSON.stringify(this.pairedDevice, null, 2), 'utf8');
      } else if (fs.existsSync(this.pairedFile)) {
        fs.unlinkSync(this.pairedFile);
      }
    } catch (err) {
      console.error('Failed to save paired device:', err);
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

  parseDeviceInfo(ua = '', customName = '', req = null) {
    let platform = 'device';
    let systemLogo = '📱';
    let systemName = 'Mobile';

    if (/iPhone|iPad|iPod/i.test(ua)) {
      platform = 'apple';
      systemLogo = '';
      systemName = 'iOS';
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      platform = 'apple';
      systemLogo = '';
      systemName = 'macOS';
    } else if (/Android/i.test(ua)) {
      platform = 'android';
      systemLogo = '🤖';
      systemName = 'Android';
    } else if (/Windows/i.test(ua)) {
      platform = 'windows';
      systemLogo = '⊞';
      systemName = 'Windows';
    } else if (/Linux/i.test(ua)) {
      platform = 'linux';
      systemLogo = '🐧';
      systemName = 'Linux';
    }

    const rawIp = req?.socket?.remoteAddress || '';
    const ip = rawIp.replace(/^.*:/, '') || 'Wi-Fi';

    let displayName = '';
    if (customName && customName.trim()) {
      displayName = `${customName.trim()} (${ip}) | ${systemLogo} ${systemName}`;
    } else {
      // If exact device model cannot be identified, show IP address + system logo
      displayName = `${ip} | ${systemLogo} ${systemName}`;
    }

    return {
      platform,
      systemLogo,
      systemName,
      ip,
      displayName,
    };
  }

  parseDeviceName(ua = '', customName = '', req = null) {
    return this.parseDeviceInfo(ua, customName, req).displayName;
  }

  recordDevice(req, customName = '') {
    const rawIp = req.socket?.remoteAddress || '';
    const ip = rawIp.replace(/^.*:/, '') || 'Unknown';
    if (ip === '127.0.0.1' || ip === 'Unknown') return null;

    const ua = req.headers['user-agent'] || '';
    const customHeaderName = req.headers['x-device-name'];
    const customHeaderId = req.headers['x-device-id'];

    const deviceId = customHeaderId || ('dev_' + ip.replace(/\./g, '_'));
    const info = this.parseDeviceInfo(ua, customHeaderName || customName, req);

    const dev = {
      id: deviceId,
      name: info.displayName,
      ip,
      ua,
      platform: info.platform,
      systemLogo: info.systemLogo,
      systemName: info.systemName,
      lastSeen: Date.now(),
      isPaired: this.pairedDevice && this.pairedDevice.id === deviceId,
    };

    this.discoveredDevices.set(deviceId, dev);
    this.onDiscoveredDevicesUpdated(this.getDiscoveredDevices());
    return dev;
  }

  pairDevice(deviceId, customName = '', req = null) {
    let dev = this.discoveredDevices.get(deviceId);
    if (!dev) {
      const info = this.parseDeviceInfo('', customName, req);
      dev = {
        id: deviceId,
        name: customName || info.displayName,
        ip: info.ip || 'Network',
        platform: info.platform,
        systemLogo: info.systemLogo,
        systemName: info.systemName,
        lastSeen: Date.now(),
      };
    }
    if (customName && customName.trim()) {
      dev.name = customName.trim();
    }
    this.pairedDevice = {
      id: dev.id,
      name: dev.name,
      ip: dev.ip,
      platform: dev.platform,
      systemLogo: dev.systemLogo,
      systemName: dev.systemName,
      time: Date.now(),
    };
    this.savePairedDevice();
    this.onDevicePaired(this.pairedDevice);
    this.onDiscoveredDevicesUpdated(this.getDiscoveredDevices());
    return this.pairedDevice;
  }

  unpairDevice() {
    this.pairedDevice = null;
    this.savePairedDevice();
    this.onDeviceUnpaired();
    this.onDiscoveredDevicesUpdated(this.getDiscoveredDevices());
  }

  getDiscoveredDevices() {
    const now = Date.now();
    const list = [];
    for (const dev of this.discoveredDevices.values()) {
      if (now - dev.lastSeen < 30 * 60 * 1000) {
        list.push({
          ...dev,
          isPaired: this.pairedDevice && this.pairedDevice.id === dev.id,
        });
      }
    }
    return list;
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
            const item = {
              id,
              name: filename,
              path: fp,
              size: stat.size,
              formattedSize: this.formatBytes(stat.size),
              type: this.categorizeFile(filename),
              time: Date.now(),
              url: `/download/${id}`,
            };
            this.sharedFiles.push(item);
            this.history.unshift({
              ...item,
              direction: 'sent',
              formattedSize: this.formatBytes(stat.size),
              type: this.categorizeFile(filename),
              device: this.pairedDevice ? this.pairedDevice.name : 'Mobile Device',
              status: 'Shared',
              time: Date.now(),
            });
          }
        } catch (err) {
          console.error('Error sharing file:', fp, err);
        }
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
      isPaired: !!this.pairedDevice,
      pairedDevice: this.pairedDevice,
      discoveredDevices: this.getDiscoveredDevices(),
      sharedFiles: this.sharedFiles,
      history: this.history,
      downloadDir: this.downloadDir,
    };
  }

  handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-filename, x-device-id, x-device-name');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // 1. Mobile Web Portal (HTML)
    if (pathname === '/' && req.method === 'GET') {
      this.recordDevice(req);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(this.renderMobileHtml());
    }

    // 2. Server info API
    if (pathname === '/api/info' && req.method === 'GET') {
      this.recordDevice(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(this.getInfo()));
    }

    // 3. Status API
    if (pathname === '/api/status' && req.method === 'GET') {
      this.recordDevice(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        isPaired: !!this.pairedDevice,
        pairedDevice: this.pairedDevice,
        hostname: os.hostname(),
        ip: this.getPrimaryIp(),
        port: this.port,
        url: `http://${this.getPrimaryIp()}:${this.port}`,
      }));
    }

    // 4. Discovered devices API
    if (pathname === '/api/devices' && req.method === 'GET') {
      this.recordDevice(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(this.getDiscoveredDevices()));
    }

    // 5. Device Pairing API
    if (pathname === '/api/pair' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let payload = {};
        try { payload = JSON.parse(body); } catch (_) {}
        const recorded = this.recordDevice(req, payload.deviceName);
        const deviceId = payload.deviceId || (recorded && recorded.id) || 'dev_mobile';
        const paired = this.pairDevice(deviceId, payload.deviceName || (recorded && recorded.name));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, device: paired }));
      });
      return;
    }

    // 6. Device Unpair API
    if (pathname === '/api/unpair' && req.method === 'POST') {
      this.unpairDevice();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // 7. Shared files API
    if (pathname === '/api/shared' && req.method === 'GET') {
      this.recordDevice(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(this.sharedFiles));
    }

    // 8. Download file from Mac to phone (Sending from Mac)
    if (pathname.startsWith('/download/') && req.method === 'GET') {
      const dev = this.recordDevice(req);
      const fileId = pathname.replace('/download/', '').trim();
      const item = this.sharedFiles.find((f) => f.id === fileId);
      if (!item || !fs.existsSync(item.path)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('File not found or no longer available.');
      }

      const stat = fs.statSync(item.path);
      const totalBytes = stat.size;
      const clientDevice = (dev && dev.name) || (this.pairedDevice && this.pairedDevice.name) || this.parseDeviceName(req.headers['user-agent'] || '', '', req);

      const transferId = 'tx_' + Date.now();
      let sentBytes = 0;
      let lastBroadcastTime = 0;

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': totalBytes,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(item.name)}"`,
      });

      this.onTransferProgress({
        id: transferId,
        direction: 'sending',
        status: 'loading',
        filename: item.name,
        loaded: 0,
        total: totalBytes,
        percent: 0,
        formattedLoaded: '0 B',
        formattedTotal: this.formatBytes(totalBytes),
        device: clientDevice,
      });

      const readStream = fs.createReadStream(item.path);
      readStream.on('data', (chunk) => {
        sentBytes += chunk.length;
        const now = Date.now();
        if (now - lastBroadcastTime > 80 || sentBytes >= totalBytes) {
          lastBroadcastTime = now;
          const pct = totalBytes > 0 ? Math.min(100, Math.round((sentBytes / totalBytes) * 100)) : 0;
          this.onTransferProgress({
            id: transferId,
            direction: 'sending',
            status: 'loading',
            filename: item.name,
            loaded: sentBytes,
            total: totalBytes,
            percent: pct,
            formattedLoaded: this.formatBytes(sentBytes),
            formattedTotal: this.formatBytes(totalBytes),
            device: clientDevice,
          });
        }
      });

      readStream.on('end', () => {
        this.onTransferProgress({
          id: transferId,
          direction: 'sending',
          status: 'completed',
          filename: item.name,
          loaded: sentBytes,
          total: totalBytes,
          percent: 100,
          formattedLoaded: this.formatBytes(sentBytes),
          formattedTotal: this.formatBytes(totalBytes),
          device: clientDevice,
        });
      });

      readStream.on('error', (err) => {
        console.error('Download stream error:', err);
        this.onTransferProgress({
          id: transferId,
          direction: 'sending',
          status: 'error',
          filename: item.name,
          device: clientDevice,
        });
      });

      return readStream.pipe(res);
    }

    // 9. Upload file from phone/client to Mac (Receiving on Mac)
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
      filename = path.basename(filename);

      const userAgent = req.headers['user-agent'] || '';
      const customHeaderName = req.headers['x-device-name'];
      const customHeaderId = req.headers['x-device-id'];
      const dev = this.recordDevice(req, customHeaderName);

      const clientDevice = customHeaderName || (dev && dev.name) || this.parseDeviceName(userAgent, '', req);
      const targetPath = this.getUniqueFilePath(filename);
      const writeStream = fs.createWriteStream(targetPath);
      let receivedBytes = 0;
      const totalBytes = parseInt(req.headers['content-length'] || '0', 10);
      const transferId = 'rx_' + Date.now();
      let lastBroadcastTime = 0;

      this.onTransferProgress({
        id: transferId,
        direction: 'receiving',
        status: 'loading',
        filename,
        loaded: 0,
        total: totalBytes,
        percent: 0,
        formattedLoaded: '0 B',
        formattedTotal: this.formatBytes(totalBytes),
        device: clientDevice,
      });

      req.on('data', (chunk) => {
        receivedBytes += chunk.length;
        const now = Date.now();
        if (now - lastBroadcastTime > 80 || (totalBytes > 0 && receivedBytes >= totalBytes)) {
          lastBroadcastTime = now;
          const pct = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0;
          this.onTransferProgress({
            id: transferId,
            direction: 'receiving',
            status: 'loading',
            filename,
            loaded: receivedBytes,
            total: totalBytes,
            percent: pct,
            formattedLoaded: this.formatBytes(receivedBytes),
            formattedTotal: this.formatBytes(totalBytes),
            device: clientDevice,
          });
        }
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

        this.onTransferProgress({
          id: transferId,
          direction: 'receiving',
          status: 'completed',
          filename: finalName,
          loaded: receivedBytes,
          total: receivedBytes,
          percent: 100,
          formattedLoaded: this.formatBytes(receivedBytes),
          formattedTotal: this.formatBytes(receivedBytes),
          device: clientDevice,
        });

        // Auto-pair with first uploading client if not paired
        if (!this.pairedDevice && customHeaderId) {
          this.pairDevice(customHeaderId, clientDevice, req);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, file: item }));
      });

      writeStream.on('error', (err) => {
        console.error('File upload write error:', err);
        this.onTransferProgress({
          id: transferId,
          direction: 'receiving',
          status: 'error',
          filename,
          device: clientDevice,
        });
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
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Notcha Drop • ${escapeHtml(hostName)}</title>
  <style>
    :root {
      --bg: #09080c;
      --surface: #141318;
      --surface-card: #1c1a23;
      --border: rgba(255, 255, 255, 0.08);
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.25);
      --success: #10b981;
      --text: #f8fafc;
      --text-dim: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-tap-highlight-color: transparent; }
    body {
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 16px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0 16px 0;
      border-bottom: 1px solid var(--border);
      margin-bottom: 18px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 17px;
      letter-spacing: -0.3px;
    }
    .brand svg { width: 24px; height: 24px; stroke: var(--accent); fill: none; stroke-width: 2.2; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 11.5px;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--success); animation: pulse 2s infinite; }
    @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }

    .pairing-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .device-info { display: flex; flex-direction: column; gap: 2px; }
    .device-title { font-size: 13.5px; font-weight: 700; color: #fff; }
    .device-id-tag { font-size: 11px; color: var(--accent); font-weight: 600; }
    .pair-btn {
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 6px 14px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .dropzone-card {
      background: var(--surface);
      border: 2px dashed rgba(56, 189, 248, 0.4);
      border-radius: 20px;
      padding: 32px 20px;
      text-align: center;
      margin-bottom: 22px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      cursor: pointer;
      background: rgba(56, 189, 248, 0.03);
      transition: all 0.2s ease;
    }
    .dropzone-card:active {
      transform: scale(0.98);
      background: rgba(56, 189, 248, 0.08);
      border-color: var(--accent);
    }
    .dropzone-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(56, 189, 248, 0.15);
      display: grid;
      place-items: center;
      color: var(--accent);
    }
    .dropzone-icon svg { width: 28px; height: 28px; stroke: currentColor; fill: none; stroke-width: 2.2; }
    .dropzone-title { font-size: 17px; font-weight: 700; }
    .dropzone-sub { font-size: 12.5px; color: var(--text-dim); }

    .quick-pickers {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      width: 100%;
      margin-top: 6px;
    }
    .picker-btn {
      background: var(--surface-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #fff;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .picker-btn svg { width: 16px; height: 16px; stroke: var(--accent); fill: none; stroke-width: 2; }

    .progress-bar {
      display: none;
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.1);
      overflow: hidden;
      margin: 12px 0;
    }
    .progress-fill { width: 0%; height: 100%; background: var(--accent); transition: width 0.15s ease; }
    .status-msg { font-size: 12px; color: var(--text-dim); text-align: center; }

    .section-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-dim);
      margin-bottom: 12px;
    }
    .shared-list { display: flex; flex-direction: column; gap: 8px; }
    .shared-item {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .shared-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .shared-size { font-size: 11px; color: var(--text-dim); }
    .download-btn {
      background: var(--accent);
      color: #0b151e;
      text-decoration: none;
      padding: 7px 14px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 700;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <span>Notcha Drop</span>
    </div>
    <div class="status-badge">
      <span class="pulse"></span>
      <span>Connected to ${escapeHtml(hostName)}</span>
    </div>
  </header>

  <div class="pairing-card">
    <div class="device-info">
      <div class="device-title" id="mDeviceName">Detecting Device...</div>
      <div class="device-id-tag" id="mDeviceId">ID: ...</div>
    </div>
    <button class="pair-btn" id="mPairBtn">Paired ✓</button>
  </div>

  <input type="file" id="filePicker" multiple style="display: none;" />
  <input type="file" id="photoPicker" accept="image/*,video/*" multiple style="display: none;" />

  <div class="dropzone-card" id="uploadTrigger">
    <div class="dropzone-icon">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    </div>
    <div>
      <div class="dropzone-title">Send to ${escapeHtml(hostName)}</div>
      <div class="dropzone-sub">Tap here to choose files, photos or videos</div>
    </div>
    <div class="quick-pickers">
      <div class="picker-btn" id="pickPhotosBtn">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span>Photos & Videos</span>
      </div>
      <div class="picker-btn" id="pickFilesBtn">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>Files & Docs</span>
      </div>
    </div>
  </div>

  <div class="progress-bar" id="progressWrap">
    <div class="progress-fill" id="progressFill"></div>
  </div>
  <div class="status-msg" id="statusMsg">Ready to send</div>

  <div id="sharedSection" style="margin-top: 26px; display: none;">
    <div class="section-title">Files from ${escapeHtml(hostName)}</div>
    <div class="shared-list" id="sharedFilesList"></div>
  </div>

  <script>
    function detectDevice() {
      const ua = navigator.userAgent || '';
      if (/iPhone|iPad|iPod/i.test(ua)) return ' iOS';
      if (/Android/i.test(ua)) return '🤖 Android';
      if (/Macintosh/i.test(ua)) return ' Mac';
      if (/Windows/i.test(ua)) return '⊞ Windows';
      return '📱 Mobile';
    }

    let devId = localStorage.getItem('notcha_dev_id');
    if (!devId) {
      devId = 'dev_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('notcha_dev_id', devId);
    }
    let devName = localStorage.getItem('notcha_dev_name') || detectDevice();
    localStorage.setItem('notcha_dev_name', devName);

    document.getElementById('mDeviceName').textContent = devName;
    document.getElementById('mDeviceId').textContent = 'ID: ' + devId;

    async function doPair() {
      try {
        await fetch('/api/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: devId, deviceName: devName })
        });
      } catch (_) {}
    }
    doPair();

    const picker = document.getElementById('filePicker');
    const photoPicker = document.getElementById('photoPicker');
    const trigger = document.getElementById('uploadTrigger');
    const pickPhotosBtn = document.getElementById('pickPhotosBtn');
    const pickFilesBtn = document.getElementById('pickFilesBtn');
    const progressWrap = document.getElementById('progressWrap');
    const progressFill = document.getElementById('progressFill');
    const statusMsg = document.getElementById('statusMsg');
    const sharedSection = document.getElementById('sharedSection');
    const sharedFilesList = document.getElementById('sharedFilesList');

    trigger.addEventListener('click', (e) => {
      if (e.target.closest('#pickPhotosBtn') || e.target.closest('#pickFilesBtn')) return;
      picker.click();
    });
    pickPhotosBtn.addEventListener('click', (e) => { e.stopPropagation(); photoPicker.click(); });
    pickFilesBtn.addEventListener('click', (e) => { e.stopPropagation(); picker.click(); });

    async function handleFiles(files) {
      if (!files || files.length === 0) return;
      progressWrap.style.display = 'block';
      let uploaded = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const totalMb = (file.size / (1024 * 1024)).toFixed(1);
        statusMsg.textContent = 'Sending ' + (i + 1) + ' of ' + files.length + ': ' + file.name + ' (' + totalMb + ' MB)...';
        progressFill.style.width = Math.round((i / files.length) * 100) + '%';

        try {
          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload', true);
            xhr.setRequestHeader('x-filename', encodeURIComponent(file.name));
            xhr.setRequestHeader('x-device-id', devId);
            xhr.setRequestHeader('x-device-name', devName);

            xhr.upload.onprogress = (evt) => {
              if (evt.lengthComputable) {
                const loadedMb = (evt.loaded / (1024 * 1024)).toFixed(1);
                const filePct = Math.round((evt.loaded / evt.total) * 100);
                const part = evt.loaded / evt.total;
                const totalPct = Math.round(((i + part) / files.length) * 100);
                progressFill.style.width = totalPct + '%';
                statusMsg.textContent = 'Sending ' + file.name + ': ' + filePct + '% (' + loadedMb + ' / ' + totalMb + ' MB)';
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
          console.error(err);
        }
      }

      progressFill.style.width = '100%';
      statusMsg.innerHTML = '<span style="color:#10b981;">✓ Sent ' + uploaded + ' file(s) to Mac!</span>';
      setTimeout(() => { progressWrap.style.display = 'none'; }, 2500);
    }

    picker.addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));
    photoPicker.addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));

    window.notifyDownloadStarted = function(name) {
      statusMsg.innerHTML = '<span style="color:#38bdf8;">📥 Downloading ' + escapeHtml(name) + '...</span>';
    };

    async function fetchShared() {
      try {
        const res = await fetch('/api/shared');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          sharedSection.style.display = 'block';
          sharedFilesList.innerHTML = data.map((f) => \`
            <div class="shared-item">
              <div>
                <div class="shared-name">\${escapeHtml(f.name)}</div>
                <div class="shared-size">\${escapeHtml(f.formattedSize)}</div>
              </div>
              <a href="\${f.url}" download="\${escapeHtml(f.name)}" class="download-btn" onclick="notifyDownloadStarted('\${escapeHtml(f.name)}')">Download</a>
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
    setInterval(fetchShared, 1200);
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
