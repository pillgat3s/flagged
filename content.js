// ==========================
// Flagged - content.js
// ==========================

const DEFAULT_BLOCKED = ["India"];
const DEFAULT_WHITELIST = [];
const DEFAULT_BLACKLIST = [];
let blockedCountries = [...DEFAULT_BLOCKED];
let hideMode = "blur";
let fetchNewAccounts = true;
let showFlags = true;
let showFlagsFilteredOnly = false;
let filterMode = "blocklist";
let whitelistHandles = new Set(DEFAULT_WHITELIST);
let blacklistHandles = new Set(DEFAULT_BLACKLIST);

const OVERLAY_CLASS = "flagged-overlay";
const IS_CHAT_VIEW =
  location.pathname === "/chat" ||
  location.pathname.startsWith("/chat/") ||
  location.pathname.startsWith("/i/chats") ||
  location.pathname.startsWith("/i/chat");
function getPermalinkStatusId() {
  const match = location.pathname.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

function isPermalinkView() {
  return !!getPermalinkStatusId();
}

function handleRouteChange() {
  if (location.pathname === lastPathname) return;
  lastPathname = location.pathname;
  refreshOwnHandle();
  resetCheckedFlags();
  filterPage();
}

function watchNavigation() {
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  history.pushState = function (...args) {
    const ret = origPushState.apply(this, args);
    handleRouteChange();
    return ret;
  };

  history.replaceState = function (...args) {
    const ret = origReplaceState.apply(this, args);
    handleRouteChange();
    return ret;
  };

  window.addEventListener("popstate", handleRouteChange);
}
const RESERVED_PATHS = new Set([
  "home",
  "explore",
  "notifications",
  "messages",
  "settings",
  "i",
  "search",
  "topics",
  "lists",
  "bookmarks",
  "communitynotes",
  "communities"
]);
// Use the AboutAccountQuery ID you saw in DevTools
const QUERY_ID = "XRqGa7EeokUU5kppkh13EA";

// In-memory cache: handle -> { blocked: boolean, country: string | null }
const countryCache = new Map();

// Persistent DB key (for options.js)
const CACHE_KEY = "flagged_cache";
const dbLookupPromises = new Map();
const UNKNOWN_REFETCH_DELAY_MS = 5 * 60 * 1000; // refetch unknown entries after 5 minutes

// Queue
const handleQueue = [];
let activeFetches = 0;
const MAX_ACTIVE = 3;              // how aggressive you want to be
const REQUEST_INTERVAL_MS = 500;   // ms between queue ticks
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000; // wait 5 minutes after 429
const ISO_REGION_CODES = [
  "AC","AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ","BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","EH","ER","ES","ET","EU","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM","HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","XK","YE","YT","ZA","ZM","ZW","UK"
];
const ISO_REGION_SET = new Set(ISO_REGION_CODES);
const COUNTRY_NAME_OVERRIDES = {
  "united states": "US",
  usa: "US",
  us: "US",
  "united states of america": "US",
  america: "US",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "great britain": "GB",
  uae: "AE",
  "uae (dubai)": "AE",
  "north korea": "KP",
  "south korea": "KR",
  "south sudan": "SS",
  russia: "RU",
  "viet nam": "VN",
  "vatican city": "VA",
  palestine: "PS",
  kosovo: "XK",
  "czech republic": "CZ",
  "republic of the congo": "CG",
  "democratic republic of the congo": "CD",
  "congo": "CG",
  "congo republic": "CG",
  "congo-brazzaville": "CG",
  "congo brazzaville": "CG",
  "dr congo": "CD",
  drc: "CD",
  "congo-kinshasa": "CD",
  "congo kinshasa": "CD",
  "cote d'ivoire": "CI",
  "cote d’ivoire": "CI",
  "cote divoire": "CI",
  bolivia: "BO",
  "bolivia (plurinational state of)": "BO",
  "bosnia & herzegovina": "BA",
  "bosnia and herzegovina": "BA",
  bosnia: "BA",
  "iran": "IR",
  "lao": "LA",
  "laos": "LA",
  "korea": "KR",
  syria: "SY",
  swaziland: "SZ",
  eswatini: "SZ",
  tanzania: "TZ",
  venezuela: "VE",
  "venezuela (bolivarian republic of)": "VE",
  moldova: "MD",
  taiwan: "TW",
  macau: "MO",
  "macao": "MO",
  hongkong: "HK",
  "hong kong": "HK",
  turkey: "TR",
  turkiye: "TR",
  bangladesh: "BD",
  "us virgin islands": "VI",
  "u.s. virgin islands": "VI",
  "virgin islands, u.s.": "VI",
  "virgin islands (u.s.)": "VI",
  "virgin islands": "VI",
  macedonia: "MK",
  "north macedonia": "MK",
  "syrian arab republic": "SY",
  "russian federation": "RU",
  "turks and caicos islands": "TC",
  "trinidad and tobago": "TT",
  martinique: "MQ",
  "saint lucia": "LC",
  curacao: "CW",
  "lao people's democratic republic": "LA",
  "sint maarten (dutch part)": "SX",
  "antigua and barbuda": "AG",
  guadeloupe: "GP",
  "brunei darussalam": "BN",
  brunei: "BN",
  "saint vincent and the grenadines": "VC",
  "saint vincent": "VC",
  "st vincent and the grenadines": "VC",
  "st vincent": "VC",
  "saint kitts and nevis": "KN",
  "saint kitts": "KN",
  "st kitts and nevis": "KN",
  "st kitts": "KN"
};
const UNKNOWN_COUNTRY_TERMS = new Set(["unknown", "null", "none", "missing", "n/a", "na"]);
const CONTINENT_ABBREV = {
  africa: "AFR",
  "north africa": "AFR",
  "sub saharan africa": "AFR",
  "sub-saharan africa": "AFR",
  "western africa": "AFR",
  "eastern africa": "AFR",
  "southern africa": "AFR",
  "central africa": "AFR",
  europe: "EUR",
  asia: "AS",
  "east asia": "AS",
  "east asia pacific": "AS",
  "east asia & pacific": "AS",
  "east asia and pacific": "AS",
  "west asia": "AS",
  "western asia": "AS",
  "central asia": "AS",
  "south asia": "AS",
  "southeast asia": "AS",
  "south-east asia": "AS",
  "south east asia": "AS",
  "middle east": "AS",
  "north america": "NA",
  "central america": "NA",
  caribbean: "NA",
  "south america": "SA",
  "latin america": "SA",
  oceania: "OC",
  australasia: "OC",
  "pacific islands": "OC",
  antarctica: "ANT"
};
const FLAG_BADGE_CLASS = "flagged-flag-badge";
let regionDisplayNames = null;
const REGION_NAME_TO_CODE = new Map();
let tooltipEl = null;
const CONTINENT_SYMBOLS = {
  AFR: "🌍",
  EUR: "🇪🇺",
  AS: "🌏",
  OC: "🌏",
  NA: "🌎",
  SA: "🌎",
  ANT: "❄️"
};
const UNKNOWN_LOCATION_FLAG = "🌐";
const CONTINENT_GROUPS = {
  AFR: [
    "DZ","AO","BJ","BW","BF","BI","CM","CV","CF","TD","KM","CG","CD","CI","DJ","EG","GQ","ER","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG","MW","ML","MR","MU","YT","MA","MZ","NA","NE","NG","RE","RW","ST","SN","SC","SL","SO","ZA","SS","SD","SZ","TZ","TG","TN","UG","EH","ZM","ZW"
  ],
  EUR: [
    "AL","AD","AM","AT","AZ","BY","BE","BA","BG","HR","CY","CZ","DK","EE","FI","FR","GE","DE","GI","GR","HU","IS","IE","IT","KZ","XK","LV","LI","LT","LU","MT","MD","MC","ME","NL","MK","NO","PL","PT","RO","RU","SM","RS","SK","SI","ES","SE","CH","TR","UA","GB","UK","VA"
  ],
  AS: [
    "AF","AE","AM","AZ","BH","BD","BT","BN","KH","CN","CY","GE","IN","ID","IR","IQ","IL","JP","JO","KZ","KW","KG","LA","LB","MO","MY","MV","MN","MM","NP","KP","OM","PK","PS","PH","QA","SA","SG","KR","LK","SY","TJ","TH","TM","AE","UZ","VN","YE","HK","TW"
  ],
  OC: [
    "AU","NZ","FJ","PG","SB","VU","FM","MH","MP","GU","PW","NR","KI","TV","WS","TO","NU","CK","PF","NC","WF","TK"
  ],
  NA: [
    "US","CA","MX","BZ","CR","SV","GT","HN","NI","PA","GL","PM","HT","DO","PR","BS","BB","JM","TT","VC","LC","GD","AG","DM","KN","KY","BM","AI","VG","VI","TC","AW","CW","SX","BQ","MQ","GP","BL","MF"
  ],
  SA: [
    "AR","BO","BR","CL","CO","EC","FK","GF","GY","PY","PE","SR","UY","VE"
  ],
  ANT: ["AQ","BV","TF","GS","HM"]
};
const RECOMMENDED_LABEL_MARKERS = [
  "recommended",
  "recommended tweets",
  "more tweets",
  "you might like",
  "for you",
  "because you follow",
  "because you liked",
  "similar to this"
];
let lastPathname = location.pathname;
async function bgCacheGet(handle) {
  return new Promise((resolve) => {
    const key = canonicalHandle(handle);
    if (!key) return resolve(null);
    try {
      chrome.runtime.sendMessage(
        { type: "cache:get", handle: key },
        (res) => {
          const err = chrome.runtime.lastError;
          if (err) {
            resolve(null);
            return;
          }

          if (!res || res.ok === false) {
            resolve(null);
            return;
          }

          resolve(res.result || null);
        }
      );
    } catch (e) {
      resolve(null);
    }
  });
}

async function bgCachePut(handle, country) {
  return new Promise((resolve) => {
    const key = canonicalHandle(handle);
    if (!key) return resolve();
    try {
      chrome.runtime.sendMessage(
        { type: "cache:put", handle: key, country, lastChecked: Date.now() },
        () => {
          chrome.runtime.lastError; // suppress unchecked error
          resolve();
        }
      );
    } catch (e) {
      resolve();
    }
  });
}

// global on/off
let noJeetEnabled = true;
let rateLimitedUntil = 0;
let ownHandle = null;

function isBookmarksView() {
  return (
    location.pathname === "/i/bookmarks" ||
    location.pathname.startsWith("/i/bookmarks/")
  );
}

function refreshOwnHandle() {
  const profileLink = document.querySelector(
    'a[data-testid="AppTabBar_Profile_Link"]'
  );
  if (profileLink) {
    const href = profileLink.getAttribute("href") || "";
    const part = href.split("/").filter(Boolean)[0];
    if (part && !RESERVED_PATHS.has(part)) {
      ownHandle = part.toLowerCase();
    }
  }
}

// -----------------------------
// Extension icon badge (dot)
// -----------------------------
function setExtensionStatus(state) {
  try {
    // Content scripts cannot paint the action badge directly in MV3; forward to background.
    if (chrome.runtime?.sendMessage) {
      const payload = { type: "status", state };
      if (state === "rate_limited") payload.rateLimitedUntil = rateLimitedUntil;
      chrome.runtime.sendMessage(payload);
    }

    if (!chrome.action) return; // in case host allows direct access

    if (state === "active") {
      chrome.action.setBadgeText({ text: "" });
    } else if (state === "rate_limited") {
      chrome.action.setBadgeText({ text: "" });
    } else if (state === "off") {
      chrome.action.setBadgeText({ text: "" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch (e) {
    // ignore badge errors
  }
}

// -----------------------------
// Settings
// -----------------------------
function loadSettings() {
  chrome.storage.sync.get(
    {
      blockedValues: DEFAULT_BLOCKED,
      blockedCountries: DEFAULT_BLOCKED,
      extensionEnabled: true,
      enabled: true, // legacy key
      fetchNewAccounts: true,
      hideMode: "blur",
      filterMode: "blocklist",
      showFlags: true,
      showFlagsFilteredOnly: false,
      whitelist: DEFAULT_WHITELIST,
      blacklist: DEFAULT_BLACKLIST
    },
    (data) => {
      blockedCountries =
        data.blockedValues ||
        data.blockedCountries ||
        DEFAULT_BLOCKED;

      hideMode = data.hideMode || "blur";
      fetchNewAccounts =
        data.fetchNewAccounts !== undefined
          ? !!data.fetchNewAccounts
          : true;
  filterMode = data.filterMode || "blocklist";
      showFlags =
        data.showFlags !== undefined ? !!data.showFlags : true;
  showFlagsFilteredOnly =
    data.showFlagsFilteredOnly !== undefined
      ? !!data.showFlagsFilteredOnly
      : false;
  const whitelist = data.whitelist || DEFAULT_WHITELIST;
  const blacklist = data.blacklist || DEFAULT_BLACKLIST;
  setHandleLists(whitelist, blacklist);

      const enabledFromStorage =
        data.extensionEnabled !== undefined
          ? data.extensionEnabled
          : data.enabled;

      applyEnabledState(enabledFromStorage !== false);

      recomputeCacheMatches();
      if (noJeetEnabled) filterPage();
    }
  );
}

function applyEnabledState(enabled) {
  noJeetEnabled = enabled;
  if (noJeetEnabled) {
    setExtensionStatus("active");
    filterPage();
  } else {
    setExtensionStatus("off");
    clearOverlays();
    resetCheckedFlags();
    handleQueue.length = 0;
  }
}

// react live to changes from options page
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      if (changes.extensionEnabled || changes.enabled) {
        const newVal = changes.extensionEnabled
          ? changes.extensionEnabled.newValue
          : changes.enabled.newValue;
        applyEnabledState(newVal !== false);
      }

      if (changes.filterMode) {
        filterMode = changes.filterMode.newValue || "blocklist";
        recomputeCacheMatches();
        resetCheckedFlags();
        if (noJeetEnabled) filterPage();
      }

      if (changes.showFlags) {
        showFlags = !!changes.showFlags.newValue;
        resetCheckedFlags();
        if (noJeetEnabled) filterPage();
      }

      if (changes.showFlagsFilteredOnly) {
        showFlagsFilteredOnly = !!changes.showFlagsFilteredOnly.newValue;
        resetCheckedFlags();
        if (noJeetEnabled) filterPage();
      }

      if (changes.fetchNewAccounts) {
        fetchNewAccounts = !!changes.fetchNewAccounts.newValue;
        if (!fetchNewAccounts) handleQueue.length = 0;
      }

      if (changes.hideMode) {
        hideMode = changes.hideMode.newValue || "blur";
        resetCheckedFlags();
        filterPage();
      }

      if (changes.blockedValues || changes.blockedCountries) {
        const updatedList =
          changes.blockedValues?.newValue ||
          changes.blockedCountries?.newValue ||
          DEFAULT_BLOCKED;
        blockedCountries = updatedList;
        recomputeCacheMatches();
        resetCheckedFlags();
        if (noJeetEnabled) filterPage();
      }

      if (changes.whitelist || changes.blacklist) {
        const whitelist =
          changes.whitelist?.newValue || Array.from(whitelistHandles);
        const blacklist =
          changes.blacklist?.newValue || Array.from(blacklistHandles);
        setHandleLists(whitelist, blacklist);
        resetCheckedFlags();
        if (noJeetEnabled) filterPage();
      }
    }
  });
}

// -----------------------------
// Persistent DB helpers
// -----------------------------
function loadLocalDB() {
  try {
    chrome.runtime.sendMessage({ type: "cache:count" }, () => {
      chrome.runtime.lastError; // suppress unchecked error
    });
  } catch (e) {
    // ignore
  }
}

function saveEntryToLocalDB(handle, country) {
  if (!handle) return;
  bgCachePut(handle, country);
}

// -----------------------------
// Helpers
// -----------------------------
function normalizeCountryName(country) {
  if (!country) return "";
  return String(country)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isNonEUEurope(normalized) {
  if (!normalized) return false;
  return (
    normalized.includes("non eu") ||
    normalized.includes("non-eu") ||
    normalized.includes("non european") ||
    normalized.includes("non-european") ||
    normalized.includes("(non eu") ||
    normalized.includes("(non-eu")
  );
}

function isCountryInFilterList(country) {
  const normalizedCountry = normalizeCountryName(country);
  const countryCode = countryCodeFromName(country);
  if (!normalizedCountry) {
    // allow blocking accounts with no reported location by adding "unknown" or "null" to the list
    return blockedCountries.some((c) =>
      UNKNOWN_COUNTRY_TERMS.has(normalizeCountryName(c))
    );
  }

  return blockedCountries.some((c) => {
    const normalizedBlocked = normalizeCountryName(c);
    if (!normalizedBlocked) return false;
    if (normalizedCountry === normalizedBlocked) return true;

    const blockedCode = countryCodeFromName(c);
    if (countryCode && blockedCode && countryCode === blockedCode) return true;

    return false;
  });
}

function computeShouldFilter(matchesList) {
  if (filterMode === "allowlist") {
    return !matchesList;
  }

  if (filterMode === "flag_only") {
    return false;
  }

  // blocklist default
  return matchesList;
}

function ensureTooltip() {
  if (tooltipEl) return tooltipEl;
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.zIndex = "999999";
  el.style.pointerEvents = "none";
  el.style.background = "rgba(0,0,0,0.9)";
  el.style.color = "#fff";
  el.style.padding = "6px 10px";
  el.style.borderRadius = "8px";
  el.style.fontSize = "13px";
  el.style.fontWeight = "600";
  el.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  el.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
  el.style.opacity = "0";
  el.style.transition = "opacity 80ms ease, transform 80ms ease";
  el.style.transform = "translateY(-2px)";
  document.body.appendChild(el);
  tooltipEl = el;
  return tooltipEl;
}

function hideTooltip() {
  if (!tooltipEl) return;
  tooltipEl.style.opacity = "0";
}

function showTooltip(text, clientX, clientY) {
  const el = ensureTooltip();
  el.textContent = text;
  const margin = 12;
  const maxWidth = Math.min(window.innerWidth - margin * 2, 280);
  el.style.maxWidth = `${maxWidth}px`;
  el.style.left = `${Math.min(clientX + margin, window.innerWidth - margin - maxWidth)}px`;
  el.style.top = `${Math.max(clientY - 10, margin)}px`;
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
}

function initRegionLookup() {
  if (regionDisplayNames) return;
  try {
    regionDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });
    ISO_REGION_CODES.forEach((code) => {
      const name = regionDisplayNames.of(code);
      if (name) {
        REGION_NAME_TO_CODE.set(normalizeCountryName(name), code);
      }
    });
  } catch (e) {
    regionDisplayNames = null;
  }
}

