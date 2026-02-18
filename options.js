// options.js – Flagged

const DEFAULT_SETTINGS = {
  blockedValues: ["India"],
  hideMode: "blur",      // "blur" | "hide"
  filterMode: "blocklist", // "blocklist" | "allowlist" | "flag_only"
  whitelist: [],           // array of handles
  extensionEnabled: true,
  fetchNewAccounts: true,
  showFlags: true,
  showFlagsFilteredOnly: false,
  blacklist: []
};

const CACHE_KEY = "flagged_cache";
let currentExtensionEnabled = DEFAULT_SETTINGS.extensionEnabled;
let currentFetchNewAccounts = DEFAULT_SETTINGS.fetchNewAccounts;
let currentHideMode = DEFAULT_SETTINGS.hideMode;
let currentShowFlags = DEFAULT_SETTINGS.showFlags;
let currentShowFlagsFilteredOnly = DEFAULT_SETTINGS.showFlagsFilteredOnly;
let currentBlacklist = DEFAULT_SETTINGS.blacklist;
let autoSaveTimer = null;
let rateLimitInterval = null;
let suppressBlockedAutoSave = false;
const ICON_ON = "icons/flagged_on.png";
const ICON_OFF = "icons/flagged_off.png";
const DB_NAME = "flagged-db";
const DB_STORE = "cache";
const DB_VERSION = 1;
let cacheDbPromise = null;

// --- Flag → country helper (minimal mapping + code fallback) ---

// ISO country code -> name (extend if you like)
const COUNTRY_NAMES = {
  IN: "India",
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  CN: "China",
  JP: "Japan",
  KR: "South Korea",
  CA: "Canada",
  AU: "Australia",
  BR: "Brazil",
  RU: "Russian Federation",
  MX: "Mexico",
  ZA: "South Africa",
  CH: "Switzerland",
  MK: "Macedonia",
  SY: "Syrian Arab Republic",
  VI: "US Virgin Islands",
  TC: "Turks and Caicos Islands",
  TT: "Trinidad and Tobago",
  MQ: "Martinique",
  LC: "Saint Lucia",
  CW: "Curacao",
  LA: "Lao People's Democratic Republic",
  SX: "Sint Maarten (Dutch part)",
  AG: "Antigua and Barbuda",
  GP: "Guadeloupe",
  BN: "Brunei Darussalam",
  VC: "Saint Vincent and the Grenadines",
  KN: "Saint Kitts and Nevis"
};

// Convert a single flag emoji 🇮🇳 -> "IN"
function flagEmojiToCode(flag) {
  if (!flag || flag.length < 4) return null;
  const codePoints = [...flag];
  if (codePoints.length !== 2) return null;
  const base = 0x1f1e6;
  const cp1 = codePoints[0].codePointAt(0);
  const cp2 = codePoints[1].codePointAt(0);
  if (cp1 < base || cp1 > 0x1f1ff || cp2 < base || cp2 > 0x1f1ff) return null;
  const c1 = String.fromCharCode(65 + (cp1 - base));
  const c2 = String.fromCharCode(65 + (cp2 - base));
  return c1 + c2;
}

// Convert any flags in a string into country names or region codes
function expandFlagsInLine(line) {
  const result = [];

  const regex = /([\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF])/g;
  let match;
  let hasFlag = false;

  while ((match = regex.exec(line)) !== null) {
    hasFlag = true;
    const flag = match[1];
    const code = flagEmojiToCode(flag); // e.g. "IN"
    if (!code) continue;

    if (COUNTRY_NAMES[code]) {
      result.push(COUNTRY_NAMES[code]);
    } else {
      result.push(code);
    }
  }

  if (!hasFlag) {
    result.push(line);
  }

  return result;
}

// --- IndexedDB helpers for cache ---
function supportsIndexedDB() {
  return typeof indexedDB !== "undefined";
}

