(function () {
  let selectedFiles = []; // [{ path, name, size, formattedSize }]
  let isAlwaysOnTop = true;
  let progressHideTimer = null;

  const dropzone = document.getElementById('dropzone');
  const filesTray = document.getElementById('filesTray');
  const fileChipsContainer = document.getElementById('fileChipsContainer');
  const trayCountText = document.getElementById('trayCountText');
  const clearTrayBtn = document.getElementById('clearTrayBtn');
  const sendBtn = document.getElementById('sendBtn');
  const sendBtnText = document.getElementById('sendBtnText');
  const sharedBanner = document.getElementById('sharedBanner');
  const sharedBannerText = document.getElementById('sharedBannerText');
  const stopSharingBtn = document.getElementById('stopSharingBtn');
  const pinBtn = document.getElementById('pinBtn');
  const minBtn = document.getElementById('minBtn');
  const closeBtn = document.getElementById('closeBtn');
  const targetDevicePill = document.getElementById('targetDevicePill');
  const targetDeviceName = document.getElementById('targetDeviceName');

  // Progress UI Elements
  const transferProgressCard = document.getElementById('transferProgressCard');
  const progressStatusLabel = document.getElementById('progressStatusLabel');
  const progressPercentLabel = document.getElementById('progressPercentLabel');
  const progressFileName = document.getElementById('progressFileName');
  const progressFillBar = document.getElementById('progressFillBar');
  const progressLoadedText = document.getElementById('progressLoadedText');
  const progressTargetDevice = document.getElementById('progressTargetDevice');

  // Titlebar controls
  closeBtn.addEventListener('click', () => {
    if (window.api && window.api.closeSendWindow) {
      window.api.closeSendWindow();
    } else {
      window.close();
    }
  });

  minBtn.addEventListener('click', () => {
    window.minimize?.() || window.api?.minimizeSendWindow?.();
  });

  pinBtn.addEventListener('click', () => {
    isAlwaysOnTop = !isAlwaysOnTop;
    pinBtn.classList.toggle('active', isAlwaysOnTop);
    window.api?.setSendWindowAlwaysOnTop?.(isAlwaysOnTop);
  });

  function resolveFilePath(f) {
    if (typeof f === 'string') return f;
    if (window.api && typeof window.api.getPathForFile === 'function') {
      try {
        const p = window.api.getPathForFile(f);
        if (p) return p;
      } catch (_) {}
    }
    return f?.path || '';
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'File';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function handleDroppedItems(fileList) {
    if (!fileList || fileList.length === 0) return;
    const resolved = [];
    for (const f of fileList) {
      const p = resolveFilePath(f);
      if (!p) continue;
      const name = f.name || p.split('/').pop() || 'File';
      resolved.push({
        path: p,
        name,
        size: f.size || 0,
        formattedSize: formatBytes(f.size || 0),
      });
    }
    if (resolved.length > 0) {
      addFiles(resolved);
    }
  }

  // Window-wide drag and drop listeners
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dragover');
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      dropzone.classList.remove('dragover');
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files) {
      handleDroppedItems(Array.from(e.dataTransfer.files));
    }
  });

  // Browse click fallback
  dropzone.addEventListener('click', async () => {
    if (window.api && window.api.chooseFilesToShare) {
      const paths = await window.api.chooseFilesToShare();
      if (Array.isArray(paths) && paths.length > 0) {
        const fileObjs = paths.map((p) => ({
          path: p,
          name: p.split('/').pop(),
          size: 0,
          formattedSize: 'File',
        }));
        addFiles(fileObjs);
      }
    }
  });

  function addFiles(files) {
    for (const f of files) {
      const p = f.path;
      if (!p) continue;
      if (!selectedFiles.some((item) => item.path === p)) {
        selectedFiles.push({
          path: p,
          name: f.name || p.split('/').pop() || 'File',
          size: f.size || 0,
          formattedSize: f.formattedSize || formatBytes(f.size),
        });
      }
    }
    renderTray();
  }

  function renderTray() {
    if (selectedFiles.length === 0) {
      filesTray.classList.remove('active');
      sendBtn.style.display = 'none';
      return;
    }

    filesTray.classList.add('active');
    sendBtn.style.display = 'flex';
    trayCountText.textContent = `${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''} Selected`;
    sendBtnText.textContent = `Share with Mobile Device (${selectedFiles.length})`;

    fileChipsContainer.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
      const chip = document.createElement('div');
      chip.className = 'file-chip';
      chip.innerHTML = `
        <div class="chip-left">
          <div class="chip-icon">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <span class="chip-name" title="${escapeHtml(file.path)}">${escapeHtml(file.name)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="chip-size">${file.formattedSize}</span>
          <button class="chip-del" title="Remove">&times;</button>
        </div>
      `;

      chip.querySelector('.chip-del').addEventListener('click', (e) => {
        e.stopPropagation();
        selectedFiles.splice(idx, 1);
        renderTray();
      });

      fileChipsContainer.appendChild(chip);
    });
  }

  clearTrayBtn.addEventListener('click', () => {
    selectedFiles = [];
    renderTray();
  });

  // Send action
  sendBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;
    const paths = selectedFiles.map((f) => f.path);

    if (window.api && window.api.shareFiles) {
      await window.api.shareFiles(paths);
      sharedBanner.classList.add('active');
      sharedBannerText.textContent = `✓ Sharing ${selectedFiles.length} file(s) with phone`;
      selectedFiles = [];
      renderTray();
    }
  });

  stopSharingBtn.addEventListener('click', async () => {
    if (window.api && window.api.clearSharedFiles) {
      await window.api.clearSharedFiles();
      sharedBanner.classList.remove('active');
    }
  });

  // Real-time transfer progress tracking
  function handleTransferProgress(p) {
    if (!transferProgressCard || !p) return;
    clearTimeout(progressHideTimer);
    transferProgressCard.style.display = 'flex';

    if (p.status === 'completed') {
      transferProgressCard.classList.add('completed');
      progressStatusLabel.textContent = p.direction === 'sending' ? '✓ Sent successfully' : '✓ Received';
      progressPercentLabel.textContent = '100%';
      progressFillBar.style.width = '100%';
      progressFileName.textContent = p.filename || 'File';
      progressLoadedText.textContent = p.formattedTotal || '';
      progressTargetDevice.textContent = p.device || '';

      progressHideTimer = setTimeout(() => {
        transferProgressCard.style.display = 'none';
        transferProgressCard.classList.remove('completed');
      }, 3000);
      return;
    }

    if (p.status === 'error') {
      progressStatusLabel.textContent = '⚠️ Transfer error';
      progressHideTimer = setTimeout(() => { transferProgressCard.style.display = 'none'; }, 3000);
      return;
    }

    transferProgressCard.classList.remove('completed');
    progressStatusLabel.textContent = p.direction === 'sending' ? 'Sending to mobile...' : 'Receiving...';
    progressPercentLabel.textContent = (p.percent || 0) + '%';
    progressFillBar.style.width = (p.percent || 0) + '%';
    progressFileName.textContent = p.filename || 'File';
    progressLoadedText.textContent = `${p.formattedLoaded || '0 B'} / ${p.formattedTotal || '0 B'}`;
    progressTargetDevice.textContent = p.device ? `to ${p.device}` : '';
  }

  // Pairing state updates
  function updateDeviceUI(dev) {
    if (dev && dev.name) {
      targetDevicePill.classList.remove('unpaired');
      targetDeviceName.textContent = dev.name;
      targetDevicePill.title = `Paired Device: ${dev.name} (ID: ${dev.id})`;
    } else {
      targetDevicePill.classList.add('unpaired');
      targetDeviceName.textContent = 'All Devices';
      targetDevicePill.title = 'Open mobile portal on your phone to pair';
    }
  }

  // Load initial info
  async function init() {
    if (window.api && window.api.getTransferServerInfo) {
      const info = await window.api.getTransferServerInfo();
      if (info && info.pairedDevice) {
        updateDeviceUI(info.pairedDevice);
      }
      if (info && Array.isArray(info.sharedFiles) && info.sharedFiles.length > 0) {
        sharedBanner.classList.add('active');
        sharedBannerText.textContent = `✓ Sharing ${info.sharedFiles.length} file(s) with phone`;
      }
    }

    if (window.api) {
      window.api.onDevicePaired?.((dev) => updateDeviceUI(dev));
      window.api.onDeviceUnpaired?.(() => updateDeviceUI(null));
      window.api.onTransferProgress?.((prog) => handleTransferProgress(prog));
      window.api.onSharedFilesUpdated?.((files) => {
        if (Array.isArray(files) && files.length > 0) {
          sharedBanner.classList.add('active');
          sharedBannerText.textContent = `✓ Sharing ${files.length} file(s) with phone`;
        } else {
          sharedBanner.classList.remove('active');
        }
      });
    }
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  init();
})();