function continentCodeToSymbol(code) {
  if (!code) return null;
  const upper = code.toUpperCase();
  return CONTINENT_SYMBOLS[upper] || upper;
}

function continentFromCode(code) {
  if (!code) return null;
  const upper = code.toUpperCase();
  for (const [abbr, codes] of Object.entries(CONTINENT_GROUPS)) {
    if (codes.includes(upper)) return continentCodeToSymbol(abbr);
  }
  return null;
}

function countryCodeFromName(country) {
  if (!country) return null;
  const normalized = normalizeCountryName(country);
  if (!normalized) return null;

  if (normalized.length === 2 && ISO_REGION_SET.has(country.toUpperCase())) {
    return country.toUpperCase();
  }

  if (COUNTRY_NAME_OVERRIDES[normalized]) {
    return COUNTRY_NAME_OVERRIDES[normalized];
  }

  initRegionLookup();
  if (REGION_NAME_TO_CODE.has(normalized)) {
    return REGION_NAME_TO_CODE.get(normalized);
  }

  return null;
}

function codeToFlagEmoji(code) {
  if (!code || code.length !== 2) return null;
  const upper = code.toUpperCase();
  const A = 0x1f1e6;
  const first = upper.charCodeAt(0);
  const second = upper.charCodeAt(1);
  if (first < 65 || first > 90 || second < 65 || second > 90) return null;
  return String.fromCodePoint(A + (first - 65)) + String.fromCodePoint(A + (second - 65));
}

