document.addEventListener('DOMContentLoaded', () => {
  const tabStatusBadge = document.getElementById('tab-status-badge');
  const tabUrlText = document.getElementById('tab-url-text');
  const activeSessionInfo = document.getElementById('active-session-info');
  const currentSessionBadge = document.getElementById('current-session-badge');
  const currentSessionName = document.getElementById('current-session-name');
  const isolateActions = document.getElementById('isolate-actions');
  const btnIsolateCurrent = document.getElementById('btn-isolate-current');
  const btnNewEmptySession = document.getElementById('btn-new-empty-session');
  const sessionsCount = document.getElementById('sessions-count');
  const sessionsList = document.getElementById('sessions-list');

  let activeTabState = null;

  // Carregar o estado atual da aba e a lista de sessões
  function refreshState() {
    chrome.runtime.sendMessage({ type: 'GET_TAB_STATE' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        tabUrlText.textContent = 'Não foi possível ler o estado da aba.';
        return;
      }

      const { activeTab, currentSession, sessions } = response;
      activeTabState = activeTab;

      if (activeTab && activeTab.url) {
        tabUrlText.textContent = activeTab.url;
      } else {
        tabUrlText.textContent = 'Aba do sistema ou sem URL';
      }

      // Atualizar status da aba
      if (currentSession) {
        tabStatusBadge.textContent = 'Isolada';
        tabStatusBadge.className = 'badge badge-active';
        
        activeSessionInfo.classList.remove('hidden');
        currentSessionBadge.textContent = currentSession.badgeText || 'S';
        currentSessionBadge.style.backgroundColor = currentSession.color || '#3b82f6';
        currentSessionName.textContent = currentSession.name;

        // Ocultar botão de isolar já que a aba já está isolada
        isolateActions.classList.add('hidden');
      } else {
        tabStatusBadge.textContent = 'Padrão';
        tabStatusBadge.className = 'badge badge-inactive';

        activeSessionInfo.classList.add('hidden');
        isolateActions.classList.remove('hidden');
      }

      // Renderizar lista de sessões
      renderSessions(sessions);
    });
  }

  // Renderizar itens da lista de sessões
  function renderSessions(sessions = []) {
    sessionsCount.textContent = sessions.length;
    sessionsList.innerHTML = '';

    if (sessions.length === 0) {
      sessionsList.innerHTML = `
        <div style="text-align: center; color: var(--text-sub); padding: 12px; font-size: 11px;">
          Nenhuma sessão salva ainda. Clique em "Isolar esta Aba" ou em um atalho rápido acima.
        </div>
      `;
      return;
    }

    sessions.forEach((session) => {
      const item = document.createElement('div');
      item.className = 'session-item';
      item.innerHTML = `
        <div class="session-item-left">
          <div class="session-color-dot" style="background-color: ${session.color || '#3b82f6'};"></div>
          <span class="session-item-name">${escapeHtml(session.name)}</span>
        </div>
        <div class="session-item-actions">
          <button class="icon-btn btn-open-session" title="Abrir aba nesta sessão" data-id="${session.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
          <button class="icon-btn btn-rename-session" title="Renomear sessão" data-id="${session.id}" data-name="${escapeHtml(session.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="icon-btn icon-btn-danger btn-delete-session" title="Excluir sessão" data-id="${session.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      // Eventos dos botões da lista
      item.querySelector('.btn-open-session').addEventListener('click', () => {
        const targetUrl = activeTabState && activeTabState.url && !activeTabState.url.startsWith('chrome') ? activeTabState.url : 'https://web.whatsapp.com';
        chrome.runtime.sendMessage({
          type: 'CREATE_NEW_ISOLATED_TAB',
          url: targetUrl,
          sessionId: session.id
        }, () => window.close());
      });

      item.querySelector('.btn-rename-session').addEventListener('click', (e) => {
        const newName = prompt('Novo nome para esta sessão:', session.name);
        if (newName && newName.trim()) {
          chrome.runtime.sendMessage({
            type: 'RENAME_SESSION',
            sessionId: session.id,
            newName: newName.trim()
          }, refreshState);
        }
      });

      item.querySelector('.btn-delete-session').addEventListener('click', () => {
        if (confirm(`Tem certeza que deseja excluir a "${session.name}"?`)) {
          chrome.runtime.sendMessage({
            type: 'DELETE_SESSION',
            sessionId: session.id
          }, refreshState);
        }
      });

      sessionsList.appendChild(item);
    });
  }

  // Isolar aba atual
  btnIsolateCurrent.addEventListener('click', () => {
    if (!activeTabState || !activeTabState.id) return;
    chrome.runtime.sendMessage({
      type: 'ISOLATE_TAB',
      tabId: activeTabState.id
    }, () => window.close());
  });

  // Botões de atalho rápido (WhatsApp, Gmail, etc.)
  document.querySelectorAll('.btn-quick').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      chrome.runtime.sendMessage({
        type: 'CREATE_NEW_ISOLATED_TAB',
        url: url
      }, () => window.close());
    });
  });

  // Criar nova sessão vazia
  btnNewEmptySession.addEventListener('click', () => {
    const targetUrl = activeTabState && activeTabState.url && !activeTabState.url.startsWith('chrome') ? activeTabState.url : 'https://web.whatsapp.com';
    chrome.runtime.sendMessage({
      type: 'CREATE_NEW_ISOLATED_TAB',
      url: targetUrl
    }, () => window.close());
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Carregar inicial
  refreshState();
});
