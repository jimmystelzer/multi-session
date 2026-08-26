(function () {
  'use strict';

  // 1. Identificar se a aba possui uma sessão isolada ativa
  function getSessionId() {
    try {
      // Verificar parâmetro na URL (?__msession=... ou &#__msession=...)
      const urlParams = new URLSearchParams(window.location.search);
      let sid = urlParams.get('__msession');
      
      if (!sid && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        sid = hashParams.get('__msession');
      }

      // Se encontrado na URL, salvar no sessionStorage para navegações internas e relinks
      if (sid) {
        window.sessionStorage.setItem('__msession_id__', sid);
        return sid;
      }

      // Se não estiver na URL, verificar se já está no sessionStorage (restauração de aba/recarregamento)
      sid = window.sessionStorage.getItem('__msession_id__');
      if (sid) {
        return sid;
      }
    } catch (e) {
      console.error('[MultiSession] Erro ao obter ID da sessão:', e);
    }
    return null;
  }

  const sessionId = getSessionId();

  // Se a aba NÃO tiver uma sessão isolada atribuída, a extensão NÃO altera nada!
  if (!sessionId) {
    return;
  }

  console.log(`[MultiSession] Isolamento ATIVO para a sessão: ${sessionId}`);
  window.__MULTI_SESSION_ACTIVE__ = sessionId;

  const PREFIX = `__ms_${sessionId}__`;

  // --- 2. VIRTUALIZAÇÃO DO LOCALSTORAGE ---
  (function setupVirtualLocalStorage() {
    const rawLocalStorage = window.localStorage;
    const realGetItem = rawLocalStorage.getItem.bind(rawLocalStorage);
    const realSetItem = rawLocalStorage.setItem.bind(rawLocalStorage);
    const realRemoveItem = rawLocalStorage.removeItem.bind(rawLocalStorage);
    const realClear = rawLocalStorage.clear.bind(rawLocalStorage);
    const realKey = rawLocalStorage.key.bind(rawLocalStorage);

    function getSessionKeys() {
      const keys = [];
      for (let i = 0; i < rawLocalStorage.length; i++) {
        const k = realKey(i);
        if (k && k.startsWith(PREFIX)) {
          keys.push(k.substring(PREFIX.length));
        }
      }
      return keys;
    }

    const storageHandler = {
      getItem(key) {
        return realGetItem(PREFIX + key);
      },
      setItem(key, value) {
        realSetItem(PREFIX + key, String(value));
      },
      removeItem(key) {
        realRemoveItem(PREFIX + key);
      },
      clear() {
        const keys = getSessionKeys();
        keys.forEach((k) => realRemoveItem(PREFIX + k));
      },
      key(index) {
        const keys = getSessionKeys();
        return keys[index] !== undefined ? keys[index] : null;
      },
      get length() {
        return getSessionKeys().length;
      }
    };

    const storageProxy = new Proxy(storageHandler, {
      get(target, prop, receiver) {
        if (prop in target) {
          if (typeof target[prop] === 'function') {
            return target[prop].bind(target);
          }
          return target[prop];
        }
        return target.getItem(prop);
      },
      set(target, prop, value) {
        if (prop in target) {
          target[prop] = value;
          return true;
        }
        target.setItem(prop, value);
        return true;
      },
      deleteProperty(target, prop) {
        target.removeItem(prop);
        return true;
      },
      ownKeys() {
        return getSessionKeys();
      },
      getOwnPropertyDescriptor(target, prop) {
        const keys = getSessionKeys();
        if (keys.includes(prop)) {
          return {
            configurable: true,
            enumerable: true,
            value: target.getItem(prop),
            writable: true
          };
        }
        return undefined;
      }
    });

    try {
      Object.defineProperty(window, 'localStorage', {
        value: storageProxy,
        configurable: true,
        writable: false
      });
    } catch (err) {
      console.warn('[MultiSession] Não foi possível redefinir window.localStorage via Object.defineProperty, aplicando fallback.');
    }
  })();

  // --- 3. VIRTUALIZAÇÃO DO SESSIONSTORAGE ---
  (function setupVirtualSessionStorage() {
    const rawSessionStorage = window.sessionStorage;
    const realGetItem = rawSessionStorage.getItem.bind(rawSessionStorage);
    const realSetItem = rawSessionStorage.setItem.bind(rawSessionStorage);
    const realRemoveItem = rawSessionStorage.removeItem.bind(rawSessionStorage);
    const realKey = rawSessionStorage.key.bind(rawSessionStorage);

    function getSessionKeys() {
      const keys = [];
      for (let i = 0; i < rawSessionStorage.length; i++) {
        const k = realKey(i);
        if (k && k.startsWith(PREFIX) && k !== '__msession_id__') {
          keys.push(k.substring(PREFIX.length));
        }
      }
      return keys;
    }

    const sessionStorageHandler = {
      getItem(key) {
        if (key === '__msession_id__') return realGetItem('__msession_id__');
        return realGetItem(PREFIX + key);
      },
      setItem(key, value) {
        if (key === '__msession_id__') {
          realSetItem('__msession_id__', value);
          return;
        }
        realSetItem(PREFIX + key, String(value));
      },
      removeItem(key) {
        if (key === '__msession_id__') return;
        realRemoveItem(PREFIX + key);
      },
      clear() {
        const keys = getSessionKeys();
        keys.forEach((k) => realRemoveItem(PREFIX + k));
      },
      key(index) {
        const keys = getSessionKeys();
        return keys[index] !== undefined ? keys[index] : null;
      },
      get length() {
        return getSessionKeys().length;
      }
    };

    const sessionStorageProxy = new Proxy(sessionStorageHandler, {
      get(target, prop) {
        if (prop in target) {
          if (typeof target[prop] === 'function') {
            return target[prop].bind(target);
          }
          return target[prop];
        }
        return target.getItem(prop);
      },
      set(target, prop, value) {
        if (prop in target) {
          target[prop] = value;
          return true;
        }
        target.setItem(prop, value);
        return true;
      },
      deleteProperty(target, prop) {
        target.removeItem(prop);
        return true;
      }
    });

    try {
      Object.defineProperty(window, 'sessionStorage', {
        value: sessionStorageProxy,
        configurable: true,
        writable: false
      });
    } catch (err) {
      console.warn('[MultiSession] Fallback para sessionStorage.');
    }
  })();

  // --- 4. VIRTUALIZAÇÃO DO DOCUMENT.COOKIE ---
  (function setupVirtualCookies() {
    const COOKIE_STORAGE_KEY = PREFIX + 'cookies__';

    function getCookieMap() {
      try {
        const raw = window.localStorage.getItem(COOKIE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    }

    function saveCookieMap(map) {
      try {
        window.localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(map));
      } catch (e) {
        console.error('[MultiSession] Erro ao salvar cookies virtuais:', e);
      }
    }

    Object.defineProperty(document, 'cookie', {
      get() {
        const map = getCookieMap();
        const now = Date.now();
        const activeCookies = [];

        for (const [key, obj] of Object.entries(map)) {
          if (obj.expires && obj.expires < now) {
            delete map[key];
            continue;
          }
          activeCookies.push(`${key}=${obj.value}`);
        }
        saveCookieMap(map);
        return activeCookies.join('; ');
      },
      set(cookieString) {
        if (!cookieString || typeof cookieString !== 'string') return;
        const parts = cookieString.split(';').map((p) => p.trim());
        const [firstPart, ...options] = parts;
        const eqIdx = firstPart.indexOf('=');
        if (eqIdx === -1) return;

        const key = firstPart.substring(0, eqIdx).trim();
        const value = firstPart.substring(eqIdx + 1).trim();

        const map = getCookieMap();
        let expiresTime = null;

        options.forEach((opt) => {
          const [optKey, optVal] = opt.split('=').map((s) => s.trim().toLowerCase());
          if (optKey === 'max-age' && optVal) {
            const seconds = parseInt(optVal, 10);
            if (!isNaN(seconds)) {
              expiresTime = Date.now() + seconds * 1000;
            }
          } else if (optKey === 'expires' && optVal) {
            const parsedDate = Date.parse(optVal);
            if (!isNaN(parsedDate)) {
              expiresTime = parsedDate;
            }
          }
        });

        // Se o valor estiver vazio e houver data de expiração no passado, remove o cookie
        if (value === '' || (expiresTime && expiresTime < Date.now())) {
          delete map[key];
        } else {
          map[key] = {
            value: value,
            expires: expiresTime
          };
        }

        saveCookieMap(map);
      },
      configurable: true,
      enumerable: true
    });
  })();

  // --- 5. VIRTUALIZAÇÃO DO INDEXEDDB ---
  (function setupVirtualIndexedDB() {
    if (!window.indexedDB) return;

    const rawIDB = window.indexedDB;
    const realOpen = rawIDB.open.bind(rawIDB);
    const realDeleteDB = rawIDB.deleteDatabase.bind(rawIDB);

    rawIDB.open = function (name, version) {
      const prefixedName = PREFIX + name;
      return realOpen(prefixedName, version);
    };

    rawIDB.deleteDatabase = function (name) {
      const prefixedName = PREFIX + name;
      return realDeleteDB(prefixedName);
    };

    if (rawIDB.databases) {
      const realDatabases = rawIDB.databases.bind(rawIDB);
      rawIDB.databases = async function () {
        const dbs = await realDatabases();
        return dbs
          .filter((db) => db.name && db.name.startsWith(PREFIX))
          .map((db) => ({
            ...db,
            name: db.name.substring(PREFIX.length)
          }));
      };
    }
  })();

  // --- 6. VIRTUALIZAÇÃO DO BROADCASTCHANNEL ---
  (function setupVirtualBroadcastChannel() {
    if (!window.BroadcastChannel) return;

    const RawBroadcastChannel = window.BroadcastChannel;

    window.BroadcastChannel = function (channelName) {
      const prefixedChannel = PREFIX + channelName;
      return new RawBroadcastChannel(prefixedChannel);
    };
    window.BroadcastChannel.prototype = RawBroadcastChannel.prototype;
  })();

})();