function countryToFlag(country) {
  if (!country) return UNKNOWN_LOCATION_FLAG;
  const normalized = normalizeCountryName(country);
  if (UNKNOWN_COUNTRY_TERMS.has(normalized)) return UNKNOWN_LOCATION_FLAG;
  if (isNonEUEurope(normalized)) return continentCodeToSymbol("AFR");

  if (normalized.includes("europe")) {
    return codeToFlagEmoji("EU") || "🇪🇺";
  }
  const continentCode = CONTINENT_ABBREV[normalized];
  if (continentCode) return continentCodeToSymbol(continentCode);
  const code = countryCodeFromName(country);
  if (!code) return null;
  return codeToFlagEmoji(code) || code;
}

function countryToContinent(country) {
  const code = countryCodeFromName(country);
  if (code) {
    return continentFromCode(code);
  }
  const normalized = normalizeCountryName(country);
  if (isNonEUEurope(normalized)) return continentCodeToSymbol("AFR");
  if (normalized.includes("europe")) return codeToFlagEmoji("EU") || "🇪🇺";
  const continentCode = CONTINENT_ABBREV[normalized];
  if (continentCode) return continentCodeToSymbol(continentCode);
  return null;
}

function buildCacheEntry(country, lastChecked = Date.now()) {
  const matchesList = isCountryInFilterList(country);
  const shouldFilter = computeShouldFilter(matchesList);
  const flag = countryToFlag(country);
  const continent = countryToContinent(country);
  return {
    country: country || null,
    matchesList,
    shouldFilter,
    flag,
    continent,
    lastFetched: lastChecked || Date.now()
  };
}

