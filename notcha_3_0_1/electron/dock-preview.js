// Controller for Floating Dock Window Previews
(function() {
  const appIcon = document.getElementById('appIcon');
  const appName = document.getElementById('appName');
  const winCount = document.getElementById('winCount');
  const cardsRow = document.getElementById('cardsRow');
  const previewShell = document.getElementById('previewShell');

  let currentData = null;

  function render(data) {
    if (!data) return;
    currentData = data;

    if (appIcon) {
      if (data.appIcon) {
        appIcon.src = data.appIcon;
        appIcon.style.display = 'block';
      } else {
        appIcon.style.display = 'none';
      }
    }

    if (appName) {
      appName.textContent = data.appName || 'Application';
    }

    const windows = data.windows || [];
    if (winCount) {
      winCount.textContent = windows.length === 1 ? '1 Window' : `${windows.length} Windows`;
    }

    if (!cardsRow) return;
    cardsRow.innerHTML = '';

    windows.forEach((win) => {
      const card = document.createElement('div');
      card.className = 'window-card';
      card.title = win.title || data.appName;

      const thumbHtml = win.thumbnail
        ? `<img class="thumb-img" src="${win.thumbnail}" alt="" />`
        : win.isMinimized
        ? `<div class="thumb-placeholder minimized">
            <svg viewBox="0 0 24 24"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>
            <span style="font-size: 11px; font-weight: 600; color:#f59e0b;">Minimized in Dock</span>
            <span style="font-size: 9.5px; color:var(--text-dim);">Click to restore</span>
           </div>`
        : `<div class="thumb-placeholder">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            <span style="font-size: 10px; font-weight: 600;">Window Preview</span>
           </div>`;

      const minBadgeHtml = win.isMinimized
        ? `<span class="min-badge">Minimized</span>`
        : '';

      card.innerHTML = `
        <button class="close-card-btn" title="Close Window">&times;</button>
        <div class="thumb-wrap">${thumbHtml}</div>
        <div class="card-footer">
          <span class="card-title">${escapeHtml(win.title)}</span>
          ${minBadgeHtml}
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.close-card-btn')) return;
        if (window.api && window.api.activateDockWindow) {
          window.api.activateDockWindow({ pid: data.pid, index: win.index });
        }
      });

      const closeBtn = card.querySelector('.close-card-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.api && window.api.closeDockWindow) {
            window.api.closeDockWindow({ pid: data.pid, index: win.index });
          }
          card.style.opacity = '0.3';
          card.style.pointerEvents = 'none';
        });
      }

      cardsRow.appendChild(card);
    });
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  if (previewShell) {
    previewShell.addEventListener('mouseenter', () => {
      if (window.api && window.api.dockPreviewMouseEnter) {
        window.api.dockPreviewMouseEnter();
      }
    });

    previewShell.addEventListener('mouseleave', () => {
      if (window.api && window.api.dockPreviewMouseLeave) {
        window.api.dockPreviewMouseLeave();
      }
    });
  }

  if (window.api && window.api.onDockPreviewData) {
    window.api.onDockPreviewData((data) => {
      render(data);
    });
  }
})();
