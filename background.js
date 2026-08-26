// Service Worker da Extensão MultiSession

// Paleta de cores padrão para sessões
const DEFAULT_COLORS = [
  '#3b82f6', // Azul
  '#10b981', // Verde
  '#f59e0b', // Amarelo/Laranja
  '#ec4899', // Rosa
  '#8b5cf6', // Roxo
  '#06b6d4', // Ciano
  '#ef4444'  // Vermelho
];

// Inicializar menus de contexto e dados ao instalar/atualizar a extensão
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'isolate_current_tab',
    title: 'Isolar esta aba em nova sessão',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'open_link_in_new_session',
    title: 'Abrir link em nova sessão isolada',
    contexts: ['link']
  });
});

// Manipular cliques no menu de contexto
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'isolate_current_tab' && tab) {
    await isolateTab(tab.id, null);
  } else if (info.menuItemId === 'open_link_in_new_session' && info.linkUrl) {
    const session = await createNewSession();
    const isolatedUrl = addSessionToUrl(info.linkUrl, session.id);
    await chrome.tabs.create({ url: isolatedUrl });
  }
});

// Auxiliar para gerar ID de sessão único
function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
}

// Obter todas as sessões salvas
async function getSessions() {
  const data = await chrome.storage.local.get(['sessions']);
  return data.sessions || {};
}

// Salvar sessões
async function saveSessions(sessions) {
  await chrome.storage.local.set({ sessions });
}

// Criar uma nova sessão
async function createNewSession(customName = null) {
  const sessions = await getSessions();
  const count = Object.keys(sessions).length + 1;
  const id = generateSessionId();
  const color = DEFAULT_COLORS[(count - 1) % DEFAULT_COLORS.length];
  
  const newSession = {
    id,
    name: customName || `Sessão ${count}`,
    color,
    badgeText: `S${count}`,
    createdAt: Date.now()
  };

  sessions[id] = newSession;
  await saveSessions(sessions);
  return newSession;
}

// Adicionar parâmetro de sessão à URL
function addSessionToUrl(urlString, sessionId) {
  try {
    const url = new URL(urlString);
    url.searchParams.set('__msession', sessionId);
    return url.toString();
  } catch (e) {
    if (urlString.includes('?')) {
      return `${urlString}&__msession=${sessionId}`;
    }
    return `${urlString}?__msession=${sessionId}`;
  }
}

// Extrair ID de sessão da URL
function getSessionIdFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.searchParams.get('__msession');
  } catch (e) {
    return null;
  }
}

// Isolar uma aba existente
async function isolateTab(tabId, targetSessionId = null) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    return;
  }

  let session;
  if (targetSessionId) {
    const sessions = await getSessions();
    session = sessions[targetSessionId];
  }
  
  if (!session) {
    session = await createNewSession();
  }

  const newUrl = addSessionToUrl(tab.url, session.id);
  await chrome.tabs.update(tabId, { url: newUrl });
  await updateTabBadge(tabId, session);
}

// Mapear cor em Hex para cores válidas do chrome.tabGroups
function getTabGroupColor(sessionColor = '') {
  if (sessionColor.includes('3b82f6')) return 'blue';
  if (sessionColor.includes('10b981')) return 'green';
  if (sessionColor.includes('f59e0b')) return 'yellow';
  if (sessionColor.includes('ec4899')) return 'pink';
  if (sessionColor.includes('8b5cf6')) return 'purple';
  if (sessionColor.includes('06b6d4')) return 'cyan';
  if (sessionColor.includes('ef4444')) return 'red';
  return 'blue';
}

// Atribuir a aba ao Grupo de Abas nativo do Chrome/Edge
async function assignTabToGroup(tabId, session) {
  if (!chrome.tabGroups) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || tab.pinned) return;

    const groups = await chrome.tabGroups.query({ windowId: tab.windowId, title: session.name });
    let groupId;

    if (groups && groups.length > 0) {
      groupId = groups[0].id;
      await chrome.tabs.group({ tabIds: tabId, groupId });
    } else {
      groupId = await chrome.tabs.group({ tabIds: tabId });
      const color = getTabGroupColor(session.color);
      await chrome.tabGroups.update(groupId, {
        title: session.name,
        color: color
      });
    }
  } catch (err) {
    // Ignorar erros caso a aba já esteja fechada ou em transição
  }
}

// Atualizar o Badge visual e o Grupo da aba no navegador
async function updateTabBadge(tabId, session) {
  if (session) {
    await chrome.action.setBadgeText({ tabId, text: session.badgeText || 'S' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: session.color || '#3b82f6' });
    await assignTabToGroup(tabId, session);
  } else {
    await chrome.action.setBadgeText({ tabId, text: '' });
  }
}

// Ouvir atualizações de abas para manter a cor e texto do Badge atualizados
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.url) {
    const sid = getSessionIdFromUrl(tab.url);
    if (sid) {
      const sessions = await getSessions();
      const session = sessions[sid];
      if (session) {
        await updateTabBadge(tabId, session);
        return;
      }
    }
  }
  await updateTabBadge(tabId, null);
});

// Responder a mensagens vindas da Popup UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'GET_TAB_STATE') {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const sessions = await getSessions();
      let currentSession = null;

      if (activeTab && activeTab.url) {
        const sid = getSessionIdFromUrl(activeTab.url);
        if (sid && sessions[sid]) {
          currentSession = sessions[sid];
        }
      }

      sendResponse({
        activeTab,
        currentSession,
        sessions: Object.values(sessions)
      });
    } else if (message.type === 'GET_SESSION_INFO') {
      const { sessionId } = message;
      const sessions = await getSessions();
      sendResponse(sessions[sessionId] || null);
    } else if (message.type === 'ISOLATE_TAB') {
      const { tabId, sessionId } = message;
      await isolateTab(tabId, sessionId);
      sendResponse({ success: true });
    } else if (message.type === 'CREATE_NEW_ISOLATED_TAB') {
      const { url, sessionId } = message;
      const sessions = await getSessions();
      let session = sessions[sessionId];
      
      if (!session) {
        session = await createNewSession();
      }

      const targetUrl = url || 'https://web.whatsapp.com';
      const isolatedUrl = addSessionToUrl(targetUrl, session.id);
      await chrome.tabs.create({ url: isolatedUrl });
      sendResponse({ success: true });
    } else if (message.type === 'RENAME_SESSION') {
      const { sessionId, newName } = message;
      const sessions = await getSessions();
      if (sessions[sessionId]) {
        sessions[sessionId].name = newName;
        await saveSessions(sessions);
      }
      sendResponse({ success: true });
    } else if (message.type === 'DELETE_SESSION') {
      const { sessionId } = message;
      const sessions = await getSessions();
      if (sessions[sessionId]) {
        delete sessions[sessionId];
        await saveSessions(sessions);
      }
      sendResponse({ success: true });
    }
  })();
  return true; // Manter canal assíncrono aberto
});
