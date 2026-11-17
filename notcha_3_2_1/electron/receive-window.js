(function () {
  let allTransfers = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let isAlwaysOnTop = true;
  let progressTimer = null;

  const transfersList = document.getElementById('transfersList');
  const emptyState = document.getElementById('emptyState');
  const activeProgressArea = document.getElementById('activeProgressArea');
  const searchInput = document.getElementById('searchInput');
  const filterPills = document.querySelectorAll('.filter-pill');
  const openFolderBtn = document.getElementById('openFolderBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const footerCountText = document.getElementById('footerCountText');
  const footerFolderLink = document.getElementById('footerFolderLink');
  const devicePill = document.getElementById('devicePill');
  const deviceName = document.getElementById('deviceName');
  const pinBtn = document.getElementById('pinBtn');
  const minBtn = document.getElementById('minBtn');
  const closeBtn = document.getElementById('closeBtn');

  // Titlebar controls
  closeBtn.addEventListener('click', () => {
    if (window.api && window.api.closeReceiveWindow) {
      window.api.closeReceiveWindow();
    } else {
      window.close();
    }
  });

  minBtn.addEventListener('click', () => {
    window.minimize?.() || window.api?.minimizeReceiveWindow?.();
  });

  pinBtn.addEventListener('click', () => {
    isAlwaysOnTop = !isAlwaysOnTop;
    pinBtn.classList.toggle('active', isAlwaysOnTop);
    window.api?.setReceiveWindowAlwaysOnTop?.(isAlwaysOnTop);
  });

  // Open folder
  const openFolderHandler = () => {
    window.api?.openTransfersFolder?.();
  };
  openFolderBtn.addEventListener('click', openFolderHandler);
  footerFolderLink.addEventListener('click', openFolderHandler);

  // Clear history
  clearHistoryBtn.addEventListener('click', async () => {
    if (allTransfers.length === 0) return;
    if (confirm('Clear transfer history log? (Files in your Downloads folder will not be deleted)')) {
      if (window.api && window.api.clearTransfersHistory) {
        await window.api.clearTransfersHistory();
        allTransfers = [];
        renderList();
      }
    }
  });

  // Filter pills
  filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      filterPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.getAttribute('data-filter') || 'all';
      renderList();
    });
  });

  // Search input
  searchInput.addEventListener('input', (e) => {
    searchQuery = (e.target.value || '').trim().toLowerCase();
    renderList();
  });

  function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 10) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function getCategorySvg(type) {
    switch (type) {
      case 'images':
        return '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
      case 'videos':
        return '<svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
      case 'docs':
        return '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
      case 'archives':
        return '<svg viewBox="0 0 24 24"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';
      default:
        return '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    }
  }

  function renderList() {
    const filtered = allTransfers.filter((item) => {
      if (currentFilter !== 'all' && item.type !== currentFilter) return false;
      if (searchQuery && !item.name.toLowerCase().includes(searchQuery)) return false;
      return true;
    });

    footerCountText.textContent = `${allTransfers.length} item${allTransfers.length === 1 ? '' : 's'} received`;

    if (filtered.length === 0) {
      transfersList.innerHTML = '';
      transfersList.appendChild(emptyState);
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';
    transfersList.innerHTML = '';

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'transfer-card';

      const typeClass = item.type || 'other';
      const devName = item.deviceName || item.device || (item.deviceIp ? `IP: ${item.deviceIp}` : 'Mobile Device');
      const timeStr = formatRelativeTime(item.timestamp || item.time);

      card.innerHTML = `
        <div class="card-left">
          <div class="file-icon ${typeClass}">
            ${getCategorySvg(item.type)}
          </div>
          <div class="file-meta">
            <div class="file-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            <div class="file-sub">
              <span>${item.formattedSize || 'File'}</span>
              <span>•</span>
              <span class="badge-device">
                <svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                ${escapeHtml(devName)}
              </span>
              <span>•</span>
              <span>${timeStr}</span>
            </div>
          </div>
        </div>
        <div class="card-actions">
          <button class="card-btn" data-action="open" title="Open with default application">
            <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            <span>Open</span>
          </button>
          <button class="card-btn" data-action="finder" title="Show in Finder">
            <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>Finder</span>
          </button>
        </div>
      `;

      card.querySelector('[data-action="open"]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.api && window.api.showItemInFolder) {
          window.api.showItemInFolder(item.path);
        }
      });

      card.querySelector('[data-action="finder"]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.api && window.api.showItemInFolder) {
          window.api.showItemInFolder(item.path);
        }
      });

      transfersList.appendChild(card);
    });
  }

  // Real-time transfer progress tracking
  function handleTransferProgress(p) {
    if (!activeProgressArea || !p) return;
    clearTimeout(progressTimer);

    if (p.status === 'completed') {
      activeProgressArea.style.display = 'block';
      activeProgressArea.innerHTML = `
        <div class="active-progress-box completed">
          <div class="active-progress-top">
            <div class="active-progress-badge">
              <span>✓ ${p.direction === 'receiving' ? 'Received file' : 'Sent file'} successfully</span>
            </div>
            <span class="active-progress-percent">100%</span>
          </div>
          <div class="active-progress-filename">${escapeHtml(p.filename || 'File')} (${p.formattedTotal || ''})</div>
        </div>
      `;
      progressTimer = setTimeout(() => {
        activeProgressArea.style.display = 'none';
      }, 3000);
      return;
    }

    if (p.status === 'error') {
      activeProgressArea.style.display = 'block';
      activeProgressArea.innerHTML = `
        <div class="active-progress-box" style="border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.1);">
          <div class="active-progress-top">
            <span style="color:#ef4444; font-weight:700;">⚠️ Transfer error</span>
          </div>
        </div>
      `;
      progressTimer = setTimeout(() => { activeProgressArea.style.display = 'none'; }, 3000);
      return;
    }

    activeProgressArea.style.display = 'block';
    activeProgressArea.innerHTML = `
      <div class="active-progress-box">
        <div class="active-progress-top">
          <div class="active-progress-badge">
            <span class="pulse-dot-spin"></span>
            <span>${p.direction === 'receiving' ? '📥 Receiving from phone...' : '📤 Sending to phone...'}</span>
          </div>
          <span class="active-progress-percent">${p.percent || 0}%</span>
        </div>
        <div class="active-progress-filename">${escapeHtml(p.filename || 'File')}</div>
        <div class="active-progress-track">
          <div class="active-progress-fill" style="width: ${p.percent || 0}%;"></div>
        </div>
        <div class="active-progress-meta">
          <span>${p.formattedLoaded || '0 B'} / ${p.formattedTotal || '0 B'}</span>
          <span>${escapeHtml(p.device || '')}</span>
        </div>
      </div>
    `;
  }

  function updateDeviceUI(dev) {
    if (dev && dev.name) {
      devicePill.classList.remove('unpaired');
      deviceName.textContent = dev.name;
      devicePill.title = `Paired Device: ${dev.name} (ID: ${dev.id})`;
    } else {
      devicePill.classList.add('unpaired');
      deviceName.textContent = 'Ready for transfers';
      devicePill.title = 'No device explicitly paired. Ready to receive from any device on Wi-Fi.';
    }
  }

  // Drag and drop onto Receive window
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files) {
      const paths = [];
      for (const f of Array.from(e.dataTransfer.files)) {
        let p = '';
        if (window.api && typeof window.api.getPathForFile === 'function') {
          try { p = window.api.getPathForFile(f); } catch (_) {}
        }
        if (!p) p = f.path || '';
        if (p) paths.push(p);
      }
      if (paths.length > 0 && window.api && window.api.shareFiles) {
        await window.api.shareFiles(paths);
        if (window.api.openSendWindow) {
          window.api.openSendWindow();
        }
      }
    }
  });

  async function init() {
    if (window.api && window.api.getTransferServerInfo) {
      const info = await window.api.getTransferServerInfo();
      if (info && info.history) {
        allTransfers = info.history;
        renderList();
      }
      if (info && info.pairedDevice) {
        updateDeviceUI(info.pairedDevice);
      }
    }

    if (window.api) {
      window.api.onTransferReceived?.((item) => {
        allTransfers.unshift(item);
        renderList();
      });

      window.api.onTransferProgress?.((prog) => handleTransferProgress(prog));

      window.api.onTransfersHistoryUpdated?.((history) => {
        if (Array.isArray(history)) {
          allTransfers = history;
          renderList();
        }
      });

      window.api.onDevicePaired?.((dev) => updateDeviceUI(dev));
      window.api.onDeviceUnpaired?.(() => updateDeviceUI(null));
    }
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  init();
})();