function openCacheDb() {
  if (cacheDbPromise) return cacheDbPromise;
  if (!supportsIndexedDB()) {
    cacheDbPromise = Promise.reject(new Error("IndexedDB not supported"));
    return cacheDbPromise;
  }

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

async function idbCount() {
  try {
    const db = await openCacheDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const store = tx.objectStore(DB_STORE);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch (e) {
    console.warn("[Flagged] IDB count failed", e);
    return 0;
  }
}

async function idbClear() {
  try {
    const db = await openCacheDb();
    await new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (e) {
    console.warn("[Flagged] IDB clear failed", e);
  }
}

async function idbExportAll() {
  const out = {};
  try {
    const db = await openCacheDb();
    await new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const store = tx.objectStore(DB_STORE);
      const req = store.openCursor();
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          out[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  } catch (e) {
    console.warn("[Flagged] IDB export failed", e);
  }
  return out;
}

async function idbImportEntries(entries) {
  if (!entries || typeof entries !== "object") return 0;
  let imported = 0;
  try {
    const db = await openCacheDb();
    await new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      for (const [handle, entry] of Object.entries(entries)) {
        if (!handle) continue;
        if (!entry || typeof entry !== "object") continue;
        store.put({
          handle,
          country: entry.country || null,
          lastChecked: entry.lastChecked || Date.now()
        });
        imported++;
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.warn("[Flagged] IDB import failed", e);
  }
  return imported;
}

// --- Save / restore settings ---

function normalizeHandle(raw) {
  if (!raw) return null;
  let h = raw.trim();
  if (!h) return null;
  if (h.startsWith("@")) h = h.slice(1);
  return h.toLowerCase();
}

function saveOptions() {
  const text = document.getElementById("blockedValues").value;
  const hideMode =
    document.getElementById("hideModeToggle").checked ? "hide" : "blur";
  const filterMode = document.getElementById("filterMode").value;
  const whitelistText = document.getElementById("whitelist").value;
  const blacklistText = document.getElementById("blacklist").value;
  currentFetchNewAccounts = document.getElementById("fetchNew").checked;
  currentHideMode = hideMode;
  currentShowFlags = document.getElementById("showFlags").checked;
  const filteredOnlyEl = document.getElementById("showFlagsFilteredOnly");
  currentShowFlagsFilteredOnly = filteredOnlyEl
    ? filteredOnlyEl.checked
    : currentShowFlagsFilteredOnly;

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const normalizedBlocked = [];
  for (const line of lines) {
    const expanded = expandFlagsInLine(line);
    for (const v of expanded) {
      if (v && !normalizedBlocked.includes(v)) normalizedBlocked.push(v);
    }
  }

  const whitelistLines = whitelistText
    .split("\n")
    .map((l) => normalizeHandle(l))
    .filter((v) => !!v);

  const whitelist = Array.from(new Set(whitelistLines));

  const blacklistLines = blacklistText
    .split("\n")
    .map((l) => normalizeHandle(l))
    .filter((v) => !!v);

  const blacklist = Array.from(new Set(blacklistLines));
  currentBlacklist = blacklist;

  chrome.storage.sync.set(
    {
      blockedValues: normalizedBlocked,
      hideMode,
      filterMode,
      whitelist,
      extensionEnabled: currentExtensionEnabled,
      fetchNewAccounts: currentFetchNewAccounts,
      showFlags: currentShowFlags,
      showFlagsFilteredOnly: currentShowFlagsFilteredOnly,
      blacklist
    },
    () => {
      const statuses = [
        document.getElementById("status"),
        document.getElementById("whitelistStatus"),
        document.getElementById("blacklistStatus")
      ].filter(Boolean);
      statuses.forEach((el) => (el.textContent = "Saved"));
      setTimeout(() => {
        statuses.forEach((el) => (el.textContent = ""));
      }, 1500);
      document.getElementById("blockedValues").value =
        normalizedBlocked.join("\n");
    }
  );
}

function restoreOptions() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (data) => {
    const blockedValues = data.blockedValues || DEFAULT_SETTINGS.blockedValues;
    const hideMode = data.hideMode || DEFAULT_SETTINGS.hideMode;
    const filterMode = data.filterMode || DEFAULT_SETTINGS.filterMode;
    const whitelist = data.whitelist || DEFAULT_SETTINGS.whitelist;
    const blacklist = data.blacklist || DEFAULT_SETTINGS.blacklist;
    currentExtensionEnabled =
      data.extensionEnabled !== undefined
        ? !!data.extensionEnabled
        : DEFAULT_SETTINGS.extensionEnabled;
    currentFetchNewAccounts =
      data.fetchNewAccounts !== undefined
        ? !!data.fetchNewAccounts
        : DEFAULT_SETTINGS.fetchNewAccounts;
    currentHideMode = hideMode;
    currentShowFlags =
      data.showFlags !== undefined
        ? !!data.showFlags
        : DEFAULT_SETTINGS.showFlags;
    currentShowFlagsFilteredOnly = false; // force always show flags

    document.getElementById("blockedValues").value =
      blockedValues.join("\n");
    document.getElementById("filterMode").value = filterMode;
    document.getElementById("whitelist").value =
      whitelist.map((h) => "@" + h).join("\n");
    document.getElementById("blacklist").value =
      blacklist.map((h) => "@" + h).join("\n");
    document.getElementById("fetchNew").checked = currentFetchNewAccounts;
    document.getElementById("hideModeToggle").checked = hideMode === "hide";
    document.getElementById("showFlags").checked = currentShowFlags;
    currentBlacklist = blacklist;
    updateFlagFilteredToggleState();
    updateToggleButton();
  });
}

function updateFlagFilteredToggleState() {
  const showFlagsEl = document.getElementById("showFlags");
  const filteredOnlyEl = document.getElementById("showFlagsFilteredOnly");
  if (!showFlagsEl || !filteredOnlyEl) return;
  filteredOnlyEl.checked = false;
  filteredOnlyEl.disabled = true;
}

function scheduleAutoSave(immediate = false) {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  if (immediate) {
    saveOptions();
    return;
  }
  autoSaveTimer = setTimeout(saveOptions, 200);
}

function updateToggleButton() {
  const checkbox = document.getElementById("toggleExtension");
  const label = document.getElementById("extensionToggleLabel");
  const headerIcon = document.getElementById("headerIcon");
  if (!checkbox || !label) return;
  checkbox.checked = currentExtensionEnabled;
  label.textContent = currentExtensionEnabled ? "On" : "Off";
  if (headerIcon) {
    headerIcon.src = currentExtensionEnabled ? ICON_ON : ICON_OFF;
  }
  // notify background to swap toolbar icon
  try {
    chrome.runtime.sendMessage({
      type: "status",
      state: currentExtensionEnabled ? "active" : "off"
    });
  } catch (e) {
    // ignore; extension context might be unavailable
  }
}

function toggleExtension(e) {
  currentExtensionEnabled = e.target.checked;
  chrome.storage.sync.set(
    { extensionEnabled: currentExtensionEnabled },
    () => {
      updateToggleButton();
      const el = document.getElementById("extensionToggleStatus");
      if (el) {
        el.textContent = currentExtensionEnabled
          ? "X is now clean"
          : "Extension is OFF";
        setTimeout(() => (el.textContent = ""), 1500);
      }
    }
  );
}

function onFetchNewChange(e) {
  currentFetchNewAccounts = e.target.checked;
  chrome.storage.sync.set({ fetchNewAccounts: currentFetchNewAccounts }, () => {
    const el = document.getElementById("extensionToggleStatus");
    if (el) {
      el.textContent = currentFetchNewAccounts
        ? "Fetching new accounts enabled"
        : "Fetching new accounts disabled";
      setTimeout(() => (el.textContent = ""), 1500);
    }
  });
}

function onHideModeChange(e) {
  currentHideMode = e.target.checked ? "hide" : "blur";
  chrome.storage.sync.set({ hideMode: currentHideMode }, () => {
    const el = document.getElementById("extensionToggleStatus");
    if (el) {
      el.textContent =
        currentHideMode === "hide"
          ? "Fully hiding matching posts"
          : "Blurring matching posts";
      setTimeout(() => (el.textContent = ""), 1500);
    }
  });
}

// --- Cache controls ---

function updateCacheCount(count) {
  document.getElementById("cacheCount").textContent = String(count);
}

function loadCacheInfo() {
  idbCount().then((count) => updateCacheCount(count || 0));
}

function clearCache() {
  const currentCount = Number(
    document.getElementById("cacheCount")?.textContent || "0"
  );
  const ok = window.confirm(
    `Clear local cache${currentCount ? ` (${currentCount} entries)` : ""}? This cannot be undone.`
  );
  if (!ok) return;

  showProgress(true);
  const el = document.getElementById("cacheStatus");
  el.textContent = "Clearing cache...";

  idbClear().then(() => {
    setProgress(100);
    updateCacheCount(0);
    el.textContent = "Cache cleared.";
    setTimeout(() => {
      hideProgress();
      el.textContent = "";
    }, 2000);
  }).catch(() => {
    hideProgress();
    el.textContent = "Failed to clear cache.";
    setTimeout(() => (el.textContent = ""), 2000);
  });
}

function showProgress(indeterminate = true) {
  const progressBar = document.getElementById("dbProgress");
  const progressFill = document.getElementById("dbProgressFill");
  if (progressBar) {
    progressBar.classList.add("visible");
    if (indeterminate) {
      progressFill.classList.add("indeterminate");
      progressFill.style.width = "30%";
    } else {
      progressFill.classList.remove("indeterminate");
      progressFill.style.width = "0%";
    }
  }
}

function hideProgress() {
  const progressBar = document.getElementById("dbProgress");
  const progressFill = document.getElementById("dbProgressFill");
  if (progressBar) {
    progressBar.classList.remove("visible");
    progressFill.classList.remove("indeterminate");
    progressFill.style.width = "0%";
  }
}

function setProgress(percent) {
  const progressFill = document.getElementById("dbProgressFill");
  if (progressFill) {
    progressFill.classList.remove("indeterminate");
    progressFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }
}

function exportDb() {
  showProgress(true);
  const el = document.getElementById("cacheStatus");
  el.textContent = "Exporting...";

  idbExportAll().then((db) => {
    setProgress(50);
    const blob = new Blob([JSON.stringify(db, null, 2)], {
      type: "application/json"
    });
    setProgress(75);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flagged-db.json";
    a.click();
    URL.revokeObjectURL(url);
    setProgress(100);
    el.textContent = "Export complete.";
    setTimeout(() => {
      hideProgress();
      el.textContent = "";
    }, 2000);
  }).catch(() => {
    hideProgress();
    el.textContent = "Export failed.";
    setTimeout(() => el.textContent = "", 3000);
  });
}

function importDbFromFile(file) {
  showProgress(true);
  const el = document.getElementById("cacheStatus");
  el.textContent = "Reading file...";

  const reader = new FileReader();
  reader.onload = () => {
    try {
      setProgress(20);
      el.textContent = "Parsing data...";
      const imported = JSON.parse(reader.result);
      if (!imported || typeof imported !== "object") {
        throw new Error("Invalid JSON");
      }

      setProgress(40);
      el.textContent = "Loading existing cache...";
      idbExportAll().then((existing) => {
        setProgress(60);
        el.textContent = "Merging entries...";
        const merged = { ...(existing || {}) };
        let addedCount = 0;
        let updatedCount = 0;
        for (const [handle, entry] of Object.entries(imported)) {
          if (!entry || typeof entry !== "object") continue;
          if (!merged[handle]) {
            merged[handle] = entry;
            addedCount++;
          } else if (entry.lastChecked && entry.lastChecked > (merged[handle].lastChecked || 0)) {
            merged[handle] = entry;
            updatedCount++;
          }
        }

        setProgress(80);
        el.textContent = "Saving to database...";
        idbImportEntries(merged).then(() => {
          setProgress(90);
          idbCount().then((count) => {
            updateCacheCount(count || 0);
            setProgress(100);
            const parts = [];
            if (addedCount > 0) parts.push(`${addedCount.toLocaleString()} new`);
            if (updatedCount > 0) parts.push(`${updatedCount.toLocaleString()} updated`);
            el.textContent = parts.length
              ? `Merged: ${parts.join(", ")} — ${(count || 0).toLocaleString()} total.`
              : `Already up to date — ${(count || 0).toLocaleString()} entries.`;
            setTimeout(() => {
              hideProgress();
              el.textContent = "";
            }, 4000);
          });
        });
      }).catch(() => {
        hideProgress();
        el.textContent = "Import failed: database error.";
        setTimeout(() => (el.textContent = ""), 3000);
      });
    } catch (e) {
      hideProgress();
      el.textContent = "Import failed: invalid JSON.";
      setTimeout(() => (el.textContent = ""), 3000);
    }
  };
  reader.onerror = () => {
    hideProgress();
    el.textContent = "Import failed: could not read file.";
    setTimeout(() => (el.textContent = ""), 3000);
  };
  reader.readAsText(file);
}

// --- Rate-limit countdown ---

function startRateLimitCountdown(until) {
  const banner = document.getElementById("rateLimitBanner");
  const timerEl = document.getElementById("rateLimitTimer");
  if (!banner || !timerEl) return;

  if (rateLimitInterval) clearInterval(rateLimitInterval);

  function tick() {
    const remaining = Math.max(0, until - Date.now());
    if (remaining <= 0) {
      banner.style.display = "none";
      clearInterval(rateLimitInterval);
      rateLimitInterval = null;
      return;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    banner.style.display = "block";
  }

  tick();
  rateLimitInterval = setInterval(tick, 1000);
}

function checkRateLimitStatus() {
  let started = false;

  // Primary: ask background
  try {
    chrome.runtime.sendMessage({ type: "rate-limit:info" }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.rateLimitedUntil && res.rateLimitedUntil > Date.now()) {
        started = true;
        startRateLimitCountdown(res.rateLimitedUntil);
      }
    });
  } catch (e) {
    // extension context unavailable
  }

  // Fallback: read from storage.local (written directly by content script)
  try {
    chrome.storage.local.get("rateLimitedUntil", (data) => {
      if (started) return;
      if (data && data.rateLimitedUntil && data.rateLimitedUntil > Date.now()) {
        startRateLimitCountdown(data.rateLimitedUntil);
      }
    });
  } catch (e) {
    // ignore
  }
}

// --- Wiring ---

document.addEventListener("DOMContentLoaded", () => {
  restoreOptions();
  loadCacheInfo();
  checkRateLimitStatus();

  // Collapsible cards
  document.querySelectorAll(".card.collapsible").forEach((card) => {
    const header = card.querySelector(".card-header");
    if (header) {
      header.addEventListener("click", () => card.classList.toggle("open"));
    }
  });

  document.getElementById("clearCache").addEventListener("click", clearCache);
  document.getElementById("exportDb").addEventListener("click", exportDb);
  document
    .getElementById("toggleExtension")
    .addEventListener("change", toggleExtension);
  document
    .getElementById("fetchNew")
    .addEventListener("change", onFetchNewChange);
  document
    .getElementById("hideModeToggle")
    .addEventListener("change", onHideModeChange);
  document
    .getElementById("showFlags")
    .addEventListener("change", () => {
      updateFlagFilteredToggleState();
      scheduleAutoSave(true);
    });
  document
    .getElementById("importFile")
    .addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) importDbFromFile(file);
      e.target.value = "";
    });
  document
    .getElementById("blockedValues")
    .addEventListener("input", () => {
      if (suppressBlockedAutoSave) return;
      scheduleAutoSave(true);
    });
  document
    .getElementById("blockedValues")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        suppressBlockedAutoSave = true;
      }
    });
  document
    .getElementById("blockedValues")
    .addEventListener("keyup", () => {
      suppressBlockedAutoSave = false;
    });
  document
    .getElementById("blockedValues")
    .addEventListener("blur", saveOptions);
  document
    .getElementById("blockedValues")
    .addEventListener("change", saveOptions);
  document
    .getElementById("whitelist")
    .addEventListener("input", () => scheduleAutoSave(true));
  document
    .getElementById("whitelist")
    .addEventListener("blur", saveOptions);
  document
    .getElementById("blacklist")
    .addEventListener("input", () => scheduleAutoSave(true));
  document
    .getElementById("blacklist")
    .addEventListener("blur", saveOptions);
  document
    .getElementById("filterMode")
    .addEventListener("change", saveOptions);
  document
    .getElementById("aboutButton")
    .addEventListener("click", () => {
      // TODO: Update this URL when website is ready
      const websiteUrl = "https://pillgates.dev/flagged";
      window.open(websiteUrl, "_blank");
    });
  window.addEventListener("beforeunload", saveOptions);
});