function recomputeCacheMatches() {
  for (const [handle, entry] of countryCache.entries()) {
    const updated = buildCacheEntry(entry.country, entry.lastFetched);
    countryCache.set(handle, updated);
  }
}

function normalizeHandleValue(raw) {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  return trimmed.replace(/^@/, "").toLowerCase();
}

function canonicalHandle(raw) {
  return normalizeHandleValue(raw);
}

function setHandleLists(whitelist, blacklist) {
  whitelistHandles = new Set(
    (whitelist || []).map((h) => normalizeHandleValue(h)).filter(Boolean)
  );
  blacklistHandles = new Set(
    (blacklist || []).map((h) => normalizeHandleValue(h)).filter(Boolean)
  );
}

function isWhitelisted(handle) {
  if (!handle) return false;
  return whitelistHandles.has(normalizeHandleValue(handle));
}

function isBlacklisted(handle) {
  if (!handle) return false;
  return blacklistHandles.has(normalizeHandleValue(handle));
}

function matchesPermalinkTweet(el) {
  const permalinkId = getPermalinkStatusId();
  if (!isPermalinkView() || !permalinkId) return false;
  const links = el.querySelectorAll('a[href*="/status/"]');
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const match = href.match(/\/status\/(\d+)/);
    if (match && match[1] === permalinkId) {
      return true;
    }
  }
  return false;
}

