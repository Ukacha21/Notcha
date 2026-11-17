// Mini Transfer Floating Window Controller
(function() {
  const miniServerIp = document.getElementById('miniServerIp');
  const dropzone = document.getElementById('dropzone');
  const filePicker = document.getElementById('filePicker');
  const sharedWrap = document.getElementById('sharedWrap');
  const sharedText = document.getElementById('sharedText');
  const clearSharedBtn = document.getElementById('clearSharedBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const historyList = document.getElementById('historyList');
  const qrModal = document.getElementById('qrModal');
  const qrBox = document.getElementById('qrBox');
  const qrUrlLabel = document.getElementById('qrUrlLabel');
  const toggleQrModalBtn = document.getElementById('toggleQrModalBtn');
  const closeQrModalBtn = document.getElementById('closeQrModalBtn');
  const openFolderBtn = document.getElementById('openFolderBtn');
  const closeMiniBtn = document.getElementById('closeMiniBtn');
  const dockToNotchBtn = document.getElementById('dockToNotchBtn');

  let currentInfo = null;

  async function refreshServerInfo() {
    if (!window.api || !window.api.getTransferServerInfo) return;
    try {
      currentInfo = await window.api.getTransferServerInfo();
      if (!currentInfo) return;

      if (miniServerIp) {
        miniServerIp.textContent = currentInfo.url.replace(/^http:\/\//, '');
      }
      if (qrUrlLabel) {
        qrUrlLabel.textContent = currentInfo.url;
      }
      if (qrBox && currentInfo.qrSvg) {
        qrBox.innerHTML = currentInfo.qrSvg;
      }

      updateSharedFiles(currentInfo.sharedFiles || []);
      renderHistory(currentInfo.history || []);
    } catch (err) {
      console.error('Failed to get transfer server info:', err);
    }
  }

  function updateSharedFiles(files) {
    if (!sharedWrap || !sharedText) return;
    if (!files || files.length === 0) {
      sharedWrap.style.display = 'none';
      return;
    }
    sharedWrap.style.display = 'flex';
    if (files.length === 1) {
      sharedText.textContent = `Sharing "${files[0].name}" (${files[0].formattedSize})`;
    } else {
      sharedText.textContent = `Sharing ${files.length} files to paired devices`;
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  function getFileIcon(type) {
    switch (type) {
      case 'images': return '🖼️';
      case 'videos': return '🎬';
      case 'docs': return '📄';
      case 'archives': return '📦';
      default: return '📁';
    }
  }

  function renderHistory(history) {
    if (!historyList) return;
    if (!history || history.length === 0) {
      historyList.innerHTML = '<div style="font-size: 11px; color: var(--text-mute); text-align: center; padding: 18px 10px;">No transfers yet. Drop files or connect your phone!</div>';
      return;
    }

    historyList.innerHTML = '';
    history.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'history-item';

      const icon = getFileIcon(item.type);
      const isReceived = item.direction === 'received';
      const dirBadge = isReceived ? '📥 Received' : '📤 Shared';
      const deviceStr = item.device ? ` • ${item.device}` : '';

      row.innerHTML = `
        <div style="font-size: 16px; margin-right: 8px;">${icon}</div>
        <div class="item-left">
          <div class="item-name" title="${item.name}">${item.name}</div>
          <div class="item-meta">${dirBadge} • ${item.formattedSize || ''} • ${formatTime(item.time)}${deviceStr}</div>
        </div>
        <button class="item-btn reveal-btn" title="Show in Finder">
          <svg viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>
        </button>
      `;

      row.addEventListener('click', (e) => {
        if (e.target.closest('.reveal-btn')) return;
        if (window.api && window.api.showItemInFolder && item.path) {
          window.api.showItemInFolder(item.path);
        }
      });

      const revealBtn = row.querySelector('.reveal-btn');
      if (revealBtn) {
        revealBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.api && window.api.showItemInFolder && item.path) {
            window.api.showItemInFolder(item.path);
          }
        });
      }

      historyList.appendChild(row);
    });
  }

  // Drag and drop handling
  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');

      const files = Array.from(e.dataTransfer.files || []);
      const paths = [];
      for (const f of files) {
        let p = '';
        if (window.api && typeof window.api.getPathForFile === 'function') {
          try { p = window.api.getPathForFile(f); } catch (_) {}
        }
        if (!p) p = f.path || '';
        if (p) paths.push(p);
      }
      if (paths.length > 0 && window.api && window.api.shareFiles) {
        await window.api.shareFiles(paths);
      }
    });

    dropzone.addEventListener('click', async () => {
      if (window.api && window.api.chooseFilesToShare) {
        await window.api.chooseFilesToShare();
      } else if (filePicker) {
        filePicker.click();
      }
    });
  }

  if (filePicker) {
    filePicker.addEventListener('change', async () => {
      const files = Array.from(filePicker.files || []);
      const paths = files.map((f) => f.path).filter(Boolean);
      if (paths.length > 0 && window.api && window.api.shareFiles) {
        await window.api.shareFiles(paths);
      }
      filePicker.value = '';
    });
  }

  // Clear shared files
  if (clearSharedBtn) {
    clearSharedBtn.addEventListener('click', async () => {
      if (window.api && window.api.clearSharedFiles) {
        await window.api.clearSharedFiles();
      }
    });
  }

  // Clear history
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', async () => {
      if (window.api && window.api.clearTransfersHistory) {
        await window.api.clearTransfersHistory();
      }
    });
  }

  // Open folder
  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', () => {
      if (window.api && window.api.openTransfersFolder) {
        window.api.openTransfersFolder();
      }
    });
  }

  // Close mini window
  if (closeMiniBtn) {
    closeMiniBtn.addEventListener('click', () => {
      if (window.api && window.api.closeMiniTransfer) {
        window.api.closeMiniTransfer();
      }
    });
  }

  // Dock to notch button
  if (dockToNotchBtn) {
    dockToNotchBtn.addEventListener('click', () => {
      if (window.api && window.api.dockToNotch) {
        window.api.dockToNotch();
      }
    });
  }

  // QR Modal
  if (toggleQrModalBtn && qrModal) {
    toggleQrModalBtn.addEventListener('click', () => {
      qrModal.style.display = 'flex';
    });
  }
  if (closeQrModalBtn && qrModal) {
    closeQrModalBtn.addEventListener('click', () => {
      qrModal.style.display = 'none';
    });
  }

  // Listen for IPC events
  if (window.api) {
    if (window.api.onTransferReceived) {
      window.api.onTransferReceived(() => {
        refreshServerInfo();
      });
    }
    if (window.api.onSharedFilesUpdated) {
      window.api.onSharedFilesUpdated((files) => {
        updateSharedFiles(files);
      });
    }
    if (window.api.onTransfersHistoryUpdated) {
      window.api.onTransfersHistoryUpdated((history) => {
        renderHistory(history);
      });
    }
  }

  // Initial load
  refreshServerInfo();
})();
