(function () {
  let selectedFiles = []; // [{ path, name, size, formattedSize }]
  let isAlwaysOnTop = true;

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

  // Drag & drop on dropzone
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'dragend'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');

    if (e.dataTransfer && e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
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
        }));
        addFiles(fileObjs);
      }
    }
  });

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'File';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function addFiles(files) {
    for (const f of files) {
      const p = f.path || f;
      if (!p) continue;
      const name = f.name || p.split('/').pop() || 'File';
      if (!selectedFiles.some((item) => item.path === p)) {
        selectedFiles.push({
          path: p,
          name,
          size: f.size || 0,
          formattedSize: formatBytes(f.size),
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

  // Pairing state updates
  function updateDeviceUI(dev) {
    if (dev && dev.name) {
      targetDevicePill.classList.remove('unpaired');
      targetDeviceName.textContent = dev.name;
      targetDevicePill.title = `Paired Device ID: ${dev.id} (${dev.ip})`;
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