function isRecommendedDetailTweet(el) {
  if (!isPermalinkView()) return false;

  const socialContext = el.querySelector('[data-testid="socialContext"]');
  if (socialContext) {
    const text = (socialContext.textContent || "").toLowerCase();
    if (RECOMMENDED_LABEL_MARKERS.some((marker) => text.includes(marker))) {
      return true;
    }
  }

  const labeledAncestor = el.closest('section[aria-label], div[aria-label]');
  if (labeledAncestor) {
    const label = (labeledAncestor.getAttribute("aria-label") || "").toLowerCase();
    if (RECOMMENDED_LABEL_MARKERS.some((marker) => label.includes(marker))) {
      return true;
    }
  }

  return false;
}

function shouldBypassFiltering(el, { isBlacklisted: isBlack = false } = {}) {
  if (!isPermalinkView() || isBlack) return false;
  if (matchesPermalinkTweet(el)) return true;
  if (isRecommendedDetailTweet(el)) return true;
  return false;
}

function requestCacheEntry(handle) {
  if (!handle) return Promise.resolve(null);
  if (countryCache.has(handle)) {
    return Promise.resolve(countryCache.get(handle));
  }

  if (dbLookupPromises.has(handle)) {
    return dbLookupPromises.get(handle);
  }

  const promise = bgCacheGet(handle)
    .then((stored) => {
      if (stored && Object.prototype.hasOwnProperty.call(stored, "country")) {
        const entry = buildCacheEntry(stored.country);
        countryCache.set(handle, entry);
        return entry;
      }
      if (fetchNewAccounts) enqueue(handle);
      return null;
    })
    .catch(() => {
      if (fetchNewAccounts) enqueue(handle);
      return null;
    })
    .finally(() => {
      dbLookupPromises.delete(handle);
    });

  dbLookupPromises.set(handle, promise);
  return promise;
}

function buildQueryUrl(handle) {
  const vars = encodeURIComponent(JSON.stringify({ screenName: handle }));
  return `https://x.com/i/api/graphql/${QUERY_ID}/AboutAccountQuery?variables=${vars}`;
}

function getHandleFromTweet(tweetEl) {
  const a = tweetEl.querySelector('a[href^="/"][role="link"]');
  if (!a) return null;

  const href = a.getAttribute("href") || "";
  const part = href.split("/").filter(Boolean)[0];
  if (!part) return null;

  if (RESERVED_PATHS.has(part))
    return null;

  return part;
}

function getAuthorHandle(tweetEl) {
  const authorLink = tweetEl.querySelector(
    'div[data-testid="User-Name"] a[href^="/"][role="link"]'
  );
  if (authorLink) {
    const href = authorLink.getAttribute("href") || "";
    const part = href.split("/").filter(Boolean)[0];
    if (part) return part;
  }
  return getHandleFromTweet(tweetEl);
}

function getHandleFromUserCell(cellEl) {
  // Prefer href-based handles
  const link =
    cellEl.querySelector('a[href^="/"][role="link"]') ||
    cellEl.querySelector('a[href^="/"]');

  if (link) {
    const href = link.getAttribute("href") || "";
    const part = href.split("/").filter(Boolean)[0] || null;
    if (part && !part.startsWith("i")) return part; // normal handle paths
  }

  // Fallback: look for visible @handle text inside the cell
  const handleSpan = Array.from(cellEl.querySelectorAll("span, div")).find(
    (node) => {
      const text = (node.textContent || "").trim();
      return /^@[\w.]+$/i.test(text);
    }
  );

  if (handleSpan) {
    return handleSpan.textContent.replace(/^@/, "");
  }

  // Fallback: aria-labels often contain "@handle"
  const withAria = [cellEl, ...Array.from(cellEl.querySelectorAll("[aria-label]"))];
  for (const node of withAria) {
    const label = (node.getAttribute("aria-label") || "").trim();
    const m = label.match(/@([\w.]+)/);
    if (m && m[1]) return m[1];
  }

  return null;
}


