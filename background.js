// background.js – controls the extension icon badge

const ICON_ON = {
  16: "icons/flagged_on.png",
  32: "icons/flagged_on.png",
  48: "icons/flagged_on.png",
  128: "icons/flagged_on.png"
};

const ICON_OFF = {
  16: "icons/flagged_off.png",
  32: "icons/flagged_off.png",
  48: "icons/flagged_off.png",
  128: "icons/flagged_off.png"
};
const DB_NAME = "flagged-db";
const DB_STORE = "cache";
const DB_VERSION = 1;
let cacheDbPromise = null;
let rateLimitedUntil = 0;

// state: "active" | "rate_limited" | "off" | "idle"
function setStatus(state) {
  if (chrome.action?.setIcon) {
    if (state === "off") {
      chrome.action.setIcon({ path: ICON_OFF });
    } else if (state === "active" || state === "rate_limited" || state === "idle") {
      chrome.action.setIcon({ path: ICON_ON });
    } else {
      chrome.action.setIcon({ path: ICON_ON });
    }
  }

  if (state === "active") {
    chrome.action.setBadgeText({ text: "" }); // no dot
  } else if (state === "rate_limited") {
    chrome.action.setBadgeBackgroundColor({ color: "#d50000" }); // red
    chrome.action.setBadgeText({ text: "" }); // keep badge clear (icon communicates state)
  } else if (state === "off") {
    chrome.action.setBadgeText({ text: "" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// default when the worker spins up
chrome.runtime.onInstalled.addListener(() => {
  setStatus("active");
});

chrome.runtime.onStartup.addListener(() => {
  setStatus("active");
});

// listen to messages from content.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "status") {
    if (msg.state === "rate_limited" && msg.rateLimitedUntil) {
      rateLimitedUntil = msg.rateLimitedUntil;
      try { chrome.storage.local.set({ rateLimitedUntil }); } catch (_) {}
    } else if (msg.state === "active") {
      rateLimitedUntil = 0;
      try { chrome.storage.local.remove("rateLimitedUntil"); } catch (_) {}
    }
    setStatus(msg.state || "idle");
    return;
  }

  if (msg && msg.type === "rate-limit:info") {
    sendResponse({ rateLimitedUntil });
    return;
  }

  if (msg && msg.type === "cache:get") {
    const handle = msg.handle;
    openCacheDb()
      .then((db) => idbGet(db, handle))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err || "") }));
    return true; // async
  }

  if (msg && msg.type === "cache:put") {
    const { handle, country, lastChecked } = msg;
    openCacheDb()
      .then((db) => idbPut(db, handle, country, lastChecked))
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err || "") }));
    return true;
  }

  if (msg && msg.type === "cache:count") {
    openCacheDb()
      .then((db) => idbCount(db))
      .then((count) => sendResponse({ ok: true, count }))
      .catch((err) => sendResponse({ ok: false, error: String(err || "") }));
    return true;
  }
});

// reflect toggle changes even if no content script is alive
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.extensionEnabled || changes.enabled) {
    const newVal = changes.extensionEnabled
      ? changes.extensionEnabled.newValue
      : changes.enabled?.newValue;
    setStatus(newVal === false ? "off" : "active");
  }
});

function openCacheDb() {
  if (cacheDbPromise) return cacheDbPromise;

  cacheDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION); 
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "handle" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return cacheDbPromise;
}

function idbGet(db, handle) {
  if (!handle) return Promise.resolve(null);
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const store = tx.objectStore(DB_STORE);
    const req = store.get(handle);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

function idbPut(db, handle, country, lastChecked) {
  if (!handle) return Promise.resolve();
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const store = tx.objectStore(DB_STORE);
    const req = store.put({
      handle,
      country: country || null,
      lastChecked: lastChecked || Date.now()
    });
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

function idbCount(db) {
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const store = tx.objectStore(DB_STORE);
    const req = store.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => resolve(0);
  });
}
