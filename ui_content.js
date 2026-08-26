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
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="top-glow-bar"></div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(wrapper);
  }

})();