function enqueue(handle) {
  if (!noJeetEnabled) return;
  if (!fetchNewAccounts) return;
  const key = canonicalHandle(handle);
  if (!key) return;
  if (countryCache.has(key)) return;
  if (handleQueue.includes(key)) return;
  handleQueue.push(key);
}

// -----------------------------
// Fetch account country (GET)
// -----------------------------
async function processQueue() {
  if (!noJeetEnabled) return;
  if (!fetchNewAccounts) return;
  if (Date.now() < rateLimitedUntil) {
    setExtensionStatus("rate_limited");
    return;
  }
  if (activeFetches >= MAX_ACTIVE) return;

  const handle = handleQueue.shift();
  if (!handle) return;

  activeFetches++;

  try {
    let csrf = null;
    const m = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
    if (m) csrf = decodeURIComponent(m[1]);

    const url = buildQueryUrl(handle);

    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        "Authorization":
          "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
        "X-Csrf-Token": csrf || ""
      }
    });

    if (res.status === 429) {
      rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      try { chrome.storage.local.set({ rateLimitedUntil }); } catch (_) {}
      setExtensionStatus("rate_limited");
      countryCache.set(handle, buildCacheEntry(null));
      return;
    }

    if (!res.ok) {
      countryCache.set(handle, buildCacheEntry(null));
      return;
    }

    let json;
    try {
      json = await res.json();
    } catch (e) {
      countryCache.set(handle, buildCacheEntry(null));
      return;
    }

    const country =
      json?.data?.user_result_by_screen_name?.result?.about_profile
        ?.account_based_in || null;

    countryCache.set(handle, buildCacheEntry(country));
    saveEntryToLocalDB(handle, country); // <-- persist to DB

    if (noJeetEnabled) {
      setExtensionStatus("active");
      try { chrome.storage.local.remove("rateLimitedUntil"); } catch (_) {}
    }
  } catch (e) {
    countryCache.set(handle, buildCacheEntry(null));
  } finally {
    activeFetches--;
    filterPage();
  }
}

// --- Init lifecycle ---
let started = false;

function clearOverlays() {
  document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((overlay) => {
    const parent = overlay.parentElement;
    overlay.remove();
    if (parent) {
      delete parent.dataset.flaggedBlured;
      delete parent.dataset.flaggedRevealed;
    }
  });
}

function resetCheckedFlags() {
  document
    .querySelectorAll('article[data-testid="tweet"], div[data-testid="UserCell"]')
    .forEach((el) => {
      delete el.dataset.flaggedChecked;
      delete el.dataset.flaggedBlured;
      delete el.dataset.flaggedRevealed;
      if (el.dataset.flaggedHidden === "1") {
        el.style.display = "";
      }
      delete el.dataset.flaggedHidden;
      delete el.dataset.flaggedEnqueued;
      delete el.dataset.flaggedEnqueuedAuthor;
      delete el.dataset.flaggedProcessed;
      delete el.dataset.flaggedProcessedAuthor;
      delete el.dataset.flaggedDbLookup;
      delete el.dataset.flaggedDbLookupAuthor;
      removeFlagBadges(el);
    });
}

function clearElementState(el) {
  const overlay = el.querySelector(`.${OVERLAY_CLASS}`);
  if (overlay) overlay.remove();
  if (el.dataset.flaggedHidden === "1") {
    el.style.display = "";
  }
  removeFlagBadges(el);
  delete el.dataset.flaggedBlured;
  delete el.dataset.flaggedRevealed;
  delete el.dataset.flaggedHidden;
}

function hideElement(el) {
  clearElementState(el);
  el.style.display = "none";
  el.dataset.flaggedHidden = "1";
}

function removeFlagBadges(root) {
  if (!root) return;
  root.querySelectorAll(`.${FLAG_BADGE_CLASS}`).forEach((badge) => badge.remove());
}

function shouldShowFlag(cached) {
  if (!showFlags) return false;
  if (!cached || !cached.flag) return false;
  if (showFlagsFilteredOnly) return !!cached.matchesList;
  return true;
}

