(function () {
  'use strict';

  // Evitar dupla injeção do UI
  if (window.__MULTISESSION_UI_INJECTED__) return;
  window.__MULTISESSION_UI_INJECTED__ = true;

  function getSessionId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let sid = urlParams.get('__msession');
      if (!sid && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        sid = hashParams.get('__msession');
      }
      if (sid) return sid;
      return window.sessionStorage.getItem('__msession_id__');
    } catch (e) {
      return null;
    }
  }

  const sessionId = getSessionId();
  if (!sessionId) return;

  // Solicitar dados da sessão ao Service Worker
  chrome.runtime.sendMessage({ type: 'GET_SESSION_INFO', sessionId }, (session) => {
    if (chrome.runtime.lastError || !session) return;
    renderSessionHighlight(session);
    setupTabTitleHighlight(session);
    customizeFavicon(session);
  });

  // 1. Realce do Título da Aba do Navegador (ex: [🔵 S1] WhatsApp)
  function setupTabTitleHighlight(session) {
    const emoji = getEmojiForColor(session.color);
    const tag = `[${emoji} ${session.badgeText || 'S'}]`;

    function applyTitlePrefix() {
      if (document.title && !document.title.startsWith(tag)) {
        const cleanTitle = document.title.replace(/^\[.*?\]\s*/, '');
        document.title = `${tag} ${cleanTitle}`;
      }
    }

    applyTitlePrefix();

    try {
      const titleEl = document.querySelector('title');
      if (titleEl) {
        const observer = new MutationObserver(() => {
          applyTitlePrefix();
        });
        observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          applyTitlePrefix();
          const el = document.querySelector('title');
          if (el) {
            new MutationObserver(() => applyTitlePrefix()).observe(el, { childList: true, characterData: true, subtree: true });
          }
        });
      }
    } catch (e) {
      console.warn('[MultiSession] Erro ao aplicar MutationObserver no título:', e);
    }
  }

  function getEmojiForColor(color = '') {
    if (color.includes('3b82f6')) return '🔵';
    if (color.includes('10b981')) return '🟢';
    if (color.includes('f59e0b')) return '🟡';
    if (color.includes('ec4899')) return '🔴';
    if (color.includes('8b5cf6')) return '🟣';
    if (color.includes('06b6d4')) return '🌐';
    if (color.includes('ef4444')) return '🔴';
    return '🔵';
  }

  // 2. Customização do Favicon da Aba (Sem fundo preenchido, apenas moldura quadrada com a cor da sessão)
  function customizeFavicon(session) {
    const color = session.color || '#3b82f6';

    function applyCustomFavicon() {
      const existingFavicons = Array.from(document.querySelectorAll("link[rel*='icon']"));
      let originalUrl = '';
      if (existingFavicons.length > 0) {
        originalUrl = existingFavicons[0].href;
      } else {
        originalUrl = window.location.origin + '/favicon.ico';
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext('2d');

          ctx.clearRect(0, 0, 32, 32);

          // Desenhar moldura quadrada com cantos levemente arredondados
          const x = 1.5;
          const y = 1.5;
          const w = 29;
          const h = 29;
          const r = 5;

          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + w - r, y);
          ctx.quadraticCurveTo(x + w, y, x + w, y + r);
          ctx.lineTo(x + w, y + h - r);
          ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
          ctx.lineTo(x + r, y + h);
          ctx.quadraticCurveTo(x, y + h, x, y + h - r);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.closePath();
          ctx.stroke();

          // Desenhar o ícone original dentro da moldura
          ctx.drawImage(img, 4, 4, 24, 24);

          setFaviconDataUrl(canvas.toDataURL('image/png'));
        } catch (e) {
          fallbackFavicon(color);
        }
      };

      img.onerror = () => {
        fallbackFavicon(color);
      };

      img.src = originalUrl;
    }

    function fallbackFavicon(borderColor) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');

      ctx.clearRect(0, 0, 32, 32);

      const x = 1.5;
      const y = 1.5;
      const w = 29;
      const h = 29;
      const r = 5;

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.stroke();

      setFaviconDataUrl(canvas.toDataURL('image/png'));
    }

    function setFaviconDataUrl(dataUrl) {
      document.querySelectorAll("link[rel*='icon']").forEach((l) => l.remove());
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.href = dataUrl;
      document.head.appendChild(link);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyCustomFavicon);
    } else {
      applyCustomFavicon();
    }
  }

  // 3. Realce na Página via Shadow DOM
  function renderSessionHighlight(session) {
    const color = session.color || '#3b82f6';
    const name = session.name || 'Sessão Isolada';
    const badgeText = session.badgeText || 'S';

    const host = document.createElement('div');
    host.id = 'multisession-highlight-root';
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial !important;
        pointer-events: none;
      }
      
      .top-glow-bar {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 4px;
        background: ${color};
        box-shadow: 0 0 12px ${color}, 0 0 4px ${color};
        z-index: 2147483647;
        pointer-events: none;
      }

      .floating-badge {
        position: fixed;
        top: 10px;
        right: 16px;
        z-index: 2147483647;
        pointer-events: auto;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-left: 4px solid ${color};
        color: #f8fafc;
        padding: 5px 10px;
        border-radius: 20px;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;
        opacity: 0.92;
      }

      .floating-badge:hover {
        opacity: 1;
        transform: translateY(2px);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.45);
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: ${color};
        box-shadow: 0 0 6px ${color};
      }

      .badge-tag {
        background: ${color};
        color: #ffffff;
        font-size: 9px;
        font-weight: 800;
        padding: 1px 5px;
        border-radius: 4px;
        text-transform: uppercase;
      }

      .session-title {
        max-width: 140px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .toggle-btn {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 12px;
        padding: 0 2px;
        display: flex;
        align-items: center;
        line-height: 1;
        transition: color 0.15s;
      }

      .toggle-btn:hover {
        color: #ffffff;
      }

      .floating-badge.collapsed .session-title,
      .floating-badge.collapsed .badge-tag {
        display: none;
      }

      .floating-badge.collapsed {
        padding: 5px 8px;
      }
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="top-glow-bar"></div>
      <div class="floating-badge" id="badge-pill">
        <span class="status-dot"></span>
        <span class="badge-tag">${badgeText}</span>
        <span class="session-title">${escapeHtml(name)}</span>
        <button class="toggle-btn" id="btn-toggle" title="Minimizar / Expandir indicador">✕</button>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(wrapper);

    const badgePill = shadow.getElementById('badge-pill');
    const btnToggle = shadow.getElementById('btn-toggle');
    let collapsed = false;

    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      collapsed = !collapsed;
      if (collapsed) {
        badgePill.classList.add('collapsed');
        btnToggle.textContent = '🔒';
        btnToggle.title = 'Expandir indicador de sessão';
      } else {
        badgePill.classList.remove('collapsed');
        btnToggle.textContent = '✕';
        btnToggle.title = 'Minimizar indicador';
      }
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