function renderFlagBadge(el, cached) {
  if (!shouldShowFlag(cached)) {
    removeFlagBadges(el);
    return;
  }

  // Prefer explicit user name containers, otherwise fall back to the provided element
  const nameContainer =
    el.querySelector('div[data-testid="User-Name"]') ||
    el.querySelector('div[data-testid="UserName"]') ||
    el;

  const target =
    nameContainer.querySelector('a[href^="/"][role="link"]') ||
    nameContainer.querySelector('a[href^="/"]') ||
    nameContainer;

  if (!target) return;

  const inlineRow =
    nameContainer.querySelector('div[dir="auto"] span[dir="auto"]') ||
    nameContainer.querySelector('div[dir="auto"]') ||
    nameContainer.querySelector('span[dir="auto"]') ||
    nameContainer.firstElementChild ||
    target;

  removeFlagBadges(inlineRow);

  const flag = cached.flag || null;
  const continentText = cached.continent || "";
  const locationText = cached.country || continentText || "unknown";

  let label = flag || locationText;

  const badge = document.createElement("span");
  badge.className = FLAG_BADGE_CLASS;
  badge.textContent = label;
  badge.style.marginLeft = "6px";
  badge.style.setProperty("fontSize", "14px", "important");
  badge.style.lineHeight = "1.2";
  badge.style.fontWeight = "700";
  badge.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  badge.style.verticalAlign = "middle";
  badge.style.alignSelf = "center";
  badge.style.userSelect = "none";
  badge.style.filter = "drop-shadow(0 1px 2px rgba(0,0,0,0.35))";
  badge.style.display = "inline-flex";
  badge.style.alignItems = "center";
  badge.setAttribute(
    "aria-label",
    `Account location: ${cached.country || "unknown"}${continentText ? ` (${continentText})` : ""}`
  );
  badge.title = cached.country || "unknown";
  const tooltipText = badge.title;
  badge.addEventListener("mouseenter", (e) => showTooltip(tooltipText, e.clientX, e.clientY));
  badge.addEventListener("mousemove", (e) => showTooltip(tooltipText, e.clientX, e.clientY));
  badge.addEventListener("mouseleave", hideTooltip);

  const nameSpan =
    inlineRow.querySelector('span[dir="auto"] span') ||
    inlineRow.querySelector('span[dir="auto"]') ||
    inlineRow.querySelector("span");

  if (nameSpan && nameSpan.parentElement) {
    nameSpan.parentElement.insertBefore(badge, nameSpan.nextSibling);
    return;
  }

  // fallback: append to inlineRow
  inlineRow.appendChild(badge);
}

// -----------------------------
// Blur overlay
// -----------------------------
function addOverlay(el, country, isBlacklisted = false) {
  if (!noJeetEnabled) return;
  if (el.dataset.flaggedHidden === "1") return;
  if (el.dataset.flaggedBlured === "1" || el.dataset.flaggedRevealed === "1") return;

  const overlay = document.createElement("div");
  overlay.className = OVERLAY_CLASS;
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.backdropFilter = "blur(6px)";
  overlay.style.background = "rgba(0,0,0,0.2)";
  overlay.style.zIndex = "9999";

  const countryLabel = country || "unknown";
  const btn = document.createElement("button");
  btn.innerHTML = isBlacklisted
    ? `<div>user is on your</div><div>⚠️blacklist⚠️</div><div>click to reveal</div>`
    : `<div>user is from</div><div>⚠️${countryLabel}⚠️</div><div>click to reveal</div>`;
  btn.style.position = "absolute";
  btn.style.top = "50%";
  btn.style.left = "50%";
  btn.style.transform = "translate(-50%, -50%)";
  btn.style.padding = "6px 12px";
  btn.style.background = "rgba(0,0,0,0.9)";
  btn.style.color = "#fff";
  btn.style.borderRadius = "999px";
  btn.style.border = "none";
  btn.style.cursor = "pointer";
  btn.style.textAlign = "center";
  btn.style.whiteSpace = "normal";
  btn.style.maxWidth = "220px";
  btn.style.display = "flex";
  btn.style.flexDirection = "column";
  btn.style.gap = "2px";
  btn.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  btn.style.fontWeight = "700";
  btn.style.fontSize = "12px";
  btn.style.lineHeight = "1.35";
  btn.style.alignItems = "center";

  btn.onclick = (e) => {
    e.stopPropagation();
    overlay.remove();
    el.dataset.flaggedRevealed = "1";
  };

  overlay.appendChild(btn);

  if (getComputedStyle(el).position === "static") {
    el.style.position = "relative";
  }

  el.appendChild(overlay);
  el.dataset.flaggedBlured = "1";
}

// -----------------------------
// Per-element logic
// -----------------------------
function applyFilterToElement(el, cached, handle) {
  clearElementState(el);

  const isWhite = handle ? isWhitelisted(handle) : false;
  const isBlack = handle ? isBlacklisted(handle) : false;
  const bypass = shouldBypassFiltering(el, { isBlacklisted: isBlack });
  const isSelf = !!(ownHandle && handle && canonicalHandle(handle) === ownHandle);

  if (cached) renderFlagBadge(el, cached);

  if (isWhite) return;
  if (bypass) return;
  if (isSelf) return;            // own posts: keep flags, skip hiding
  if (isBookmarksView()) return; // bookmarks: keep flags, skip hiding

  const shouldFilter = isBlack || (cached && cached.shouldFilter);
  const countryLabel = cached?.country || null;

  if (!shouldFilter) return;

  if (!cached && !isBlack) return;

  if (hideMode === "hide") {
    hideElement(el);
    return;
  }

  addOverlay(el, countryLabel, isBlack);
}

function checkTweet(tweetEl) {
  if (!noJeetEnabled) return;

  const rawHandle = getAuthorHandle(tweetEl);
  const authorHandle = canonicalHandle(rawHandle);

  if (!authorHandle) return;

  const isBlack = isBlacklisted(authorHandle);
  const cachedAuthor = countryCache.get(authorHandle);

  if (cachedAuthor) {
    if (tweetEl.dataset.flaggedProcessedAuthor !== "1") {
      applyFilterToElement(tweetEl, cachedAuthor, authorHandle);
      tweetEl.dataset.flaggedProcessedAuthor = "1";
    }
    return;
  }

  if (isBlack) {
    if (tweetEl.dataset.flaggedProcessedAuthor !== "1") {
      applyFilterToElement(tweetEl, null, authorHandle);
      tweetEl.dataset.flaggedProcessedAuthor = "1";
    }
  }

  // Always enqueue so we fetch new accounts even if DB lookup stalls
  if (fetchNewAccounts) enqueue(authorHandle);

  if (tweetEl.dataset.flaggedDbLookupAuthor === "1") return;
  tweetEl.dataset.flaggedDbLookupAuthor = "1";

  requestCacheEntry(authorHandle).then((entry) => {
    tweetEl.dataset.flaggedDbLookupAuthor = "0";
    if (!entry) return;
    applyFilterToElement(tweetEl, entry, authorHandle);
    tweetEl.dataset.flaggedProcessedAuthor = "1";
  });
}

function checkUserCell(cellEl) {
  if (!noJeetEnabled) return;

  const handle = canonicalHandle(getHandleFromUserCell(cellEl));
  if (!handle) return;
  const isBlack = isBlacklisted(handle);

  const cached = countryCache.get(handle);
  if (cached) {
    if (cellEl.dataset.flaggedProcessed !== "1") {
      applyFilterToElement(cellEl, cached, handle);
      cellEl.dataset.flaggedProcessed = "1";
    }
    return;
  }

  if (isBlack) {
    if (cellEl.dataset.flaggedProcessed !== "1") {
      applyFilterToElement(cellEl, null, handle);
      cellEl.dataset.flaggedProcessed = "1";
    }
  }

  if (fetchNewAccounts) enqueue(handle);

  if (cellEl.dataset.flaggedDbLookup === "1") return;
  cellEl.dataset.flaggedDbLookup = "1";

  requestCacheEntry(handle).then((entry) => {
    cellEl.dataset.flaggedDbLookup = "0";
    if (!entry) return;
    applyFilterToElement(cellEl, entry, handle);
    cellEl.dataset.flaggedProcessed = "1";
  });
}


function filterPage() {
  if (!noJeetEnabled) {
    clearOverlays();
    resetCheckedFlags();
    handleQueue.length = 0;
    return;
  }

  if (IS_CHAT_VIEW) {
    // Don't run on chat views to avoid noisy console errors and unnecessary work
    clearOverlays();
    resetCheckedFlags();
    handleQueue.length = 0;
    return;
  }

  document
    .querySelectorAll('article[data-testid="tweet"]')
    .forEach(checkTweet);

  document
    .querySelectorAll('div[data-testid="UserCell"]')
    .forEach(checkUserCell);
}

function start() {
  if (started) return;
  if (!document.body) {
    setTimeout(start, 50);
    return;
  }
  started = true;

  refreshOwnHandle();

  // Observe timeline changes (skip chat views)
  if (!IS_CHAT_VIEW) {
    new MutationObserver(() => {
      try {
        if (!ownHandle) refreshOwnHandle();
        filterPage();
      } catch (e) {
        console.warn("[Flagged] filterPage failed", e);
      }
    }).observe(document.body, {
      childList: true,
      subtree: true
    });

    // Run the queue regularly (skip chat views)
    setInterval(() => {
      try {
        processQueue();
      } catch (e) {
        console.warn("[Flagged] processQueue failed", e);
      }
    }, REQUEST_INTERVAL_MS);

    watchNavigation();
  }

  try {
    filterPage();
  } catch (e) {
    console.warn("[Flagged] initial filterPage failed", e);
  }
}

// -----------------------------
// Extension context health check
// -----------------------------
let contextDead = false;

function checkExtensionContext() {
  if (contextDead) return;
  try {
    if (!chrome.runtime?.id) {
      onContextInvalidated();
    }
  } catch (_) {
    onContextInvalidated();
  }
}

function onContextInvalidated() {
  if (contextDead) return;
  contextDead = true;
  showContextBanner();
}

function showContextBanner() {
  if (document.getElementById("flagged-ctx-banner")) return;
  const banner = document.createElement("div");
  banner.id = "flagged-ctx-banner";
  banner.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "z-index:2147483647",
    "display:flex", "align-items:center", "justify-content:center", "gap:12px",
    "padding:10px 16px",
    "background:rgba(20,20,20,0.92)", "backdrop-filter:blur(12px)",
    "border-bottom:1px solid rgba(255,255,255,0.08)",
    "font-family:Inter,-apple-system,sans-serif", "font-size:13px",
    "color:#ccc", "letter-spacing:-0.1px"
  ].join(";");

  const text = document.createElement("span");
  text.textContent = "Flagged was updated — refresh to keep filtering & saving new accounts";

  const btn = document.createElement("button");
  btn.textContent = "Refresh";
  btn.style.cssText = [
    "padding:5px 14px", "border-radius:6px", "border:none",
    "background:#ff2d2d", "color:#fff",
    "font-weight:600", "font-size:12px",
    "cursor:pointer", "font-family:inherit"
  ].join(";");
  btn.addEventListener("click", () => location.reload());

  const dismiss = document.createElement("button");
  dismiss.textContent = "\u00d7";
  dismiss.style.cssText = [
    "padding:2px 8px", "border-radius:4px", "border:none",
    "background:transparent", "color:#666",
    "font-size:18px", "cursor:pointer", "line-height:1"
  ].join(";");
  dismiss.addEventListener("click", () => banner.remove());

  banner.append(text, btn, dismiss);
  (document.body || document.documentElement).appendChild(banner);
}

setInterval(checkExtensionContext, 15000);

// Init
loadSettings();
loadLocalDB();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}

